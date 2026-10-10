import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OLYVIA · Seller Workspace",
  description: "OLYVIA의 매출, 재고, 정산과 광고 성과를 연결하는 Amazon 셀러 워크스페이스",
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
