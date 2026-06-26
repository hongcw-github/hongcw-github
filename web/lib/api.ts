import type { DashboardData } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const KEY_STORE = "dash_key";

export function getKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY_STORE) || "";
}

export function setKey(k: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY_STORE, k);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function fetchDashboard(days: number, refresh = false): Promise<DashboardData> {
  const url = `${BASE}/api/dashboard?days=${days}${refresh ? "&refresh=1" : ""}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "X-Dashboard-Key": getKey() },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);

export const shortName = (s: string, n = 36) =>
  s && s.length > n ? s.slice(0, n - 1) + "…" : s;
