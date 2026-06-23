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


def _fetch_report_text(
    settings: Settings, report_type: str, fatal_retries: int = 2, **create_kwargs
) -> str:
    """리포트를 생성→완료까지 폴링→문서 다운로드하여 본문 텍스트를 반환한다.

    FATAL(아마존측 일시 실패)이 나면 몇 번 재생성한다.
    """
    from sp_api.api import Reports

    mp = _marketplace(settings)
    client = Reports(credentials=_credentials(settings), marketplace=mp)

    last_status = None
    for attempt in range(fatal_retries + 1):
        created = _retry(
            lambda: client.create_report(
                reportType=report_type,
                marketplaceIds=[mp.marketplace_id],
                **create_kwargs,
            )
        )
        report_id = created.payload["reportId"]

        document_id = None
        for _ in range(60):  # 최대 ~5분
            report = _retry(lambda: client.get_report(report_id))
            status = report.payload.get("processingStatus")
            if status == "DONE":
                document_id = report.payload.get("reportDocumentId")
                break
            if status in ("CANCELLED", "FATAL"):
                last_status = status
                break
            time.sleep(5)

        if document_id:
            doc = _retry(lambda: client.get_report_document(document_id))
            return _download_report_text(doc.payload)

        if last_status == "FATAL" and attempt < fatal_retries:
            time.sleep(5)  # 잠시 후 재생성
            continue
        if last_status in ("CANCELLED", "FATAL"):
            raise RuntimeError(f"리포트 생성 실패: {last_status}")
        raise TimeoutError("리포트 처리 시간이 초과되었습니다. 잠시 후 다시 시도하세요.")

    raise RuntimeError(f"리포트 생성 실패: {last_status}")


def orders(settings: Settings, days: int = 90) -> pd.DataFrame:
    """Reports API 로 전체 주문 데이터를 한 번에 받아 DataFrame 으로 반환한다.

    개별 getOrders/getOrderItems 호출은 한도가 매우 낮아 데이터가 많으면
    바로 throttling 된다. 대신 'All Orders' 플랫파일 리포트를 생성·다운로드한다.
    """
    start = _iso(datetime.now(timezone.utc) - timedelta(days=days))
    text = _fetch_report_text(settings, _ALL_ORDERS_REPORT, dataStartTime=start)
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
    # purchase_date 는 반드시 datetime 타입이어야 .dt 접근이 깨지지 않는다
    return pd.DataFrame(
        {
            "amazon_order_id": pd.Series(dtype="object"),
            "purchase_date": pd.Series(dtype="datetime64[ns]"),
            "sku": pd.Series(dtype="object"),
            "asin": pd.Series(dtype="object"),
            "product_name": pd.Series(dtype="object"),
            "quantity": pd.Series(dtype="int64"),
            "item_price": pd.Series(dtype="float64"),
            "unit_price": pd.Series(dtype="float64"),
            "order_status": pd.Series(dtype="object"),
        }
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


# FBA 재고 스냅샷 리포트 (실시간 FBA Inventory API 대신 사용 — 호출/권한이 더 관대)
# 상세 리포트(수량 분해 포함). 실패 시 더 단순한 AFN 리포트로 폴백.
_FBA_INVENTORY_REPORT = "GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA"
_AFN_INVENTORY_REPORT = "GET_AFN_INVENTORY_DATA"


def inventory(settings: Settings) -> pd.DataFrame:
    """FBA 재고를 리포트로 받아 DataFrame 으로 반환한다.

    실시간 FBA Inventory API(getInventorySummaries)는 권한/엔드포인트 제약이
    까다로워 403 이 잦다. 상세 재고 리포트를 쓰되, FATAL 등으로 실패하면
    더 단순하고 안정적인 AFN 재고 리포트로 폴백한다.
    """
    try:
        text = _fetch_report_text(settings, _FBA_INVENTORY_REPORT)
        return _parse_fba_inventory(text)
    except (RuntimeError, TimeoutError):
        # 상세 리포트가 FATAL/타임아웃이면 단순 AFN 리포트로 폴백
        text = _fetch_report_text(settings, _AFN_INVENTORY_REPORT)
        return _parse_fba_inventory(text)


def _parse_fba_inventory(text: str) -> pd.DataFrame:
    cols = [
        "sku", "asin", "product_name", "fulfillable_quantity",
        "inbound_quantity", "reserved_quantity", "total_quantity",
    ]
    if not text.strip():
        return pd.DataFrame(columns=cols)

    df = pd.read_csv(io.StringIO(text), sep="\t", dtype=str)
    if df.empty:
        return pd.DataFrame(columns=cols)

    def num(*names: str):
        for n in names:
            if n in df.columns:
                return pd.to_numeric(df[n], errors="coerce").fillna(0).astype(int)
        return pd.Series([0] * len(df), dtype=int)

    def col(*names: str):
        for n in names:
            if n in df.columns:
                return df[n]
        return pd.Series([None] * len(df))

    # 상세 리포트(afn-*) 또는 단순 AFN 리포트(Quantity Available) 컬럼 모두 지원
    fulfillable = num("afn-fulfillable-quantity", "Quantity Available", "quantity-available")
    inbound = (
        num("afn-inbound-working-quantity")
        + num("afn-inbound-shipped-quantity")
        + num("afn-inbound-receiving-quantity")
    )
    reserved = num("afn-reserved-quantity")
    total = num("afn-total-quantity")
    # 리포트에 total 이 비어 있으면 합산으로 보정
    total = total.where(total > 0, fulfillable + inbound + reserved)

    sku = col("sku", "seller-sku")
    # AFN 리포트에는 상품명이 없으므로 SKU 로 대체
    product_name = col("product-name")
    product_name = product_name.where(product_name.notna(), sku)

    return pd.DataFrame(
        {
            "sku": sku,
            "asin": col("asin"),
            "product_name": product_name,
            "fulfillable_quantity": fulfillable,
            "inbound_quantity": inbound,
            "reserved_quantity": reserved,
            "total_quantity": total,
        }
    )


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
