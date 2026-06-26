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
}: {
  ads: DashboardData["ads"];
  trueProfit: number;
}) {
  if (ads.error) return <ErrorBanner label="광고" error={ads.error} />;

  const s = ads.summary;
  const finalProfit = trueProfit - s.spend;
  const finalMargin = trueProfit ? (finalProfit / trueProfit) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-5">
      {ads.mode === "mock" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          🟡 광고는 <b>샘플 데이터</b>입니다. 실제 광고비를 보려면 <b>Amazon Ads API</b> 자격증명을 백엔드에 추가하세요.
        </div>
      )}

      {/* 핵심 KPI */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="광고비" value={fmtUSD(s.spend)} />
        <Metric label="광고 매출" value={fmtUSD(s.ad_sales)} />
        <Metric label="ACOS (광고비/광고매출)" value={`${s.acos}%`} />
        <Metric label="ROAS (광고매출/광고비)" value={`${s.roas}x`} />
      </div>

      {/* 광고 후 최종 순이익 */}
      <Card title="🏁 광고 후 최종 순이익">
        <div className="grid grid-cols-3 gap-4">
          <Metric label="순이익(광고 전)" value={fmtUSD(trueProfit)} />
          <Metric label="광고비" value={`- ${fmtUSD(s.spend)}`} />
          <Metric label="최종 순이익" value={fmtUSD(finalProfit)} accent />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          최종 순이익 = (정산순액 − 상품원가) − 광고비. 순이익률 {finalMargin.toFixed(1)}%.
        </p>
      </Card>

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
