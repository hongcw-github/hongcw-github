"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { fmtUSD } from "@/lib/api";
import { Card, ErrorBanner, Metric } from "./ui";

export default function AdsTab({
  ads,
  trueProfit,
  salesDaily,
  days,
}: {
  ads: DashboardData["ads"];
  trueProfit: number;
  salesDaily: DashboardData["sales"]["daily"];
  days: number;
}) {
  if (ads.error) return <ErrorBanner label="광고" error={ads.error} />;

  const s = ads.summary;
  const realSpend = ads.settlement_spend;
  const finalMargin = trueProfit && realSpend ? (realSpend / (trueProfit + realSpend)) * 100 : 0;

  // 실제 광고비 총액을 기간 일수로 균등 배분
  const perDay = realSpend / (days || 1);
  const spread = salesDaily.map((d) => ({
    date: d.date,
    revenue: d.revenue,
    adSpend: Number(perDay.toFixed(2)),
  }));

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* 실제 광고비 (정산 기준) — 순이익에 이미 반영 */}
      <Card title="🏁 광고비 & 최종 순이익 (정산 기준 실제값)">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="실제 광고비 (정산 차감)" value={fmtUSD(realSpend)} />
          <Metric label="일평균 광고비 (균등)" value={fmtUSD(perDay)} />
          <Metric label="광고 비중" value={`${finalMargin.toFixed(1)}%`} />
          <Metric label="최종 순이익 (광고 반영)" value={fmtUSD(trueProfit)} accent />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          광고비는 아마존 정산에서 차감되므로 위 <b>순이익에 이미 포함</b>됩니다 (잔액 차감 방식).
          {realSpend === 0 && " (이 기간 정산에 광고 차감 내역이 없습니다.)"}
        </p>
      </Card>

      {/* 광고비 균등 배분 vs 일별 매출 */}
      <Card title="📊 일별 매출 vs 광고비 (총 광고비를 기간 균등 배분)">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={spread} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtUSD(v)} />
            <Legend />
            <Bar dataKey="revenue" name="일별 매출" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="adSpend" name="광고비(균등 배분)" stroke="#ef4444" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-400">
          실제 광고비는 청구 시점에 덩어리로 찍히므로, 총액을 {days}일로 나눠 균등하게 펼친 추정선입니다.
          정확한 일별 집행액은 Amazon Ads API 연동 시 제공됩니다.
        </p>
      </Card>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
        🟡 아래 <b>ACOS·ROAS·캠페인별</b> 등 상세 분석은 <b>샘플</b>입니다. Amazon Ads API 를 연동하면 실데이터로 바뀝니다.
        (위 "실제 광고비"는 정산 기준 진짜 금액)
      </div>

      {/* 핵심 KPI (샘플 분석) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="광고비(샘플)" value={fmtUSD(s.spend)} />
        <Metric label="광고 매출(샘플)" value={fmtUSD(s.ad_sales)} />
        <Metric label="ACOS (광고비/광고매출)" value={`${s.acos}%`} />
        <Metric label="ROAS (광고매출/광고비)" value={`${s.roas}x`} />
      </div>

      {/* 보조 지표 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="노출수" value={s.impressions.toLocaleString()} />
        <Metric label="클릭수" value={s.clicks.toLocaleString()} />
        <Metric label="CTR" value={`${s.ctr}%`} />
        <Metric label="CPC (클릭당 비용)" value={fmtUSD(s.cpc)} />
      </div>

      <Card title="일별 광고비 vs 광고매출">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={ads.daily} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtUSD(v)} />
            <Legend />
            <Bar dataKey="spend" name="광고비" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="ad_sales" name="광고매출" stroke="#22c55e" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="캠페인별 광고 성과">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4">캠페인</th>
                <th className="py-2 pr-4 text-right">광고비</th>
                <th className="py-2 pr-4 text-right">광고매출</th>
                <th className="py-2 text-right">ACOS</th>
              </tr>
            </thead>
            <tbody>
              {ads.by_name.map((r) => (
                <tr key={r.name} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4 text-right">{fmtUSD(r.spend)}</td>
                  <td className="py-2 pr-4 text-right">{fmtUSD(r.ad_sales)}</td>
                  <td
                    className={`py-2 text-right font-medium ${
                      r.acos > 35 ? "text-red-600" : "text-slate-700"
                    }`}
                  >
                    {r.acos}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
