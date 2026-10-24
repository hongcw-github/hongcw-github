import type { DashboardData, InventoryHistoryData } from "./types";
const BASE =
  // The legacy API_URL setting still points at the retired Render service.
  process.env.NEXT_PUBLIC_SELLER_API_URL ||
  "https://hongcw-github-419197548925.us-east1.run.app";
const KEY_STORE = "dash_key";
let displayCurrency = "CAD";
export function configureCurrency(currency: string) {
  displayCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "CAD";
}
export function getKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY_STORE) || "";
  } catch {
    return "";
  }
}
export function setKey(key: string) {
  if (typeof window !== "undefined")
    window.localStorage.setItem(KEY_STORE, key);
}
export class UnauthorizedError extends Error {
  constructor() {
    super("대시보드 접근 키를 확인해주세요.");
    this.name = "UnauthorizedError";
  }
}
async function request<T = DashboardData>(
  path: string,
  dashboard = true,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  try {
    const key = getKey();
    const response = await fetch(`${BASE}${path}`, {
      cache: "no-store",
      headers: key ? { "X-Dashboard-Key": key } : {},
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new UnauthorizedError();
    if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`);
    const data = await response.json();
    if (
      dashboard &&
      !data.building &&
      (!data.kpis || !data.sales || !data.finance || !data.inventory)
    )
      throw new Error("서버 데이터 형식을 확인할 수 없습니다.");
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("조회 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export function fetchInventoryHistory(days: number) {
  return request<InventoryHistoryData>(
    `/api/inventory/history?days=${days}`,
    false,
  );
}
export function fetchDashboard(days: number, refresh = false) {
  return request(
    `/api/dashboard?days=${days}${refresh ? "&refresh=1&refresh_sources=1" : ""}`,
  );
}
export function fetchHistory(range: string, refresh = false) {
  return request(
    `/api/history?range=${encodeURIComponent(range)}${refresh ? "&refresh=1" : ""}`,
  );
}
export const fmtUSD = (value: number) =>
  !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: displayCurrency,
      }).format(Number.isFinite(value) ? value : 0);
export const fmtNum = (value: number) =>
  new Intl.NumberFormat("ko-KR").format(value);
export const shortName = (value: string, length = 36) =>
  value && value.length > length ? value.slice(0, length - 1) + "…" : value;
