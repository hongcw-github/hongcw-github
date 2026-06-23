"""Amazon 셀러 대시보드 (Streamlit).

실행:  streamlit run app.py

DATA_SOURCE=mock 이면 자격증명 없이 샘플 데이터로 동작하고,
DATA_SOURCE=live 이고 SP-API 자격증명이 있으면 실제 데이터를 불러온다.
"""
from __future__ import annotations

import os

import pandas as pd
import plotly.express as px
import streamlit as st

from src import repository
from src.config import load_settings

st.set_page_config(page_title="Amazon 셀러 대시보드", page_icon="📦", layout="wide")

settings = load_settings()

# 캐시 유지 시간(분). 세일즈가 잦지 않으므로 기본 30분.
# 이 시간 안에는 실제 API 를 다시 부르지 않고, "새로고침" 버튼으로 즉시 갱신 가능.
CACHE_TTL = int(os.getenv("CACHE_TTL_MINUTES", "30")) * 60


@st.cache_data(ttl=CACHE_TTL, show_spinner="데이터를 불러오는 중…")
def load_orders(days: int) -> pd.DataFrame:
    return repository.get_orders(settings, days)


@st.cache_data(ttl=CACHE_TTL, show_spinner="재고를 불러오는 중…")
def load_inventory() -> pd.DataFrame:
    return repository.get_inventory(settings)


@st.cache_data(ttl=CACHE_TTL, show_spinner="정산 데이터를 불러오는 중…")
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
st.sidebar.caption(f"⏱️ 데이터는 {CACHE_TTL // 60}분간 캐시됩니다 (그 안엔 새로고침 버튼으로만 갱신).")

if settings.data_source == "live" and not settings.has_sp_api_credentials:
    st.sidebar.warning("live 모드인데 SP-API 자격증명이 없어 mock 으로 표시 중입니다. `.env` 를 확인하세요.")

# ── 데이터 로드 (탭별 독립: 하나가 막혀도 나머지는 보여준다) ──────────────
def _empty(columns: dict) -> pd.DataFrame:
    return pd.DataFrame({c: pd.Series(dtype=t) for c, t in columns.items()})


_EMPTY_ORDERS = {
    "amazon_order_id": "object", "purchase_date": "datetime64[ns]", "sku": "object",
    "asin": "object", "product_name": "object", "quantity": "int64",
    "item_price": "float64", "unit_price": "float64", "order_status": "object",
}
_EMPTY_INVENTORY = {
    "sku": "object", "asin": "object", "product_name": "object",
    "fulfillable_quantity": "int64", "inbound_quantity": "int64",
    "reserved_quantity": "int64", "total_quantity": "int64",
}
_EMPTY_FINANCES = {
    "date": "datetime64[ns]", "revenue": "float64", "referral_fee": "float64",
    "fba_fee": "float64", "product_cost": "float64", "units": "int64",
    "total_fees": "float64", "net_profit": "float64",
}


def _safe_load(loader, empty_cols, *args):
    """실패해도 앱을 멈추지 않고 (빈 DataFrame, 에러) 를 반환한다."""
    try:
        return loader(*args), None
    except Exception as e:  # noqa: BLE001
        return _empty(empty_cols), e


def render_load_error(label, e):
    name = type(e).__name__
    msg = str(e)
    st.error(f"❌ **{label}** 데이터를 불러오지 못했습니다 — `{name}`")
    if "invalid_client" in msg:
        st.warning(
            "**`invalid_client`** — Client ID + Client Secret 조합을 아마존이 거부했습니다. "
            "`SP_API_LWA_CLIENT_SECRET` 가 LWA credentials 의 **Client Secret** 인지 확인하세요."
        )
    elif "invalid_grant" in msg:
        st.warning(
            "**`invalid_grant`** — Refresh Token 이 잘못/만료되었습니다. "
            "**Authorize → Authorize app** 으로 새 토큰을 발급해 다시 넣으세요."
        )
    elif "Throttled" in name or "QuotaExceeded" in msg:
        st.warning("**호출 한도 초과** 입니다. 1~2분 후 **새로고침** 을 눌러주세요.")
    elif "Forbidden" in name or "Unauthorized" in msg or "denied" in msg:
        st.warning(
            "**접근 권한 없음(403)** — 이 API 에 대한 role 이 없거나 계정이 해당 기능을 쓰지 않습니다.\n"
            "- FBA 재고 API 는 **'Amazon Fulfillment' role** 이 필요합니다 (개발자 프로필에서 추가).\n"
            "- FBA 를 쓰지 않는 계정이면 이 탭은 사용하지 않아도 됩니다."
        )
    elif "Authorization" in name or "auth" in name.lower():
        st.warning("**LWA 인증 실패** — 자격증명 3개를 확인하세요.")
    with st.expander("자세한 오류 메시지"):
        st.code(msg or "(빈 메시지)")


orders, orders_err = _safe_load(load_orders, _EMPTY_ORDERS, days)
inventory, inventory_err = _safe_load(load_inventory, _EMPTY_INVENTORY)
finances, finances_err = _safe_load(load_finances, _EMPTY_FINANCES, days)

if not orders.empty:
    orders = orders[orders["purchase_date"] >= (pd.Timestamp.now() - pd.Timedelta(days=days))]
shipped = orders[orders["order_status"] == "Shipped"]

st.title("Amazon 셀러 대시보드")

if orders_err:
    render_load_error("주문/매출", orders_err)

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
  if inventory_err:
    render_load_error("재고", inventory_err)
  elif inventory.empty:
    st.info("표시할 재고 데이터가 없습니다. (FBA 미사용 계정일 수 있습니다.)")
  else:
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
    if finances_err:
        render_load_error("정산", finances_err)
    elif finances.empty:
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
