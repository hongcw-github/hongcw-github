"""실제 Amazon SP-API 호출 래퍼.

python-amazon-sp-api 를 사용해 Orders / FBA Inventory / Finances 데이터를
mock 모듈과 동일한 컬럼 구조의 DataFrame 으로 반환한다.

자격증명이 없거나 live 모드가 아닐 때는 호출되지 않으며,
import 시점에 sp_api 패키지가 없어도 앱이 죽지 않도록 지연 import 한다.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd

from .config import Settings


def _credentials(settings: Settings) -> dict:
    return {
        "refresh_token": settings.refresh_token,
        "lwa_app_id": settings.lwa_app_id,
        "lwa_client_secret": settings.lwa_client_secret,
    }


def _marketplace(settings: Settings):
    from sp_api.base import Marketplaces

    return getattr(Marketplaces, settings.marketplace, Marketplaces.US)


def orders(settings: Settings, days: int = 90) -> pd.DataFrame:
    from sp_api.api import Orders

    client = Orders(credentials=_credentials(settings), marketplace=_marketplace(settings))
    created_after = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    rows: list[dict] = []
    next_token: str | None = None
    while True:
        if next_token:
            resp = client.get_orders(NextToken=next_token)
        else:
            resp = client.get_orders(CreatedAfter=created_after)

        payload = resp.payload or {}
        for o in payload.get("Orders", []):
            order_id = o.get("AmazonOrderId")
            purchase = o.get("PurchaseDate")
            status = o.get("OrderStatus")
            # 주문 항목(라인 아이템)은 별도 호출
            for item in _order_items(client, order_id):
                price = float(item.get("ItemPrice", {}).get("Amount", 0) or 0)
                qty = int(item.get("QuantityOrdered", 0) or 0)
                rows.append(
                    {
                        "amazon_order_id": order_id,
                        "purchase_date": pd.to_datetime(purchase),
                        "sku": item.get("SellerSKU"),
                        "asin": item.get("ASIN"),
                        "product_name": item.get("Title"),
                        "quantity": qty,
                        "item_price": price,
                        "unit_price": round(price / qty, 2) if qty else price,
                        "order_status": status,
                    }
                )
        next_token = payload.get("NextToken")
        if not next_token:
            break

    df = pd.DataFrame(rows)
    if not df.empty:
        df["purchase_date"] = pd.to_datetime(df["purchase_date"]).dt.tz_localize(None)
    return df


def _order_items(client, order_id: str) -> list[dict]:
    items: list[dict] = []
    next_token: str | None = None
    while True:
        if next_token:
            resp = client.get_order_items(order_id, NextToken=next_token)
        else:
            resp = client.get_order_items(order_id)
        payload = resp.payload or {}
        items.extend(payload.get("OrderItems", []))
        next_token = payload.get("NextToken")
        if not next_token:
            break
    return items


def inventory(settings: Settings) -> pd.DataFrame:
    from sp_api.api import Inventories

    client = Inventories(credentials=_credentials(settings), marketplace=_marketplace(settings))
    rows: list[dict] = []
    next_token: str | None = None
    while True:
        kwargs = {"details": True, "marketplaceIds": [_marketplace(settings).marketplace_id]}
        if next_token:
            kwargs["nextToken"] = next_token
        resp = client.get_inventory_summary_marketplace(**kwargs)
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
    posted_after = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    daily: dict[str, dict] = {}
    next_token: str | None = None
    while True:
        if next_token:
            resp = client.list_financial_events(NextToken=next_token)
        else:
            resp = client.list_financial_events(PostedAfter=posted_after)
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
