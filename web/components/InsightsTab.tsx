"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { fmtUSD, shortName } from "@/lib/api";
import { Card, Metric } from "./ui";

const WD = ["월", "화", "수", "목", "금", "토", "일"];

export default function InsightsTab({ insights }: { insights: DashboardData["insights"] }) {
  if (!insights || !insights.pareto) {
    return <Card>분석할 주문 데이터가 없습니다.</Card>;
  }

  const pareto = insights.pareto || [];
  const weekday = (insights.by_weekday || []).map((r) => ({ ...r, label: WD[r.weekday] }));
  const hour = insights.by_hour || [];
  const state = insights.by_state || [];
  const promo = insights.promo;
  const cancel = insights.cancel;
  const weekly = insights.weekly || [];
  const priceTrack = insights.price_track || [];
  const cancelBySku = insights.cancel_by_sku || [];
  const changedCount = priceTrack.filter((r) => r.changed).length;

  const core80 = pareto.filter((r) => r.cum_pct <= 80).length || 1;

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* 요약 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="매출 80% 만드는 SKU" value={`${core80}개`} accent />
        <Metric label="취소율" value={cancel ? `${cancel.rate}%` : "-"} />
        <Metric label="할인 주문 비중" value={promo ? `${promo.discounted_share}%` : "-"} />
        <Metric label="총 할인액" value={promo ? fmtUSD(promo.total_discount) : "-"} />
      </div>

      {/* 파레토 (ABC) */}
      <Card title="📦 ABC / 파레토 — 매출 누적 비중 (상위 SKU)">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={pareto.slice(0, 15)} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="sku" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
            <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(v: number, n) => (n === "누적%" ? `${v}%` : fmtUSD(v))} />
            <Bar yAxisId="l" dataKey="revenue" name="매출" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" dataKey="cum_pct" name="누적%" stroke="#ef4444" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-400">
          상위 <b>{core80}개</b> SKU가 전체 매출의 80%를 만듭니다 — 재고·광고를 여기에 집중하세요.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 요일별 */}
        <Card title="📅 요일별 매출">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekday} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtUSD(v)} />
              <Bar dataKey="revenue" name="매출" radius={[4, 4, 0, 0]}>
                {weekday.map((r, i) => (
                  <Cell key={i} fill={r.weekday >= 5 ? "#f59e0b" : "#2563eb"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 시간대별 */}
        <Card title={`🕐 시간대별 매출 ${insights.tz ? `(${insights.tz})` : ""}`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hour} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtUSD(v)} labelFormatter={(h) => `${h}시`} />
              <Bar dataKey="revenue" name="매출" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* 지역별 */}
      <Card title="🗺️ 지역(주)별 매출 — 상위 15">
        <ResponsiveContainer width="100%" height={Math.max(220, state.length * 26)}>
          <BarChart layout="vertical" data={state} margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="ship_state" width={60} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtUSD(v)} />
            <Bar dataKey="revenue" name="매출" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 주별 추세 */}
      <Card title="📈 주별 매출 추세">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={weekly} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtUSD(v)} />
            <Bar dataKey="revenue" name="주간 매출" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 프로모션 · 취소 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="🎟️ 프로모션 / 할인">
          {promo ? (
            <div className="grid grid-cols-1 gap-3">
              <Metric label="총 할인액" value={fmtUSD(promo.total_discount)} />
              <Metric label="할인 적용 주문 비중" value={`${promo.discounted_share}%`} />
              <Metric label="할인 주문 매출" value={fmtUSD(promo.discounted_revenue)} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">프로모션 데이터 없음</p>
          )}
        </Card>
        <Card title="🚫 취소 현황">
          {cancel ? (
            <div className="grid grid-cols-1 gap-3">
              <Metric label="취소율" value={`${cancel.rate}%`} accent />
              <Metric label="취소 주문" value={`${cancel.canceled} / ${cancel.total}`} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">취소 데이터 없음</p>
          )}
        </Card>
      </div>

      {/* 가격변동 추적 */}
      <Card title={`💲 가격변동 추적 (변동 ${changedCount}개)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">상품명</th>
                <th className="py-2 pr-4 text-right">현재가</th>
                <th className="py-2 pr-4 text-right">최저</th>
                <th className="py-2 pr-4 text-right">최고</th>
                <th className="py-2 text-right">변동폭</th>
              </tr>
            </thead>
            <tbody>
              {priceTrack.map((r) => (
                <tr key={r.sku} className={`border-b last:border-0 ${r.changed ? "bg-amber-50" : ""}`}>
                  <td className="py-2 pr-4 font-medium">{r.sku}</td>
                  <td className="py-2 pr-4 text-slate-500" title={r.product_name}>
                    {shortName(r.product_name, 32)}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtUSD(r.current)}</td>
                  <td className="py-2 pr-4 text-right text-slate-500">{fmtUSD(r.min)}</td>
                  <td className="py-2 pr-4 text-right text-slate-500">{fmtUSD(r.max)}</td>
                  <td className={`py-2 text-right font-medium ${r.changed ? "text-amber-700" : "text-slate-400"}`}>
                    {r.changed ? fmtUSD(r.spread) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">주황색 = 기간 내 판매가가 변동된 상품.</p>
      </Card>

      {/* 상품별 취소율 */}
      <Card title="🚫 상품별 취소율 (주문 3건 이상)">
        <ResponsiveContainer width="100%" height={Math.max(180, cancelBySku.slice(0, 12).length * 28)}>
          <BarChart layout="vertical" data={cancelBySku.slice(0, 12)} margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
            <YAxis type="category" dataKey="sku" width={120} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number, n) => (n === "취소율" ? `${v}%` : v)} />
            <Bar dataKey="rate" name="취소율" radius={[0, 4, 4, 0]}>
              {cancelBySku.slice(0, 12).map((r, idx) => (
                <Cell key={idx} fill={r.rate >= 10 ? "#ef4444" : r.rate >= 5 ? "#f59e0b" : "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-400">
          빨강 ≥ 10%, 주황 ≥ 5% — 취소율 높은 상품은 리스팅·가격·재고 점검이 필요합니다.
        </p>
      </Card>
    </div>
  );
}
