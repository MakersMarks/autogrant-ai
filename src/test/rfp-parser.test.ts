import { describe, expect, it } from "vitest";
import { grantRequirementBOMSchema } from "@/lib/ai/rfp-parser";

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
});
