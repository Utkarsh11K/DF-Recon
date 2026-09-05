import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FusionConvert — Reconciliation Platform",
  description: "Oracle Fusion data conversion and reconciliation dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans text-ink-900 antialiased">{children}</body>
    </html>
  );
}
