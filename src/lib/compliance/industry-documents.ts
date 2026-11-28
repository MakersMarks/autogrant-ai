export type VaultCategoryTag = "legal_tax" | "license_permit" | "vendor_quote" | "financial";

export type IndustryDocumentRequirement = {
  key: string;
  name: string;
  category: VaultCategoryTag;
  grantId?: string;
};

export function getIndustryDocumentRequirements(
  industry: string,
  entityType: string,
): IndustryDocumentRequirement[] {
  const normalized = industry.toLowerCase();
  const requirements: IndustryDocumentRequirement[] = [];
  if (
    normalized.includes("food") ||
    normalized.includes("restaurant") ||
    normalized.includes("catering")
  ) {
    requirements.push(
      { key: "health_permit", name: "Health Permit", category: "license_permit" },
      { key: "servsafe", name: "ServSafe Certification", category: "license_permit" },
      { key: "commissary_agreement", name: "Commissary Agreement", category: "vendor_quote" },
    );
  }
  if (
    normalized.includes("mining") ||
    normalized.includes("mineral") ||
    normalized.includes("extraction")
  ) {
    requirements.push(
      { key: "mineral_license", name: "Mineral Extraction License", category: "license_permit" },
      { key: "msha_plan", name: "MSHA Safety Plan", category: "license_permit" },
      { key: "environmental_clearance", name: "Environmental Clearance", category: "legal_tax" },
    );
  }
  if (
    entityType.includes("501") ||
    normalized.includes("nonprofit") ||
    entityType.includes("Church")
  ) {
    requirements.push(
      {
        key: "determination_letter",
        name: "501(c)(3) Determination Letter",
        category: "legal_tax",
      },
      { key: "board_roster", name: "Board Roster", category: "legal_tax" },
    );
  }
  if (
    normalized.includes("creative") ||
    normalized.includes("media") ||
    normalized.includes("art") ||
    normalized.includes("film")
  ) {
    requirements.push(
      { key: "portfolio", name: "Portfolio or Reel", category: "vendor_quote" },
      { key: "client_testimonials", name: "Client Testimonials", category: "vendor_quote" },
    );
  }
  return requirements;
}
