"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { shortName } from "@/lib/api";
import { Card, ErrorBanner } from "./ui";

export default function InventoryTab({ inventory }: { inventory: DashboardData["inventory"] }) {
  if (inventory.error) return <ErrorBanner label="재고" error={inventory.error} />;
  if (inventory.items.length === 0)
    return <Card>현재 재고가 있는 상품이 없습니다.</Card>;

  const low = inventory.items.filter((i) => i.fulfillable_quantity < 50);

  return (
    <div className="grid grid-cols-1 gap-5">
      {low.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          ⚠️ 재입고 검토 필요 {low.length}개 (가용 재고 50개 미만)
        </div>
      )}
      {inventory.hidden > 0 && (
        <p className="text-xs text-slate-400">재고 0인 상품 {inventory.hidden}개는 숨겼습니다.</p>
      )}

      <Card title="SKU별 총 재고">
        <ResponsiveContainer width="100%" height={Math.max(240, inventory.items.length * 34)}>
          <BarChart layout="vertical" data={inventory.items} margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="sku" width={130} tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(l) => {
                const row = inventory.items.find((r) => r.sku === l);
                return row ? shortName(row.product_name, 50) : String(l);
              }}
            />
            <Bar dataKey="total_quantity" name="총 수량" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="재고 상세">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">상품명</th>
                <th className="py-2 pr-4 text-right">가용</th>
                <th className="py-2 pr-4 text-right">입고예정</th>
                <th className="py-2 text-right">총</th>
              </tr>
            </thead>
            <tbody>
              {inventory.items.map((r) => (
                <tr key={r.sku} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{r.sku}</td>
                  <td className="py-2 pr-4 text-slate-600" title={r.product_name}>
                    {shortName(r.product_name, 48)}
                  </td>
                  <td className="py-2 pr-4 text-right">{r.fulfillable_quantity}</td>
                  <td className="py-2 pr-4 text-right">{r.inbound_quantity}</td>
                  <td className="py-2 text-right font-medium">{r.total_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
