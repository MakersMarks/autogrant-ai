import { z } from "zod";

export const grantRequirementBOMSchema = z.object({
  grantId: z.string().min(1).max(200),
  grantTitle: z.string().min(1).max(500),
  guidelinesUrl: z.string().url().max(2048).optional(),
  extractionStatus: z.enum(["full", "partial", "portal_only"]).optional(),
  extractionNotes: z.array(z.string().max(500)).max(20).optional(),
  extractedPrompts: z.array(z.object({
    question: z.string().trim().min(1).max(2000),
    evidenceQuote: z.string().trim().min(5).max(1000),
    sourceUrl: z.string().url().max(2048).optional(),
    maxWords: z.number().int().positive().optional(),
    maxCharacters: z.number().int().positive().optional(),
  })).max(100).optional(),
  rubricCriteria: z.array(z.object({
    criterion: z.string().trim().min(1).max(500),
    evidenceQuote: z.string().trim().min(5).max(1000),
    sourceUrl: z.string().url().max(2048).optional(),
    weightPercent: z.number().min(0).max(100).optional(),
  })).max(50).optional(),
  formatting: z.object({
    pageLimit: z.number().int().positive().optional(),
    wordCountLimit: z.number().int().positive().optional(),
    fontFamilyRequired: z.string().min(1).max(100).optional(),
    submissionMedium: z.enum(["pdf_upload", "portal_text_fields", "hard_copy_mail", "not_stated"]),
    evidenceQuote: z.string().trim().min(5).max(1000).optional(),
    sourceUrl: z.string().url().max(2048).optional(),
  }),
  aiDraftableDocuments: z.array(z.object({
    documentType: z.enum([
      "executive_summary", "institutional", "portal_answers", "project_narrative",
      "letter_of_inquiry", "budget_justification", "short_answers", "federal_biosketch",
      "facilities_resources", "letter_commitment_template", "ai_use_disclosure", "data_management_plan",
      "commercialization_roadmap", "financial_projections", "video_pitch_script",
    ]),
    requiredHeadings: z.array(z.string().min(1).max(300)).max(30),
    wordLimitsPerSection: z.record(z.string(), z.number().int().positive()).optional(),
    fileFormats: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    evidenceQuote: z.string().trim().min(5).max(1000).optional(),
    sourceUrl: z.string().url().max(2048).optional(),
  })).max(30),
  userRequiredEvidence: z.array(z.object({
    evidenceId: z.string().min(1).max(200),
    name: z.string().min(1).max(300),
    category: z.enum(["legal_tax", "license_permit", "financial", "vendor_quote"]),
    isMandatory: z.boolean(),
    reason: z.string().min(1).max(1000),
    evidenceQuote: z.string().trim().min(5).max(1000).optional(),
    sourceUrl: z.string().url().max(2048).optional(),
    autoMatchVaultTag: z.string().min(1).max(200),
    fileFormats: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })).max(50),
});

export type GrantRequirementBOM = z.infer<typeof grantRequirementBOMSchema>;

function normalizeEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u00ad\u200b-\u200d\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function verifyExtractedRequirements(
  bom: GrantRequirementBOM,
  sourceTexts: readonly { url: string; text: string }[],
): GrantRequirementBOM {
  const verifiedSources = sourceTexts.map((source) => ({
    ...source,
    normalizedText: normalizeEvidenceText(source.text),
  }));
  const quoteIsSupported = (quote: string, sourceUrl?: string) =>
    verifiedSources.some(
      (source) =>
        (!sourceUrl || source.url === sourceUrl) &&
        source.normalizedText.includes(normalizeEvidenceText(quote)),
    );
  const prompts = (bom.extractedPrompts ?? []).filter((item) =>
    quoteIsSupported(item.evidenceQuote, item.sourceUrl),
  );
  const criteria = (bom.rubricCriteria ?? []).filter((item) =>
    quoteIsSupported(item.evidenceQuote, item.sourceUrl),
  );
  const evidence = bom.userRequiredEvidence.filter((item) =>
    item.evidenceQuote && quoteIsSupported(item.evidenceQuote, item.sourceUrl),
  );
  const formattingHasRequirements =
    bom.formatting.submissionMedium !== "not_stated" ||
    bom.formatting.pageLimit !== undefined ||
    bom.formatting.wordCountLimit !== undefined ||
    bom.formatting.fontFamilyRequired !== undefined;
  const formattingQuote = bom.formatting.evidenceQuote;
  const formattingValuesVerified =
    formattingQuote !== undefined &&
    quoteIsSupported(formattingQuote, bom.formatting.sourceUrl) &&
    (bom.formatting.pageLimit === undefined ||
      normalizeEvidenceText(formattingQuote).includes(String(bom.formatting.pageLimit))) &&
    (bom.formatting.wordCountLimit === undefined ||
      normalizeEvidenceText(formattingQuote).includes(String(bom.formatting.wordCountLimit))) &&
    (bom.formatting.fontFamilyRequired === undefined ||
      normalizeEvidenceText(formattingQuote).includes(normalizeEvidenceText(bom.formatting.fontFamilyRequired))) &&
    (bom.formatting.submissionMedium === "not_stated" ||
      (bom.formatting.submissionMedium === "pdf_upload" &&
        /pdf|upload/iu.test(formattingQuote)) ||
      (bom.formatting.submissionMedium === "portal_text_fields" &&
        /portal|text field/iu.test(formattingQuote)) ||
      (bom.formatting.submissionMedium === "hard_copy_mail" &&
        /hard copy|mail/iu.test(formattingQuote)));
  const formatting = formattingValuesVerified
    ? bom.formatting
    : { submissionMedium: "not_stated" as const };
  const documents = bom.aiDraftableDocuments.filter((document) => {
    if (!document.evidenceQuote || !quoteIsSupported(document.evidenceQuote, document.sourceUrl)) {
      return false;
    }
    const quote = normalizeEvidenceText(document.evidenceQuote);
    return document.requiredHeadings.every((heading) =>
      quote.includes(normalizeEvidenceText(heading)),
    ) &&
      Object.entries(document.wordLimitsPerSection ?? {}).every(([heading, limit]) =>
        quote.includes(normalizeEvidenceText(heading)) && quote.includes(String(limit)),
      ) &&
      (document.fileFormats ?? []).every((format) =>
        quote.includes(normalizeEvidenceText(format)),
      );
  });
  const rejectedCount =
    (bom.extractedPrompts?.length ?? 0) - prompts.length +
    (bom.rubricCriteria?.length ?? 0) - criteria.length +
    bom.userRequiredEvidence.length - evidence.length +
    bom.aiDraftableDocuments.length - documents.length +
    (formattingHasRequirements && !formattingValuesVerified ? 1 : 0);
  const notes = [...(bom.extractionNotes ?? [])];
  const sourceText = verifiedSources.map((source) => source.text).join(" ");
  const accessLimited =
    /sign[ -]?in required|log[ -]?in required|authentication required|account required|portal access only/iu.test(
      sourceText,
    );
  if (rejectedCount > 0) {
    notes.push(`${rejectedCount} extracted item(s) were omitted because their supporting quote could not be verified in the fetched source text.`);
  }
  if (!verifiedSources.length) {
    notes.push("No readable public guidelines text was available; verify prompts and scoring criteria in the funder's portal.");
  }
  if (accessLimited && prompts.length === 0 && criteria.length === 0) {
    notes.push("The public source indicates that full instructions require portal access.");
  }
  const extractionStatus =
    prompts.length > 0 && criteria.length > 0 && rejectedCount === 0 && notes.length === 0
      ? "full"
      : prompts.length > 0 || criteria.length > 0 || (verifiedSources.length > 0 && !accessLimited)
        ? "partial"
        : "portal_only";

  return {
    ...bom,
    extractedPrompts: prompts,
    rubricCriteria: criteria,
    userRequiredEvidence: evidence,
    aiDraftableDocuments: documents,
    formatting,
    extractionStatus,
    extractionNotes: notes,
  };
}
