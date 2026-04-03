import "../styles/globals.css";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "GripSense",
  description: "Real-time procedural skill intelligence",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
