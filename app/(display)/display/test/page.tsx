import type { Metadata } from "next";
import TestClient from "./TestClient";

export const metadata: Metadata = {
  title: "Vision check",
};

export default function TestPage() {
  return <TestClient />;
}
