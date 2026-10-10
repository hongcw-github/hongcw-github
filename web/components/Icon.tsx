import type { CSSProperties } from "react";
export type IconName =
  | "grid"
  | "trend"
  | "box"
  | "wallet"
  | "megaphone"
  | "refresh"
  | "download"
  | "arrow"
  | "check"
  | "clock"
  | "settings"
  | "globe"
  | "chevron";
const paths: Record<IconName, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-10" />
      <path d="M15 5h6v6" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5.8l10 5.5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="M3 10h18M16 15h2M5 6V4h13" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10h5l11-6v16l-11-6H4zM7 14l2 6h3l-2-5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5M5.6 7a8 8 0 0113.6 1M18.4 17A8 8 0 014.8 16" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  check: <path d="M5 12l4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" fill="currentColor" />
      <circle cx="15" cy="17" r="3" fill="currentColor" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  chevron: <path d="M9 5l7 7-7 7" />,
};
export default function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
