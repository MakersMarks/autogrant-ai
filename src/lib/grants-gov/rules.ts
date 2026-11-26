// Pure, testable rules for the live Grants.gov feed.
export type LiveGrant = {
  id: string;
  number: string;
  title: string;
  agency: string;
  openDate: string;
  closeDate: string;
  daysLeft: number | null;
  awardCeiling: number | null;
  awardFloor: number | null;
  numberOfAwards: number | null;
  eligibility: string[];
  categories: string[];
  url: string;
  matchedKeyword?: string;
  grantTier?: "Federal" | "State" | "Local" | "Foundation";
  geographicRestriction?: "national" | "state" | "county" | "city" | "rural" | "hubzone";
  naicsCodes?: string[];
  setAsides?: string[];
  costSharePercentage?: number | null;
  prerequisites?: string[];
  historicalApplicantCount?: number;
  historicalAwards?: number;
  description?: string;
  eligibilityNotes?: string;
};

export const ELIGIBILITY_OPTIONS = [
  { value: "23|22|99|25", label: "For-profit & small business (all)" },
  { value: "12|13|99|25", label: "Nonprofits (all)" },
  { value: "", label: "Any eligibility" },
  { value: "23", label: "Small businesses" },
  { value: "22", label: "For-profit (not small business)" },
  { value: "12", label: "Nonprofit 501(c)(3)" },
  { value: "21", label: "Individuals" },
  { value: "07", label: "Native American tribal governments" },
  { value: "06", label: "Public colleges & universities" },
  { value: "25", label: "Others" },
] as const;

/** Parse Grants.gov MM/DD/YYYY. */
export function parseGovDate(s: string | null | undefined): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  return m ? new Date(Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!)) : null;
}

export function daysUntil(close: string | null | undefined, now = new Date()): number | null {
  const d = parseGovDate(close);
  if (!d) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d.getTime() - today) / 86400000);
}

/** Last Chance = closes within 2–7 days (inclusive). */
export function isLastChance(days: number | null): boolean {
  return days !== null && days >= 2 && days <= 7;
}

export type GrantAwardScaleSignal = "award_ceiling_at_most_100k" | "at_least_10_awards_listed";

/** Funding-scale indicators only; Grants.gov listings here do not report applicant counts or win rates. */
export function grantAwardScaleSignals(
  g: Pick<LiveGrant, "awardCeiling" | "numberOfAwards">,
): GrantAwardScaleSignal[] {
  const signals: GrantAwardScaleSignal[] = [];
  if (g.awardCeiling !== null && g.awardCeiling > 0 && g.awardCeiling <= 100_000) {
    signals.push("award_ceiling_at_most_100k");
  }
  if ((g.numberOfAwards ?? 0) >= 10) signals.push("at_least_10_awards_listed");
  return signals;
}

export function matchesAmount(
  g: Pick<LiveGrant, "awardCeiling">,
  min: number,
  max: number,
): boolean {
  if (!min && !max) return true;
  if (g.awardCeiling === null) return false;
  return (!min || g.awardCeiling >= min) && (!max || g.awardCeiling <= max);
}

export function formatMoney(n: number | null): string {
  return n === null || n <= 0 ? "Not listed" : `$${n.toLocaleString("en-US")}`;
}

export function grantUrl(id: string) {
  return `https://www.grants.gov/search-results-detail/${id}`;
}

const STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  PR: "Puerto Rico",
  GU: "Guam",
  AS: "American Samoa",
  MP: "Northern Mariana Islands",
  VI: "U.S. Virgin Islands",
  DC: "District of Columbia",
};

/** Resolve the user's state name from free-text location like "Nashville, TN" or "Des Moines, IA". */
export function stateFromLocation(location: string | null | undefined): string | null {
  if (typeof location !== "string") return null;
  const t = location.trim();
  if (!t) return null;
  const abbr = /\b([A-Z]{2})\b/.exec(
    t
      .toUpperCase()
      .replace(/[^A-Z ,]/g, " ")
      .split(",")
      .pop() ?? "",
  )?.[1];
  if (abbr && STATES[abbr]) return STATES[abbr]!;
  const low = t.toLowerCase();
  return Object.values(STATES).find((s) => low.includes(s.toLowerCase())) ?? null;
}

export function stateCodeFromLocation(location: string | null | undefined): string {
  const state = stateFromLocation(location);
  return state ? (Object.entries(STATES).find(([, name]) => name === state)?.[0] ?? "") : "";
}

/** True when a grant title is restricted to a different named state than the user's. */
export function isOtherStateOnly(title: string | null | undefined, userState: string | null): boolean {
  if (!userState || typeof title !== "string" || !title.trim()) return false;
  const named = Object.values(STATES).filter((s) => new RegExp(`\\b${s}\\b`, "i").test(title));
  if (named.length === 0) return false;
  if (userState === "Virginia" && named.every((s) => s === "West Virginia")) return true;
  return !named.includes(userState);
}

export type EntityMode = "forprofit" | "nonprofit";
export function entityMode(entityType: string | null | undefined): EntityMode {
  if (typeof entityType !== "string") return "forprofit";
  return /non-?profit|501|charit|foundation/i.test(entityType) ? "nonprofit" : "forprofit";
}
export function eligibilityCodesFor(mode: EntityMode): string {
  return mode === "nonprofit" ? "12|13|99|25" : "23|22|99|25";
}

/** Hard gate: only retain grants that explicitly include the user's entity type. */
export function isEntityEligible(applicantTypes: string[] | null | undefined, mode: EntityMode): boolean {
  if (!Array.isArray(applicantTypes) || applicantTypes.length === 0) return false;
  return applicantTypes.some((type) => {
    if (typeof type !== "string") return false;
    const applicantType = type.trim();
    if (!applicantType) return false;
    if (/unrestricted/i.test(applicantType)) return true;
    if (mode === "forprofit") return /small businesses?|for[- ]profit/i.test(applicantType);
    return /non-?profit/i.test(applicantType) && !/other than non-?profit/i.test(applicantType);
  });
}

const TECH =
  /\b(ai|a\.i\.|artificial intelligence|machine learning|software|saas|tech|data|automation|platform|app)\b/i;
const KEYWORD_STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "because", "been", "being", "build",
  "business", "can", "could", "create", "currently", "for", "from", "have",
  "help", "into", "its", "make", "more", "need", "our", "project", "provide",
  "should", "solution", "support", "that", "their", "there", "these", "this",
  "through", "those", "will", "with", "would",
]);

/** Derive targeted Grants.gov keywords from profile and project intent (max 4). */
export function scoutKeywords(p: {
  industry?: string | null;
  fundingPurpose?: string | null;
  entityType?: string | null;
  problemStatement?: string | null;
  solutionArchitecture?: string | null;
  fundingGoal?: string | null;
}): string[] {
  const safeIndustry = typeof p.industry === "string" ? p.industry : "";
  const safePurpose = typeof p.fundingPurpose === "string" ? p.fundingPurpose : "";
  const safeProblem = typeof p.problemStatement === "string" ? p.problemStatement : "";
  const safeSolution = typeof p.solutionArchitecture === "string" ? p.solutionArchitecture : "";
  const text = `${safeIndustry} ${safePurpose} ${safeProblem} ${safeSolution}`;
  const out: string[] = [];
  const ind = safeIndustry
    .trim()
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  if (ind) out.push(ind);
  const purpose = safePurpose.trim().replace(/[^\w\s&-]/g, " ").replace(/\s+/g, " ").slice(0, 60);
  if (purpose) out.push(purpose);

  const intent = `${safeProblem} ${safeSolution}`.toLowerCase();
  const intentPhrases = [
    "commercial kitchen",
    "kitchen equipment",
    "oral history",
    "performing arts",
    "mineral exploration",
    "industrial machinery",
    "clean extraction",
    "youth mentorship",
    "veteran recognition",
    "supply chain",
  ];
  out.push(...intentPhrases.filter((phrase) => intent.includes(phrase)));

  if (/\b(food|hospitality|restaurant|cater|kitchen|agriculture)\b/i.test(text)) {
    out.push("food service", "kitchen equipment", "agriculture", "supply chain");
  } else if (/\b(mining|mineral|industrial|extraction)\b/i.test(text)) {
    out.push("mineral exploration", "industrial machinery", "clean extraction", "export");
  } else if (/\b(arts?|humanities|cultural|oral history|performing)\b/i.test(text)) {
    out.push("cultural preservation", "veteran recognition", "performing arts", "youth mentorship");
  }

  const anchors = `${safeProblem} ${safeSolution}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= 4 && !KEYWORD_STOP_WORDS.has(word));
  out.push(...anchors.slice(0, 3));

  if (TECH.test(text)) {
    out.push(
      "artificial intelligence",
      entityMode(p.entityType) === "forprofit" ? "SBIR" : "technology capacity",
      "software",
    );
  } else if (entityMode(p.entityType) === "forprofit") {
    out.push("small business", "small business grants");
  } else {
    out.push("community", "community grants");
  }
  return [...new Set(out.map((k) => k.toLowerCase()))].slice(0, 4);
}

/** Tech profiles also search Science & Technology alongside their sector. */
export function scoutCategories(sector: string | null | undefined, industry: string | null | undefined): string {
  const safeSector = typeof sector === "string" ? sector : "";
  const safeIndustry = typeof industry === "string" ? industry : "";
  const set = new Set([safeSector, ...(TECH.test(safeIndustry) ? ["ST"] : [])].filter(Boolean));
  return [...set].join("|");
}

const INSTITUTION_ONLY =
  /\b(colleges?|universit(y|ies)|tribal|tribes?|hispanic[- ]serving|HBCUs?|invasive species)\b/i;
/** Blocks university/tribal-only programs that slip into for-profit feeds via "Others". */
export function isInstitutionOnlyTitle(title: string | null | undefined, mode: EntityMode): boolean {
  if (typeof title !== "string") return false;
  return mode === "forprofit" && INSTITUTION_ONLY.test(title);
}

export type HonestEligibilityProfile = {
  state?: string | null;
  entity_type?: string | null;
  months_in_business?: number | null;
  annual_revenue?: number | null;
  demographic_tags?: readonly string[] | null;
  sam_status?: string | null;
};

export type HonestEligibilityGrant = {
  status?: string | null;
  directory_only?: boolean | null;
  states?: readonly string[] | null;
  eligible_states?: readonly string[] | null;
  eligible_entity_types?: readonly string[] | null;
  min_months_in_business?: number | null;
  requires_strict_demographic?: boolean | null;
  demographic_tags?: readonly string[] | null;
  cost_sharing_required?: boolean | null;
  amount_min?: number | null;
  award_floor?: number | null;
  stage_tags?: readonly string[] | null;
  required_documents?: readonly string[] | null;
};

export type HonestEligibilityResult = {
  eligible: boolean;
  fitScore: number;
  disqualifierReasons: string[];
  fitBreakdown: {
    operatingStage: number;
    awardAndMatchBurden: number;
    demographicAndGeographicPriority: number;
    vaultReadiness: number;
  };
  requiresSamWarning: boolean;
};

export function evaluateHonestEligibility(
  grant: HonestEligibilityGrant,
  profile: HonestEligibilityProfile,
  uploadedDocumentKeys: readonly string[] = [],
): HonestEligibilityResult {
  const reasons: string[] = [];
  if (grant.status?.toLowerCase() === "closed") {
    reasons.push("This grant is currently closed.");
  }
  if (grant.directory_only === true) {
    reasons.push("Directory listing only — no direct grant application available.");
  }

  const states = grant.states?.length ? grant.states : grant.eligible_states ?? [];
  const profileState = (profile.state ?? "").toUpperCase();
  if (
    states.length > 0 &&
    !states.some((state) => ["ALL", "US", "NATIONAL"].includes(state.toUpperCase())) &&
    !states.some((state) => state.toUpperCase() === profileState)
  ) {
    reasons.push(`Restricted to businesses in: ${states.join(", ")}. Your profile is set to ${profile.state ?? "unspecified"}.`);
  }

  const entityTypes = grant.eligible_entity_types ?? [];
  if (entityTypes.length > 0 && !entityTypes.includes(profile.entity_type ?? "")) {
    reasons.push(`Requires entity type: ${entityTypes.join(", ")}.`);
  }

  const monthsInBusiness = profile.months_in_business ?? 0;
  const minimumMonths = grant.min_months_in_business ?? 0;
  if (minimumMonths > monthsInBusiness) {
    reasons.push(
      `Requires at least ${minimumMonths} months in business (you entered ${monthsInBusiness}).`,
    );
  }

  const profileTags = new Set(profile.demographic_tags ?? []);
  const grantTags = grant.demographic_tags ?? [];
  if (grant.requires_strict_demographic === true && grantTags.length > 0) {
    if (!grantTags.some((tag) => profileTags.has(tag))) {
      reasons.push(`Restricted to founders matching: ${grantTags.join(", ")}.`);
    }
  }

  if (reasons.length) {
    return {
      eligible: false,
      fitScore: 0,
      disqualifierReasons: reasons,
      fitBreakdown: {
        operatingStage: 0,
        awardAndMatchBurden: 0,
        demographicAndGeographicPriority: 0,
        vaultReadiness: 0,
      },
      requiresSamWarning: false,
    };
  }

  const stageTags = (grant.stage_tags ?? []).map((tag) => tag.toLowerCase());
  let operatingStage = 10;
  if (stageTags.some((tag) => /0\+|all stages|pre.launch|0.to.12|early.stage|established/.test(tag))) {
    operatingStage = 15;
  } else if (stageTags.some((tag) => /startup|business|stage/.test(tag))) {
    operatingStage = 5;
  }

  let awardAndMatchBurden = grant.cost_sharing_required ? 15 : 15;
  if (grant.cost_sharing_required) {
    awardAndMatchBurden = 15;
    if (monthsInBusiness < 12 || (profile.annual_revenue ?? 0) < 50000) {
      awardAndMatchBurden -= 7;
    }
  }
  const amountMin = grant.amount_min ?? null;
  if (
    amountMin !== null &&
    amountMin > 100000 &&
    (profile.entity_type === "sole_proprietorship" || profile.entity_type === "pre_formation")
  ) {
    awardAndMatchBurden -= 3;
  }

  const demographicAndGeographicPriority =
    grantTags.length > 0 && grantTags.some((tag) => profileTags.has(tag)) ? 10 : 5;

  const requiredDocuments = grant.required_documents ?? [];
  const ready = new Set(uploadedDocumentKeys);
  const matched = requiredDocuments.filter((document) => ready.has(document)).length;
  const vaultReadiness =
    requiredDocuments.length === 0
      ? 10
      : Math.round((matched / requiredDocuments.length) * 10);

  const requiresSamWarning =
    requiredDocuments.includes("sam_gov_registration") ||
    requiredDocuments.includes("uei_number") ||
    requiredDocuments.includes("uei");

  return {
    eligible: true,
    fitScore:
      operatingStage +
      awardAndMatchBurden +
      demographicAndGeographicPriority +
      vaultReadiness,
    disqualifierReasons: [],
    fitBreakdown: {
      operatingStage,
      awardAndMatchBurden,
      demographicAndGeographicPriority,
      vaultReadiness,
    },
    requiresSamWarning: requiresSamWarning && profile.sam_status !== "active",
  };
}
