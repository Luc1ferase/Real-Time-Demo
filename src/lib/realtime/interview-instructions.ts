/**
 * System instructions for the AI Mock Interviewer. The instructions are
 * stage-aware: `buildInstructions` returns the prompt for the current stage
 * and the orchestrating client swaps it via `session.updateInstructions`
 * after each `advance_stage` tool call.
 *
 * Keeping the prompts in one module lets us tweak persona/voice once and
 * have it apply to both providers (the abstraction layer doesn't care
 * what the strings are).
 */

export type JobTrack = "frontend" | "backend" | "fullstack";
export type Difficulty = "easy" | "medium" | "hard";
export type InterviewStage =
  | "warmup"
  | "technical"
  | "behavioral"
  | "feedback";

export const INTERVIEW_STAGES: InterviewStage[] = [
  "warmup",
  "technical",
  "behavioral",
  "feedback",
];

const JOB_LABEL: Record<JobTrack, string> = {
  frontend: "Frontend Engineer",
  backend: "Backend Engineer",
  fullstack: "Full-Stack Engineer",
};

const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: "junior-level (0-2 years of experience)",
  medium: "mid-level (3-5 years of experience)",
  hard: "senior-level (5+ years of experience)",
};

interface BuildOptions {
  job: JobTrack;
  difficulty: Difficulty;
  stage: InterviewStage;
}

const PERSONA = (job: JobTrack, difficulty: Difficulty) =>
  [
    `You are conducting a structured technical interview for a ${JOB_LABEL[job]} role at a US tech company. The candidate is ${DIFFICULTY_HINT[difficulty]}.`,
    `Be warm but professional. Keep every turn short (2-4 sentences) — let the candidate talk. Speak clearly and avoid filler.`,
    `You have two tools available: \`advance_stage\` to move to the next interview phase, and \`generate_scorecard\` to wrap up. Call them when (and only when) the criteria below are met.`,
  ].join(" ");

const STAGE_BODY: Record<InterviewStage, string> = {
  warmup: [
    "STAGE: warmup. Open with a brief greeting and 1 ice-breaker question (e.g. recent project they're excited about, how they got into the field).",
    "Then ask 1 background question to understand their experience.",
    "Aim for ~2-3 minutes total. When you have a clear sense of the candidate's background, call `advance_stage` with `next_stage: \"technical\"`.",
    "Do NOT ask technical or behavioral questions here.",
  ].join(" "),
  technical: [
    "STAGE: technical. Ask 2-3 technical questions appropriate to the candidate's experience level.",
    "Mix one conceptual question (e.g. how X works) with one applied question (e.g. how would you design Y).",
    "Listen actively — ask one clarifying follow-up if the answer is incomplete, but do not turn it into a quiz show.",
    "When you have enough signal on technical depth, call `advance_stage` with `next_stage: \"behavioral\"`.",
  ].join(" "),
  behavioral: [
    "STAGE: behavioral. Ask 1-2 STAR-format behavioral questions (Situation, Task, Action, Result).",
    "Examples: a time they disagreed with a teammate; a project that didn't go as planned; how they handled an ambiguous requirement.",
    "Keep the candidate talking; reflect their answers back briefly to confirm understanding.",
    "When you have enough signal on collaboration and judgment, call `advance_stage` with `next_stage: \"feedback\"`.",
  ].join(" "),
  feedback: [
    "STAGE: feedback. Thank the candidate by acknowledging one specific thing they did well.",
    "Give 1-2 sentences of overall feedback — honest but constructive.",
    "Then IMMEDIATELY call `generate_scorecard` with scores 1-5 on `communication`, `technical_depth`, `structured_thinking`, and a 2-3 sentence `summary`.",
    "After the tool returns, say a brief sign-off (e.g. \"thanks for your time — best of luck\") and stop.",
    "Do NOT call `advance_stage` from this stage.",
  ].join(" "),
};

export function buildInstructions(options: BuildOptions): string {
  const { job, difficulty, stage } = options;
  return `${PERSONA(job, difficulty)}\n\n${STAGE_BODY[stage]}`;
}

export function nextStage(current: InterviewStage): InterviewStage | null {
  const idx = INTERVIEW_STAGES.indexOf(current);
  if (idx < 0 || idx >= INTERVIEW_STAGES.length - 1) return null;
  return INTERVIEW_STAGES[idx + 1];
}
