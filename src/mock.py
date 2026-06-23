"""자격증명 없이도 대시보드를 볼 수 있도록 샘플 데이터를 생성한다.

실제 SP-API 응답과 동일한 컬럼 구조의 DataFrame 을 돌려주므로,
나중에 live 모드로 바꿔도 대시보드 코드는 그대로 동작한다.
"""
from __future__ import annotations

import random
from datetime import date, datetime, timedelta

import pandas as pd

_PRODUCTS = [
    # (SKU, ASIN, 상품명, 단가, 원가)
    ("TS-BLK-M", "B0AAA00001", "코튼 티셔츠 (블랙/M)", 24.99, 8.50),
    ("TS-WHT-L", "B0AAA00002", "코튼 티셔츠 (화이트/L)", 24.99, 8.50),
    ("MUG-300", "B0AAA00003", "세라믹 머그컵 300ml", 14.50, 4.20),
    ("BTL-750", "B0AAA00004", "스테인리스 보틀 750ml", 29.90, 11.00),
    ("CAP-NVY", "B0AAA00005", "볼캡 (네이비)", 19.00, 6.30),
    ("SOCK-3P", "B0AAA00006", "양말 3팩", 12.00, 3.10),
    ("NB-A5", "B0AAA00007", "하드커버 노트 A5", 9.90, 2.40),
    ("PEN-BLU", "B0AAA00008", "젤펜 (블루) 5개입", 7.50, 1.80),
]

_SEED = 42


def _rng() -> random.Random:
    return random.Random(_SEED)


def orders(days: int = 90) -> pd.DataFrame:
    """일자 x 상품 단위의 주문 데이터."""
    rng = _rng()
    end = date.today()
    start = end - timedelta(days=days - 1)

    rows: list[dict] = []
    order_seq = 1000
    cur = start
    while cur <= end:
        # 주말에 주문이 조금 더 많다는 가벼운 패턴
        weekend_boost = 1.4 if cur.weekday() >= 5 else 1.0
        for sku, asin, name, price, _cost in _PRODUCTS:
            base = rng.randint(0, 6)
            qty = int(round(base * weekend_boost))
            if qty <= 0:
                continue
            order_seq += 1
            rows.append(
                {
                    "amazon_order_id": f"111-{order_seq:07d}-{rng.randint(1000000, 9999999)}",
                    "purchase_date": pd.Timestamp(cur),
                    "sku": sku,
                    "asin": asin,
                    "product_name": name,
                    "quantity": qty,
                    "item_price": round(price * qty, 2),
                    "unit_price": price,
                    "order_status": rng.choices(
                        ["Shipped", "Pending", "Canceled"], weights=[88, 8, 4]
                    )[0],
                }
            )
        cur += timedelta(days=1)

    return pd.DataFrame(rows)


def inventory() -> pd.DataFrame:
    """FBA 재고 현황 (상품 단위 스냅샷)."""
    rng = _rng()
    rows = []
    for sku, asin, name, _price, _cost in _PRODUCTS:
        fulfillable = rng.randint(0, 400)
        inbound = rng.randint(0, 150)
        reserved = rng.randint(0, 40)
        rows.append(
            {
                "sku": sku,
                "asin": asin,
                "product_name": name,
                "fulfillable_quantity": fulfillable,
                "inbound_quantity": inbound,
                "reserved_quantity": reserved,
                "total_quantity": fulfillable + inbound + reserved,
            }
        )
    return pd.DataFrame(rows)


def finances(days: int = 90) -> pd.DataFrame:
    """정산 이벤트 (일자별 매출/수수료/순수익 추정)."""
    od = orders(days)
    cost_map = {sku: cost for sku, _a, _n, _p, cost in _PRODUCTS}

    shipped = od[od["order_status"] == "Shipped"].copy()
    shipped["product_cost"] = shipped.apply(
        lambda r: cost_map[r["sku"]] * r["quantity"], axis=1
    )
    # 아마존 수수료를 매출의 15% (referral) + 건당 3.0 (FBA) 로 단순 추정
    shipped["referral_fee"] = (shipped["item_price"] * 0.15).round(2)
    shipped["fba_fee"] = (shipped["quantity"] * 3.0).round(2)

    daily = (
        shipped.groupby(shipped["purchase_date"].dt.date)
        .agg(
            revenue=("item_price", "sum"),
            referral_fee=("referral_fee", "sum"),
            fba_fee=("fba_fee", "sum"),
            product_cost=("product_cost", "sum"),
            units=("quantity", "sum"),
        )
        .reset_index()
        .rename(columns={"purchase_date": "date"})
    )
    daily["total_fees"] = (daily["referral_fee"] + daily["fba_fee"]).round(2)
    daily["net_profit"] = (
        daily["revenue"] - daily["total_fees"] - daily["product_cost"]
    ).round(2)
    daily["date"] = pd.to_datetime(daily["date"])
    return daily
