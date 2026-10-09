import type { Metadata } from "next";
import CheckClient from "./CheckClient";

export const metadata: Metadata = {
  title: "Screen drawing check",
  robots: { index: false, follow: false },
};

export default function CheckPage() {
  return <CheckClient />;
}
