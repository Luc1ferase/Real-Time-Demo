import type { Metadata } from "next";
import { HistoryClient } from "./history-client";

export const metadata: Metadata = {
  title: "Interview history — Realtime Voice Demo",
  description:
    "Browse, review, and delete past interview sessions stored in this browser.",
};

export default function HistoryPage() {
  return <HistoryClient />;
}
