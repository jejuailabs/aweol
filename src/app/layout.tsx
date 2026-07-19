import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "애월초 학급 전시실",
  description: "한 학급이 1년간 만든 미술·글쓰기 결과물을 3D 가상 공간에 전시하는 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--color-surface)] text-[var(--color-text-main)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
