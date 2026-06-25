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
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>}
      {children}
    </div>
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
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-brand" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

export function ErrorBanner({ label, error }: { label: string; error: ApiError }) {
  const forbidden =
    error.message.includes("Forbidden") ||
    error.message.includes("denied") ||
    error.type.includes("Forbidden");
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm">
      <div className="font-semibold text-amber-800">
        ⚠️ {label} 데이터를 불러오지 못했습니다 — {error.type}
      </div>
      {forbidden && (
        <p className="mt-2 text-amber-700">
          접근 권한(role) 문제이거나 해당 기능을 쓰지 않는 계정일 수 있습니다.
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-amber-700">자세히</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-amber-900">
          {error.message}
        </pre>
      </details>
    </div>
  );
}
