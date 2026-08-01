"use client";

import { useEffect, useState } from "react";
import useSWR, { preload } from "swr";

const WINDOWS = [7, 14, 30, 60, 90, 180];
import { fetchDashboard, fetchHistory, fmtNum, fmtUSD, setKey, UnauthorizedError } from "@/lib/api";
import { loadCosts, saveCosts, type CostMap } from "@/lib/costs";
import type { DashboardData } from "@/lib/types";
import { Metric } from "@/components/ui";
import SalesTab from "@/components/SalesTab";
import InventoryTab from "@/components/InventoryTab";
import FinanceTab from "@/components/FinanceTab";
import AdsTab from "@/components/AdsTab";
import InsightsTab from "@/components/InsightsTab";

const TABS = [
  { key: "sales", label: "📈 주문/매출" },
  { key: "insights", label: "🔍 분석" },
  { key: "inventory", label: "📦 재고" },
  { key: "finance", label: "💰 정산/수익" },
  { key: "ads", label: "📣 광고" },
] as const;

export default function Page() {
  // 선택값: 롤링 기간("7".."90") 또는 히스토리("2026"/"2025"/"2024"/"all")
  const [sel, setSel] = useState("30");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("sales");
  const isHistory = !WINDOWS.map(String).includes(sel);
  const daysNum = isHistory ? (sel === "all" ? 730 : 365) : Number(sel);
  const viewLabel = isHistory ? (sel === "all" ? "전체 기간" : `${sel}년`) : `최근 ${sel}일`;
  const [pw, setPw] = useState("");
  const [costs, setCostsState] = useState<CostMap>(() => loadCosts());

  const onCostChange = (sku: string, value: number) => {
    const next = { ...costs, [sku]: value };
    setCostsState(next);
    saveCosts(next);
  };

  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    ["view", sel],
    () => (isHistory ? fetchHistory(sel) : fetchDashboard(Number(sel))),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      // 백엔드가 '준비 중'이면 4초마다 폴링해서 완성되면 자동 표시
      refreshInterval: (latest) => (latest?.building ? 4000 : 0),
    }
  );

  const hasData = !!data?.kpis;
  // 첫 로딩(동기 빌드 ~1~2분) 또는 백엔드가 '준비 중' 응답일 때 안내 화면 표시
  const preparing = (isLoading || !!data?.building) && !hasData;

  // 현재 기간이 뜨면 나머지 기간을 백그라운드에서 미리 받아 둔다.
  // (Cloud Run 은 '요청 처리 중'에만 CPU 를 주므로, 브라우저가 실제 HTTP 요청을
  //  쏴서 데워야 빌드가 끝난다. 그러면 기간을 바꿔도 캐시돼 있어 즉시 뜬다.)
  useEffect(() => {
    if (!hasData) return;
    WINDOWS.filter((d) => String(d) !== sel).forEach((d) => {
      preload(["view", String(d)], () => fetchDashboard(d));
    });
  }, [hasData, sel]);

  // 입력한 원가로 진짜 순이익 계산 (KPI·정산·광고 탭이 공유)
  const cogs = hasData ? data!.sales.by_sku.reduce((s, r) => s + (costs[r.sku] || 0) * r.units, 0) : 0;
  const trueProfit = hasData ? data!.profit.amazon_net - cogs : 0;

  // 비밀번호 게이트: 백엔드가 401 이면 로그인 화면 표시
  if (error instanceof UnauthorizedError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setKey(pw);
            mutate();
          }}
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h1 className="text-lg font-bold text-brand-dark">🔒 Amazon 셀러 대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">비밀번호를 입력하세요.</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="비밀번호"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            입장
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* 헤더 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Amazon 셀러 대시보드</h1>
          {hasData && (
            <p className="mt-1 text-xs text-slate-500">
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${
                  data!.mode === "live" ? "bg-green-500" : "bg-amber-400"
                }`}
              />
              {data!.mode === "live" ? "Live (SP-API)" : "Mock"} · {data!.marketplace}
              {data!.stale && " · 갱신 중…"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <optgroup label="최근">
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={String(d)}>
                  최근 {d}일
                </option>
              ))}
            </optgroup>
            <optgroup label="연도별">
              <option value="2026">2026년</option>
              <option value="2025">2025년</option>
              <option value="2024">2024년</option>
              <option value="all">전체 기간</option>
            </optgroup>
          </select>
          <button
            onClick={() =>
              mutate(isHistory ? fetchHistory(sel, true) : fetchDashboard(Number(sel), true), {
                revalidate: false,
              })
            }
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            새로고침
          </button>
        </div>
      </header>

      {/* KPI (순이익은 입력한 원가를 반영해 클라이언트에서 계산) */}
      {hasData && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Metric label="총 매출" value={fmtUSD(data!.kpis.revenue)} />
          <Metric label="순이익" value={fmtUSD(trueProfit)} accent />
          <Metric label="판매 수량" value={fmtNum(data!.kpis.units)} />
          <Metric label="주문 수" value={fmtNum(data!.kpis.orders)} />
          <Metric label="객단가(AOV)" value={fmtUSD(data!.kpis.aov)} />
        </div>
      )}

      {/* 탭 */}
      <nav className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-brand text-brand-dark"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {preparing && (
        <div className="py-20 text-center text-slate-400">
          <div className="mb-2 text-base">⏳ 데이터를 준비하는 중입니다…</div>
          <div className="text-xs">{viewLabel} 데이터를 불러오는 중이에요. 처음이면 1~2분 걸릴 수 있어요.</div>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          백엔드 API에 연결할 수 없습니다. ({String(error)})
        </div>
      )}

      {hasData && (
        <>
          {tab === "sales" && <SalesTab sales={data!.sales} />}
          {tab === "insights" && <InsightsTab insights={data!.insights} />}
          {tab === "inventory" && <InventoryTab inventory={data!.inventory} />}
          {tab === "finance" && (
            <FinanceTab
              finance={data!.finance}
              profit={data!.profit}
              bySku={data!.sales.by_sku}
              costs={costs}
              onCostChange={onCostChange}
            />
          )}
          {tab === "ads" && (
            <AdsTab
              ads={data!.ads}
              trueProfit={trueProfit}
              salesDaily={data!.sales.daily}
              days={daysNum}
            />
          )}
        </>
      )}

      <footer className="mt-10 text-center text-xs text-slate-400">
        {data?.mode === "mock"
          ? "Mock 모드는 샘플 데이터입니다. 실제 데이터는 백엔드 환경변수에 SP-API 자격증명을 넣고 DATA_SOURCE=live 로 설정하세요."
          : "실시간 데이터는 캐시(30분) 후 표시됩니다. 최신값은 새로고침을 누르세요."}
      </footer>
    </div>
  );
}
