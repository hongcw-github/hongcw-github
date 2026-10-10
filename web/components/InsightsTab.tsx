"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { fmtUSD, shortName } from "@/lib/api";
import { Card, Metric } from "./ui";
import { buildPareto, consolidateRegions } from "@/lib/analytics";

const WD = ["월", "화", "수", "목", "금", "토", "일"];
const TEAL = "#147d73";
const ORANGE = "#dc8b53";
const tooltipStyle = {
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 8px 30px #0f172a12",
  fontSize: 12,
};
const axis = { fontSize: 11, fill: "#84908d" };

function Empty({ label = "집계된 데이터가 없습니다." }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl bg-slate-50 px-5 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

export default function InsightsTab({
  insights,
}: {
  insights: DashboardData["insights"];
}) {
  if (!insights)
    return (
      <Card>
        <Empty label="분석할 주문 데이터가 없습니다." />
      </Card>
    );
  const {
    data: pareto,
    count: core80,
    total,
  } = buildPareto(insights.pareto || []);
  const weekday = [...(insights.by_weekday || [])]
    .sort((a, b) => a.weekday - b.weekday)
    .map((row) => ({ ...row, label: WD[row.weekday] }));
  const hour = [...(insights.by_hour || [])].sort((a, b) => a.hour - b.hour);
  const state = consolidateRegions(insights.by_state || []).slice(0, 15);
  const promo = insights.promo;
  const cancel = insights.cancel;
  const weekly = [...(insights.weekly || [])].sort((a, b) =>
    a.week.localeCompare(b.week),
  );
  const priceTrack = insights.price_track || [];
  const cancelBySku = [...(insights.cancel_by_sku || [])]
    .filter((row) => row.total >= 3)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 12);
  const changedCount = priceTrack.filter((row) => row.changed).length;
  const strongestDay = [...weekday].sort((a, b) => b.revenue - a.revenue)[0];
  const bestHour = [...hour].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="매출 80%에 도달하는 SKU"
          value={core80 ? `${core80}개` : "—"}
          accent
        />
        <Metric
          label="취소율"
          value={cancel ? `${cancel.rate.toFixed(1)}%` : "—"}
        />
        <Metric
          label="할인 주문 비중"
          value={promo ? `${promo.discounted_share.toFixed(1)}%` : "—"}
        />
        <Metric
          label="총 할인액"
          value={promo ? fmtUSD(promo.total_discount) : "—"}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[20px] border border-[#d5e8e3] bg-[#edf6f3] p-5">
          <p className="text-xs font-semibold tracking-wide text-brand">
            상품 집중도
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {total > 0
              ? `상위 ${core80}개 상품이 매출의 80% 이상을 차지합니다. 해당 상품의 재고와 수익성을 함께 확인하세요.`
              : "상품별 매출이 쌓이면 집중도를 확인할 수 있습니다."}
          </p>
        </div>
        <div className="rounded-[20px] border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-slate-500">
            판매가 모이는 시간
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {strongestDay?.revenue > 0 && bestHour?.revenue > 0
              ? `${strongestDay.label}요일과 ${bestHour.hour}시의 누적 매출이 가장 높습니다. 광고 시간 최적화 전, 충분한 주문 표본을 확인하세요.`
              : "요일·시간별 집계가 아직 충분하지 않습니다."}
          </p>
        </div>
        <div className="rounded-[20px] border border-[#eedfd1] bg-[#faf3eb] p-5">
          <p className="text-xs font-semibold tracking-wide text-[#a36636]">
            해석할 때 확인하세요
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            선택 기간의 누적 결과입니다. 요일 수·주문 표본·할인 조건 차이를
            보정한 인과 분석은 아닙니다.
          </p>
        </div>
      </div>

      <Card title="매출은 어디에 집중되어 있나요?">
        <div className="mb-5 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <p>상품별 매출과 누적 비중 · 매출 상위 15개</p>
          <p>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#147d73]" />{" "}
            매출{" "}
            <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-full bg-[#dc8b53]" />{" "}
            누적 비중
          </p>
        </div>
        {pareto.length && total > 0 ? (
          <div
            role="img"
            aria-label={`상품별 매출 파레토 차트. 상위 ${core80}개 상품이 매출 80% 이상 차지`}
          >
            <ResponsiveContainer width="100%" height={310}>
              <ComposedChart
                data={pareto
                  .slice(0, 15)
                  .map((row, i) => ({ ...row, label: `상품 ${i + 1}` }))}
                margin={{ top: 15, left: 0, right: 8 }}
                accessibilityLayer
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#edf0ef"
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="label"
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="l"
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  domain={[0, 100]}
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <ReferenceLine
                  yAxisId="r"
                  y={80}
                  stroke="#a9b5b2"
                  strokeDasharray="5 5"
                  label={{
                    value: "80%",
                    fill: "#84908d",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) =>
                    name === "누적 비중"
                      ? `${Number(value).toFixed(1)}%`
                      : fmtUSD(Number(value))
                  }
                  labelFormatter={(_, payload) => payload[0]?.payload?.sku}
                />
                <Bar
                  yAxisId="l"
                  dataKey="revenue"
                  name="매출"
                  barSize={38}
                  radius={[6, 6, 0, 0]}
                >
                  {pareto.slice(0, 15).map((row, i) => (
                    <Cell key={row.sku} fill={i < core80 ? TEAL : "#b8d3ce"} />
                  ))}
                </Bar>
                <Line
                  yAxisId="r"
                  dataKey="cum_pct"
                  name="누적 비중"
                  stroke={ORANGE}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: ORANGE, stroke: "white", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty />
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {pareto.slice(0, 15).map((row, i) => (
            <span
              key={row.sku}
              className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"
              title={row.sku}
            >
              <b className="mr-2 text-slate-700">상품 {i + 1}</b>
              {shortName(row.sku, 32)}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="요일별 판매 패턴">
          <p className="mb-5 text-xs text-slate-500">
            요일별 누적 매출 · 주말은 주황색
          </p>
          {weekday.length ? (
            <div role="img" aria-label="요일별 누적 매출">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={weekday} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#edf0ef" />
                  <XAxis
                    dataKey="label"
                    tick={axis}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => fmtUSD(Number(value))}
                  />
                  <Bar
                    dataKey="revenue"
                    name="매출"
                    radius={[5, 5, 0, 0]}
                    barSize={30}
                  >
                    {weekday.map((row) => (
                      <Cell
                        key={row.weekday}
                        fill={row.weekday >= 5 ? ORANGE : TEAL}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="시간대별 판매 패턴">
          <p className="mb-5 text-xs text-slate-500">
            {insights.tz || "시간대 정보 없음"} 기준 · 누적 매출
          </p>
          {hour.length ? (
            <div role="img" aria-label="시간대별 누적 매출">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hour} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#edf0ef" />
                  <XAxis
                    dataKey="hour"
                    tick={axis}
                    interval={2}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${value}시`}
                  />
                  <YAxis tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => fmtUSD(Number(value))}
                    labelFormatter={(value) => `${value}시`}
                  />
                  <Bar
                    dataKey="revenue"
                    name="매출"
                    fill="#91bfb5"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="고객은 어느 지역에 있나요?">
          <p className="mb-5 text-xs text-slate-500">
            지역별 매출 상위 15개 · 주 이름과 약어를 통합했습니다.
          </p>
          {state.length ? (
            <div role="img" aria-label="지역별 매출 순위">
              <ResponsiveContainer
                width="100%"
                height={Math.max(250, state.length * 34)}
              >
                <BarChart
                  layout="vertical"
                  data={state}
                  margin={{ right: 15 }}
                  accessibilityLayer
                >
                  <CartesianGrid horizontal={false} stroke="#edf0ef" />
                  <XAxis
                    type="number"
                    tick={axis}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="ship_state"
                    width={130}
                    tick={axis}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => fmtUSD(Number(value))}
                  />
                  <Bar
                    dataKey="revenue"
                    name="매출"
                    fill={TEAL}
                    barSize={16}
                    radius={[0, 5, 5, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="주간 매출의 흐름">
          <p className="mb-5 text-xs text-slate-500">
            월요일 시작 · 기간 양 끝 주는 부분 집계일 수 있습니다.
          </p>
          {weekly.length ? (
            <div role="img" aria-label="주간 매출 추이">
              <ResponsiveContainer
                width="100%"
                height={Math.max(250, state.length * 34)}
              >
                <AreaChart data={weekly} accessibilityLayer>
                  <defs>
                    <linearGradient
                      id="insightsWeekly"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={TEAL} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#edf0ef" />
                  <XAxis
                    dataKey="week"
                    tick={axis}
                    tickFormatter={(value) => String(value).slice(5)}
                    minTickGap={24}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => fmtUSD(Number(value))}
                    labelFormatter={(value) => `${value} 시작 주`}
                  />
                  <Area
                    dataKey="revenue"
                    name="주간 매출"
                    type="linear"
                    stroke={TEAL}
                    strokeWidth={2.5}
                    fill="url(#insightsWeekly)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="할인이 적용된 판매">
          <div className="space-y-4">
            {promo ? (
              <>
                <div className="flex justify-between border-b border-slate-100 pb-4 text-sm">
                  <span className="text-slate-500">총 할인액</span>
                  <b>{fmtUSD(promo.total_discount)}</b>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">할인 적용 주문 비중</span>
                  <b>{promo.discounted_share.toFixed(1)}%</b>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">할인 주문 매출</span>
                  <b>{fmtUSD(promo.discounted_revenue)}</b>
                </div>
                <p className="pt-2 text-xs leading-5 text-slate-400">
                  할인 주문의 집계이며, 할인으로 늘어난 순증 매출을 뜻하지
                  않습니다.
                </p>
              </>
            ) : (
              <Empty label="프로모션 데이터가 없습니다." />
            )}
          </div>
        </Card>
        <Card title="취소 주문 확인">
          <div className="space-y-4">
            {cancel ? (
              <>
                <p className="text-3xl font-semibold text-slate-900">
                  {cancel.rate.toFixed(1)}
                  <span className="ml-1 text-lg text-slate-400">%</span>
                </p>
                <p className="text-sm text-slate-500">
                  집계 대상 {cancel.total}건 중 {cancel.canceled}건 취소
                </p>
                <p className="text-xs leading-5 text-slate-400">
                  상품별 집계와 전체 집계의 대상 기준이 다를 수 있습니다. 표본이
                  작은 상품의 취소율은 변동이 큽니다.
                </p>
              </>
            ) : (
              <Empty label="취소 데이터가 없습니다." />
            )}
          </div>
        </Card>
      </div>

      <Card title="상품별 취소율">
        <p className="mb-5 text-xs text-slate-500">
          주문 3건 이상 · 취소율 상위 12개 상품
        </p>
        {cancelBySku.length ? (
          <div className="space-y-5">
            {cancelBySku.map((row) => (
              <div key={row.sku}>
                <div className="mb-2 flex justify-between gap-4 text-sm">
                  <span
                    className="min-w-0 truncate text-slate-600"
                    title={row.sku}
                  >
                    {shortName(
                      row.product_name && row.product_name !== "-"
                        ? row.product_name
                        : row.sku,
                      56,
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-slate-800">
                    {row.rate.toFixed(1)}%{" "}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {row.canceled}/{row.total}건
                    </span>
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="meter"
                  aria-label={`${row.sku} 취소율`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={row.rate}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, row.rate))}%`,
                      background: row.rate >= 10 ? ORANGE : TEAL,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty label="주문 3건 이상인 상품의 취소 집계가 없습니다." />
        )}
      </Card>
      <Card title={`판매가 변화 · 변동 상품 ${changedCount}개`}>
        {priceTrack.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                상품별 관측 판매가와 기간 최저, 최고, 변동폭
              </caption>
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="pb-4 font-medium">상품</th>
                  <th className="pb-4 text-right font-medium">최근 관측가</th>
                  <th className="pb-4 pl-4 text-right font-medium">최저</th>
                  <th className="pb-4 pl-4 text-right font-medium">최고</th>
                  <th className="pb-4 pl-4 text-right font-medium">변동폭</th>
                </tr>
              </thead>
              <tbody>
                {priceTrack.map((row) => (
                  <tr
                    key={row.sku}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-4 pr-4">
                      <p
                        className="font-medium text-slate-700"
                        title={row.product_name}
                      >
                        {shortName(row.product_name || row.sku, 48)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{row.sku}</p>
                    </td>
                    <td className="py-4 text-right tabular-nums">
                      {fmtUSD(row.current)}
                    </td>
                    <td className="py-4 pl-4 text-right tabular-nums text-slate-500">
                      {fmtUSD(row.min)}
                    </td>
                    <td className="py-4 pl-4 text-right tabular-nums text-slate-500">
                      {fmtUSD(row.max)}
                    </td>
                    <td
                      className={`py-4 pl-4 text-right font-medium ${row.changed ? "text-[#a36636]" : "text-slate-400"}`}
                    >
                      {row.changed ? fmtUSD(row.spread) : "변동 없음"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty label="판매가 관측 데이터가 없습니다." />
        )}
        <p className="mt-4 text-xs text-slate-400">
          선택 기간 주문에서 관측한 가격입니다. 현재 리스팅 가격과 다를 수
          있습니다.
        </p>
      </Card>
    </div>
  );
}
