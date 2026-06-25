"""FastAPI 백엔드 — 기존 Python 데이터 계층(src/)을 JSON API 로 노출한다.

Next.js 프론트엔드가 이 API 를 호출해 대시보드를 그린다.
실행:  uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

import os
import sys

import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import repository  # noqa: E402
from src.config import load_settings  # noqa: E402

app = FastAPI(title="Amazon Seller Dashboard API")

# 프론트엔드(Next.js)에서의 호출 허용. 배포 시 도메인으로 제한 권장.
_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _records(df: pd.DataFrame) -> list[dict]:
    """DataFrame 을 JSON 안전한 레코드 리스트로 변환."""
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].dt.strftime("%Y-%m-%d")
    return df.where(pd.notnull(df), None).to_dict(orient="records")


def _section(loader):
    """섹션별 로딩을 감싸 실패해도 전체가 죽지 않게 (data, error) 반환."""
    try:
        return loader(), None
    except Exception as e:  # noqa: BLE001
        return None, {"type": type(e).__name__, "message": str(e)[:500]}


@app.get("/api/health")
def health():
    s = load_settings()
    return {"ok": True, "mode": "mock" if s.use_mock else "live", "marketplace": s.marketplace}


@app.get("/api/dashboard")
def dashboard(days: int = Query(30, ge=1, le=365)):
    settings = load_settings()

    orders, orders_err = _section(lambda: repository.get_orders(settings, days))
    inventory, inv_err = _section(lambda: repository.get_inventory(settings))
    finances, fin_err = _section(lambda: repository.get_finances(settings, days))
    breakdown, bd_err = _section(lambda: repository.get_finance_breakdown(settings, days))

    if orders is None:
        orders = pd.DataFrame(
            columns=[
                "amazon_order_id", "purchase_date", "sku", "asin", "product_name",
                "quantity", "item_price", "unit_price", "order_status",
            ]
        )
    if "purchase_date" in orders.columns:
        orders["purchase_date"] = pd.to_datetime(orders["purchase_date"], errors="coerce")
    if not orders.empty:
        orders = orders[orders["purchase_date"] >= (pd.Timestamp.now() - pd.Timedelta(days=days))]

    shipped = orders[orders["order_status"] == "Shipped"] if not orders.empty else orders

    # ── KPI ──
    revenue = float(shipped["item_price"].sum()) if not shipped.empty else 0.0
    units = int(shipped["quantity"].sum()) if not shipped.empty else 0
    order_count = int(shipped["amazon_order_id"].nunique()) if not shipped.empty else 0
    net_profit = float(finances["net_profit"].sum()) if finances is not None and not finances.empty else 0.0
    aov = revenue / order_count if order_count else 0.0

    # ── 매출(주문) 집계 ──
    daily_sales, by_sku, status = [], [], []
    if not shipped.empty:
        d = (
            shipped.groupby(shipped["purchase_date"].dt.date)
            .agg(revenue=("item_price", "sum"), units=("quantity", "sum"))
            .reset_index()
            .rename(columns={"purchase_date": "date"})
        )
        d["date"] = pd.to_datetime(d["date"])
        daily_sales = _records(d)

        s = (
            shipped.groupby("sku")
            .agg(revenue=("item_price", "sum"), units=("quantity", "sum"),
                 product_name=("product_name", "first"))
            .reset_index()
            .sort_values("revenue", ascending=False)
        )
        by_sku = _records(s)
    if not orders.empty:
        sc = orders["order_status"].value_counts().reset_index()
        sc.columns = ["status", "count"]
        status = _records(sc)

    # ── 재고: 0재고 숨김 + 주문 데이터로 상품명 보강 ──
    inv_items, inv_hidden = [], 0
    if inventory is not None and not inventory.empty:
        if not orders.empty:
            name_map = (
                orders.dropna(subset=["sku", "product_name"]).drop_duplicates("sku")
                .set_index("sku")["product_name"].to_dict()
            )
            if name_map:
                mapped = inventory["sku"].map(name_map)
                inventory = inventory.copy()
                inventory["product_name"] = mapped.where(mapped.notna(), inventory["product_name"])
        active = inventory[inventory["total_quantity"] > 0]
        inv_hidden = int(len(inventory) - len(active))
        inv_items = _records(active.sort_values("total_quantity", ascending=False))

    # ── 정산 ──
    fin_daily = _records(finances.sort_values("date")) if finances is not None and not finances.empty else []
    fin_breakdown, fin_totals = [], {"income": 0.0, "deductions": 0.0, "net": 0.0}
    if breakdown is not None and not breakdown.empty:
        b = breakdown.rename(columns={"구분": "group", "항목": "type", "금액": "amount"})
        fin_breakdown = _records(b)
        fin_totals = {
            "income": round(float(b[b["amount"] > 0]["amount"].sum()), 2),
            "deductions": round(float(b[b["amount"] < 0]["amount"].sum()), 2),
            "net": round(float(b["amount"].sum()), 2),
        }

    return {
        "mode": "mock" if settings.use_mock else "live",
        "marketplace": settings.marketplace,
        "days": days,
        "kpis": {
            "revenue": round(revenue, 2),
            "net_profit": round(net_profit, 2),
            "units": units,
            "orders": order_count,
            "aov": round(aov, 2),
        },
        "sales": {"daily": daily_sales, "by_sku": by_sku, "status": status, "error": orders_err},
        "inventory": {"items": inv_items, "hidden": inv_hidden, "error": inv_err},
        "finance": {
            "daily": fin_daily,
            "breakdown": fin_breakdown,
            "totals": fin_totals,
            "error": fin_err or bd_err,
        },
    }
