"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
  매출: "#147d73",
  수수료: "#dc8b53",
  프로모션: "#e6b887",
  환불: "#b18175",
  "환불 수수료": "#c99c8c",
  "서비스 수수료": "#87aaa5",
  조정: "#8b9792",
};
const tooltipStyle = {
  borderRadius: 14,
  border: "1px solid #e6ece9",
  fontSize: 12,
};

export default function FinanceTab({
  finance,
  profit,
  bySku,
  costs,
  onCostChange,
  revenue,
  currency = "CAD",
  salesAvailable = true,
}: {
  finance: DashboardData["finance"];
  profit: DashboardData["profit"];
  bySku: DashboardData["sales"]["by_sku"];
  costs: CostMap;
  onCostChange: (sku: string, value: number) => void;
  revenue?: number;
  currency?: string;
  salesAvailable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (finance.error) return <ErrorBanner label="정산" error={finance.error} />;
  if (finance.daily.length === 0 && finance.breakdown.length === 0)
    return <Card>정산 데이터가 없습니다.</Card>;

  const hasCost = (sku: string) =>
    Object.prototype.hasOwnProperty.call(costs, sku) &&
    Number.isFinite(costs[sku]) &&
    costs[sku] >= 0;
  const cogs = bySku.reduce(
    (sum, row) => sum + (hasCost(row.sku) ? costs[row.sku] : 0) * row.units,
    0,
  );
  const estimate = profit.amazon_net - cogs;
  const margin =
    revenue !== undefined && revenue > 0 ? (estimate / revenue) * 100 : null;
  const selling = bySku.filter((row) => row.units > 0);
  const filled = selling.filter((row) => hasCost(row.sku)).length;
  const units = selling.reduce((sum, row) => sum + row.units, 0);
  const coveredUnits = selling.reduce(
    (sum, row) => sum + (hasCost(row.sku) ? row.units : 0),
    0,
  );
  const coverage = units > 0 ? (coveredUnits / units) * 100 : null;
  const incomplete = filled < selling.length;
  const groups = new Map<string, number>();
  finance.breakdown.forEach((row) =>
    groups.set(row.group, (groups.get(row.group) ?? 0) + row.amount),
  );
  const grouped = [...groups]
    .map(([group, amount]) => ({ group, amount }))
    .sort((a, b) => b.amount - a.amount);
  const updateCost = (sku: string, value: string) => {
    if (value.trim() === "") {
      onCostChange(sku, Number.NaN);
      return;
    }
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) onCostChange(sku, number);
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <Card title="정산 기준 이익 추정">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            정산순액에서 입력한 상품원가를 차감한 참고값입니다.
          </p>
          <button
            disabled={!salesAvailable}
            onClick={() => setEditing((value) => !value)}
            className="rounded-full border border-[#cce1da] bg-[#f2f8f5] px-4 py-2 text-xs font-semibold text-[#147d73] transition hover:bg-[#e4f1ec]"
          >
            {editing ? "원가 입력 닫기" : "SKU 원가 입력"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Metric label="아마존 정산순액" value={fmtUSD(profit.amazon_net)} />
          <Metric
            label="입력한 상품원가"
            value={salesAvailable ? fmtUSD(cogs) : "—"}
          />
          <Metric
            label={
              incomplete ? "이익 추정 · 원가 일부 누락" : "원가 차감 후 정산액"
            }
            value={salesAvailable ? fmtUSD(estimate) : "—"}
            accent
          />
          <Metric
            label="주문매출 대비 비율 · 참고"
            value={
              !salesAvailable || margin === null ? "—" : `${margin.toFixed(1)}%`
            }
          />
        </div>
        <div className="mt-5 rounded-2xl bg-[#f6f8f6] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-600">
              {salesAvailable
                ? `원가 입력 현황 · 판매 SKU ${filled} / ${selling.length}개`
                : "주문 조회 실패 · 원가 기반 수익은 계산하지 않습니다"}
            </span>
            <span className="text-[#147d73]">
              판매수량 기준 커버리지{" "}
              {coverage === null ? "—" : `${coverage.toFixed(1)}%`}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e1e8e4]">
            <div
              className="h-full rounded-full bg-[#147d73]"
              style={{ width: `${coverage ?? 0}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {incomplete &&
              "원가가 없는 SKU는 0으로 계산되어 이익이 높게 표시될 수 있습니다. "}
            정산일과 주문일의 집계 시점이 달라 이 비율은 회계상 순이익률과
            다릅니다.{" "}
            {profit.excludes.length > 0 &&
              `추정에서 제외: ${profit.excludes.join(", ")}.`}
          </p>
        </div>
        {editing && (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[580px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-[#f8faf8] text-left text-xs text-slate-400">
                  <th className="px-4 py-3 font-medium">상품 / SKU</th>
                  <th className="px-4 py-3 text-right font-medium">판매수량</th>
                  <th className="px-4 py-3 text-right font-medium">
                    개당 원가 ({currency})
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    원가 합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {bySku.map((row) => (
                  <tr
                    key={row.sku}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="text-slate-700" title={row.product_name}>
                        {row.product_name.length > 35
                          ? row.product_name.slice(0, 34) + "…"
                          : row.product_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {row.sku}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {row.units.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`${row.sku} 개당 원가 ${currency}`}
                        value={costs[row.sku] ?? ""}
                        onChange={(event) =>
                          updateCost(row.sku, event.target.value)
                        }
                        placeholder="미입력"
                        className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-right text-slate-700 outline-none focus:border-[#147d73] focus:ring-2 focus:ring-[#147d73]/10"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {hasCost(row.sku)
                        ? fmtUSD(costs[row.sku] * row.units)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
              입력값은 이 브라우저에 저장됩니다. 다른 기기나 브라우저에는
              공유되지 않습니다.
            </p>
          </div>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric
          label="정산 수입"
          value={fmtUSD(finance.totals.income)}
          accent
        />
        <Metric label="정산 차감" value={fmtUSD(finance.totals.deductions)} />
        <Metric label="순 정산액" value={fmtUSD(finance.totals.net)} accent />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="정산 수입 · 정산순액 추이">
          <p className="mb-5 text-xs text-slate-500">
            정산 발생일 기준 · 상품원가 차감 전
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={finance.daily}
              margin={{ left: 0, right: 12, bottom: 5 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 5"
                stroke="#e9edeb"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => String(value).slice(5)}
                tick={{ fontSize: 11, fill: "#87938f" }}
                minTickGap={28}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#87938f" }}
                width={60}
                tickFormatter={(value) => `$${value}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => fmtUSD(Number(value))}
                contentStyle={tooltipStyle}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="#cfd8d3" />
              <Line
                type="monotone"
                dataKey="revenue"
                name="정산 수입"
                stroke="#8ebdb5"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="net_profit"
                name="정산순액"
                stroke="#147d73"
                dot={false}
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="정산 항목 구성">
          <p className="mb-5 text-xs text-slate-500">
            구분별 합계 · 수입 + / 차감 −
          </p>
          <ResponsiveContainer
            width="100%"
            height={Math.max(300, grouped.length * 36)}
          >
            <BarChart
              layout="vertical"
              data={grouped}
              margin={{ left: 0, right: 24 }}
              barSize={18}
            >
              <CartesianGrid
                horizontal={false}
                strokeDasharray="3 5"
                stroke="#e9edeb"
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#87938f" }}
                tickFormatter={(value) => `$${value}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="group"
                width={90}
                tick={{ fontSize: 11, fill: "#64746e" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => fmtUSD(Number(value))}
                contentStyle={tooltipStyle}
              />
              <ReferenceLine x={0} stroke="#cfd8d3" />
              <Bar dataKey="amount" name="금액" radius={5}>
                {grouped.map((row) => (
                  <Cell
                    key={row.group}
                    fill={
                      GROUP_COLOR[row.group] ??
                      (row.amount < 0 ? "#dc8b53" : "#147d73")
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card title="전체 정산 항목 상세">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="pb-3 pr-4 font-medium">구분</th>
                <th className="pb-3 pr-4 font-medium">항목</th>
                <th className="pb-3 text-right font-medium">
                  금액 ({currency})
                </th>
              </tr>
            </thead>
            <tbody>
              {finance.breakdown.map((row, index) => (
                <tr
                  key={`${row.group}-${row.type}-${index}`}
                  className="border-b border-slate-100 last:border-0 hover:bg-[#f8faf9]"
                >
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#f4f7f4] px-3 py-1 text-xs font-medium text-slate-600">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: GROUP_COLOR[row.group] ?? "#8b9792",
                        }}
                      />
                      {row.group}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{row.type}</td>
                  <td
                    className={`py-3 text-right font-semibold ${row.amount < 0 ? "text-[#c28255]" : "text-[#147d73]"}`}
                  >
                    {fmtUSD(row.amount)}
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
