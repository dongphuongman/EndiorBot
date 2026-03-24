/**
 * Environment Variable Validation Schema
 *
 * Sprint 116 T4: Zod-based validation of critical env vars at startup.
 * Fail-fast with clear error messages instead of silent misconfiguration.
 *
 * @module config/env-schema
 * @version 1.0.0
 */

import { z } from "zod";

/**
 * Schema for gateway-related env vars.
 */
export const GatewayEnvSchema = z.object({
  ENDIORBOT_GATEWAY_PORT: z.coerce.number().min(1).max(65535).default(18790),
  ENDIORBOT_GATEWAY_HOST: z.string().default("127.0.0.1"),
  ENDIORBOT_GATEWAY_AUTH: z.enum(["true", "false", "1", "0"]).default("false"),
  ENDIORBOT_GATEWAY_TOKEN: z.string().optional(),
  ENDIORBOT_CORS_ORIGINS: z.string().optional(),
});

/**
 * Schema for AI provider env vars (at least one should be present).
 */
export const ProviderEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
});

/**
 * Combined env schema for serve startup.
 */
export const ServeEnvSchema = GatewayEnvSchema.merge(ProviderEnvSchema).passthrough();

export type ServeEnv = z.infer<typeof ServeEnvSchema>;

/**
 * Validate environment variables for serve command.
 * Returns parsed env or throws with clear error messages.
 */
export function validateServeEnv(env: Record<string, string | undefined> = process.env): ServeEnv {
  const result = ServeEnvSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }

  return result.data;
}

/**
 * Check if at least one AI provider key is configured.
 * Returns warning message if none found (non-fatal).
 */
export function checkProviderKeys(env: ServeEnv): string | null {
  const hasKey = env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
  if (!hasKey) {
    return "No AI provider API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY for AI features.";
  }
  return null;
}
