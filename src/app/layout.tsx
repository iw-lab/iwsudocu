import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppUpdateChecker } from "@/components/AppUpdateChecker";
import { IOSInstallPrompt } from "@/components/IOSInstallPrompt";
import { AccessibilitySync } from "@/components/AccessibilitySync";
import "../gb/gb-ui.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "칸채움 - 두뇌 스도쿠",
  description:
    "매일 새로운 도전, 매일 더 강해지는 두뇌. 무한 스도쿠 퍼즐을 즐기세요!",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "칸채움",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#4F46E5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="칸채움" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/icons/icon-192.png"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#4F46E5" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
        >
          <ServiceWorkerRegister />
          <AppUpdateChecker />
          <IOSInstallPrompt />
          <AccessibilitySync />
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 2000,
              style: {
                background: "#1e293b",
                color: "#e2e8f0",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: "14px",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
