import type { ReactNode } from "react";

/**
 * Layout for the display surface: the laptop, monitor or tablet the patient
 * stands away from. Kept separate from the remote surface because the two have
 * different viewport assumptions and, later, different display conditions.
 */
export default function DisplayLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col">{children}</div>;
}
