"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchDashboard, fmtNum, fmtUSD, setKey, UnauthorizedError } from "@/lib/api";
import type { DashboardData } from "@/lib/types";
import { Metric } from "@/components/ui";
import SalesTab from "@/components/SalesTab";
import InventoryTab from "@/components/InventoryTab";
import FinanceTab from "@/components/FinanceTab";

const TABS = [
  { key: "sales", label: "📈 주문/매출" },
  { key: "inventory", label: "📦 재고" },
  { key: "finance", label: "💰 정산/수익" },
] as const;

export default function Page() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("sales");
  const [pw, setPw] = useState("");

  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    ["dashboard", days],
    () => fetchDashboard(days),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

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
          {data && (
            <p className="mt-1 text-xs text-slate-500">
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${
                  data.mode === "live" ? "bg-green-500" : "bg-amber-400"
                }`}
              />
              {data.mode === "live" ? "Live (SP-API)" : "Mock"} · {data.marketplace}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                최근 {d}일
              </option>
            ))}
          </select>
          <button
            onClick={() => mutate(fetchDashboard(days, true), { revalidate: false })}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            새로고침
          </button>
        </div>
      </header>

      {/* KPI */}
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Metric label="총 매출" value={fmtUSD(data.kpis.revenue)} />
          <Metric label="순수익(추정)" value={fmtUSD(data.kpis.net_profit)} accent />
          <Metric label="판매 수량" value={fmtNum(data.kpis.units)} />
          <Metric label="주문 수" value={fmtNum(data.kpis.orders)} />
          <Metric label="객단가(AOV)" value={fmtUSD(data.kpis.aov)} />
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

      {isLoading && <div className="py-20 text-center text-slate-400">불러오는 중…</div>}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          백엔드 API에 연결할 수 없습니다. ({String(error)})<br />
          FastAPI 서버(<code>uvicorn api.main:app</code>)가 켜져 있는지, NEXT_PUBLIC_API_URL이 맞는지 확인하세요.
        </div>
      )}

      {data && (
        <>
          {tab === "sales" && <SalesTab sales={data.sales} />}
          {tab === "inventory" && <InventoryTab inventory={data.inventory} />}
          {tab === "finance" && <FinanceTab finance={data.finance} />}
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
