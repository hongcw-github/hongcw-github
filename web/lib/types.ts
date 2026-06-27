export interface ApiError {
  type: string;
  message: string;
}

export interface DashboardData {
  mode: "mock" | "live";
  marketplace: string;
  days: number;
  kpis: {
    revenue: number;
    net_profit: number;
    units: number;
    orders: number;
    aov: number;
  };
  sales: {
    daily: { date: string; revenue: number; units: number }[];
    by_sku: { sku: string; product_name: string; revenue: number; units: number }[];
    status: { status: string; count: number }[];
    error: ApiError | null;
  };
  insights: {
    pareto?: { sku: string; revenue: number; cum_pct: number }[];
    by_weekday?: { weekday: number; revenue: number }[];
    by_hour?: { hour: number; revenue: number }[];
    by_state?: { ship_state: string; revenue: number; units: number }[];
    promo?: { total_discount: number; discounted_share: number; discounted_revenue: number };
    cancel?: { rate: number; canceled: number; total: number };
    weekly?: { week: string; revenue: number }[];
    tz?: string;
  };
  inventory: {
    items: {
      sku: string;
      asin: string | null;
      product_name: string;
      fulfillable_quantity: number;
      inbound_quantity: number;
      reserved_quantity: number;
      total_quantity: number;
    }[];
    hidden: number;
    error: ApiError | null;
  };
  finance: {
    daily: {
      date: string;
      revenue: number;
      total_fees: number;
      net_profit: number;
      units: number;
    }[];
    breakdown: { group: string; type: string; amount: number }[];
    totals: { income: number; deductions: number; net: number };
    error: ApiError | null;
  };
  profit: {
    amazon_net: number;
    cogs: number;
    true_profit: number;
    cogs_known: number;
    units: number;
    excludes: string[];
  };
  ads: {
    mode: "mock" | "live";
    settlement_spend: number;
    summary: {
      spend: number;
      ad_sales: number;
      impressions: number;
      clicks: number;
      orders: number;
      acos: number;
      roas: number;
      ctr: number;
      cpc: number;
    };
    daily: { date: string; spend: number; ad_sales: number }[];
    by_name: { name: string; spend: number; ad_sales: number; acos: number }[];
    error: ApiError | null;
  };
}
