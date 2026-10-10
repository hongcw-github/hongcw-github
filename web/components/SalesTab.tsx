"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { fillSalesDates, weeklySales } from "@/lib/analytics";

const COLORS = ["#147d73", "#dc8b53", "#95bcb5", "#8d98ac", "#d9dedc"];
const STATUS: Record<string, string> = {
  Shipped: "배송 완료",
  Canceled: "취소",
  Pending: "대기",
  Unshipped: "미배송",
  PartiallyShipped: "일부 배송",
};
const tooltipStyle = {
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 8px 30px #0f172a12",
  fontSize: 12,
};
const dateLabel = (date: string) => date.slice(5).replace("-", "/");

function Empty({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
      {label}
    </div>
  );
}

export default function SalesTab({ sales }: { sales: DashboardData["sales"] }) {
  const [interval, setInterval] = useState<"daily" | "weekly">("daily");
  const [measure, setMeasure] = useState<"revenue" | "units">("revenue");
  const daily = useMemo(
    () => (sales.error ? [] : fillSalesDates(sales.daily || [])),
    [sales.daily, sales.error],
  );
  const weekly = useMemo(() => weeklySales(daily), [daily]);
  const products = useMemo(
    () => [...(sales.by_sku || [])].sort((a, b) => b.revenue - a.revenue),
    [sales.by_sku],
  );
  const statuses = (sales.status || []).filter((row) => row.count > 0);
  const total = products.reduce((sum, row) => sum + row.revenue, 0);
  const totalUnits = products.reduce((sum, row) => sum + row.units, 0);
  const statusTotal = statuses.reduce((sum, row) => sum + row.count, 0);
  const chartData = interval === "weekly" ? weekly : daily;
  const amount = (value: number) =>
    measure === "revenue"
      ? fmtUSD(Number(value))
      : `${fmtNum(Number(value))}개`;
  const leadingShare =
    total > 0 && products.length ? (products[0].revenue / total) * 100 : 0;
  if (sales.error) return <ErrorBanner label="주문/매출" error={sales.error} />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[.12em] text-brand">
              SALES PERFORMANCE
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              판매 흐름을 한눈에
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              기간 내 매출과 판매 수량의 변화를 확인하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div
              className="flex rounded-xl bg-slate-100 p-1"
              aria-label="차트 지표"
            >
              {(["revenue", "units"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={measure === value}
                  onClick={() => setMeasure(value)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${measure === value ? "bg-white text-brand shadow-sm" : "text-slate-500"}`}
                >
                  {value === "revenue" ? "매출" : "판매 수량"}
                </button>
              ))}
            </div>
            <div
              className="flex rounded-xl bg-slate-100 p-1"
              aria-label="차트 집계 간격"
            >
              {(["daily", "weekly"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={interval === value}
                  onClick={() => setInterval(value)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${interval === value ? "bg-white text-brand shadow-sm" : "text-slate-500"}`}
                >
                  {value === "daily" ? "일별" : "주별"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-6 flex flex-wrap items-end gap-8">
          <div>
            <span className="text-xs text-slate-500">
              {measure === "revenue" ? "기간 매출" : "기간 판매 수량"}
            </span>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {amount(measure === "revenue" ? total : totalUnits)}
            </p>
          </div>
          <div className="pb-1 text-xs leading-6 text-slate-500">
            {daily.length
              ? `${daily[0].date} — ${daily.at(-1)?.date}`
              : "집계 날짜 없음"}
            <br />
            {interval === "weekly"
              ? "월요일 시작 · 첫 주와 마지막 주는 부분 집계일 수 있습니다."
              : "첫·마지막 집계일 사이의 누락 날짜는 매출·수량 0으로 표시합니다."}
          </div>
        </div>
        {chartData.length ? (
          <div
            role="img"
            aria-label={`${interval === "daily" ? "일별" : "주별"} ${measure === "revenue" ? "매출" : "판매 수량"} 추이`}
          >
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={chartData}
                margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                accessibilityLayer
              >
                <defs>
                  <linearGradient
                    id="salesGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={measure === "revenue" ? COLORS[0] : COLORS[1]}
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="100%"
                      stopColor={COLORS[0]}
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="#edf0ef"
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={dateLabel}
                  tick={{ fontSize: 11, fill: "#84908d" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                  dy={8}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#84908d" }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                  allowDecimals={measure === "revenue"}
                  tickFormatter={(value) =>
                    measure === "revenue"
                      ? `$${fmtNum(Number(value))}`
                      : fmtNum(Number(value))
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => amount(Number(value))}
                  labelFormatter={(value) =>
                    interval === "weekly" ? `${value} 시작 주` : String(value)
                  }
                />
                <Area
                  type="linear"
                  dataKey={measure}
                  name={measure === "revenue" ? "매출" : "판매 수량"}
                  stroke={measure === "revenue" ? COLORS[0] : COLORS[1]}
                  strokeWidth={2.5}
                  fill="url(#salesGradient)"
                  activeDot={{ r: 5, stroke: "white", strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty label="선택한 기간의 판매 데이터가 없습니다." />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card title="어떤 상품이 매출을 만들었나요?">
          <p className="mb-5 text-xs text-slate-500">
            매출 상위 8개 상품 ·{" "}
            {products.length
              ? `1위 상품 비중 ${leadingShare.toFixed(1)}%`
              : "집계 상품 없음"}
          </p>
          {products.length ? (
            <div role="img" aria-label="상품별 매출 순위">
              <ResponsiveContainer
                width="100%"
                height={Math.max(230, Math.min(products.length, 8) * 52)}
              >
                <BarChart
                  layout="vertical"
                  data={products
                    .slice(0, 8)
                    .map((row, i) => ({
                      ...row,
                      label: `${String(i + 1).padStart(2, "0")}  ${shortName(row.product_name || row.sku, 24)}`,
                    }))}
                  margin={{ left: 0, right: 24 }}
                  accessibilityLayer
                >
                  <CartesianGrid horizontal={false} stroke="#edf0ef" />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#84908d" }}
                    tickFormatter={(value) => `$${fmtNum(Number(value))}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={150}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#475569" }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => fmtUSD(Number(value))}
                    labelFormatter={(_, payload) =>
                      payload[0]?.payload?.product_name ||
                      payload[0]?.payload?.sku
                    }
                  />
                  <Bar
                    dataKey="revenue"
                    name="매출"
                    barSize={18}
                    radius={[0, 5, 5, 0]}
                  >
                    {products.slice(0, 8).map((row, i) => (
                      <Cell
                        key={row.sku}
                        fill={i === 0 ? COLORS[0] : "#a5c9c2"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty label="상품별 판매 데이터가 없습니다." />
          )}
        </Card>
        <Card title="주문 처리 상태">
          <p className="mb-2 text-xs text-slate-500">
            주문 상태 기준 · 매출 집계 주문과 기준이 다를 수 있습니다.
          </p>
          {statuses.length ? (
            <>
              <div role="img" aria-label={`주문 상태 ${statusTotal}건`}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statuses}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={65}
                      outerRadius={88}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {statuses.map((row, i) => (
                        <Cell
                          key={row.status}
                          fill={COLORS[i % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [
                        `${fmtNum(Number(value))}건`,
                        STATUS[String(name)] || name,
                      ]}
                    />
                    <text
                      x="50%"
                      y="47%"
                      textAnchor="middle"
                      fill="#1e293b"
                      fontSize={28}
                      fontWeight={600}
                    >
                      {fmtNum(statusTotal)}
                    </text>
                    <text
                      x="50%"
                      y="59%"
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize={11}
                    >
                      집계 주문
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-3">
                {statuses.map((row, i) => (
                  <li
                    key={row.status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2 text-slate-600">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      {STATUS[row.status] || row.status}
                    </span>
                    <span className="font-medium text-slate-800">
                      {row.count}건{" "}
                      <span className="ml-2 text-xs text-slate-400">
                        {((row.count / statusTotal) * 100).toFixed(1)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty label="주문 상태 데이터가 없습니다." />
          )}
        </Card>
      </div>

      <Card title="상품별 판매 내역">
        {products.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                SKU별 매출, 수량과 전체 매출 비중
              </caption>
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="pb-4 font-medium">상품 / SKU</th>
                  <th className="pb-4 text-right font-medium">매출</th>
                  <th className="pb-4 pl-5 text-right font-medium">
                    판매 수량
                  </th>
                  <th className="pb-4 pl-5 text-right font-medium">
                    매출 비중
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((row) => (
                  <tr
                    key={row.sku}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-4 pr-4">
                      <p
                        className="font-medium text-slate-800"
                        title={row.product_name}
                      >
                        {shortName(row.product_name || row.sku, 56)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{row.sku}</p>
                    </td>
                    <td className="py-4 text-right font-semibold tabular-nums text-slate-800">
                      {fmtUSD(row.revenue)}
                    </td>
                    <td className="py-4 pl-5 text-right tabular-nums text-slate-600">
                      {fmtNum(row.units)}
                    </td>
                    <td className="py-4 pl-5 text-right tabular-nums text-brand">
                      {total > 0
                        ? `${((row.revenue / total) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">
            집계된 상품이 없습니다.
          </p>
        )}
      </Card>
    </div>
  );
}
