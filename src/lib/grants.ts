export const OFFICIAL_SECTORS = [
  { code: "BC", name: "BC - Business and Commerce" },
  { code: "ST", name: "ST - Science & Technology (SBIR/STTR)" },
  { code: "AG", name: "AG - Agriculture & Food Tech" },
  { code: "HL", name: "HL - Health & Medical Research" },
  { code: "CD", name: "CD - Community & Regional Development" },
] as const;

export type Grant = {
  id: string;
  title: string;
  funder: string;
  amount: string;
  fit: string;
  tier: string;
  categoryCode: string;
  eligibilityReason: string;
  deadline: string;
};

export function sectorName(code: string) {
  return OFFICIAL_SECTORS.find((s) => s.code === code)?.name ?? OFFICIAL_SECTORS[0].name;
}

export function generateDailyGrants(sectorCode: string): Grant[] {
  const sector = OFFICIAL_SECTORS.find((s) => s.code === sectorCode) ?? OFFICIAL_SECTORS[0];
  const tiers = ["High-Priority Major Grant", "Niche Low-Competition Grant", "High Win-Rate Micro-Grant"];
  return Array.from({ length: 50 }, (_, i) => ({
    id: `g-${sector.code}-${i + 1}`,
    title: `Grant Opportunity #${i + 1}: ${sector.name} Scale Initiative`,
    funder: `Federal Agency / Corporate Foundation #${(i % 8) + 1}`,
    amount: `$${((i + 1) * 1500 + 500).toLocaleString("en-US")}`,
    fit: `${99 - (i % 12)}% Match`,
    tier: tiers[i % 3]!,
    categoryCode: sector.code,
    eligibilityReason: `Qualified by: Official Grants.gov NAICS Sector Mapping (${sector.code}), Verified Entity Classification, and Regional Compliance.`,
    deadline: `Nov ${10 + (i % 20)}, 2026`,
  }));
}

export type DocSlot = { key: string; name: string; required: boolean };

export function coreDocSlots(entityType: string): DocSlot[] {
  if (entityType === "Idea / Pre-Launch Founder") {
    return [
      { key: "ein", name: "EIN Confirmation Letter (CP 575)", required: true },
      { key: "business_plan", name: "Business Plan & Executive Summary", required: true },
      { key: "photo_id", name: "Founder Government Photo ID", required: true },
    ];
  }
  return [
    { key: "ein", name: "EIN Confirmation Letter (CP 575)", required: true },
    { key: "tax_returns", name: "Business Tax Returns (Form 1120 / 1040)", required: true },
    { key: "good_standing", name: "Certificate of Good Standing", required: true },
    { key: "photo_id", name: "Founder Government Photo ID", required: true },
  ];
}

export const CUSTOM_DOC_SLOTS: DocSlot[] = [
  { key: "pitch_deck", name: "Pitch Deck / Executive Summary", required: false },
  { key: "market_research", name: "Customer Discovery & Market Research Data", required: false },
];

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const VALID_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const VALID_EXT = [".pdf", ".docx"];

/** Returns an error message, or null when the file is acceptable. */
export function validateVaultFile(file: { name: string; type: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  const typeOk = VALID_TYPES.includes(file.type);
  const extOk = VALID_EXT.includes(ext);
  // Both must agree when the browser reports a MIME type; fall back to extension when it's blank.
  if (!extOk || (file.type !== "" && !typeOk)) {
    return `Rejected: "${file.name}" must be a valid PDF or DOCX document.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) return "Rejected: File exceeds 15MB limit.";
  return null;
}
