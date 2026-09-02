import type { ReactNode } from "react";

/**
 * Layout for the remote surface: the phone held by the patient. Kept separate
 * from the display surface because the two have different viewport
 * assumptions and, later, different display conditions.
 */
export default function RemoteLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col">{children}</div>;
}
