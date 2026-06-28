"""FastAPI 백엔드 — 기존 Python 데이터 계층(src/)을 JSON API 로 노출한다.

Next.js 프론트엔드가 이 API 를 호출해 대시보드를 그린다.
실행:  uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import repository  # noqa: E402
from src.config import load_settings  # noqa: E402
from src.costs import load_costs  # noqa: E402

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


# ── 간단한 인메모리 캐시 (무거운 리포트 생성을 매 요청마다 반복하지 않도록) ──
# 세일즈가 잦지 않으므로 기본 2시간. (예열 크론이 만료 전 미리 갱신해 둠)
_CACHE_TTL = int(os.getenv("CACHE_TTL_MINUTES", "120")) * 60
_cache: dict[int, tuple[float, dict]] = {}

_TZ = {"CA": "America/Toronto", "US": "America/Los_Angeles", "MX": "America/Mexico_City",
       "UK": "Europe/London", "GB": "Europe/London", "DE": "Europe/Berlin", "JP": "Asia/Tokyo"}

# ── 증분 주문 패칭: 과거는 보관(인메모리 히스토리)하고 최근 며칠만 다시 받는다 ──
_ORDERS_OVERLAP_DAYS = 10   # 최근 이 기간만 새로 받아 상태변경(취소/배송) 반영
_ORDERS_KEEP_DAYS = 400     # 히스토리 최대 보관 기간
_orders_hist: pd.DataFrame | None = None
_orders_lock = threading.Lock()


def _merge_orders(hist: pd.DataFrame | None, fresh: pd.DataFrame, now: pd.Timestamp) -> pd.DataFrame:
    """히스토리와 새로 받은 데이터를 합쳐 중복 제거(최근 fetch 우선)하고 오래된 건 정리."""
    fresh = fresh.copy()
    fresh["purchase_date"] = pd.to_datetime(fresh["purchase_date"], errors="coerce")
    parts = [p for p in (hist, fresh) if p is not None and not p.empty]
    merged = pd.concat(parts, ignore_index=True) if parts else fresh
    merged = merged.dropna(subset=["amazon_order_id"])
    # 같은 (주문, SKU)는 마지막(=새로 받은) 행이 이김 → 상태/가격 최신 반영
    merged = merged.drop_duplicates(subset=["amazon_order_id", "sku"], keep="last")
    cutoff = now - pd.Timedelta(days=_ORDERS_KEEP_DAYS)
    merged = merged[merged["purchase_date"] >= cutoff].reset_index(drop=True)
    return merged


def _orders_incremental(settings, days: int) -> pd.DataFrame:
    """증분 주문 조회. live 에서만 동작하고, mock 은 그대로 전체 생성."""
    if settings.use_mock:
        return repository.get_orders(settings, days)

    global _orders_hist
    now = pd.Timestamp.now()
    needed_start = now - pd.Timedelta(days=days)

    with _orders_lock:
        hist = _orders_hist
        deep_enough = (
            hist is not None and not hist.empty
            and pd.to_datetime(hist["purchase_date"]).min() <= needed_start
        )
        if deep_enough:
            fresh = repository.get_orders(settings, _ORDERS_OVERLAP_DAYS)  # 최근만
        else:
            fresh = repository.get_orders(settings, days)  # 처음/더 긴 기간 → 전체

        merged = _merge_orders(hist, fresh, now)
        _orders_hist = merged

    return merged[merged["purchase_date"] >= needed_start].reset_index(drop=True)


def _build_insights(orders: pd.DataFrame, shipped: pd.DataFrame, marketplace: str) -> dict:
    """주문 데이터에서 추가 인사이트(파레토/요일·시간/지역/프로모션·취소율) 집계."""
    out: dict = {}
    if shipped.empty:
        return out

    sh = shipped.copy()
    sh["purchase_date"] = pd.to_datetime(sh["purchase_date"], errors="coerce")

    # 파레토(ABC): SKU 매출 누적 비중
    sku_rev = sh.groupby("sku")["item_price"].sum().sort_values(ascending=False)
    total_rev = float(sku_rev.sum())
    cum = 0.0
    pareto = []
    for sku, rev in sku_rev.items():
        cum += float(rev)
        pareto.append({"sku": sku, "revenue": round(float(rev), 2),
                       "cum_pct": round(cum / total_rev * 100, 1) if total_rev else 0})
    out["pareto"] = pareto

    # 요일별 (0=월)
    wd = sh.groupby(sh["purchase_date"].dt.dayofweek)["item_price"].sum()
    out["by_weekday"] = [{"weekday": int(i), "revenue": round(float(wd.get(i, 0.0)), 2)} for i in range(7)]

    # 시간대별 (마켓플레이스 로컬 타임존으로 변환)
    try:
        tz = _TZ.get(marketplace, "UTC")
        local = sh["purchase_date"].dt.tz_localize("UTC").dt.tz_convert(tz)
        hr = sh.assign(_h=local.dt.hour).groupby("_h")["item_price"].sum()
        out["by_hour"] = [{"hour": int(i), "revenue": round(float(hr.get(i, 0.0)), 2)} for i in range(24)]
        out["tz"] = tz
    except Exception:  # noqa: BLE001
        out["by_hour"] = []

    # 지역별 (state)
    if "ship_state" in sh.columns:
        st = (sh.dropna(subset=["ship_state"]).groupby("ship_state")
              .agg(revenue=("item_price", "sum"), units=("quantity", "sum"))
              .reset_index().sort_values("revenue", ascending=False).head(15))
        st = st[st["ship_state"].astype(str).str.strip() != ""]
        out["by_state"] = _records(st)

    # 프로모션
    if "promo_discount" in sh.columns:
        disc = pd.to_numeric(sh["promo_discount"], errors="coerce").fillna(0).abs()
        discounted_units = int((disc > 0).sum())
        out["promo"] = {
            "total_discount": round(float(disc.sum()), 2),
            "discounted_share": round(discounted_units / len(sh) * 100, 1) if len(sh) else 0,
            "discounted_revenue": round(float(sh.loc[disc > 0, "item_price"].sum()), 2),
        }

    # 취소율 (전체 주문 기준)
    if not orders.empty:
        total_orders = int(orders["amazon_order_id"].nunique())
        canceled = int(orders[orders["order_status"] == "Canceled"]["amazon_order_id"].nunique())
        out["cancel"] = {
            "rate": round(canceled / total_orders * 100, 1) if total_orders else 0,
            "canceled": canceled,
            "total": total_orders,
        }

    # 주별 추세
    wk = sh.assign(_w=sh["purchase_date"].dt.to_period("W").dt.start_time)
    wkrev = wk.groupby("_w")["item_price"].sum().reset_index()
    wkrev.columns = ["week", "revenue"]
    wkrev["revenue"] = wkrev["revenue"].round(2)
    out["weekly"] = _records(wkrev)

    # 가격변동 추적: SKU별 현재가/최저/최고/평균 + 변동 여부
    p = sh[sh["quantity"] > 0].copy()
    p["unit_price"] = pd.to_numeric(p["unit_price"], errors="coerce")
    p = p.dropna(subset=["unit_price"]).sort_values("purchase_date")
    if not p.empty:
        pt = p.groupby("sku").agg(
            product_name=("product_name", "first"),
            current=("unit_price", "last"),
            min=("unit_price", "min"),
            max=("unit_price", "max"),
            avg=("unit_price", "mean"),
        ).reset_index()
        pt["changed"] = (pt["max"] - pt["min"]) > 0.01
        pt["spread"] = (pt["max"] - pt["min"]).round(2)
        for c in ["current", "min", "max", "avg"]:
            pt[c] = pt[c].round(2)
        pt = pt.sort_values(["changed", "spread"], ascending=False)
        out["price_track"] = _records(pt)

    # 상품별 취소율 (라인 기준, 주문 3건 이상만)
    if not orders.empty:
        tot = orders.groupby("sku").size().rename("total")
        can = orders[orders["order_status"] == "Canceled"].groupby("sku").size().rename("canceled")
        cdf = pd.concat([tot, can], axis=1).fillna(0).reset_index()
        cdf["canceled"] = cdf["canceled"].astype(int)
        cdf["total"] = cdf["total"].astype(int)
        cdf = cdf[cdf["total"] >= 3]
        cdf["rate"] = (cdf["canceled"] / cdf["total"] * 100).round(1)
        names = orders.dropna(subset=["product_name"]).drop_duplicates("sku").set_index("sku")["product_name"]
        cdf["product_name"] = cdf["sku"].map(names).fillna(cdf["sku"])
        cdf = cdf.sort_values("rate", ascending=False)
        out["cancel_by_sku"] = _records(cdf[["sku", "product_name", "total", "canceled", "rate"]])

    return out


# 대시보드 접근 비밀번호 (설정 시 /api/dashboard 호출에 키 필요; 없으면 공개)
_DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD")


@app.get("/api/health")
def health():
    s = load_settings()
    return {
        "ok": True,
        "mode": "mock" if s.use_mock else "live",
        "marketplace": s.marketplace,
        "auth_required": bool(_DASHBOARD_PASSWORD),
    }


@app.get("/api/dashboard")
def dashboard(
    days: int = Query(30, ge=1, le=365),
    refresh: bool = False,
    key: str | None = Query(None),
    x_dashboard_key: str | None = Header(None),
):
    # 비밀번호가 설정돼 있으면 헤더(X-Dashboard-Key) 또는 ?key= 로 검증
    if _DASHBOARD_PASSWORD:
        provided = x_dashboard_key or key
        if provided != _DASHBOARD_PASSWORD:
            raise HTTPException(status_code=401, detail="unauthorized")

    now = time.time()
    hit = _cache.get(days)

    # 수동 새로고침: 동기 재생성(증분이라 warm 이면 빠름)
    if refresh:
        return _store(days, _build_dashboard(days))

    if hit:
        ts, payload, ttl = hit
        if now - ts >= ttl:
            # 만료됐어도 일단 옛 데이터 즉시 반환하고, 갱신은 백그라운드에서
            _bg_refresh(days)
            return {**payload, "cached": True, "stale": True}
        return {**payload, "cached": True}

    # 캐시가 아예 없을 때만 동기 생성(첫 1회) — 예열이 보통 이걸 미리 처리함
    return _store(days, _build_dashboard(days))


def _store(days: int, payload: dict) -> dict:
    has_err = any(payload[s].get("error") for s in ("sales", "inventory", "finance"))
    ttl = 120 if has_err else _CACHE_TTL
    _cache[days] = (time.time(), payload, ttl)
    return payload


_refreshing: set[int] = set()
_refresh_lock = threading.Lock()


def _bg_refresh(days: int):
    """만료된 캐시를 백그라운드에서 갱신 (중복 실행 방지)."""
    with _refresh_lock:
        if days in _refreshing:
            return
        _refreshing.add(days)

    def _run():
        try:
            _store(days, _build_dashboard(days))
        except Exception:  # noqa: BLE001
            pass
        finally:
            with _refresh_lock:
                _refreshing.discard(days)

    threading.Thread(target=_run, daemon=True).start()


def _build_dashboard(days: int):
    settings = load_settings()

    # 리포트(createReport) 기반인 orders·inventory 를 동시에 부르면 throttle 되므로
    # 한 스레드에서 순차 실행하고, 정산/광고 계열만 병렬로 받는다.
    def _orders_then_inventory():
        o = _section(lambda: _orders_incremental(settings, days))
        i = _section(lambda: repository.get_inventory(settings))
        return o, i

    with ThreadPoolExecutor(max_workers=4) as ex:
        f_si = ex.submit(_orders_then_inventory)
        f_fin = ex.submit(_section, lambda: repository.get_finances(settings, days))
        f_bd = ex.submit(_section, lambda: repository.get_finance_breakdown(settings, days))
        f_ads = ex.submit(_section, lambda: repository.get_ads(settings, days))
        (orders, orders_err), (inventory, inv_err) = f_si.result()
        finances, fin_err = f_fin.result()
        breakdown, bd_err = f_bd.result()
        ads_data, ads_err = f_ads.result()

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
    aov = revenue / order_count if order_count else 0.0

    # ── 진짜 순이익 = 아마존 정산순액(모든 수수료·환불·보관료 반영) − 상품원가(COGS) ──
    costs = load_costs()
    cogs = 0.0
    if not shipped.empty:
        cogs = float(
            sum(costs.get(r.sku, 0.0) * int(r.quantity or 0) for r in shipped.itertuples())
        )
    # 아마존 정산순액: 상세내역(breakdown)의 net 우선, 없으면 일별 정산 합
    if breakdown is not None and not breakdown.empty:
        amazon_net = round(float(breakdown["금액"].sum()), 2)
    elif finances is not None and not finances.empty:
        amazon_net = round(float(finances["net_profit"].sum()), 2)
    else:
        amazon_net = 0.0
    true_profit = round(amazon_net - cogs, 2)
    cogs_known = sum(1 for r in shipped.itertuples() if costs.get(r.sku)) if not shipped.empty else 0
    net_profit = true_profit

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

    # ── 주문 인사이트 (파레토/요일·시간/지역/프로모션·취소율) ──
    insights = _build_insights(orders, shipped, settings.marketplace)

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
    settlement_ad_spend = 0.0
    if breakdown is not None and not breakdown.empty:
        settlement_ad_spend = round(
            -float(breakdown[breakdown["구분"] == "광고"]["금액"].sum()), 2
        )
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
        "insights": insights,
        "inventory": {"items": inv_items, "hidden": inv_hidden, "error": inv_err},
        "finance": {
            "daily": fin_daily,
            "breakdown": fin_breakdown,
            "totals": fin_totals,
            "error": fin_err or bd_err,
        },
        "profit": {
            "amazon_net": amazon_net,   # 아마존이 정산해주는 순액(수수료·환불·보관료 반영)
            "cogs": round(cogs, 2),     # 상품 매입원가 (costs.json)
            "true_profit": true_profit, # 진짜 순이익 = amazon_net - cogs
            "cogs_known": cogs_known,   # 원가가 입력된 판매건 수
            "units": units,
            "excludes": ["인바운드 배송", "관세/포장", "remittance 세금"],
        },
        "ads": {
            "mode": "live" if settings.has_ads_credentials else "mock",
            "settlement_spend": settlement_ad_spend,  # 정산에서 차감된 실제 광고비(순이익에 이미 반영)
            "summary": (ads_data or {}).get("summary", {}),
            "daily": _records((ads_data or {}).get("daily")) if ads_data else [],
            "by_name": _records((ads_data or {}).get("by_sku")) if ads_data else [],
            "error": ads_err,
        },
    }
