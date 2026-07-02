import type { DashboardData } from "./types";

// 백엔드: GCP Cloud Run (공개 엔드포인트라 코드에 직접 고정 — Vercel 환경변수 불필요)
const BASE = "https://hongcw-github-419197548925.us-east1.run.app";

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

// 연도별/전체 히스토리 (Firestore 백필 원본으로 조립 — 응답 형태는 대시보드와 동일)
export async function fetchHistory(range: string, refresh = false): Promise<DashboardData> {
  const url = `${BASE}/api/history?range=${encodeURIComponent(range)}${refresh ? "&refresh=1" : ""}`;
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
