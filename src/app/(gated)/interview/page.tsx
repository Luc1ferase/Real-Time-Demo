import type { Metadata } from "next";
import { InterviewClient } from "./interview-client";

export const metadata: Metadata = {
  title: "AI Mock Interviewer — Realtime Voice Demo",
  description:
    "Voice-driven structured interview with stage progression and a scorecard.",
};

export default function InterviewPage() {
  return <InterviewClient />;
}
