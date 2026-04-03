import "../styles/globals.css";
import type { Metadata } from "next";
import { Figtree, Noto_Sans } from "next/font/google";
import React from "react";
import { TelemetryProvider } from "../shared/contexts/TelemetryContext";

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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${notoSans.variable} font-sans`}>
        <TelemetryProvider>
          {children}
        </TelemetryProvider>
      </body>
    </html>
  );
}
