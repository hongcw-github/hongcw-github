"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchInventoryHistory, shortName } from "@/lib/api";
import { Card } from "./ui";

export default function InventoryHistory() {
  const [days, setDays] = useState(30);
  const [sku, setSku] = useState("");
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["inventory-daily", days],
    () => fetchInventoryHistory(days),
    {
      refreshInterval: 300000,
      shouldRetryOnError: false,
      focusThrottleInterval: 60000,
    },
  );
  const products = new Map<string, string>();
  for (const record of data?.records ?? [])
    for (const item of record.items)
      products.set(item.sku, item.product_name || item.sku);
  const records = new Map(
    (data?.records ?? []).map((record) => [record.date, record]),
  );
  const dates = [
    ...new Set([...(data?.missing_dates ?? []), ...records.keys()]),
  ].sort();
  const rows = dates.map((date) => {
    const record = records.get(date);
    const item = sku
      ? record?.items.find((item) => item.sku === sku)
      : record?.totals;
    return {
      date,
      collected_at: record?.collected_at,
      available: item?.fulfillable_quantity ?? null,
      reserved: item?.reserved_quantity ?? null,
      inbound: item?.inbound_quantity ?? null,
      total: item?.total_quantity ?? null,
      status: !record ? "기록 없음" : !item ? "해당 SKU 미보고" : "저장됨",
    };
  });
  const quantity = (value: number | null) =>
    value === null ? "—" : value.toLocaleString("ko-KR");
  return (
    <Card title="일별 재고 기록">
      <p className="mb-4 text-sm leading-6 text-slate-500">
        자동 수집 시 날짜별로 저장하며, 같은 날은 마지막 정상 수집값을
        보관합니다. 기록이 없는 날과 실제 재고 0개를 구분합니다. 일 마감 확정
        수량은 아닙니다.
      </p>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">
          기록 기간
          <select
            aria-label="재고 기록 기간"
            className="mt-1 block rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
        </label>
        <label className="min-w-0 max-w-full text-xs text-slate-500">
          상품
          <select
            aria-label="재고 기록 상품"
            className="mt-1 block max-w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
          >
            <option value="">전체 상품 합계</option>
            {[...products].map(([key, name]) => (
              <option key={key} value={key}>
                {shortName(name, 32)} · {key}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 disabled:opacity-50"
          disabled={isValidating}
          onClick={() => void mutate()}
        >
          기록 다시 조회
        </button>
      </div>
      {error ? (
        <div role="alert" className="notice notice-error">
          일별 재고 기록을 불러오지 못했습니다. 기록 다시 조회를 눌러주세요.
        </div>
      ) : isLoading ? (
        <p role="status" className="text-sm text-slate-500">
          재고 기록을 불러오는 중입니다.
        </p>
      ) : data ? (
        <>
          <p className="mb-4 text-xs text-slate-500">
            {data.start_date} — {data.end_date} · {data.timezone} 기준 · 기록{" "}
            {data.records.length}일 / 미수집 {data.missing_dates.length}일
          </p>
          {data.records.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              아직 저장된 재고 기록이 없습니다. 첫 자동 수집이 성공하면 이곳에
              표시됩니다. 저장 시작 전 날짜의 수량은 추정하지 않습니다.
            </div>
          ) : (
            <>
              <div role="img" aria-label="일별 가용·예약·입고 예정 재고 추이">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart
                    data={rows}
                    margin={{ top: 12, right: 12, left: -15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 5" stroke="#e9edeb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date: string) => date.slice(5)}
                      tick={{ fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      dataKey="available"
                      name="가용"
                      stroke="#147d73"
                      connectNulls={false}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="reserved"
                      name="예약"
                      stroke="#8ebdb5"
                      connectNulls={false}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="inbound"
                      name="입고 예정"
                      stroke="#dc8b53"
                      connectNulls={false}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 max-h-96 overflow-auto">
                <table className="w-full min-w-[650px] text-right text-sm">
                  <caption className="sr-only">
                    날짜별 재고 수량과 수집 시각
                  </caption>
                  <thead className="sticky top-0 bg-white text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="p-3 text-left">
                        날짜
                      </th>
                      <th scope="col" className="p-3">
                        가용
                      </th>
                      <th scope="col" className="p-3">
                        예약
                      </th>
                      <th scope="col" className="p-3">
                        입고 예정
                      </th>
                      <th scope="col" className="p-3">
                        총 재고
                      </th>
                      <th scope="col" className="p-3">
                        수집 시각 / 상태
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((row) => (
                      <tr key={row.date} className="border-t border-slate-100">
                        <th
                          scope="row"
                          className="p-3 text-left font-normal text-slate-600"
                        >
                          {row.date}
                        </th>
                        <td className="p-3 font-semibold text-[#147d73]">
                          {quantity(row.available)}
                        </td>
                        <td className="p-3">{quantity(row.reserved)}</td>
                        <td className="p-3">{quantity(row.inbound)}</td>
                        <td className="p-3">{quantity(row.total)}</td>
                        <td className="p-3 text-xs text-slate-500">
                          {row.collected_at && row.status === "저장됨"
                            ? new Intl.DateTimeFormat("ko-KR", {
                                timeZone: data.timezone,
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              }).format(new Date(row.collected_at))
                            : row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            수량 증가는 입고뿐 아니라 반품·예약 해제·재고 조정으로도 발생할 수
            있습니다. 이 기록만으로 실제 입고일이나 입고 수량을 확정하지
            않습니다.
          </p>
        </>
      ) : null}
    </Card>
  );
}
