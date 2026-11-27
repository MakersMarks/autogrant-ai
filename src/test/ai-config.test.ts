import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROVIDER_BASE_URL,
  DEFAULT_PROVIDER_MODEL,
  LOVABLE_MODEL,
  resolveAiConfig,
  safeProviderMessage,
} from "@/lib/ai/ai-config";

describe("resolveAiConfig", () => {
  it("is unconfigured when no keys are set", () => {
    expect(resolveAiConfig({})).toEqual({ kind: "unconfigured" });
    expect(resolveAiConfig({ LOVABLE_API_KEY: "  ", AI_PROVIDER_API_KEY: "" })).toEqual({
      kind: "unconfigured",
    });
  });

  it("keeps the Lovable gateway as the default", () => {
    expect(resolveAiConfig({ LOVABLE_API_KEY: "lov-key" })).toEqual({
      kind: "lovable",
      apiKey: "lov-key",
      model: LOVABLE_MODEL,
    });
  });

  it("uses the owner's own provider key with Gemini defaults", () => {
    expect(resolveAiConfig({ AI_PROVIDER_API_KEY: " my-key " })).toEqual({
      kind: "own-provider",
      apiKey: "my-key",
      baseURL: DEFAULT_PROVIDER_BASE_URL,
      model: DEFAULT_PROVIDER_MODEL,
    });
  });

  it("prefers the own provider over Lovable when both are set", () => {
    const config = resolveAiConfig({ AI_PROVIDER_API_KEY: "mine", LOVABLE_API_KEY: "lov-key" });
    expect(config.kind).toBe("own-provider");
  });

  it("accepts a custom OpenAI-compatible base URL and model", () => {
    const config = resolveAiConfig({
      AI_PROVIDER_API_KEY: "mine",
      AI_PROVIDER_BASE_URL: "https://api.openai.com/v1///",
      AI_PROVIDER_MODEL: "gpt-4o-mini",
    });
    expect(config).toEqual({
      kind: "own-provider",
      apiKey: "mine",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });
  });
});

describe("safeProviderMessage", () => {
  it("reads gateway-style and provider-style error bodies", () => {
    expect(safeProviderMessage('{"message":"Out of credits"}')).toBe("Out of credits");
    expect(safeProviderMessage('{"error":{"message":"Quota exceeded"}}')).toBe("Quota exceeded");
    expect(safeProviderMessage('[{"error":{"message":"API key invalid"}}]')).toBe("API key invalid");
  });

  it("never returns raw HTML or empty bodies", () => {
    expect(safeProviderMessage("<html>502</html>")).toBeUndefined();
    expect(safeProviderMessage(undefined)).toBeUndefined();
    expect(safeProviderMessage("{}")).toBeUndefined();
  });
});
