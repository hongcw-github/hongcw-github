"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { fmtNum, fmtUSD, shortName } from "@/lib/api";
import { Card, ErrorBanner } from "./ui";

const PIE = ["#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#06b6d4"];

export default function SalesTab({ sales }: { sales: DashboardData["sales"] }) {
  if (sales.error) return <ErrorBanner label="주문/매출" error={sales.error} />;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="일별 매출 · 판매 수량" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={sales.daily} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis yAxisId="rev" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="units"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v: number, name) =>
                name === "판매 수량" ? `${fmtNum(v)}개` : fmtUSD(v)
              }
            />
            <Legend />
            <Bar
              yAxisId="rev"
              dataKey="revenue"
              name="매출"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="units"
              type="monotone"
              dataKey="units"
              name="판매 수량"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="SKU별 매출">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            layout="vertical"
            data={sales.by_sku.slice(0, 12)}
            margin={{ left: 8, right: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="sku" width={120} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: number) => fmtUSD(v)}
              labelFormatter={(l) => {
                const row = sales.by_sku.find((r) => r.sku === l);
                return row ? shortName(row.product_name, 50) : String(l);
              }}
            />
            <Bar dataKey="revenue" name="매출" fill="#2563eb" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="주문 상태 분포">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={sales.status}
              dataKey="count"
              nameKey="status"
              outerRadius={100}
              label
            >
              {sales.status.map((_, i) => (
                <Cell key={i} fill={PIE[i % PIE.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card title="SKU별 요약" className="lg:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">상품명</th>
                <th className="py-2 pr-4 text-right">매출</th>
                <th className="py-2 text-right">수량</th>
              </tr>
            </thead>
            <tbody>
              {sales.by_sku.map((r) => (
                <tr key={r.sku} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{r.sku}</td>
                  <td className="py-2 pr-4 text-slate-600" title={r.product_name}>
                    {shortName(r.product_name, 48)}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtUSD(r.revenue)}</td>
                  <td className="py-2 text-right">{r.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
