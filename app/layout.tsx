import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "In-App Message 재설계 · 테스트 콘솔",
  description: "인앱 마케팅 팝업 재설계 프로토타입 (기획서 기반 테스트 페이지)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white">
        <TopBar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
