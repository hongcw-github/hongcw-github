"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  configureCurrency,
  fetchDashboard,
  fetchHistory,
  fmtNum,
  fmtUSD,
  setKey,
  UnauthorizedError,
} from "@/lib/api";
import { loadCosts, saveCosts, type CostMap } from "@/lib/costs";
import type { DashboardData } from "@/lib/types";
import { ErrorBanner } from "@/components/ui";
import Icon, { type IconName } from "@/components/Icon";
import SalesTab from "@/components/SalesTab";
import InsightsTab from "@/components/InsightsTab";
import InventoryTab from "@/components/InventoryTab";
import FinanceTab from "@/components/FinanceTab";
import AdsTab from "@/components/AdsTab";
const WINDOWS = [7, 14, 30, 60, 90, 180];
const TABS = [
  {
    key: "sales",
    label: "비즈니스 개요",
    icon: "grid",
    description: "매출의 흐름과 상품별 성과를 한눈에 확인하세요.",
  },
  {
    key: "insights",
    label: "판매 분석",
    icon: "trend",
    description: "매출을 만드는 상품, 시간, 지역을 살펴보세요.",
  },
  {
    key: "inventory",
    label: "재고 관리",
    icon: "box",
    description: "판매 속도에 맞춰 재고와 재입고 시점을 점검하세요.",
  },
  {
    key: "finance",
    label: "정산 · 수익",
    icon: "wallet",
    description: "매출에서 실제 남는 금액까지, 수익의 구조를 확인하세요.",
  },
  {
    key: "ads",
    label: "광고 성과",
    icon: "megaphone",
    description: "정산 광고비와 광고 API 성과를 구분해 확인하세요.",
  },
] as const;
const formatTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "America/Toronto",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-]/.test(text) && typeof value !== "number") text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function exportCSV(data: DashboardData, currency: string, range: string) {
  const rows: unknown[][] = [
    [
      "구분",
      "날짜 / SKU / 항목",
      "상품 / 상태",
      "매출 / 금액",
      "판매수량 / 건수",
      "통화",
    ],
    ...data.sales.daily.map((r) => [
      "일별 매출",
      r.date,
      "",
      r.revenue,
      r.units,
      currency,
    ]),
    ...data.sales.by_sku.map((r) => [
      "상품 매출",
      r.sku,
      r.product_name,
      r.revenue,
      r.units,
      currency,
    ]),
    ...data.finance.breakdown.map((r) => [
      "정산",
      r.type,
      r.group,
      r.amount,
      "",
      currency,
    ]),
    ...data.inventory.items.map((r) => [
      "재고",
      r.sku,
      "가용 재고",
      "",
      r.fulfillable_quantity,
      "개",
    ]),
  ];
  const blob = new Blob(
    ["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `olyvia-seller-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Page() {
  const [range, setRange] = useState("30");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("sales");
  const [costs, setCosts] = useState<CostMap>({});
  const [currencyOverride, setCurrencyOverride] = useState("");
  const [settings, setSettings] = useState(false);
  const [key, setKeyInput] = useState("");
  const [received, setReceived] = useState<Record<string, string>>({});
  const [manualBusy, setManualBusy] = useState(false);
  const [slowRefresh, setSlowRefresh] = useState(false);
  useEffect(() => {
    if (!manualBusy) {
      setSlowRefresh(false);
      return;
    }
    const timer = setTimeout(() => setSlowRefresh(true), 20000);
    return () => clearTimeout(timer);
  }, [manualBusy]);
  const [refreshError, setRefreshError] = useState("");
  const isHistory = !WINDOWS.map(String).includes(range);
  const viewLabel = isHistory
    ? range === "all"
      ? "저장된 최근 약 2년"
      : `${range}년`
    : `최근 ${range}일`;
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<DashboardData>(
      ["dashboard-v2", range],
      () => (isHistory ? fetchHistory(range) : fetchDashboard(Number(range))),
      {
        revalidateOnFocus: true,
        focusThrottleInterval: 60000,
        revalidateOnReconnect: true,
        shouldRetryOnError: false,
        refreshInterval: (latest) =>
          latest?.building || latest?.stale ? 4000 : 300000,
        onSuccess: () =>
          setReceived((old) => ({ ...old, [range]: new Date().toISOString() })),
      },
    );
  useEffect(() => {
    setCosts(loadCosts());
    try {
      setCurrencyOverride(localStorage.getItem("dashboard_currency") || "");
    } catch {}
  }, []);
  const active = TABS.find((t) => t.key === tab)!;
  const hasData = !!data?.kpis;
  const currency =
    currencyOverride ||
    data?.currency ||
    (data?.marketplace === "US" ? "USD" : "CAD");
  configureCurrency(currency);
  const sourceLabel = data?.mode === "mock" ? "데모 데이터" : "Amazon SP-API";
  const salesDate =
    data?.metadata?.latest_order_date ||
    data?.sales?.daily
      ?.map((r) => r.date)
      .sort()
      .at(-1);
  const financeDate =
    data?.metadata?.latest_settlement_date ||
    data?.finance?.daily
      ?.map((r) => r.date)
      .sort()
      .at(-1);
  const sourceTime =
    data?.metadata?.generated_at || data?.metadata?.cache_saved_at;
  const salesReliable = hasData && !data!.sales.error;
  const financeReliable = hasData && !data!.finance.error;
  const cogs = salesReliable
    ? data!.sales.by_sku.reduce(
        (sum, row) => sum + (costs[row.sku] || 0) * row.units,
        0,
      )
    : 0;
  const missingCosts = salesReliable
    ? data!.sales.by_sku.filter(
        (row) => row.units > 0 && costs[row.sku] === undefined,
      ).length
    : 0;
  const trueProfit =
    financeReliable && salesReliable ? data!.profit.amazon_net - cogs : 0;
  const sparkRows = data?.sales?.daily || [];
  const sparkMax = Math.max(1, ...sparkRows.map((r) => r.revenue));
  const sparkPath = sparkRows
    .map(
      (row, index) =>
        `${index === 0 ? "M" : "L"}${sparkRows.length > 1 ? (index / (sparkRows.length - 1)) * 160 : 80} ${42 - (row.revenue / sparkMax) * 37}`,
    )
    .join(" ");
  const allDates = [
    ...(data?.sales?.daily || []).map((r) => r.date),
    ...(data?.finance?.daily || []).map((r) => r.date),
  ].sort();
  const actualDays =
    isHistory && allDates.length
      ? Math.max(
          1,
          Math.round(
            (Date.parse(allDates.at(-1)!) - Date.parse(allDates[0])) / 86400000,
          ) + 1,
        )
      : Number(range);
  async function refresh() {
    setManualBusy(true);
    setRefreshError("");
    try {
      const next = await (isHistory
        ? fetchHistory(range, true)
        : fetchDashboard(Number(range), true));
      await mutate(next, { revalidate: false });
      setReceived((old) => ({ ...old, [range]: new Date().toISOString() }));
    } catch (e) {
      setRefreshError(
        e instanceof Error ? e.message : "새로고침에 실패했습니다.",
      );
    } finally {
      setManualBusy(false);
    }
  }
  const changeCosts = (sku: string, value: number) => {
    const next = { ...costs };
    if (!Number.isFinite(value)) delete next[sku];
    else next[sku] = Math.max(0, value);
    setCosts(next);
    saveCosts(next);
  };
  if (error instanceof UnauthorizedError)
    return (
      <main className="login-page">
        <form
          className="dashboard-card login-card"
          onSubmit={(event) => {
            event.preventDefault();
            setKey(key);
            mutate();
          }}
        >
          <div className="brand-symbol">o.</div>
          <h1>Seller workspace</h1>
          <p>대시보드 접근 키를 입력해주세요.</p>
          <label htmlFor="access-key">접근 키</label>
          <input
            id="access-key"
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(e) => setKeyInput(e.target.value)}
            required
          />
          <button className="button button-primary" type="submit">
            대시보드 열기 <Icon name="arrow" />
          </button>
        </form>
      </main>
    );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#main" aria-label="OLYVIA Seller Workspace">
          <div className="brand-symbol">o.</div>
          <div>
            <strong>OLYVIA</strong>
            <span>SELLER WORKSPACE</span>
          </div>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="대시보드 탐색">
          {TABS.map((item) => (
            <button
              key={item.key}
              aria-label={item.label}
              title={item.label}
              className={`nav-link ${tab === item.key ? "is-active" : ""}`}
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => setTab(item.key)}
            >
              <Icon name={item.icon as IconName} />
              <span>{item.label}</span>
              {tab === item.key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="market-card">
            <span className="market-icon">
              <Icon name="globe" />
            </span>
            <div>
              <strong>Canada</strong>
              <span>Amazon Marketplace</span>
            </div>
            <span className="market-code">CA</span>
          </div>
          <button
            className={`nav-link ${settings ? "is-active" : ""}`}
            onClick={() => setSettings(!settings)}
            aria-expanded={settings}
          >
            <Icon name="settings" />
            표시 설정
          </button>
          <div className="sidebar-caption">
            더 선명한 데이터.
            <br />더 나은 비즈니스.
          </div>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <div className="breadcrumb">
            워크스페이스 <Icon name="chevron" size={14} />
            <span>{active.label}</span>
          </div>
          <button
            className="mobile-settings"
            aria-label="표시 설정"
            onClick={() => setSettings(!settings)}
          >
            <Icon name="settings" size={17} />
          </button>
          <div className="connection-pill">
            <span
              className={`status-dot ${error || refreshError ? "status-error" : data?.mode === "mock" ? "status-demo" : ""}`}
            />
            {error ? "연결 확인 필요" : hasData ? sourceLabel : "연결 확인 중"}
            <span className="pill-divider" />
            CA
          </div>
        </header>
        <main id="main" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR BUSINESS, AT A GLANCE</div>
              <h1>
                {active.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>{active.description}</p>
            </div>
            <div className="toolbar">
              <label className="sr-only" htmlFor="date-range">
                분석 기간
              </label>
              <select
                id="date-range"
                value={range}
                onChange={(e) => {
                  setRange(e.target.value);
                  setRefreshError("");
                }}
              >
                <optgroup label="최근 기간">
                  {WINDOWS.map((d) => (
                    <option key={d} value={d}>
                      최근 {d}일
                    </option>
                  ))}
                </optgroup>
                <optgroup label="연도별">
                  <option value="2026">2026년</option>
                  <option value="2025">2025년</option>
                  <option value="2024">2024년</option>
                  <option value="all">저장된 최근 약 2년</option>
                </optgroup>
              </select>
              <button
                className="button button-secondary"
                disabled={!hasData}
                onClick={() => hasData && exportCSV(data!, currency, range)}
              >
                <Icon name="download" size={17} />
                <span>내보내기</span>
              </button>
              <button
                className="button button-primary"
                disabled={manualBusy || isLoading}
                onClick={refresh}
              >
                <Icon
                  name="refresh"
                  size={17}
                  className={manualBusy ? "animate-spin" : ""}
                />
                {manualBusy ? "갱신 중" : "새로고침"}
              </button>
            </div>
          </div>
          {settings && (
            <section className="dashboard-card settings-panel">
              <div>
                <h2 className="card-title">통화 표시</h2>
                <p>
                  금액을 환산하지 않습니다. Amazon 원본 통화에 맞춰 표시 단위를
                  선택하세요.
                </p>
              </div>
              <label>
                <span className="sr-only">통화 표시 단위</span>
                <select
                  value={currencyOverride || "auto"}
                  onChange={(e) => {
                    const next =
                      e.target.value === "auto" ? "" : e.target.value;
                    setCurrencyOverride(next);
                    try {
                      localStorage.setItem("dashboard_currency", next);
                    } catch {}
                  }}
                >
                  <option value="auto">마켓 기준 자동</option>
                  <option value="CAD">CAD · 캐나다 달러</option>
                  <option value="USD">USD · 미국 달러</option>
                </select>
              </label>
              <button
                className="text-button"
                onClick={() => setSettings(false)}
              >
                닫기
              </button>
            </section>
          )}
          <div className="freshness-row">
            <span>
              <Icon name="clock" size={14} />
              {received[range]
                ? `마지막 조회 ${formatTime(received[range])}`
                : "데이터를 조회하고 있습니다"}{" "}
              <span className="muted">· Toronto</span>
            </span>
            <span>
              {hasData &&
                `주문 ${salesDate || "날짜 없음"} · 정산 ${financeDate || "날짜 없음"}`}
              <span className="muted"> · 5분마다 자동 확인</span>
              {isValidating && !isLoading && (
                <span className="poll-indicator">확인 중</span>
              )}
            </span>
          </div>
          {(error || refreshError) && (
            <div className="notice notice-error" role="alert">
              <strong>{refreshError || error.message}</strong>
              {hasData && <p>아래에는 마지막으로 조회한 값이 표시됩니다.</p>}
              <button className="text-button" onClick={() => mutate()}>
                다시 조회
              </button>
            </div>
          )}
          {slowRefresh && (
            <div className="notice" role="status">
              Amazon 원본 데이터를 다시 수집하고 있습니다. 리포트 생성에 수 분이
              걸릴 수 있으며, 완료 전까지 마지막 조회값을 표시합니다.
            </div>
          )}
          {(data?.building || data?.stale) && (
            <div className="notice" role="status">
              데이터를 갱신하고 있습니다. 완료될 때까지 4초마다 상태를
              확인합니다.
            </div>
          )}
          {data?.mode === "mock" && (
            <div className="notice">
              데모 모드입니다. 아래 값은 실제 사업 성과가 아닌 샘플
              데이터입니다.
            </div>
          )}
          {!hasData && (isLoading || data?.building) && (
            <div className="loading-state" role="status">
              <div className="loading-orbit" />
              <h2>{viewLabel} 데이터를 준비하고 있습니다</h2>
              <p>첫 조회는 최대 2분 정도 걸릴 수 있습니다.</p>
              <div className="skeleton-grid">
                {[1, 2, 3, 4].map((n) => (
                  <div className="skeleton" key={n} />
                ))}
              </div>
            </div>
          )}
          {hasData && (
            <>
              <section className="kpi-grid" aria-label="핵심 사업 지표">
                <div className="kpi-card kpi-featured">
                  <div className="kpi-top">
                    <span>총 주문 매출</span>
                    <span className="kpi-icon">
                      <Icon name="trend" size={18} />
                    </span>
                  </div>
                  <div className="kpi-number">
                    {salesReliable ? fmtUSD(data!.kpis.revenue) : "—"}
                  </div>
                  <div className="kpi-caption">
                    {viewLabel} <span>· {currency}</span>
                  </div>
                  <svg
                    className="kpi-spark"
                    viewBox="0 0 160 45"
                    aria-hidden="true"
                  >
                    <path
                      d={sparkPath}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <div className="kpi-card">
                  <div className="kpi-top">
                    <span>
                      {missingCosts ? "원가 반영 전 수익" : "원가 반영 수익"}
                    </span>
                    <Icon name="wallet" size={18} />
                  </div>
                  <div
                    className={`kpi-number ${trueProfit < 0 ? "negative" : "positive"}`}
                  >
                    {financeReliable && salesReliable
                      ? fmtUSD(trueProfit)
                      : "—"}
                  </div>
                  <div className="kpi-caption">
                    {missingCosts
                      ? `원가 미입력 ${missingCosts} SKU`
                      : "정산순액 − 상품원가"}
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-top">
                    <span>판매 수량</span>
                    <Icon name="box" size={18} />
                  </div>
                  <div className="kpi-number">
                    {salesReliable ? fmtNum(data!.kpis.units) : "—"}
                    <small>개</small>
                  </div>
                  <div className="kpi-caption">주문 기준 상품 수량</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-top">
                    <span>주문 수</span>
                    <Icon name="grid" size={18} />
                  </div>
                  <div className="kpi-number">
                    {salesReliable ? fmtNum(data!.kpis.orders) : "—"}
                    <small>건</small>
                  </div>
                  <div className="kpi-caption">매출 집계 대상 주문</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-top">
                    <span>평균 주문 금액</span>
                    <Icon name="trend" size={18} />
                  </div>
                  <div className="kpi-number">
                    {salesReliable ? fmtUSD(data!.kpis.aov) : "—"}
                  </div>
                  <div className="kpi-caption">주문 매출 ÷ 주문 수</div>
                </div>
              </section>
              {tab === "sales" && (
                <div className="overview-note">
                  <span className="note-icon">
                    <Icon name="check" size={17} />
                  </span>
                  <div>
                    <strong>{viewLabel}의 비즈니스 흐름</strong>
                    <span>
                      {" "}
                      {salesReliable
                        ? `${data!.sales.by_sku.length}개 SKU · ${fmtNum(data!.kpis.units)}개 판매`
                        : "주문 데이터를 확인해주세요"}
                      {missingCosts > 0
                        ? " · 원가를 입력하면 수익 추정이 더 정확해집니다."
                        : " · 상품과 재고를 함께 확인해 다음 액션을 정하세요."}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setTab(missingCosts ? "finance" : "insights")
                    }
                    aria-label={
                      missingCosts ? "원가 입력 화면 열기" : "판매 분석 열기"
                    }
                  >
                    <Icon name="arrow" size={20} />
                  </button>
                </div>
              )}
              <div className="tab-content" key={tab}>
                {tab === "sales" && <SalesTab sales={data!.sales} />}{" "}
                {tab === "insights" &&
                  (salesReliable ? (
                    <InsightsTab insights={data!.insights} />
                  ) : (
                    <ErrorBanner label="판매 분석" error={data!.sales.error!} />
                  ))}{" "}
                {tab === "inventory" && (
                  <InventoryTab
                    inventory={data!.inventory}
                    bySku={salesReliable ? data!.sales.by_sku : []}
                    days={isHistory ? undefined : actualDays}
                  />
                )}{" "}
                {tab === "finance" && (
                  <FinanceTab
                    finance={data!.finance}
                    profit={data!.profit}
                    bySku={salesReliable ? data!.sales.by_sku : []}
                    salesAvailable={salesReliable}
                    costs={costs}
                    onCostChange={changeCosts}
                    currency={currency}
                    revenue={salesReliable ? data!.kpis.revenue : undefined}
                  />
                )}{" "}
                {tab === "ads" && (
                  <AdsTab
                    ads={data!.ads}
                    settlementAvailable={financeReliable}
                    salesAvailable={salesReliable}
                    trueProfit={trueProfit}
                    salesDaily={salesReliable ? data!.sales.daily : []}
                    days={actualDays}
                  />
                )}
              </div>
              <footer className="dashboard-footer">
                <span>
                  OLYVIA <span className="muted">/ Seller Workspace</span>
                </span>
                <details>
                  <summary>데이터 기준 · {currency}</summary>
                  <p>
                    조회 시각은 화면에서 응답을 받은 시각입니다. 원본 Amazon
                    수집 완료 시각과 다를 수 있습니다.
                  </p>
                  <p>
                    {sourceTime
                      ? `집계 생성: ${formatTime(sourceTime)} (Toronto)`
                      : "서버가 집계 생성 시각을 제공하지 않습니다."}
                  </p>
                  <p>
                    금액 환산 없음 ·{" "}
                    {currencyOverride
                      ? "사용자 선택 통화"
                      : data!.currency_source === "marketplace_inferred" ||
                          !data!.currency
                        ? "마켓 기준 추정 통화"
                        : "서버 제공 통화"}
                    . 주문·정산은 집계 시점이 다를 수 있습니다.
                  </p>
                </details>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
