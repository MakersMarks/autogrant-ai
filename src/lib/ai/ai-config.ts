// Pure AI provider selection. It only reads the environment object it is given and never
// touches the network, so it is safe to unit test. Secret values stay on the server: only
// server-only modules (ai.server.ts) pass `process.env` in here.

export const LOVABLE_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_PROVIDER_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
export const DEFAULT_PROVIDER_MODEL = "gemini-2.5-flash";

export type AiConfig =
  | {
      /** The owner's own provider account (any OpenAI-compatible API). Lovable credits are not used. */
      kind: "own-provider";
      apiKey: string;
      baseURL: string;
      model: string;
    }
  | {
      /** Lovable's AI Gateway (default). Billed against Lovable credits. */
      kind: "lovable";
      apiKey: string;
      model: string;
    }
  | { kind: "unconfigured" };

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Picks the AI provider from server environment variables.
 *
 * - `AI_PROVIDER_API_KEY` set -> use that provider directly (defaults to Google Gemini's
 *   OpenAI-compatible endpoint). Optional: `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_MODEL`.
 * - otherwise `LOVABLE_API_KEY` set -> Lovable AI Gateway (unchanged default behavior).
 * - otherwise unconfigured.
 */
export function resolveAiConfig(env: Record<string, string | undefined>): AiConfig {
  const ownKey = clean(env["AI_PROVIDER_API_KEY"]);
  if (ownKey) {
    return {
      kind: "own-provider",
      apiKey: ownKey,
      baseURL: (clean(env["AI_PROVIDER_BASE_URL"]) || DEFAULT_PROVIDER_BASE_URL).replace(/\/+$/, ""),
      model: clean(env["AI_PROVIDER_MODEL"]) || DEFAULT_PROVIDER_MODEL,
    };
  }
  const lovableKey = clean(env["LOVABLE_API_KEY"]);
  if (lovableKey) return { kind: "lovable", apiKey: lovableKey, model: LOVABLE_MODEL };
  return { kind: "unconfigured" };
}

/** Pulls a readable message out of a provider error body without ever returning raw HTML. */
export function safeProviderMessage(responseBody: string | undefined): string | undefined {
  if (!responseBody) return undefined;
  try {
    const body: unknown = JSON.parse(responseBody);
    const first = Array.isArray(body) ? body[0] : body;
    if (first && typeof first === "object") {
      const record = first as { message?: unknown; error?: { message?: unknown } };
      const message = record.message ?? record.error?.message;
      if (typeof message === "string" && message.trim()) return message;
    }
  } catch {
    // Non-JSON errors must not leak raw HTML.
  }
  return undefined;
}
