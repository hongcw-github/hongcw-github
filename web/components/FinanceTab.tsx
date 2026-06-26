"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import type { DashboardData } from "@/lib/types";
import { fmtUSD } from "@/lib/api";
import type { CostMap } from "@/lib/costs";
import { Card, ErrorBanner, Metric } from "./ui";

const GROUP_COLOR: Record<string, string> = {
  매출: "#22c55e",
  수수료: "#ef4444",
  프로모션: "#f59e0b",
  환불: "#a855f7",
  "환불 수수료": "#ec4899",
  "서비스 수수료": "#0ea5e9",
  조정: "#64748b",
};

export default function FinanceTab({
  finance,
  profit,
  bySku,
  costs,
  onCostChange,
}: {
  finance: DashboardData["finance"];
  profit: DashboardData["profit"];
  bySku: DashboardData["sales"]["by_sku"];
  costs: CostMap;
  onCostChange: (sku: string, value: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (finance.error) return <ErrorBanner label="정산" error={finance.error} />;
  if (finance.daily.length === 0 && finance.breakdown.length === 0)
    return <Card>정산 데이터가 없습니다.</Card>;

  const bd = [...finance.breakdown].sort((a, b) => a.amount - b.amount);

  // 원가는 화면에서 입력한 값으로 클라이언트에서 계산
  const cogs = bySku.reduce((s, r) => s + (costs[r.sku] || 0) * r.units, 0);
  const trueProfit = profit.amazon_net - cogs;
  const margin = profit.amazon_net ? (trueProfit / profit.amazon_net) * 100 : 0;
  const filled = bySku.filter((r) => costs[r.sku]).length;

  const updateCost = (sku: string, v: string) => onCostChange(sku, parseFloat(v) || 0);

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* 진짜 순이익 */}
      <Card title="🏆 진짜 순이익 (상품원가 반영)">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="아마존 정산순액" value={fmtUSD(profit.amazon_net)} />
          <Metric label="상품원가(COGS)" value={`- ${fmtUSD(cogs)}`} />
          <Metric label="진짜 순이익" value={fmtUSD(trueProfit)} accent />
          <Metric label="순이익률" value={`${margin.toFixed(1)}%`} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            아마존 정산순액(모든 수수료·환불·보관료 반영) − 상품원가 = 진짜 순이익.
            {filled === 0 && " ⚠️ 원가 미입력 → COGS=0. 아래 버튼으로 SKU별 원가를 넣으세요."}
            {" "}제외: {profit.excludes.join(", ")}.
          </p>
          <button
            onClick={() => setEditing((v) => !v)}
            className="ml-3 shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            {editing ? "닫기" : "원가 입력"}
          </button>
        </div>

        {editing && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">상품명</th>
                  <th className="px-3 py-2 text-right">판매수량</th>
                  <th className="px-3 py-2 text-right">1개당 원가($)</th>
                  <th className="px-3 py-2 text-right">원가 합계</th>
                </tr>
              </thead>
              <tbody>
                {bySku.map((r) => (
                  <tr key={r.sku} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{r.sku}</td>
                    <td className="px-3 py-2 text-slate-500" title={r.product_name}>
                      {r.product_name.length > 30 ? r.product_name.slice(0, 29) + "…" : r.product_name}
                    </td>
                    <td className="px-3 py-2 text-right">{r.units}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={costs[r.sku] ?? ""}
                        onChange={(e) => updateCost(r.sku, e.target.value)}
                        placeholder="0.00"
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {fmtUSD((costs[r.sku] || 0) * r.units)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-slate-400">
              입력값은 이 브라우저에 저장됩니다. (기기/브라우저가 바뀌면 다시 입력)
            </p>
          </div>
        )}
      </Card>

      <Card title="매출 vs 순수익 추이">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={finance.daily} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtUSD(v)} />
            <Line type="monotone" dataKey="revenue" name="매출" stroke="#2563eb" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="net_profit" name="순수익" stroke="#22c55e" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Metric label="총 수입" value={fmtUSD(finance.totals.income)} accent />
        <Metric label="총 차감" value={fmtUSD(finance.totals.deductions)} />
        <Metric label="순 정산액" value={fmtUSD(finance.totals.net)} accent />
      </div>

      <Card title="💸 항목별 금액 (수입 +, 차감 −)">
        <ResponsiveContainer width="100%" height={Math.max(260, bd.length * 36)}>
          <BarChart layout="vertical" data={bd} margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <YAxis type="category" dataKey="type" width={180} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtUSD(v)} />
            <Bar dataKey="amount" name="금액" radius={[0, 4, 4, 0]}>
              {bd.map((r, i) => (
                <Cell key={i} fill={GROUP_COLOR[r.group] || "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="전체 정산 항목 상세">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4">구분</th>
                <th className="py-2 pr-4">항목</th>
                <th className="py-2 text-right">금액</th>
              </tr>
            </thead>
            <tbody>
              {finance.breakdown.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-medium text-white"
                      style={{ background: GROUP_COLOR[r.group] || "#94a3b8" }}
                    >
                      {r.group}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{r.type}</td>
                  <td
                    className={`py-2 text-right font-medium ${
                      r.amount < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {fmtUSD(r.amount)}
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
