import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale, messagesFor } from "@/lib/i18n/server";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const devanagari = Noto_Sans_Devanagari({ variable: "--font-devanagari", subsets: ["devanagari"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "SAMVAAD", template: "%s · SAMVAAD" },
  description:
    "An AI-assisted mentoring copilot that turns every school visit into one evidence-backed, followed-up coaching cycle. Prototype with fictional demo data.",
  // Installable as an app: manifest in src/app/manifest.ts, service worker in public/sw.js
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "SAMVAAD", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0f1b33", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = messagesFor(locale);
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} ${devanagari.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider locale={locale} messages={messages}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-white"
          >
            {messages["common.skipToContent"]}
          </a>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
