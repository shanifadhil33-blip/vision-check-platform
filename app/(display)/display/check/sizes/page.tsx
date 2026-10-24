import type { Metadata } from "next";
import SizeCheckClient from "./SizeCheckClient";

export const metadata: Metadata = {
  title: "Letter size check",
  robots: { index: false, follow: false },
};

export default function SizeCheckPage() {
  return <SizeCheckClient />;
}
