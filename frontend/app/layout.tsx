import "../styles/globals.css";
import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans } from "next/font/google";
import React from "react";
import { TelemetryProvider } from "../shared/contexts/TelemetryContext";
import ServiceWorkerRegistrar from "../shared/components/ServiceWorkerRegistrar";

const figtree = Figtree({ 
  subsets: ["latin"],
  variable: '--font-figtree',
});

const notoSans = Noto_Sans({ 
  subsets: ["latin"],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans',
});

export const metadata: Metadata = {
  title: "SkillSync",
  description: "Real-time procedural skill intelligence dashboard",
  manifest: "/manifest.webmanifest",
  applicationName: "SkillSync",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SkillSync",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0891b2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${notoSans.variable} font-sans`}>
        <ServiceWorkerRegistrar />
        <TelemetryProvider>
          {children}
        </TelemetryProvider>
      </body>
    </html>
  );
}
