export interface GrantRequirementBOM {
  grantId: string;
  grantTitle: string;
  formatting: {
    pageLimit?: number;
    wordCountLimit?: number;
    fontFamilyRequired?: string;
    submissionMedium: "pdf_upload" | "portal_text_fields" | "hard_copy_mail";
  };
  aiDraftableDocuments: Array<{
    documentType:
      | "executive_summary"
      | "project_narrative"
      | "letter_of_inquiry"
      | "budget_justification"
      | "short_answers";
    requiredHeadings: string[];
    wordLimitsPerSection?: Record<string, number>;
  }>;
  userRequiredEvidence: Array<{
    evidenceId: string;
    name: string;
    category: "legal_tax" | "license_permit" | "financial" | "vendor_quote";
    isMandatory: boolean;
    reason: string;
    autoMatchVaultTag: string;
  }>;
}
