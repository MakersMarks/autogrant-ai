import { createServerFn } from "@tanstack/react-start";
import { tool } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateCopilotWithTools, generateWithGemini } from "./ai.server";
import { sectorName } from "@/lib/grants";
import { stateFromLocation } from "@/lib/grants-gov/rules";
import { getSiteGrantDetails, searchSiteGrantListings } from "@/lib/grants-gov/grants.functions";
import {
  programGuidanceForProgram,
  winnerResearchForProgram,
} from "@/lib/grants/sources/winner-research";

import { z } from "zod";
import {
  intakeSchema,
  summarySchema,
  buildProposalPrompt,
  validateProposalOutput,
  documentTypes,
  buildDocumentPrompt,
  parseDocument,
  voiceDirective,
  documentFileName,
  isRestrictedDocumentRequest,
} from "./proposal-policy";
import { extractDocumentText } from "./documents.server";
import { evaluateProposalRedTeam } from "./red-team";
import type { GrantRequirementBOM } from "./rfp-parser";
import type { Tables } from "@/integrations/supabase/types";

const grantSchema = z.object({
  title: z.string().min(1).max(500),
  funder: z.string().max(500),
  amount: z.string().max(500),
  eligibilityReason: z.string().max(500),
  grantId: z.string().max(200).optional(),
});

type ApplicantProfile = Tables<"profiles">;
type VaultEvidence = { name: string; text: string }[];

async function loadEvidence(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  userId: string,
): Promise<{ profile: ApplicantProfile; evidence: VaultEvidence }>;
async function loadEvidence(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  userId: string,
  allowMissingProfile: true,
): Promise<{ profile: ApplicantProfile | null; evidence: VaultEvidence }>;
async function loadEvidence(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  userId: string,
  allowMissingProfile = false,
): Promise<{ profile: ApplicantProfile | null; evidence: VaultEvidence }> {
  const [{ data: profile, error: profileError }, { data: docs, error: docsError }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("vault_documents").select("*").eq("user_id", userId).order("created_at"),
    ]);
  if (profileError) throw new Error("Could not read your intake profile.");
  if (!allowMissingProfile && !profile)
    throw new Error("Save your intake profile before drafting.");
  if (docsError) throw new Error("Could not read your Vault inventory.");
  const evidence: VaultEvidence = [];
  for (const doc of docs ?? []) {
    if (!doc.storage_path.startsWith(`${userId}/`))
      throw new Error("Vault document ownership could not be verified.");
    const { data: file, error } = await supabase.storage.from("vault").download(doc.storage_path);
    if (error || !file) throw new Error(`Could not read Vault document: ${doc.file_name}`);
    const text = (
      await extractDocumentText(new Uint8Array(await file.arrayBuffer()), doc.mime_type)
    ).trim();
    if (!text)
      throw new Error(
        `No readable text in ${doc.file_name}. Upload a text-searchable PDF, DOCX, or TXT version.`,
      );
    evidence.push({ name: doc.file_name, text });
  }
  if (JSON.stringify(evidence).length > 1_000_000)
    throw new Error(
      "Your Vault exceeds the drafting context capacity. Reduce document size before drafting; no evidence was silently omitted.",
    );
  return {
    profile: profile ? { ...profile, location: stateFromLocation(profile.location) ?? "" } : null,
    evidence,
  };
}

const copilotActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("draft_summary") }),
  z.object({
    type: z.literal("update_intake"),
    field: z.enum([
      "project_name",
      "industry",
      "lifecycle_stage",
      "sector_code",
      "entity_type",
      "funding_goal",
      "location",
      "funding_purpose",
    ]),
    value: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal("edit_vault_file"),
    documentId: z.string().uuid(),
    instruction: z.string().trim().min(1).max(1000),
  }),
  z.object({ type: z.literal("delete_vault_file"), documentId: z.string().uuid() }),
  z.object({
    type: z.literal("update_settings"),
    field: z.enum(["name", "email", "notification_opt_in"]),
    value: z.union([z.string().max(254), z.boolean()]),
  }),
  z.object({ type: z.literal("search_grants") }),
]);
export type CopilotAction = z.infer<typeof copilotActionSchema>;

const copilotReplySchema = z.object({
  reply: z.string().min(1).max(6000),
  action: copilotActionSchema,
});

const copilotActionInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft_summary") }),
  z.object({
    type: z.literal("update_intake"),
    field: z.enum([
      "project_name",
      "industry",
      "lifecycle_stage",
      "sector_code",
      "entity_type",
      "funding_goal",
      "location",
      "funding_purpose",
    ]),
    value: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal("edit_vault_file"),
    documentId: z.string().uuid(),
    instruction: z.string().trim().min(1).max(1000),
  }),
  z.object({ type: z.literal("delete_vault_file"), documentId: z.string().uuid() }),
  z.object({
    type: z.literal("update_settings"),
    field: z.enum(["name", "email", "notification_opt_in"]),
    value: z.union([z.string().max(254), z.boolean()]),
  }),
  z.object({ type: z.literal("search_grants") }),
]);

const copilotMessagesSchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(4000),
  }),
);

function stripHtmlDocument(html: string) {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/ /giu, " ")
    .replace(/&/giu, "&")
    .replace(/</giu, "<")
    .replace(/>/giu, ">")
    .replace(/"/giu, '"')
    .replace(/&#(?:39|x27);/giu, "'")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function validateGrantUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid public grant webpage URL.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[\vert{}\]$/gu, "");
  const blockedHost =
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    /^127\./u.test(hostname) ||
    /^10\./u.test(hostname) ||
    /^192\.168\./u.test(hostname) ||
    /^169\.254\./u.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./u.test(hostname) ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:");
  if (url.protocol !== "https:" || url.username || url.password || blockedHost) {
    throw new Error("Only public HTTPS grant pages can be fetched.");
  }
  return url;
}

async function fetchGrantPage(value: string) {
  const url = validateGrantUrl(value);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "text/html,text/plain,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`The grant webpage returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/(?:text\/html|text\/plain|application\/xhtml\+xml)/u.test(contentType)) {
    throw new Error("The link did not return a readable HTML or text grant page.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The grant webpage returned no readable content.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    size += chunk.byteLength;
    if (size > 1_000_000) {
      await reader.cancel();
      throw new Error("The grant webpage is larger than the 1 MB reading limit.");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = stripHtmlDocument(new TextDecoder().decode(bytes));
  if (!text) throw new Error("The grant webpage did not contain readable text.");
  return { url: url.toString(), text: text.slice(0, 30000) };
}

export const copilotChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        message: z.string().trim().min(1).max(4000),
        messages: copilotMessagesSchema,
        activePage: z.string().trim().min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (isRestrictedDocumentRequest(data.message)) {
      return {
        reply:
          "That document or action must be completed by an authorized human, legal professional, or financial professional. I will not draft or certify it as final, sign it, or submit it. I can help make an internal checklist of the official requirements for your review.",
        action: { type: "none" as const },
      };
    }
    const { profile, evidence } = await loadEvidence(context.supabase, context.userId, true);
    const { data: applications, error: applicationError } = await context.supabase
      .from("applications")
      .select("id, name, funder
