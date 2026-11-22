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
  officialUrl?: string;
  publicWinnerHistoryUrl?: string;
};

export type GrantPoolTier = "federal" | "state_territory" | "corporate_diversity" | "foundation";

export interface UnifiedGrant {
  id: string;
  grantTier?: "Federal" | "State" | "Local" | "Foundation";
  geographicRestriction?: "national" | "state" | "county" | "city" | "rural" | "hubzone";
  naicsCodes?: string[];
  setAsides?: Array<"WOSB" | "HUBZone" | "Veteran" | "Tribal" | "Rural" | string>;
  openDate?: string;
  closeDate?: string;
  fundingPool?: number;
  awardCount?: number;
  historicalApplicantCount?: number;
  prerequisites?: string[];
  officialApplicationUrl?: string;
  directoryOnly?: boolean;
  poolTier: GrantPoolTier;
  title: string;
  funderName: string;
  funderType: "government" | "corporate" | "private_foundation" | "nonprofit";
  awardFloor: number;
  awardCeiling: number;
  minMonthsInBusiness?: number | null;
  eligibleStates?: string[] | null;
  applicationTimeMinutes?: number | null;
  deadline: string;
  isRolling: boolean;
  costSharingRequired: boolean;
  costSharingPercentage?: number;

  eligibleEntityTypes: Array<
    "for_profit" | "nonprofit_501c3" | "fiscal_sponsor" | "church" | "individual"
  >;
  demographicSetAsides: Array<
    "women_owned" | "minority_owned" | "veteran_owned" | "rural" | "african_diaspora" | "lgbtq"
  >;
  geographicScope: {
    level: "national" | "state_specific" | "local_county" | "international";
    allowedStates?: string[];
  };

  applicationMethod: "online_portal" | "grants_gov_workspace" | "email_package" | "physical_mail";
  directApplyUrl: string;
  portalUrl?: string;
  isFreeToApply: boolean;
  summaryText: string;
  sourceSolicitationUrl?: string;
  publicWinnerHistoryUrl?: string;
}

export function isUnifiedGrantOpen(
  grant: Pick<UnifiedGrant, "isRolling" | "closeDate">,
  now = new Date(),
): boolean {
  if (grant.isRolling) return true;
  if (!grant.closeDate) return false;

  const closeDate = new Date(grant.closeDate);
  if (Number.isNaN(closeDate.getTime())) return false;
  return closeDate.toISOString().slice(0, 10) >= now.toISOString().slice(0, 10);
}

export const grantPoolBadge: Record<GrantPoolTier, string> = {
  federal: "Federal",
  state_territory: "State",
  corporate_diversity: "Corporate",
  foundation: "Foundation",
};

export function sectorName(code: string) {
  return OFFICIAL_SECTORS.find((s) => s.code === code)?.name ?? OFFICIAL_SECTORS[0].name;
}

export type DocSlot = { key: string; name: string; required: boolean };

export function coreDocSlots(entityType: string, lifecycleStage = ""): DocSlot[] {
  if (/idea|not registered|new startup|under 1 year|creator|pre-launch/i.test(`${entityType} ${lifecycleStage}`)) {
    return [
      { key: "ein", name: "EIN Confirmation Letter (CP 575)", required: false },
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
  { key: "sam_registration_record", name: "SAM.gov Entity Registration / UEI / CAGE record (if required; not externally verified)", required: false },
  { key: "w9", name: "W-9 (if requested by the funder; sensitive tax details)", required: false },
];

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Returns an error message, or null when the file is acceptable. */
export function validateVaultFile(file: { name: string; type: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "image/jpeg",
    "image/png",
  ];
  const matchingTypes: Record<string, readonly string[]> = {
    ".pdf": ["application/pdf"],
    ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ".txt": ["text/plain"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".png": ["image/png"],
  };
  const allowedExt = Object.keys(matchingTypes);
  const typeOk = allowedTypes.includes(file.type);
  const extOk = allowedExt.includes(ext);
  const mimeMatchesExt = file.type === "" || matchingTypes[ext]?.includes(file.type);
  if (!extOk || !typeOk || !mimeMatchesExt) {
    return `Rejected: "${file.name}" must be a valid PDF, DOCX, TXT, JPG, or PNG document.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) return "Rejected: File exceeds 15MB limit.";
  return null;
}

