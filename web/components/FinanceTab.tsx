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
import type { DashboardData } from "@/lib/types";
import { fmtUSD } from "@/lib/api";
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

export default function FinanceTab({ finance }: { finance: DashboardData["finance"] }) {
  if (finance.error) return <ErrorBanner label="정산" error={finance.error} />;
  if (finance.daily.length === 0 && finance.breakdown.length === 0)
    return <Card>정산 데이터가 없습니다.</Card>;

  const bd = [...finance.breakdown].sort((a, b) => a.amount - b.amount);

  return (
    <div className="grid grid-cols-1 gap-5">
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
