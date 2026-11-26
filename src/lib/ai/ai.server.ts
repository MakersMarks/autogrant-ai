import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, APICallError, stepCountIs, type ToolSet } from "ai";
import { createLovableAiGatewayProvider } from "./gateway.server";
import { LOVABLE_MODEL, resolveAiConfig, safeProviderMessage } from "./ai-config";

const MODEL = LOVABLE_MODEL;
const GENERIC_FAILURE = "The AI request failed. Please try again.";

/**
 * Chooses the AI provider from server secrets (see ai-config.ts):
 * `AI_PROVIDER_API_KEY` uses the owner's own provider account; otherwise Lovable's AI Gateway
 * (`LOVABLE_API_KEY`) is used, including its persisted pause when credits run out.
 */
async function prepareModel() {
  const config = resolveAiConfig(process.env);
  if (config.kind === "unconfigured") throw new Error("AI is not configured yet.");

  if (config.kind === "own-provider") {
    const provider = createOpenAICompatible({
      name: "own-provider",
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    });
    return { model: provider.chatModel(config.model), supabaseAdmin: undefined };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: blocked, error: stateError } = await supabaseAdmin
    .from("ai_gateway_state")
    .select("reason")
    .eq("model_id", MODEL)
    .maybeSingle();
  if (stateError) throw new Error("AI access status could not be checked.");
  if (blocked) throw new Error(blocked.reason);

  const provider = createLovableAiGatewayProvider(config.apiKey, undefined, {
    baseURL: "https://ai.gateway.lovable.dev",
  });
  return { model: provider.chatModel(MODEL), supabaseAdmin };
}

type PreparedModel = Awaited<ReturnType<typeof prepareModel>>;

async function failureMessage(
  failure: unknown,
  supabaseAdmin: PreparedModel["supabaseAdmin"],
): Promise<string> {
  const status = APICallError.isInstance(failure) ? failure.statusCode : undefined;
  let message = GENERIC_FAILURE;
  if (APICallError.isInstance(failure)) {
    message = safeProviderMessage(failure.responseBody) ?? message;
  }
  // Only Lovable gateway billing/permission errors are persisted as a pause.
  if ((status === 402 || status === 403) && supabaseAdmin) {
    const { error } = await supabaseAdmin.from("ai_gateway_state").upsert({
      model_id: MODEL,
      reason: message,
    });
    if (error) console.error("Could not persist AI access pause");
  }
  if (status === 429 && message === GENERIC_FAILURE) {
    message = "AI is busy. Wait before starting a fresh request.";
  }
  return message;
}

export async function generateWithGemini(
  system: string,
  prompt: string,
  image?: { data: Uint8Array; mediaType: string },
): Promise<string> {
  const { model, supabaseAdmin } = await prepareModel();
  let failure: unknown;
  const result = streamText({
    model,
    system,
    ...(image
      ? {
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: prompt },
                { type: "image" as const, image: image.data, mediaType: image.mediaType },
              ],
            },
          ],
        }
      : { prompt }),
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
  if (failure) throw new Error(await failureMessage(failure, supabaseAdmin));
  if (!text.trim()) throw new Error("The AI returned an empty response.");
  return text.trim();
}

export async function generateCopilotWithTools(
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  tools: ToolSet,
): Promise<string> {
  const { model, supabaseAdmin } = await prepareModel();
  let failure: unknown;
  const result = streamText({
    model,
    system,
    messages,
    tools,
    stopWhen: stepCountIs(5),
    maxRetries: 0,
    onError: ({ error }) => {
      failure = error;
    },
  });
  let text = "";
  try {
    text = await result.text;
  } catch (error) {
    failure ??= error;
  }
  if (failure) throw new Error(await failureMessage(failure, supabaseAdmin));
  if (!text.trim()) throw new Error("The AI returned an empty response.");
  return text.trim();
}
