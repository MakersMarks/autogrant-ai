import { streamText, APICallError } from "ai";
import { createLovableAiGatewayProvider } from "./gateway.server";

const MODEL = "google/gemini-3-flash-preview";

export async function generateWithGemini(system: string, prompt: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI is not configured yet.");
  const provider = createLovableAiGatewayProvider(key, undefined, {
    baseURL: "https://ai.gateway.lovable.dev",
  });
  let failure: unknown;
  const result = streamText({
    model: provider.chatModel(MODEL),
    system,
    prompt,
    maxRetries: 0,
    onError: ({ error }) => {
      failure = error;
    },
  });
  let text = "";
  try {
    text = await result.text;
  } catch (e) {
    failure ??= e;
  }
  if (failure) {
    const status = APICallError.isInstance(failure) ? failure.statusCode : undefined;
    if (status === 429) throw new Error("AI is busy right now. Please wait a moment and try again.");
    if (status === 402) throw new Error("AI credits are used up. Add credits in your workspace to continue.");
    if (status === 403) throw new Error("AI access is blocked for this workspace.");
    console.error(failure);
    throw new Error("The AI request failed. Please try again.");
  }
  if (!text.trim()) throw new Error("The AI returned an empty response.");
  return text.trim();
}
