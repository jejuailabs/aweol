import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";

/**
 * 이름은 `lib/brand.ts` 한 곳에서 가져온다.
 * 여기 글자로 적어두면 퍼가기·설정 화면과 따로 놀다가 반드시 어긋난다.
 *
 * `openGraph` 를 함께 적는 이유: 카카오톡·문자로 링크를 보내면 미리보기가
 * 뜨는데, 이게 없으면 **주소만 덜렁** 간다. 퍼가기를 붙여 놓고 미리보기를
 * 안 챙기면 절반만 한 셈이다.
 */
export const metadata: Metadata = {
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: BRAND_TAGLINE,
  openGraph: {
    title: BRAND,
    description: BRAND_TAGLINE,
    type: 'website',
    locale: 'ko_KR',
    siteName: BRAND,
  },
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
