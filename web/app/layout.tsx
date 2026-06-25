import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon 셀러 대시보드",
  description: "Amazon SP-API 기반 셀러 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
