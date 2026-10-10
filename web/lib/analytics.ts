import type { DashboardData } from "./types";

export function weeklySales(rows: DashboardData["sales"]["daily"]) {
  const grouped = new Map<
    string,
    { date: string; revenue: number; units: number }
  >();
  for (const row of rows) {
    const date = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const monday = date.toISOString().slice(0, 10);
    const week = grouped.get(monday) || { date: monday, revenue: 0, units: 0 };
    week.revenue += row.revenue;
    week.units += row.units;
    grouped.set(monday, week);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const PROVINCES: Record<string, string> = {
  on: "Ontario",
  ontario: "Ontario",
  bc: "British Columbia",
  "british columbia": "British Columbia",
  qc: "Québec",
  pq: "Québec",
  quebec: "Québec",
  ab: "Alberta",
  alberta: "Alberta",
  mb: "Manitoba",
  manitoba: "Manitoba",
  sk: "Saskatchewan",
  saskatchewan: "Saskatchewan",
  ns: "Nova Scotia",
  "nova scotia": "Nova Scotia",
  nb: "New Brunswick",
  "new brunswick": "New Brunswick",
  nl: "Newfoundland and Labrador",
  nf: "Newfoundland and Labrador",
  newfoundland: "Newfoundland and Labrador",
  "newfoundland and labrador": "Newfoundland and Labrador",
  pe: "Prince Edward Island",
  pei: "Prince Edward Island",
  "prince edward island": "Prince Edward Island",
  yt: "Yukon",
  yukon: "Yukon",
  nt: "Northwest Territories",
  "northwest territories": "Northwest Territories",
  nu: "Nunavut",
  nunavut: "Nunavut",
};

export function consolidateRegions(
  rows: NonNullable<DashboardData["insights"]["by_state"]>,
) {
  const regions = new Map<
    string,
    { ship_state: string; revenue: number; units: number }
  >();
  for (const row of rows) {
    const normalized = row.ship_state
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ");
    const name = PROVINCES[normalized] || row.ship_state.trim() || "미상";
    const previous = regions.get(name) || {
      ship_state: name,
      revenue: 0,
      units: 0,
    };
    previous.revenue += row.revenue;
    previous.units += row.units;
    regions.set(name, previous);
  }
  return [...regions.values()].sort((a, b) => b.revenue - a.revenue);
}

export function buildPareto(
  rows: NonNullable<DashboardData["insights"]["pareto"]>,
) {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((sum, row) => sum + Math.max(0, row.revenue), 0);
  let running = 0;
  const data = sorted.map((row) => {
    running += Math.max(0, row.revenue);
    return { ...row, cum_pct: total > 0 ? (running / total) * 100 : 0 };
  });
  const thresholdIndex = data.findIndex((row) => row.cum_pct >= 80 - 1e-9);
  return {
    data,
    count: total > 0 && thresholdIndex >= 0 ? thresholdIndex + 1 : 0,
    total,
  };
}

export function fillSalesDates(rows: DashboardData["sales"]["daily"]) {
  const valid = rows
    .filter((row) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return false;
      const date = new Date(`${row.date}T00:00:00Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === row.date
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!valid.length) return [];
  const byDate = new Map<string, DashboardData["sales"]["daily"][number]>();
  for (const row of valid) {
    const previous = byDate.get(row.date);
    byDate.set(
      row.date,
      previous
        ? {
            date: row.date,
            revenue: previous.revenue + row.revenue,
            units: previous.units + row.units,
          }
        : { ...row },
    );
  }
  const result: DashboardData["sales"]["daily"] = [];
  const date = new Date(`${valid[0].date}T00:00:00Z`);
  const end = valid[valid.length - 1].date;
  while (date.toISOString().slice(0, 10) <= end) {
    const key = date.toISOString().slice(0, 10);
    result.push(byDate.get(key) || { date: key, revenue: 0, units: 0 });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return result;
}
