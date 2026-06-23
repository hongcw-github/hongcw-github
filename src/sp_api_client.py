"""실제 Amazon SP-API 호출 래퍼.

python-amazon-sp-api 를 사용해 Orders / FBA Inventory / Finances 데이터를
mock 모듈과 동일한 컬럼 구조의 DataFrame 으로 반환한다.

자격증명이 없거나 live 모드가 아닐 때는 호출되지 않으며,
import 시점에 sp_api 패키지가 없어도 앱이 죽지 않도록 지연 import 한다.
"""
from __future__ import annotations

import gzip
import io
import time
from datetime import datetime, timedelta, timezone

import pandas as pd

from .config import Settings


def _credentials(settings: Settings) -> dict:
    return {
        "refresh_token": settings.refresh_token,
        "lwa_app_id": settings.lwa_app_id,
        "lwa_client_secret": settings.lwa_client_secret,
    }


def _iso(dt: datetime) -> str:
    """SP-API 가 요구하는 ISO8601 형식(마이크로초 없는 'Z' 표기)으로 변환."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _marketplace(settings: Settings):
    from sp_api.base import Marketplaces

    return getattr(Marketplaces, settings.marketplace, Marketplaces.US)


# 주문 + 상품을 한 번에 받는 플랫파일 리포트 (주문건마다 호출하지 않아 throttling 회피)
_ALL_ORDERS_REPORT = "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL"


def orders(settings: Settings, days: int = 90) -> pd.DataFrame:
    """Reports API 로 전체 주문 데이터를 한 번에 받아 DataFrame 으로 반환한다.

    개별 getOrders/getOrderItems 호출은 한도가 매우 낮아 데이터가 많으면
    바로 throttling 된다. 대신 'All Orders' 플랫파일 리포트를 생성·다운로드한다.
    """
    from sp_api.api import Reports

    mp = _marketplace(settings)
    client = Reports(credentials=_credentials(settings), marketplace=mp)
    start = _iso(datetime.now(timezone.utc) - timedelta(days=days))

    # 1) 리포트 생성 요청
    created = _retry(
        lambda: client.create_report(
            reportType=_ALL_ORDERS_REPORT,
            dataStartTime=start,
            marketplaceIds=[mp.marketplace_id],
        )
    )
    report_id = created.payload["reportId"]

    # 2) 처리 완료까지 폴링 (보통 수십 초)
    document_id = None
    for _ in range(60):  # 최대 ~5분
        report = _retry(lambda: client.get_report(report_id))
        status = report.payload.get("processingStatus")
        if status == "DONE":
            document_id = report.payload.get("reportDocumentId")
            break
        if status in ("CANCELLED", "FATAL"):
            raise RuntimeError(f"리포트 생성 실패: {status}")
        time.sleep(5)

    if not document_id:
        raise TimeoutError("리포트 처리 시간이 초과되었습니다. 잠시 후 다시 시도하세요.")

    # 3) 리포트 문서 다운로드 → TSV 파싱
    doc = _retry(lambda: client.get_report_document(document_id))
    text = _download_report_text(doc.payload)
    return _parse_all_orders(text)


def _download_report_text(doc_payload: dict) -> str:
    import requests

    raw = requests.get(doc_payload["url"], timeout=60).content
    if doc_payload.get("compressionAlgorithm") == "GZIP":
        raw = gzip.decompress(raw)
    # 플랫파일 리포트는 보통 cp1252/latin-1 또는 utf-8
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("iso-8859-1", errors="replace")


def _parse_all_orders(text: str) -> pd.DataFrame:
    if not text.strip():
        return _empty_orders()

    df = pd.read_csv(io.StringIO(text), sep="\t", dtype=str)
    if df.empty:
        return _empty_orders()

    def col(*names: str):
        for n in names:
            if n in df.columns:
                return df[n]
        return pd.Series([None] * len(df))

    qty = pd.to_numeric(col("quantity", "quantity-purchased"), errors="coerce").fillna(0).astype(int)
    price = pd.to_numeric(col("item-price"), errors="coerce").fillna(0.0)
    # 수량 0 인 행은 NaN 으로 나눠 단가를 비우고, 이후 라인금액으로 보정 (object dtype 회피)
    unit_price = price.div(qty.where(qty != 0)).round(2).fillna(price).round(2)

    out = pd.DataFrame(
        {
            "amazon_order_id": col("amazon-order-id"),
            "purchase_date": pd.to_datetime(col("purchase-date"), errors="coerce", utc=True),
            "sku": col("sku"),
            "asin": col("asin"),
            "product_name": col("product-name"),
            "quantity": qty,
            "item_price": price.round(2),
            "unit_price": unit_price,
            "order_status": col("item-status", "order-status"),
        }
    )
    out["purchase_date"] = out["purchase_date"].dt.tz_localize(None)
    # 상태값을 대시보드 표준(Shipped/Pending/Canceled)에 맞게 정규화
    out["order_status"] = out["order_status"].astype(str).str.title().replace(
        {"Cancelled": "Canceled"}
    )
    return out


def _empty_orders() -> pd.DataFrame:
    return pd.DataFrame(
        columns=[
            "amazon_order_id",
            "purchase_date",
            "sku",
            "asin",
            "product_name",
            "quantity",
            "item_price",
            "unit_price",
            "order_status",
        ]
    )


def _retry(call, attempts: int = 4, base_delay: float = 3.0):
    """SP-API throttling(QuotaExceeded) 발생 시 지수 백오프로 재시도."""
    last = None
    for i in range(attempts):
        try:
            return call()
        except Exception as e:  # noqa: BLE001
            last = e
            if "Throttled" in type(e).__name__ or "QuotaExceeded" in str(e):
                time.sleep(base_delay * (2**i))
                continue
            raise
    raise last


def inventory(settings: Settings) -> pd.DataFrame:
    from sp_api.api import Inventories

    client = Inventories(credentials=_credentials(settings), marketplace=_marketplace(settings))
    rows: list[dict] = []
    next_token: str | None = None
    while True:
        kwargs = {"details": True, "marketplaceIds": [_marketplace(settings).marketplace_id]}
        if next_token:
            kwargs["nextToken"] = next_token
        resp = _retry(lambda: client.get_inventory_summary_marketplace(**kwargs))
        payload = resp.payload or {}
        for s in payload.get("inventorySummaries", []):
            details = s.get("inventoryDetails", {}) or {}
            fulfillable = int(details.get("fulfillableQuantity", 0) or 0)
            inbound = int(
                (details.get("inboundWorkingQuantity", 0) or 0)
                + (details.get("inboundShippedQuantity", 0) or 0)
            )
            reserved = int(
                (details.get("reservedQuantity", {}) or {}).get("totalReservedQuantity", 0) or 0
            )
            rows.append(
                {
                    "sku": s.get("sellerSku"),
                    "asin": s.get("asin"),
                    "product_name": s.get("productName"),
                    "fulfillable_quantity": fulfillable,
                    "inbound_quantity": inbound,
                    "reserved_quantity": reserved,
                    "total_quantity": fulfillable + inbound + reserved,
                }
            )
        next_token = (resp.pagination or {}).get("nextToken") if hasattr(resp, "pagination") else None
        if not next_token:
            break
    return pd.DataFrame(rows)


def finances(settings: Settings, days: int = 90) -> pd.DataFrame:
    """Finances API 의 이벤트를 일자별 매출/수수료/순수익으로 집계한다.

    Finances API 의 응답 구조는 매우 상세하므로 여기서는 shipment 이벤트의
    주요 수수료 항목만 추려서 집계한다. 상품원가(product_cost)는 SP-API 가
    제공하지 않으므로 0 으로 두고, 필요 시 별도 원가표와 join 해서 채운다.
    """
    from sp_api.api import Finances

    client = Finances(credentials=_credentials(settings), marketplace=_marketplace(settings))
    posted_after = _iso(datetime.now(timezone.utc) - timedelta(days=days))

    daily: dict[str, dict] = {}
    next_token: str | None = None
    while True:
        if next_token:
            resp = _retry(lambda: client.list_financial_events(NextToken=next_token))
        else:
            resp = _retry(lambda: client.list_financial_events(PostedAfter=posted_after))
        payload = resp.payload or {}
        events = payload.get("FinancialEvents", {})

        for ev in events.get("ShipmentEventList", []):
            posted = ev.get("PostedDate")
            day = pd.to_datetime(posted).date().isoformat() if posted else None
            bucket = daily.setdefault(
                day,
                {"revenue": 0.0, "referral_fee": 0.0, "fba_fee": 0.0, "units": 0},
            )
            for item in ev.get("ShipmentItemList", []):
                bucket["units"] += int(item.get("QuantityShipped", 0) or 0)
                for charge in item.get("ItemChargeList", []):
                    bucket["revenue"] += _amount(charge)
                for fee in item.get("ItemFeeList", []):
                    ftype = fee.get("FeeType", "")
                    amt = _amount(fee)
                    if ftype == "Commission":
                        bucket["referral_fee"] += amt
                    else:
                        bucket["fba_fee"] += amt

        next_token = payload.get("NextToken")
        if not next_token:
            break

    rows = []
    for day, b in sorted(daily.items()):
        if day is None:
            continue
        revenue = round(b["revenue"], 2)
        total_fees = round(abs(b["referral_fee"]) + abs(b["fba_fee"]), 2)
        rows.append(
            {
                "date": pd.to_datetime(day),
                "revenue": revenue,
                "referral_fee": round(abs(b["referral_fee"]), 2),
                "fba_fee": round(abs(b["fba_fee"]), 2),
                "product_cost": 0.0,
                "units": b["units"],
                "total_fees": total_fees,
                "net_profit": round(revenue - total_fees, 2),
            }
        )
    return pd.DataFrame(rows)


def _amount(charge: dict) -> float:
    return float((charge.get("ChargeAmount") or charge.get("FeeAmount") or {}).get("CurrencyAmount", 0) or 0)
