/**
 * Tool definitions for the AI Mock Interviewer. These are provider-agnostic
 * — the adapter layer in `provider.ts` rewrites the JSON Schema to each
 * provider's wire format.
 *
 * `advance_stage` moves the interview through warmup → technical →
 * behavioral → feedback. `generate_scorecard` is called once at the very
 * end of the feedback stage.
 */

import type { ToolDefinition } from "./types";
import { INTERVIEW_STAGES, type InterviewStage } from "./interview-instructions";

export const ADVANCE_STAGE_TOOL: ToolDefinition = {
  name: "advance_stage",
  description:
    "Move the interview to the next stage. Use only after the user has answered the current stage's questions to your satisfaction. Do not skip stages — call this once per transition.",
  parameters: {
    type: "object",
    properties: {
      next_stage: {
        type: "string",
        enum: INTERVIEW_STAGES,
        description:
          "The stage to move to. Should follow the natural progression: warmup → technical → behavioral → feedback.",
      },
    },
    required: ["next_stage"],
    additionalProperties: false,
  },
};

export const GENERATE_SCORECARD_TOOL: ToolDefinition = {
  name: "generate_scorecard",
  description:
    "Produce the final scorecard. Call ONLY ONCE at the end of the feedback stage, after thanking the candidate. Do not call this from any other stage.",
  parameters: {
    type: "object",
    properties: {
      communication: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        description: "How clearly the candidate communicated, on a 1-5 scale.",
      },
      technical_depth: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        description: "Depth of technical knowledge demonstrated, 1-5.",
      },
      structured_thinking: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        description:
          "How structured the candidate's thinking and problem decomposition were, 1-5.",
      },
      summary: {
        type: "string",
        description:
          "A 2-3 sentence summary of overall performance. Honest and constructive.",
      },
    },
    required: [
      "communication",
      "technical_depth",
      "structured_thinking",
      "summary",
    ],
    additionalProperties: false,
  },
};

export const INTERVIEW_TOOLS: ToolDefinition[] = [
  ADVANCE_STAGE_TOOL,
  GENERATE_SCORECARD_TOOL,
];

export interface ScorecardPayload {
  communication: number;
  technical_depth: number;
  structured_thinking: number;
  summary: string;
}

export function isValidStage(value: unknown): value is InterviewStage {
  return (
    typeof value === "string" &&
    (INTERVIEW_STAGES as string[]).includes(value)
  );
}

export function parseScorecardArgs(
  args: Record<string, unknown>,
): ScorecardPayload | null {
  // Clamp to the documented 1-5 range so a hallucinated 7 doesn't crash the
  // renderer. The model is told to use 1-5; we treat anything outside as a
  // bug and clip rather than error.
  const clamp = (n: unknown): number => {
    const v = typeof n === "number" ? n : Number.parseFloat(String(n));
    if (!Number.isFinite(v)) return 0;
    return Math.max(1, Math.min(5, Math.round(v)));
  };
  const summaryRaw = args.summary;
  const summary = typeof summaryRaw === "string" ? summaryRaw.trim() : "";
  if (!summary) return null;
  return {
    communication: clamp(args.communication),
    technical_depth: clamp(args.technical_depth),
    structured_thinking: clamp(args.structured_thinking),
    summary,
  };
}
