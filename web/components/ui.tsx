import type { ApiError } from "@/lib/types";
export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`dashboard-card ${className}`}>
      {title && <h3 className="card-title">{title}</h3>}
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "metric-accent" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}
export function ErrorBanner({
  label,
  error,
}: {
  label: string;
  error: ApiError;
}) {
  return (
    <div role="alert" className="notice notice-error">
      <strong>{label} 데이터를 불러오지 못했습니다.</strong>
      <p className="mt-1">
        이 항목은 현재 분석에서 제외됩니다. 다시 조회하거나 연결 상태를
        확인해주세요.
      </p>
      <details className="mt-2">
        <summary>오류 상세</summary>
        <pre className="mt-2 whitespace-pre-wrap text-xs">
          {error.type}: {error.message}
        </pre>
      </details>
    </div>
  );
}
