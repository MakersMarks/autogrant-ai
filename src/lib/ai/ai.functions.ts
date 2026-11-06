import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateWithGemini } from "./ai.server";
import { sectorName } from "@/lib/grants";

type GrantInput = { title: string; funder: string; amount: string; eligibilityReason: string };

export const draftProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GrantInput) => {
    for (const k of ["title", "funder", "amount", "eligibilityReason"] as const) {
      if (typeof input?.[k] !== "string" || input[k].length > 500) throw new Error("Invalid grant");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: docs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("vault_documents").select("file_name, slot_key").eq("user_id", userId),
    ]);
    const voice = profile?.voice_profile
      ? `Write in this founder's voice. Style profile: ${profile.voice_profile}`
      : "Use a clear, confident, professional tone.";
    const system = `You are an expert federal grant writer. Draft persuasive, specific, honest proposal narratives. Never invent statistics; use bracketed placeholders like [metric] where facts are missing. ${voice}`;
    const prompt = `Draft a proposal narrative (about 350 words, plain text with short headed sections: Summary, Need, Approach, Budget Use, Impact) for:
Grant: ${data.title}
Funder: ${data.funder}
Amount requested: ${data.amount}
Eligibility: ${data.eligibilityReason}

Applicant:
Entity type: ${profile?.entity_type ?? "Unknown"}
Sector: ${sectorName(profile?.sector_code ?? "BC")}
Funding goal: ${profile?.funding_goal ?? "Unknown"}
Founder demographics: ${(profile?.demographics ?? []).join(", ") || "Not specified"}
Supporting documents on file: ${(docs ?? []).map((d) => d.file_name).join(", ") || "None"}`;
    return { narrative: await generateWithGemini(system, prompt) };
  });

export const calibrateVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sample: string }) => {
    const sample = String(input?.sample ?? "").trim();
    if (!sample) throw new Error("Please enter a writing sample first.");
    if (sample.length > 8000) throw new Error("Sample is too long (8,000 characters max).");
    return { sample };
  })
  .handler(async ({ data, context }) => {
    const profileText = await generateWithGemini(
      "You analyze writing style. Respond with 2-3 sentences describing tone, sentence length, vocabulary level and quirks, so another writer can imitate it. No preamble.",
      data.sample,
    );
    const demo = await generateWithGemini(
      `Write one 2-sentence grant-proposal opening for a small business, imitating this style: ${profileText}`,
      "Write the sample now.",
    );
    const { error } = await context.supabase
      .from("profiles")
      .update({ voice_sample: data.sample, voice_profile: profileText, updated_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { profile: profileText, demo };
  });
