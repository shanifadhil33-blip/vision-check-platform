import type { Metadata } from "next";
import { LANDOLT_PAGE_TITLE } from "@/lib/acuity/landoltWording";
import LandoltClient from "./LandoltClient";

export const metadata: Metadata = {
  title: LANDOLT_PAGE_TITLE,
  robots: { index: false, follow: false },
};

export default function LandoltPage() {
  return <LandoltClient />;
}
