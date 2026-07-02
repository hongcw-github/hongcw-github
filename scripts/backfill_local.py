"""로컬 백필: SP-API 에서 최대 ~2년치 원본 데이터를 통째로 받아
Firestore 에 월 단위로 저장한다. (Cloud Run 10분 타임아웃을 피하려 로컬에서 실행)

저장 구조 (월별 문서, rows 는 JSON 문자열 = 인덱싱/타입제약 회피):
  raw_orders/{YYYY-MM}            = {ym, count, rows_json}
  raw_finance_breakdown/{YYYY-MM} = {ym, count, rows_json}
  raw_finance_daily/{YYYY-MM}     = {ym, count, rows_json}
  raw_inventory/current           = {count, rows_json}   (현재 스냅샷)

실행:  .venv/bin/python scripts/backfill_local.py
"""
from __future__ import annotations

import json
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import subprocess  # noqa: E402

from src import repository          # noqa: E402
from src.config import load_settings  # noqa: E402
from google.cloud import firestore    # noqa: E402
from google.oauth2.credentials import Credentials  # noqa: E402

PROJECT = os.getenv("GCP_PROJECT", "project-126436da-55b5-430c-84d")
DAYS = int(os.getenv("BACKFILL_DAYS", "730"))  # Amazon 보관 한계 ~2년


def _firestore_client():
    """ADC 없이 기존 gcloud 로그인의 액세스 토큰으로 Firestore 에 접속."""
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
    return firestore.Client(project=PROJECT, credentials=Credentials(token=token))


def records(df: pd.DataFrame) -> list[dict]:
    if df is None or df.empty:
        return []
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].dt.strftime("%Y-%m-%d %H:%M:%S")
    return df.where(pd.notnull(df), None).to_dict(orient="records")


def write_monthly(db, collection: str, df: pd.DataFrame, date_col: str) -> None:
    if df is None or df.empty:
        print(f"  {collection}: (empty)", flush=True)
        return
    df = df.copy()
    df["_ym"] = pd.to_datetime(df[date_col], errors="coerce").dt.strftime("%Y-%m")
    undated = int(df["_ym"].isna().sum())
    df = df.dropna(subset=["_ym"])
    months = 0
    for ym, g in df.groupby("_ym"):
        rows = records(g.drop(columns=["_ym"]))
        rows_json = json.dumps(rows, default=str)
        db.collection(collection).document(str(ym)).set({
            "ym": str(ym),
            "count": len(rows),
            "rows_json": rows_json,
            "updated": firestore.SERVER_TIMESTAMP,
        })
        kb = len(rows_json) // 1024
        flag = "  ⚠️>900KB" if len(rows_json) > 900_000 else ""
        print(f"  {collection}/{ym}: {len(rows)} rows ({kb}KB){flag}", flush=True)
        months += 1
    note = f" (+{undated} undated skipped)" if undated else ""
    print(f"  {collection}: {months} months written{note}", flush=True)


def main() -> None:
    settings = load_settings()
    mode = "mock" if settings.use_mock else "live"
    print(f"mode={mode} marketplace={settings.marketplace} days={DAYS}", flush=True)
    if settings.use_mock:
        print("!! live 크레덴셜이 없어 mock 모드입니다. .env 확인 필요.", flush=True)
    db = _firestore_client()

    print("[1/4] orders …", flush=True)
    orders = repository.get_orders(settings, DAYS)
    print(f"  fetched {len(orders)} order-item rows", flush=True)
    write_monthly(db, "raw_orders", orders, "purchase_date")

    print("[2/4] finance breakdown …", flush=True)
    bd = repository.get_finance_breakdown(settings, DAYS)
    print(f"  fetched {len(bd)} breakdown rows", flush=True)
    write_monthly(db, "raw_finance_breakdown", bd, "날짜")

    print("[3/4] finance daily …", flush=True)
    fin = repository.get_finances(settings, DAYS)
    print(f"  fetched {len(fin)} daily rows", flush=True)
    write_monthly(db, "raw_finance_daily", fin, "date")

    print("[4/4] inventory snapshot …", flush=True)
    inv = repository.get_inventory(settings)
    db.collection("raw_inventory").document("current").set({
        "count": len(inv),
        "rows_json": json.dumps(records(inv), default=str),
        "updated": firestore.SERVER_TIMESTAMP,
    })
    print(f"  inventory {len(inv)} rows", flush=True)

    print("DONE", flush=True)


if __name__ == "__main__":
    main()
