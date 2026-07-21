import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "애월초 학급 전시실",
  description: "한 학급이 1년간 만든 미술·글쓰기 결과물을 3D 가상 공간에 전시하는 플랫폼",
};

/**
 * `viewportFit: 'cover'` 가 **반드시** 있어야 한다.
 *
 * 이게 없으면 `env(safe-area-inset-*)` 이 아이폰에서 **항상 0** 으로 나온다.
 * 안전영역을 쓰는 CSS(.pos-top-safe, .pad-bottom-safe)를 아무리 짜도
 * 조용히 아무 일도 안 하는 죽은 코드가 된다 — 실제로 그랬다.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.dataset.theme='dark';}catch(e){}`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-[var(--color-surface)] text-[var(--color-text-main)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
