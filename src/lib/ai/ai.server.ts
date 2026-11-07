import { streamText, APICallError } from "ai";
import { createLovableAiGatewayProvider } from "./gateway.server";

const MODEL = "google/gemini-3-flash-preview";

export async function generateWithGemini(system: string, prompt: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet.");
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: blocked, error: stateError } = await supabaseAdmin.from('ai_gateway_state').select('reason').eq('model_id', MODEL).maybeSingle();
  if (stateError) throw new Error('AI access status could not be checked.');
  if (blocked) throw new Error(blocked.reason);
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
    let message = 'The AI request failed. Please try again.';
    if (APICallError.isInstance(failure) && failure.responseBody) {
      try {
        const body = JSON.parse(failure.responseBody);
        const safe = body.message ?? body.error?.message;
        if (typeof safe === 'string') message = safe;
      } catch { /* Non-JSON errors must not leak raw HTML. */ }
    }
    if (status === 402 || status === 403) {
      const { error } = await supabaseAdmin.from('ai_gateway_state').upsert({ model_id: MODEL, reason: message });
      if (error) console.error('Could not persist AI access pause');
    }
    if (status === 429 && message === 'The AI request failed. Please try again.') message = 'AI is busy. Wait before starting a fresh request.';
    throw new Error(message);
  }
  if (!text.trim()) throw new Error("The AI returned an empty response.");
  return text.trim();
}
