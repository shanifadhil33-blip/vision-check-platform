import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Throwaway staff pages for the camera distance spike. Linked from nowhere,
 * kept out of search engines, no database.
 */
export const metadata: Metadata = {
  title: "Camera spike (staff only)",
  robots: { index: false, follow: false, nocache: true },
};

export default function SpikeLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col">{children}</div>;
}
