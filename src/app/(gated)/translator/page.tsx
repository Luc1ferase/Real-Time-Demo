import type { Metadata } from "next";
import { TranslatorClient } from "./translator-client";

export const metadata: Metadata = {
  title: "Live Translator — Realtime Voice Demo",
  description:
    "Continuous speech-to-speech translation using OpenAI's dedicated gpt-realtime-translate endpoint.",
};

export default function TranslatorPage() {
  return <TranslatorClient />;
}
