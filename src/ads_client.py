"""Amazon Ads API (광고) 클라이언트.

SP-API 와 별개의 API 다. 별도 자격증명(ADS_*)이 필요하며, Sponsored Products
리포트(v3)를 생성·다운로드해 일별/캠페인별 지출·광고매출을 집계한다.

자격증명이 없으면 호출되지 않는다(repository 에서 mock 으로 폴백).
"""
from __future__ import annotations

import gzip
import io
import json
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

from .config import Settings

# CA/US 등 북미는 NA 엔드포인트
_ADS_HOST = "https://advertising-api.amazon.com"
_TOKEN_URL = "https://api.amazon.com/auth/o2/token"


def _access_token(settings: Settings) -> str:
    resp = requests.post(
        _TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": settings.ads_refresh_token,
            "client_id": settings.ads_client_id,
            "client_secret": settings.ads_client_secret,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _headers(settings: Settings, token: str, content_type: str | None = None) -> dict:
    h = {
        "Authorization": f"Bearer {token}",
        "Amazon-Advertising-API-ClientId": settings.ads_client_id,
        "Amazon-Advertising-API-Scope": settings.ads_profile_id,
    }
    if content_type:
        h["Content-Type"] = content_type
    return h


def ads(settings: Settings, days: int = 90) -> dict:
    """Sponsored Products 일별·캠페인별 리포트를 받아 집계한다."""
    token = _access_token(settings)
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days)

    body = {
        "name": "dashboard-sp",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "configuration": {
            "adProduct": "SPONSORED_PRODUCTS",
            "groupBy": ["campaign"],
            "columns": [
                "date",
                "campaignName",
                "impressions",
                "clicks",
                "cost",
                "sales30d",
                "purchases30d",
            ],
            "reportTypeId": "spCampaigns",
            "timeUnit": "DAILY",
            "format": "GZIP_JSON",
        },
    }
    create = requests.post(
        f"{_ADS_HOST}/reporting/reports",
        headers=_headers(settings, token, "application/vnd.createasyncreportrequest.v3+json"),
        data=json.dumps(body),
        timeout=30,
    )
    create.raise_for_status()
    report_id = create.json()["reportId"]

    # 처리 완료까지 폴링
    url = None
    for _ in range(60):
        st = requests.get(
            f"{_ADS_HOST}/reporting/reports/{report_id}",
            headers=_headers(settings, token),
            timeout=30,
        )
        st.raise_for_status()
        j = st.json()
        status = (j.get("status") or "").upper()
        if status in ("COMPLETED", "SUCCESS"):
            url = j.get("url")
            break
        if status in ("FAILURE", "CANCELLED"):
            raise RuntimeError(f"광고 리포트 실패: {status}")
        time.sleep(5)
    if not url:
        raise TimeoutError("광고 리포트 처리 시간 초과")

    raw = requests.get(url, timeout=60).content
    try:
        raw = gzip.decompress(raw)
    except OSError:
        pass
    records = json.loads(raw.decode("utf-8"))
    return _aggregate(pd.DataFrame(records))


def _aggregate(df: pd.DataFrame) -> dict:
    if df.empty:
        return {
            "summary": {k: 0 for k in
                        ["spend", "ad_sales", "impressions", "clicks", "orders", "acos", "roas", "ctr", "cpc"]},
            "daily": pd.DataFrame(columns=["date", "spend", "ad_sales"]),
            "by_sku": pd.DataFrame(columns=["name", "spend", "ad_sales", "acos"]),
        }

    for c in ["impressions", "clicks", "cost", "sales30d", "purchases30d"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    daily = (
        df.groupby("date").agg(spend=("cost", "sum"), ad_sales=("sales30d", "sum")).reset_index()
    )
    daily["date"] = pd.to_datetime(daily["date"])
    daily = daily.round(2)

    by_sku = (
        df.groupby("campaignName")
        .agg(spend=("cost", "sum"), ad_sales=("sales30d", "sum"))
        .reset_index()
        .rename(columns={"campaignName": "name"})
    )
    by_sku["acos"] = (by_sku["spend"] / by_sku["ad_sales"].replace(0, pd.NA) * 100).round(1).fillna(0)
    by_sku = by_sku.round(2).sort_values("spend", ascending=False)

    spend = float(df["cost"].sum())
    ad_sales = float(df["sales30d"].sum())
    impressions = int(df["impressions"].sum())
    clicks = int(df["clicks"].sum())
    orders = int(df["purchases30d"].sum())
    summary = {
        "spend": round(spend, 2),
        "ad_sales": round(ad_sales, 2),
        "impressions": impressions,
        "clicks": clicks,
        "orders": orders,
        "acos": round(spend / ad_sales * 100, 1) if ad_sales else 0,
        "roas": round(ad_sales / spend, 2) if spend else 0,
        "ctr": round(clicks / impressions * 100, 2) if impressions else 0,
        "cpc": round(spend / clicks, 2) if clicks else 0,
    }
    return {"summary": summary, "daily": daily, "by_sku": by_sku}
