// SKU별 매입원가를 브라우저(localStorage)에 저장/로드. 사용자가 화면에서 입력한다.
const STORE = "sku_costs";

export type CostMap = Record<string, number>;

export function loadCosts(): CostMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

export function saveCosts(costs: CostMap) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORE, JSON.stringify(costs));
  }
}
