"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { shortName } from "@/lib/api";
import { Card, ErrorBanner, Metric } from "./ui";

type InventoryItem = DashboardData["inventory"]["items"][number];

export default function InventoryTab({
  inventory,
  bySku = [],
  days,
}: {
  inventory: DashboardData["inventory"];
  bySku?: DashboardData["sales"]["by_sku"];
  days?: number;
}) {
  if (inventory.error)
    return <ErrorBanner label="재고" error={inventory.error} />;
  if (inventory.items.length === 0)
    return <Card>현재 재고가 있는 상품이 없습니다.</Card>;

  // FBA can return several condition / fulfillment rows for one seller SKU.
  const grouped = new Map<string, InventoryItem>();
  for (const item of inventory.items) {
    const previous = grouped.get(item.sku);
    if (!previous) grouped.set(item.sku, { ...item });
    else {
      previous.fulfillable_quantity += item.fulfillable_quantity;
      previous.inbound_quantity += item.inbound_quantity;
      previous.reserved_quantity += item.reserved_quantity;
      previous.total_quantity += item.total_quantity;
    }
  }
  const sold = new Map<string, number>();
  for (const row of bySku)
    sold.set(row.sku, (sold.get(row.sku) ?? 0) + row.units);
  const rows = [...grouped.values()]
    .map((row) => {
      const product = bySku.find((item) => item.sku === row.sku);
      if (!row.product_name || row.product_name === "-")
        row.product_name = product?.product_name || row.sku;
      const units = sold.get(row.sku) ?? 0;
      const cover =
        days && days > 0 && units > 0
          ? row.fulfillable_quantity / (units / days)
          : null;
      return { ...row, units, cover };
    })
    .sort((a, b) => b.fulfillable_quantity - a.fulfillable_quantity);
  const totals = rows.reduce(
    (total, row) => ({
      available: total.available + row.fulfillable_quantity,
      reserved: total.reserved + row.reserved_quantity,
      inbound: total.inbound + row.inbound_quantity,
    }),
    { available: 0, reserved: 0, inbound: 0 },
  );
  const low = rows.filter((row) =>
    row.cover !== null ? row.cover < 30 : row.fulfillable_quantity < 50,
  );
  const number = (value: number) => value.toLocaleString("ko-KR");

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="가용 재고" value={number(totals.available)} accent />
        <Metric label="예약 재고" value={number(totals.reserved)} />
        <Metric label="입고 예정" value={number(totals.inbound)} />
        <Metric label="재고 보유 SKU" value={number(rows.length)} />
      </div>
      {low.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] border border-[#ecd8c8] bg-[#fbf3eb] px-5 py-4">
          <span className="text-sm font-semibold text-[#a65f32]">
            재입고 검토 · {low.length}개 SKU
          </span>
          <span className="text-xs text-[#9b765b]">
            커버일 30일 미만 · 판매 데이터가 없으면 가용 재고 50개 미만
          </span>
        </div>
      )}
      <Card title="재고 구성">
        <p className="mb-5 text-xs text-slate-500">
          같은 SKU의 재고를 합산했습니다. 가용·예약·입고 예정 수량을 비교하세요.
        </p>
        <ResponsiveContainer
          width="100%"
          height={Math.max(260, rows.length * 43)}
        >
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ left: 0, right: 24 }}
            barSize={20}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 5"
              stroke="#e9edeb"
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#87938f" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sku"
              width={120}
              tick={{ fontSize: 11, fill: "#64746e" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 14,
                border: "1px solid #e6ece9",
                fontSize: 12,
              }}
              labelFormatter={(label) =>
                shortName(
                  rows.find((row) => row.sku === label)?.product_name ??
                    String(label),
                  45,
                )
              }
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 15 }}
            />
            <Bar
              stackId="inventory"
              dataKey="fulfillable_quantity"
              name="가용"
              fill="#147d73"
            />
            <Bar
              stackId="inventory"
              dataKey="reserved_quantity"
              name="예약"
              fill="#8ebdb5"
            />
            <Bar
              stackId="inventory"
              dataKey="inbound_quantity"
              name="입고 예정"
              fill="#dc8b53"
              radius={[0, 5, 5, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="SKU별 재고 · 판매 속도">
        <p className="mb-4 text-xs leading-5 text-slate-500">
          커버일 = 가용 재고 ÷ 조회 기간의 일평균 판매수량. 판매 이력이 없거나
          기간을 알 수 없으면 —로 표시합니다. 입고 일정·수요 변동은 반영하지
          않은 참고값입니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[730px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="pb-3 pr-4 font-medium">상품 / SKU</th>
                <th className="pb-3 pr-4 text-right font-medium">가용</th>
                <th className="pb-3 pr-4 text-right font-medium">예약</th>
                <th className="pb-3 pr-4 text-right font-medium">입고 예정</th>
                <th className="pb-3 pr-4 text-right font-medium">총 재고</th>
                <th className="pb-3 pr-4 text-right font-medium">기간 판매</th>
                <th className="pb-3 text-right font-medium">커버일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.sku}
                  className="border-b border-slate-100 last:border-0 hover:bg-[#f8faf9]"
                >
                  <td className="py-4 pr-4">
                    <div
                      className="font-medium text-slate-700"
                      title={row.product_name}
                    >
                      {shortName(row.product_name, 38)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{row.sku}</div>
                  </td>
                  <td className="py-4 pr-4 text-right font-semibold text-[#147d73]">
                    {number(row.fulfillable_quantity)}
                  </td>
                  <td className="py-4 pr-4 text-right text-slate-500">
                    {number(row.reserved_quantity)}
                  </td>
                  <td className="py-4 pr-4 text-right text-slate-500">
                    {number(row.inbound_quantity)}
                  </td>
                  <td className="py-4 pr-4 text-right">
                    {number(row.total_quantity)}
                  </td>
                  <td className="py-4 pr-4 text-right text-slate-500">
                    {number(row.units)}
                  </td>
                  <td className="py-4 text-right">
                    <span
                      className={
                        row.cover !== null && row.cover < 30
                          ? "rounded-full bg-[#fbf0e6] px-3 py-1 text-xs font-semibold text-[#b47446]"
                          : "text-slate-600"
                      }
                    >
                      {row.cover === null
                        ? "—"
                        : `${row.cover.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}일`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {inventory.hidden > 0 && (
          <p className="mt-4 text-xs text-slate-400">
            재고가 0인 원본 항목 {inventory.hidden}개는 숨겼습니다.
          </p>
        )}
      </Card>
    </div>
  );
}
