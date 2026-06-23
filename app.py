"""Amazon 셀러 대시보드 (Streamlit).

실행:  streamlit run app.py

DATA_SOURCE=mock 이면 자격증명 없이 샘플 데이터로 동작하고,
DATA_SOURCE=live 이고 SP-API 자격증명이 있으면 실제 데이터를 불러온다.
"""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from src import repository
from src.config import load_settings

st.set_page_config(page_title="Amazon 셀러 대시보드", page_icon="📦", layout="wide")

settings = load_settings()


@st.cache_data(ttl=600, show_spinner="데이터를 불러오는 중…")
def load_orders(days: int) -> pd.DataFrame:
    return repository.get_orders(settings, days)


@st.cache_data(ttl=600, show_spinner="재고를 불러오는 중…")
def load_inventory() -> pd.DataFrame:
    return repository.get_inventory(settings)


@st.cache_data(ttl=600, show_spinner="정산 데이터를 불러오는 중…")
def load_finances(days: int) -> pd.DataFrame:
    return repository.get_finances(settings, days)


# ── 사이드바 ─────────────────────────────────────────────
st.sidebar.title("📦 셀러 대시보드")
mode = "🟡 Mock (샘플 데이터)" if settings.use_mock else "🟢 Live (SP-API)"
st.sidebar.caption(f"데이터 소스: **{mode}**")
st.sidebar.caption(f"마켓플레이스: **{settings.marketplace}**")
days = st.sidebar.slider("조회 기간 (일)", 7, 90, 30, step=1)
if st.sidebar.button("🔄 새로고침"):
    st.cache_data.clear()
    st.rerun()

if settings.data_source == "live" and not settings.has_sp_api_credentials:
    st.sidebar.warning("live 모드인데 SP-API 자격증명이 없어 mock 으로 표시 중입니다. `.env` 를 확인하세요.")

# ── 데이터 로드 ──────────────────────────────────────────
orders = load_orders(days)
inventory = load_inventory()
finances = load_finances(days)

orders = orders[orders["purchase_date"] >= (pd.Timestamp.now() - pd.Timedelta(days=days))]
shipped = orders[orders["order_status"] == "Shipped"]

st.title("Amazon 셀러 대시보드")

# ── 상단 KPI ─────────────────────────────────────────────
total_revenue = float(shipped["item_price"].sum())
total_units = int(shipped["quantity"].sum())
total_orders = shipped["amazon_order_id"].nunique()
net_profit = float(finances["net_profit"].sum()) if not finances.empty else 0.0
aov = total_revenue / total_orders if total_orders else 0.0

k1, k2, k3, k4, k5 = st.columns(5)
k1.metric("총 매출", f"${total_revenue:,.0f}")
k2.metric("순수익(추정)", f"${net_profit:,.0f}")
k3.metric("판매 수량", f"{total_units:,}")
k4.metric("주문 수", f"{total_orders:,}")
k5.metric("객단가(AOV)", f"${aov:,.2f}")

tab_sales, tab_inventory, tab_finance = st.tabs(["📈 주문/매출", "📦 재고", "💰 정산/수익"])

# ── 주문/매출 탭 ─────────────────────────────────────────
with tab_sales:
    daily = (
        shipped.groupby(shipped["purchase_date"].dt.date)
        .agg(revenue=("item_price", "sum"), units=("quantity", "sum"))
        .reset_index()
        .rename(columns={"purchase_date": "date"})
    )
    fig = px.bar(daily, x="date", y="revenue", title="일별 매출", labels={"revenue": "매출 ($)", "date": "날짜"})
    st.plotly_chart(fig, use_container_width=True)

    col1, col2 = st.columns(2)
    by_product = (
        shipped.groupby("product_name")
        .agg(revenue=("item_price", "sum"), units=("quantity", "sum"))
        .reset_index()
        .sort_values("revenue", ascending=False)
    )
    with col1:
        fig2 = px.bar(by_product, x="revenue", y="product_name", orientation="h", title="상품별 매출")
        fig2.update_layout(yaxis={"categoryorder": "total ascending"})
        st.plotly_chart(fig2, use_container_width=True)
    with col2:
        status_counts = orders["order_status"].value_counts().reset_index()
        status_counts.columns = ["status", "count"]
        fig3 = px.pie(status_counts, names="status", values="count", title="주문 상태 분포")
        st.plotly_chart(fig3, use_container_width=True)

    st.subheader("상품별 요약")
    st.dataframe(by_product, use_container_width=True, hide_index=True)

# ── 재고 탭 ──────────────────────────────────────────────
with tab_inventory:
    low_stock = inventory[inventory["fulfillable_quantity"] < 50]
    if not low_stock.empty:
        st.warning(f"⚠️ 재입고 검토가 필요한 상품 {len(low_stock)}개 (가용 재고 50개 미만)")

    fig = px.bar(
        inventory.sort_values("total_quantity"),
        x="total_quantity",
        y="product_name",
        orientation="h",
        title="상품별 총 재고",
        labels={"total_quantity": "총 수량", "product_name": "상품"},
    )
    st.plotly_chart(fig, use_container_width=True)

    st.subheader("재고 상세")
    st.dataframe(
        inventory.sort_values("fulfillable_quantity"),
        use_container_width=True,
        hide_index=True,
    )

# ── 정산/수익 탭 ─────────────────────────────────────────
with tab_finance:
    if finances.empty:
        st.info("정산 데이터가 없습니다.")
    else:
        fin = finances[finances["date"] >= (pd.Timestamp.now() - pd.Timedelta(days=days))]
        fig = px.line(
            fin,
            x="date",
            y=["revenue", "net_profit"],
            title="매출 vs 순수익 추이",
            labels={"value": "금액 ($)", "date": "날짜", "variable": "구분"},
        )
        st.plotly_chart(fig, use_container_width=True)

        fee_total = fin[["referral_fee", "fba_fee", "product_cost"]].sum()
        fee_df = pd.DataFrame(
            {"항목": ["아마존 수수료(referral)", "FBA 수수료", "상품 원가"], "금액": fee_total.values}
        )
        col1, col2 = st.columns([1, 2])
        with col1:
            st.metric("총 매출", f"${fin['revenue'].sum():,.0f}")
            st.metric("총 수수료", f"${fin['total_fees'].sum():,.0f}")
            st.metric("순수익", f"${fin['net_profit'].sum():,.0f}")
            margin = fin["net_profit"].sum() / fin["revenue"].sum() * 100 if fin["revenue"].sum() else 0
            st.metric("순이익률", f"{margin:.1f}%")
        with col2:
            fig2 = px.pie(fee_df, names="항목", values="금액", title="비용 구성")
            st.plotly_chart(fig2, use_container_width=True)

        st.subheader("일별 정산 상세")
        st.dataframe(fin.sort_values("date", ascending=False), use_container_width=True, hide_index=True)

st.caption("ℹ️ Mock 모드에서는 샘플 데이터가 표시됩니다. 실제 데이터는 `.env` 에 SP-API 자격증명을 넣고 `DATA_SOURCE=live` 로 설정하세요.")
