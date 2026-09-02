import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vision Check Platform",
  description: "Browser-based online vision check. Phase A prototype.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-full bg-neutral-950 font-sans text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
