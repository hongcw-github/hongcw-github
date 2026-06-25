import type { DashboardData } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchDashboard(days: number): Promise<DashboardData> {
  const res = await fetch(`${BASE}/api/dashboard?days=${days}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return res.json();
}

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);

export const shortName = (s: string, n = 36) =>
  s && s.length > n ? s.slice(0, n - 1) + "…" : s;
