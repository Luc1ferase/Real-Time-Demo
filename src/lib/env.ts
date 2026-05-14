import { z } from "zod";

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  DEMO_PASSWORD: z.string().min(1, "DEMO_PASSWORD is required"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DEMO_PASSWORD: process.env.DEMO_PASSWORD,
  });
}
