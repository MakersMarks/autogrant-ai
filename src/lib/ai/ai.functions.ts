import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateWithGemini } from "./ai.server";
import { sectorName } from "@/lib/grants";

import { z } from "zod";
import { intakeSchema, summarySchema, buildProposalPrompt, validateProposalOutput, documentTypes, buildDocumentPrompt, parseDocument, voiceDirective, documentFileName } from "./proposal-policy";
import { extractDocumentText } from "./documents.server";

const grantSchema = z.object({ title: z.string().min(1).max(500), funder: z.string().max(500), amount: z.string().max(500), eligibilityReason: z.string().max(500), grantId: z.string().max(200).optional() });

async function loadEvidence(supabase: import('@supabase/supabase-js').SupabaseClient<import('@/integrations/supabase/types').Database>, userId: string) {
  const [{ data: profile, error: profileError }, { data: docs, error: docsError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('vault_documents').select('*').eq('user_id', userId).order('created_at'),
  ]);
  if (profileError || !profile) throw new Error('Save your intake profile before drafting.');
  if (docsError) throw new Error('Could not read your Vault inventory.');
  const evidence: { name: string; text: string }[] = [];
  for (const doc of docs ?? []) {
    if (!doc.storage_path.startsWith(`${userId}/`)) throw new Error('Vault document ownership could not be verified.');
    const { data: file, error } = await supabase.storage.from('vault').download(doc.storage_path);
    if (error || !file) throw new Error(`Could not read Vault document: ${doc.file_name}`);
    const text = (await extractDocumentText(new Uint8Array(await file.arrayBuffer()), doc.mime_type)).trim();
    if (!text) throw new Error(`No readable text in ${doc.file_name}. Upload a text-searchable PDF, DOCX, or TXT version.`);
    evidence.push({ name: doc.file_name, text });
  }
  if (JSON.stringify(evidence).length > 1_000_000) throw new Error('Your Vault exceeds the drafting context capacity. Reduce document size before drafting; no evidence was silently omitted.');
  return { profile, evidence };
}

export const saveIntake = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => intakeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase.from('profiles').upsert({ ...data, id: context.userId, updated_at: new Date().toISOString() }).select().single();
    if (error) throw new Error('Your intake profile could not be saved.');
    return profile;
  });

export const draftProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => grantSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { profile, evidence } = await loadEvidence(context.supabase, context.userId);
    const request = buildProposalPrompt({ ...profile, industry: profile.industry || sectorName(profile.sector_code), lifecycle_stage: profile.lifecycle_stage || profile.entity_type }, evidence, { kind: 'Complete grant proposal', ...data });
    const narrative = validateProposalOutput(await generateWithGemini(request.system, request.prompt));
    const { data: application, error } = await context.supabase.from('applications').insert({ user_id: context.userId, grant_id: data.grantId || data.title, name: data.title, funder: data.funder, amount: data.amount, narrative, status: 'draft' }).select().single();
    if (error) throw new Error('Proposal generated but could not be saved to the tracker. Please try again after storage is restored.');
    return { narrative, application };
  });

export const generateExecutiveSummary = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => summarySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { profile, evidence } = await loadEvidence(context.supabase, context.userId);
    const request = buildProposalPrompt(profile, evidence, { kind: 'Executive summary', ...data });
    const narrative = validateProposalOutput(await generateWithGemini(request.system, request.prompt));
    const path = `${context.userId}/executive-summary-${crypto.randomUUID()}.txt`;
    const bytes = new TextEncoder().encode(narrative);
    const { error: uploadError } = await context.supabase.storage.from('vault').upload(path, bytes, { contentType: 'text/plain' });
    if (uploadError) throw new Error('Summary generated but could not be saved in your private Vault.');
    const { data: document, error } = await context.supabase.from('vault_documents').insert({ user_id: context.userId, file_name: `Executive Summary (${profile.project_name?.trim() || 'Business Name'}).txt`, storage_path: path, slot_key: `summary-${crypto.randomUUID()}`, mime_type: 'text/plain', size_bytes: bytes.length }).select().single();
    if (error) { await context.supabase.storage.from('vault').remove([path]); throw new Error('Summary could not be indexed in your Vault.'); }
    return { narrative, document };
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

const documentRequestSchema = grantSchema.extend({ type: z.enum(documentTypes), applicationId: z.string().uuid().optional() });

export const generateGrantDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => documentRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { profile, evidence } = await loadEvidence(context.supabase, context.userId);
    const { type, applicationId, ...grant } = data;
    const intakeText = [profile.project_name, profile.funding_purpose, profile.voice_sample].filter(Boolean).join(' \n ');
    const request = buildDocumentPrompt(type, { ...profile, voice_sample: undefined, voice_profile: undefined, industry: profile.industry || sectorName(profile.sector_code) }, evidence, grant, voiceDirective(profile.voice_profile, intakeText));
    const sections = parseDocument(type, await generateWithGemini(request.system, request.prompt));
    const narrative = sections.map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.body}`).join('\n\n');
    const path = `${context.userId}/${type}-${crypto.randomUUID()}.txt`;
    const bytes = new TextEncoder().encode(narrative);
    const { error: uploadError } = await context.supabase.storage.from('vault').upload(path, bytes, { contentType: 'text/plain' });
    if (uploadError) throw new Error('Document generated but could not be saved in your private Vault.');
    const fileName = documentFileName(type, profile.project_name, grant.title);
    const { data: document, error } = await context.supabase.from('vault_documents').insert({ user_id: context.userId, file_name: fileName, storage_path: path, slot_key: `${type}-${crypto.randomUUID()}`, mime_type: 'text/plain', size_bytes: bytes.length }).select('id, file_name').single();
    if (error) { await context.supabase.storage.from('vault').remove([path]); throw new Error('Document could not be indexed in your Vault.'); }
    let appId = applicationId;
    if (appId) {
      const { error: upErr } = await context.supabase.from('applications').update({ narrative }).eq('id', appId).eq('user_id', context.userId);
      if (upErr) throw new Error('Saved to Vault, but the tracker could not be updated.');
    } else {
      const { data: app, error: insErr } = await context.supabase.from('applications').insert({ user_id: context.userId, grant_id: grant.grantId || grant.title, name: grant.title, funder: grant.funder, amount: grant.amount, narrative, status: 'Drafting' }).select('id').single();
      if (insErr || !app) throw new Error('Saved to Vault, but the tracker could not be updated.');
      appId = app.id;
    }
    return { sections, fileName: document.file_name, applicationId: appId, voiceSource: profile.voice_profile ? 'calibrated' : 'intake' };
  });

const saveProposalDraftSchema = z.object({
  applicationId: z.string().uuid().optional(),
  grantId: z.string().max(200),
  title: z.string().min(1).max(500),
  funder: z.string().max(500),
  amount: z.string().max(500),
  narrative: z.string().min(1).max(500000),
  budgetJustification: z.string().max(50000).optional(),
});

export const saveProposalDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveProposalDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    let applicationId = data.applicationId;
    if (applicationId) {
      const { error } = await context.supabase
        .from("applications")
        .update({ narrative: data.narrative, grant_id: data.grantId, name: data.title, funder: data.funder, amount: data.amount })
        .eq("id", applicationId)
        .eq("user_id", context.userId);
      if (error) throw new Error("The edited proposal could not be saved.");
    } else {
      const { data: application, error } = await context.supabase
        .from("applications")
        .insert({ user_id: context.userId, grant_id: data.grantId, name: data.title, funder: data.funder, amount: data.amount, narrative: data.narrative, status: "Drafting" })
        .select("id")
        .single();
      if (error || !application) throw new Error("The edited proposal could not be saved.");
      applicationId = application.id;
    }
    if (data.budgetJustification?.trim()) {
      const path = `${context.userId}/budget-${crypto.randomUUID()}.txt`;
      const bytes = new TextEncoder().encode(data.budgetJustification);
      const { error: uploadError } = await context.supabase.storage.from("vault").upload(path, bytes, { contentType: "text/plain" });
      if (uploadError) throw new Error("Proposal saved, but the budget justification could not be saved to the Vault.");
      const indexResult = await context.supabase.from("vault_documents").insert({
        user_id: context.userId,
        file_name: `Budget Justification - ${data.title}.txt`,
        storage_path: path,
        slot_key: `budget-${crypto.randomUUID()}`,
        mime_type: "text/plain",
        size_bytes: bytes.length,
        ...(data.grantId ? { grant_id: data.grantId } : {}),
        category_tag: "financial",
      });
      let indexError = indexResult.error;
      if (indexError) {
        const fallback = await context.supabase.from("vault_documents").insert({
          user_id: context.userId,
          file_name: `Budget Justification - ${data.title}.txt`,
          storage_path: path,
          slot_key: `budget-${crypto.randomUUID()}`,
          mime_type: "text/plain",
          size_bytes: bytes.length,
        });
        indexError = fallback.error;
      }
      if (indexError) {
        await context.supabase.storage.from("vault").remove([path]);
        throw new Error("Proposal saved, but the budget justification could not be indexed.");
      }
    }
    return { applicationId };
  });
