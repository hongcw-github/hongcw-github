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
    _states = ["CA", "NY", "TX", "FL", "WA", "IL", "ON", "BC", "QC", "AB"]
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
            # 데모: 일부 상품은 기간 중반에 가격 변동 (가격추적 시연용)
            if sku == "TS-BLK-M" and cur > start + (end - start) / 2:
                price = round(price * 1.08, 2)
            elif sku == "MUG-300" and cur > start + (end - start) * 2 / 3:
                price = round(price * 0.9, 2)
            # 시간대 패턴(낮~저녁 비중 ↑), 일부 주문에 프로모션 할인
            hour = rng.choices(range(24), weights=[1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8,
                                                    8, 7, 7, 6, 6, 7, 8, 7, 5, 4, 3, 2])[0]
            discount = round(price * qty * rng.choice([0, 0, 0, 0.1, 0.15]), 2)
            rows.append(
                {
                    "amazon_order_id": f"111-{order_seq:07d}-{rng.randint(1000000, 9999999)}",
                    "purchase_date": pd.Timestamp(cur) + pd.Timedelta(hours=hour),
                    "sku": sku,
                    "asin": asin,
                    "product_name": name,
                    "quantity": qty,
                    "item_price": round(price * qty, 2),
                    "unit_price": price,
                    "order_status": rng.choices(
                        ["Shipped", "Pending", "Canceled"], weights=[88, 8, 4]
                    )[0],
                    "ship_state": rng.choice(_states),
                    "promo_discount": discount,
                    "fulfillment": rng.choices(["AFN", "MFN"], weights=[85, 15])[0],
                    "is_business": rng.choices(["true", "false"], weights=[12, 88])[0],
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


def finance_breakdown(days: int = 90) -> pd.DataFrame:
    """정산 상세 내역(샘플). 수입 +, 차감 −."""
    fin = finances(days)
    revenue = float(fin["revenue"].sum())
    referral = float(fin["referral_fee"].sum())
    fba = float(fin["fba_fee"].sum())

    rows = [
        ("매출", "Principal", round(revenue, 2)),
        ("매출", "Shipping", round(revenue * 0.04, 2)),
        ("매출", "Tax", round(revenue * 0.11, 2)),
        ("수수료", "Commission(판매수수료)", -round(referral, 2)),
        ("수수료", "FBAPerUnitFulfillmentFee", -round(fba, 2)),
        ("수수료", "FixedClosingFee", -round(revenue * 0.01, 2)),
        ("프로모션", "Promotion(할인)", -round(revenue * 0.03, 2)),
        ("환불", "RefundedPrincipal", -round(revenue * 0.02, 2)),
        ("서비스 수수료", "FBAStorageFee(보관료)", -round(12.50, 2)),
        ("서비스 수수료", "Subscription(월구독료)", -39.99),
        ("광고", "Sponsored Products(광고비)", -round(revenue * 0.12, 2)),
    ]
    return pd.DataFrame(rows, columns=["구분", "항목", "금액"])


def ads(days: int = 90) -> dict:
    """광고(Amazon Ads) 샘플 데이터. 일별 지출/광고매출 + SKU별 + 요약."""
    rng = _rng()
    od = orders(days)
    shipped = od[od["order_status"] == "Shipped"].copy()

    # 일별: 광고비 ≈ 매출의 12%, 광고매출 ≈ 광고비의 4배(ACOS ~25%)
    daily = (
        shipped.groupby(shipped["purchase_date"].dt.date)["item_price"].sum().reset_index()
    )
    daily.columns = ["date", "revenue"]
    daily["spend"] = (daily["revenue"] * 0.12 * [0.8 + rng.random() * 0.4 for _ in range(len(daily))]).round(2)
    daily["ad_sales"] = (daily["spend"] * (3 + rng.random() * 2)).round(2)
    daily["date"] = pd.to_datetime(daily["date"])
    daily = daily[["date", "spend", "ad_sales"]]

    # SKU별
    by_sku = shipped.groupby("sku").agg(revenue=("item_price", "sum")).reset_index()
    by_sku["spend"] = (by_sku["revenue"] * 0.12 * [0.7 + rng.random() * 0.6 for _ in range(len(by_sku))]).round(2)
    by_sku["ad_sales"] = (by_sku["spend"] * (2.5 + rng.random() * 2.5)).round(2)
    by_sku["acos"] = (by_sku["spend"] / by_sku["ad_sales"].replace(0, pd.NA) * 100).round(1).fillna(0)
    by_sku = (
        by_sku.rename(columns={"sku": "name"})[["name", "spend", "ad_sales", "acos"]]
        .sort_values("spend", ascending=False)
    )

    spend = float(daily["spend"].sum())
    ad_sales = float(daily["ad_sales"].sum())
    impressions = int(spend * rng.randint(800, 1200))
    clicks = int(spend / (0.4 + rng.random() * 0.4))
    ad_orders = int(ad_sales / 30)
    summary = {
        "spend": round(spend, 2),
        "ad_sales": round(ad_sales, 2),
        "impressions": impressions,
        "clicks": clicks,
        "orders": ad_orders,
        "acos": round(spend / ad_sales * 100, 1) if ad_sales else 0,
        "roas": round(ad_sales / spend, 2) if spend else 0,
        "ctr": round(clicks / impressions * 100, 2) if impressions else 0,
        "cpc": round(spend / clicks, 2) if clicks else 0,
    }
    return {"summary": summary, "daily": daily, "by_sku": by_sku}
