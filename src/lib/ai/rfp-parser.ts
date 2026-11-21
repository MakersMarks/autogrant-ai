import { z } from "zod";

export const grantRequirementBOMSchema = z.object({
  grantId: z.string().min(1).max(200),
  grantTitle: z.string().min(1).max(500),
  formatting: z.object({
    pageLimit: z.number().int().positive().optional(),
    wordCountLimit: z.number().int().positive().optional(),
    fontFamilyRequired: z.string().min(1).max(100).optional(),
    submissionMedium: z.enum(["pdf_upload", "portal_text_fields", "hard_copy_mail", "not_stated"]),
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
  })).max(30),
  userRequiredEvidence: z.array(z.object({
    evidenceId: z.string().min(1).max(200),
    name: z.string().min(1).max(300),
    category: z.enum(["legal_tax", "license_permit", "financial", "vendor_quote"]),
    isMandatory: z.boolean(),
    reason: z.string().min(1).max(1000),
    autoMatchVaultTag: z.string().min(1).max(200),
    fileFormats: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })).max(50),
});

export type GrantRequirementBOM = z.infer<typeof grantRequirementBOMSchema>;
