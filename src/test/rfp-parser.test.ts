import { describe, expect, it } from "vitest";
import {
  grantRequirementBOMSchema,
  verifyExtractedRequirements,
} from "@/lib/ai/rfp-parser";

describe("grant requirement checklist validation", () => {
  it("accepts supported document types and explicitly unknown submission formats", () => {
    const result = grantRequirementBOMSchema.safeParse({
      grantId: "grant-1",
      grantTitle: "Innovation Grant",
      formatting: { submissionMedium: "not_stated" },
      aiDraftableDocuments: [{
        documentType: "institutional",
        requiredHeadings: ["Project Need", "Work Plan"],
        wordLimitsPerSection: { "Project Need": 250 },
        fileFormats: ["PDF"],
      }],
      userRequiredEvidence: [{
        evidenceId: "sam-registration",
        name: "SAM.gov registration",
        category: "legal_tax",
        isMandatory: true,
        reason: "The solicitation requires current registration.",
        autoMatchVaultTag: "sam_registration_record",
        fileFormats: ["PDF"],
      }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiDraftableDocuments[0]?.fileFormats).toEqual(["PDF"]);
      expect(result.data.userRequiredEvidence[0]?.fileFormats).toEqual(["PDF"]);
    }
  });

  it("rejects malformed or unsupported evidence requirements", () => {
    const result = grantRequirementBOMSchema.safeParse({
      grantId: "grant-1",
      grantTitle: "Innovation Grant",
      formatting: { submissionMedium: "email" },
      aiDraftableDocuments: [],
      userRequiredEvidence: [{
        evidenceId: "",
        name: "Required form",
        category: "unknown",
        isMandatory: true,
        reason: "Required",
        autoMatchVaultTag: "form",
      }],
    });

    expect(result.success).toBe(false);
  });

  it("keeps extracted prompts and criteria only when exact source quotes verify", () => {
    const bom = grantRequirementBOMSchema.parse({
      grantId: "grant-1",
      grantTitle: "Rural Innovation Grant",
      formatting: { submissionMedium: "portal_text_fields" },
      aiDraftableDocuments: [{
        documentType: "institutional",
        requiredHeadings: ["Unverified heading"],
      }],
      userRequiredEvidence: [
        {
          evidenceId: "quote",
          name: "Vendor quote",
          category: "vendor_quote",
          isMandatory: true,
          reason: "A vendor quote is required.",
          evidenceQuote: "Applicants must upload a signed vendor quote.",
          sourceUrl: "https://funder.gov/nofo",
          autoMatchVaultTag: "vendor_quote",
        },
        {
          evidenceId: "unsupported",
          name: "Unsupported document",
          category: "legal_tax",
          isMandatory: true,
          reason: "Unsupported claim.",
          autoMatchVaultTag: "unsupported",
        },
      ],
      extractedPrompts: [
        {
          question: "How will the project improve rural access?",
          evidenceQuote: "Applicants must describe measurable improvements to rural access.",
          sourceUrl: "https://funder.gov/nofo",
          maxWords: 200,
        },
        {
          question: "Invented question",
          evidenceQuote: "This quote does not occur in the notice.",
          sourceUrl: "https://funder.gov/nofo",
        },
      ],
      rubricCriteria: [{
        criterion: "Measurable project outcomes",
        evidenceQuote: "Projects are scored on measurable project outcomes.",
        sourceUrl: "https://funder.gov/nofo",
        weightPercent: 30,
      }],
    });
    const result = verifyExtractedRequirements(bom, [{
      url: "https://funder.gov/nofo",
      text: "Applicants must describe measurable improvements to rural access. Applicants must upload a signed vendor quote. Projects are scored on measurable project outcomes.",
    }]);

    expect(result.extractionStatus).toBe("partial");
    expect(result.extractedPrompts).toHaveLength(1);
    expect(result.rubricCriteria).toHaveLength(1);
    expect(result.userRequiredEvidence.map((item) => item.name)).toEqual(["Vendor quote"]);
    expect(result.aiDraftableDocuments).toEqual([]);
    expect(result.formatting.submissionMedium).toBe("not_stated");
    expect(result.extractionNotes?.[0]).toContain("omitted because their supporting quote");
  });

  it("retains document instructions and formatting only when their evidence quotes support them", () => {
    const bom = grantRequirementBOMSchema.parse({
      grantId: "grant-1",
      grantTitle: "Innovation Grant",
      formatting: {
        submissionMedium: "portal_text_fields",
        wordCountLimit: 500,
        evidenceQuote: "Submit your 500-word narrative through the application portal.",
        sourceUrl: "https://funder.gov/nofo",
      },
      aiDraftableDocuments: [{
        documentType: "institutional",
        requiredHeadings: ["Project Need"],
        wordLimitsPerSection: { "Project Need": 250 },
        fileFormats: ["PDF"],
        evidenceQuote: "Include a Project Need section of 250 words and upload the statement as PDF.",
        sourceUrl: "https://funder.gov/nofo",
      }],
      userRequiredEvidence: [],
    });
    const result = verifyExtractedRequirements(bom, [{
      url: "https://funder.gov/nofo",
      text: "Submit your 500-word narrative through the application portal. Include a Project Need section of 250 words and upload the statement as PDF.",
    }]);

    expect(result.aiDraftableDocuments).toHaveLength(1);
    expect(result.formatting.wordCountLimit).toBe(500);
    expect(result.formatting.submissionMedium).toBe("portal_text_fields");
  });

  it("marks portal-gated instructions as unavailable instead of inventing prompts or criteria", () => {
    const bom = grantRequirementBOMSchema.parse({
      grantId: "grant-1",
      grantTitle: "Rural Innovation Grant",
      formatting: { submissionMedium: "portal_text_fields" },
      aiDraftableDocuments: [],
      userRequiredEvidence: [],
      extractedPrompts: [],
      rubricCriteria: [],
    });
    const result = verifyExtractedRequirements(bom, [{
      url: "https://funder.gov/apply",
      text: "Sign in required. Portal access only.",
    }]);

    expect(result.extractionStatus).toBe("portal_only");
    expect(result.extractedPrompts).toEqual([]);
    expect(result.rubricCriteria).toEqual([]);
    expect(result.extractionNotes?.join(" ")).toContain("require portal access");
  });
});
