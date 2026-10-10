"use client";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { fmtUSD, fmtNum } from "@/lib/api";
import { Card, ErrorBanner, Metric } from "./ui";
import Icon from "./Icon";
export default function AdsTab({
  ads,
  trueProfit,
  salesDaily,
  days,
  settlementAvailable = true,
  salesAvailable = true,
}: {
  ads: DashboardData["ads"];
  trueProfit: number;
  salesDaily: DashboardData["sales"]["daily"];
  days: number;
  settlementAvailable?: boolean;
  salesAvailable?: boolean;
}) {
  if (ads.error) return <ErrorBanner label="광고" error={ads.error} />;
  const realSpend = ads.settlement_spend;
  const revenue = salesDaily.reduce((sum, row) => sum + row.revenue, 0);
  const spendRatio =
    settlementAvailable && salesAvailable && revenue > 0
      ? (realSpend / revenue) * 100
      : null;
  const live = ads.mode === "live";
  const s = ads.summary;
  return (
    <div className="grid grid-cols-1 gap-5">
      <Card title="정산에 반영된 광고비">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Metric
            label="정산 차감 광고비"
            value={settlementAvailable ? fmtUSD(realSpend) : "—"}
          />
          <Metric
            label="정산 광고비 / 주문매출"
            value={spendRatio !== null ? `${spendRatio.toFixed(1)}%` : "—"}
          />
          <Metric
            label="일평균 정산 광고비 (참고)"
            value={
              settlementAvailable && days > 0 ? fmtUSD(realSpend / days) : "—"
            }
          />
          <Metric
            label="원가 반영 수익 (광고 포함)"
            value={
              settlementAvailable && salesAvailable ? fmtUSD(trueProfit) : "—"
            }
            accent
          />
        </div>
        <p className="chart-caption">
          정산에서 차감된 광고비는 수익에 이미 반영되어 있습니다. 청구일과 실제
          집행일은 다를 수 있어 일별 집행액·ACOS로 해석하지 않습니다. 원가
          미입력 시 수익은 추정값입니다.
        </p>
      </Card>
      {!live ? (
        <>
          <section className="dashboard-card ads-connect">
            <div className="ads-connect-icon">
              <Icon name="megaphone" size={32} />
            </div>
            <span className="small-badge">AMAZON ADS · 미연동</span>
            <h2>광고의 성과까지 연결하세요.</h2>
            <p>
              캠페인별 매출, ACOS, ROAS는 별도의 Amazon Ads API 연동이
              필요합니다.
            </p>
            <div className="ads-locked-metrics">
              {["광고 기여 매출", "ACOS", "ROAS", "클릭 · 노출"].map(
                (label) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>—</strong>
                    <small>연동 후 제공</small>
                  </div>
                ),
              )}
            </div>
            <details>
              <summary>연동에 필요한 항목 보기</summary>
              <p>
                Amazon Ads API 접근 권한과 해당 광고 계정의 프로필 연결이
                필요합니다. 실제 성과 데이터가 제공되면 이 화면의 차트가
                표시됩니다.
              </p>
            </details>
          </section>
          <Card title="데이터를 구분해 읽기">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {[
                ["정산 광고비", "Amazon 정산에서 실제 차감된 금액입니다."],
                [
                  "광고 성과",
                  "Amazon Ads API가 제공하는 광고 기여 매출과 캠페인 지표입니다.",
                ],
                [
                  "현재 표시 기준",
                  "샘플 광고 수치를 제거했습니다. 미연동 지표는 값 대신 —로 표시합니다.",
                ],
              ].map(([title, text]) => (
                <div key={title}>
                  <h3 className="text-xs font-semibold text-brand">{title}</h3>
                  <p className="chart-caption">{text}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="광고 집행액 (Ads API)" value={fmtUSD(s.spend)} />
            <Metric label="광고 기여 매출" value={fmtUSD(s.ad_sales)} />
            <Metric label="ACOS" value={s.ad_sales > 0 ? `${s.acos}%` : "—"} />
            <Metric label="ROAS" value={s.spend > 0 ? `${s.roas}×` : "—"} />
          </div>
          <Card title="광고비와 광고 기여 매출">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={ads.daily}
                margin={{ left: 0, right: 12, top: 12 }}
                accessibilityLayer
              >
                <CartesianGrid
                  strokeDasharray="3 6"
                  vertical={false}
                  stroke="#edf1eb"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => d.slice(5)}
                  minTickGap={25}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip formatter={(value) => fmtUSD(Number(value))} />
                <Legend />
                <Bar
                  dataKey="spend"
                  name="광고 집행액"
                  fill="#dc8b53"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
                <Line
                  dataKey="ad_sales"
                  name="광고 기여 매출"
                  stroke="#147d73"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="노출수" value={fmtNum(s.impressions)} />
            <Metric label="클릭수" value={fmtNum(s.clicks)} />
            <Metric label="CTR" value={`${s.ctr}%`} />
            <Metric label="CPC" value={fmtUSD(s.cpc)} />
          </div>
          <Card title="캠페인별 성과">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pr-4">캠페인</th>
                    <th className="text-right pr-4">광고비</th>
                    <th className="text-right pr-4">기여 매출</th>
                    <th className="text-right">ACOS</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.by_name.map((row) => (
                    <tr className="border-b" key={row.name}>
                      <td className="pr-4 font-medium">{row.name}</td>
                      <td className="text-right pr-4">{fmtUSD(row.spend)}</td>
                      <td className="text-right pr-4">
                        {fmtUSD(row.ad_sales)}
                      </td>
                      <td className="text-right">
                        {row.ad_sales > 0 ? `${row.acos}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!ads.by_name.length && (
              <p className="empty-state">이 기간의 캠페인 데이터가 없습니다.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
