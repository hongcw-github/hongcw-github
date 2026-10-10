import test from "node:test";
import assert from "node:assert/strict";
import {
  weeklySales,
  fillSalesDates,
  buildPareto,
  consolidateRegions,
} from "../lib/analytics.ts";

test("fills calendar gaps with zero only within observed endpoints, without mutating input", () => {
  const raw = [
    { date: "2026-10-05", revenue: 30, units: 3 },
    { date: "2026-10-03", revenue: 10, units: 1 },
  ];
  const filled = fillSalesDates(raw);
  assert.deepEqual(filled, [
    { date: "2026-10-03", revenue: 10, units: 1 },
    { date: "2026-10-04", revenue: 0, units: 0 },
    { date: "2026-10-05", revenue: 30, units: 3 },
  ]);
  assert.equal(raw[0].date, "2026-10-05");
  assert.equal(
    filled.reduce((sum, row) => sum + row.revenue, 0),
    40,
  );
});

test("empty/single/invalid data never extends to an inferred current date", () => {
  assert.deepEqual(fillSalesDates([]), []);
  assert.deepEqual(
    fillSalesDates([
      { date: "not-date", revenue: 2, units: 1 },
      { date: "2026-02-31", revenue: 2, units: 1 },
    ]),
    [],
  );
  assert.deepEqual(
    fillSalesDates([{ date: "2025-01-01", revenue: 2, units: 1 }]),
    [{ date: "2025-01-01", revenue: 2, units: 1 }],
  );
});

test("zero fill follows UTC calendar across daylight-saving and leap-day boundaries", () => {
  assert.deepEqual(
    fillSalesDates([
      { date: "2026-03-07", revenue: 1, units: 1 },
      { date: "2026-03-09", revenue: 1, units: 1 },
    ]).map((row) => row.date),
    ["2026-03-07", "2026-03-08", "2026-03-09"],
  );
  assert.equal(
    fillSalesDates([
      { date: "2024-02-28", revenue: 1, units: 1 },
      { date: "2024-03-01", revenue: 1, units: 1 },
    ])[1].date,
    "2024-02-29",
  );
});

test("weekly aggregation uses ISO Monday across the year boundary and zero fill preserves totals", () => {
  const raw = [
    { date: "2025-12-31", revenue: 2, units: 1 },
    { date: "2026-01-04", revenue: 3, units: 2 },
    { date: "2026-01-05", revenue: 7, units: 1 },
  ];
  const expected = [
    { date: "2025-12-29", revenue: 5, units: 3 },
    { date: "2026-01-05", revenue: 7, units: 1 },
  ];
  assert.deepEqual(weeklySales(raw), expected);
  assert.deepEqual(weeklySales(fillSalesDates(raw)), expected);
});

test("Pareto includes the product crossing eighty percent and handles exact/empty cases", () => {
  const rows = [
    { sku: "A", revenue: 64.3, cum_pct: 64.3 },
    { sku: "B", revenue: 35.7, cum_pct: 100 },
  ];
  assert.equal(buildPareto(rows).count, 2);
  assert.equal(
    buildPareto([
      { sku: "A", revenue: 80, cum_pct: 80 },
      { sku: "B", revenue: 20, cum_pct: 100 },
    ]).count,
    1,
  );
  assert.equal(buildPareto([]).count, 0);
  assert.equal(buildPareto([{ sku: "A", revenue: 0, cum_pct: 100 }]).count, 0);
});

test("Pareto sorts the input without mutation and recalculates cumulative values", () => {
  const rows = [
    { sku: "B", revenue: 20, cum_pct: 1 },
    { sku: "A", revenue: 80, cum_pct: 1 },
  ];
  const result = buildPareto(rows);
  assert.equal(result.data[0].sku, "A");
  assert.equal(result.data[0].cum_pct, 80);
  assert.equal(rows[0].sku, "B");
});

test("Canadian province abbreviations and accents merge without losing sales or units", () => {
  const rows = consolidateRegions([
    { ship_state: "QC", revenue: 2, units: 1 },
    { ship_state: "Québec", revenue: 3, units: 2 },
    { ship_state: "ON", revenue: 4, units: 1 },
    { ship_state: "Ontario", revenue: 1, units: 1 },
    { ship_state: "BC", revenue: 1, units: 1 },
    { ship_state: "British Columbia", revenue: 2, units: 1 },
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.find((row) => row.ship_state === "Québec"),
    { ship_state: "Québec", revenue: 5, units: 3 },
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.revenue, 0),
    13,
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.units, 0),
    7,
  );
});
