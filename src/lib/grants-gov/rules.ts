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

const MINORITY_GROUP_TAGS = new Set([
  "black_owned",
  "hispanic_owned",
  "asian_owned",
  "pacific_islander_owned",
  "indigenous_owned",
  "mena_owned",
]);

function canonicalDemographicTag(tag: string): string {
  const value = tag.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (/black|african diaspora|african american/.test(value)) return "black_owned";
  if (/hispanic|latino/.test(value)) return "hispanic_owned";
  if (/asian/.test(value)) return "asian_owned";
  if (/pacific islander|native hawaiian/.test(value)) return "pacific_islander_owned";
  if (/indigenous|native american|alaska native|tribal/.test(value)) return "indigenous_owned";
  if (/middle eastern|north african|mena/.test(value)) return "mena_owned";
  if (/minority|underrepresented/.test(value)) return "minority_owned";
  if (/immigrant|refugee|first generation/.test(value)) return "immigrant_owned";
  if (/women owned|woman owned|female|wosb/.test(value)) return "women_owned";
  if (/lgbtq/.test(value)) return "lgbtq_owned";
  if (/veteran/.test(value)) return "veteran_owned";
  if (/disability|disabled founder/.test(value)) return "disability_owned";
  if (/rural/.test(value)) return "rural_business";
  if (/hubzone|opportunity zone|low income/.test(value)) return "hubzone_or_low_income";
  return value.replace(/\s+/g, "_");
}

export function demographicRequirementMatches(
  requiredTags: readonly string[],
  profileTags: readonly string[],
): boolean {
  const normalizedProfileTags = new Set(profileTags.map(canonicalDemographicTag));
  return requiredTags.some((tag) => {
    const required = canonicalDemographicTag(tag);
    if (normalizedProfileTags.has(required)) return true;
    return (
      required === "minority_owned" &&
      [...normalizedProfileTags].some((profileTag) => MINORITY_GROUP_TAGS.has(profileTag))
    );
  });
}

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

export function interleaveUniqueSearchResults<T>(
  resultSets: readonly (readonly T[])[],
  getId: (result: T) => string | null,
  limit: number,
): T[] {
  const selected: T[] = [];
  const seen = new Set<string>();
  const maxRows = Math.max(0, Math.floor(limit));
  for (let index = 0; selected.length < maxRows; index += 1) {
    let foundAtIndex = false;
    for (const resultSet of resultSets) {
      const result = resultSet[index];
      if (result === undefined) continue;
      foundAtIndex = true;
      const id = getId(result);
      if (id === null || seen.has(id)) continue;
      seen.add(id);
      selected.push(result);
      if (selected.length >= maxRows) break;
    }
    if (!foundAtIndex) break;
  }
  return selected;
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
export function isOtherStateOnly(
  title: string | null | undefined,
  userState: string | null,
): boolean {
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
export function isEntityEligible(
  applicantTypes: string[] | null | undefined,
  mode: EntityMode,
): boolean {
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
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "been",
  "being",
  "build",
  "business",
  "can",
  "could",
  "create",
  "currently",
  "for",
  "from",
  "have",
  "help",
  "into",
  "its",
  "make",
  "more",
  "need",
  "our",
  "project",
  "provide",
  "should",
  "solution",
  "support",
  "that",
  "their",
  "there",
  "these",
  "this",
  "through",
  "those",
  "will",
  "with",
  "would",
]);

/** Derive a balanced set of profile, demographic, and project keywords (max 5). */
export function scoutKeywords(p: {
  industry?: string | null;
  fundingPurpose?: string | null;
  entityType?: string | null;
  problemStatement?: string | null;
  solutionArchitecture?: string | null;
  fundingGoal?: string | null;
  demographics?: readonly string[] | null;
}): string[] {
  const safeIndustry = typeof p.industry === "string" ? p.industry : "";
  const safePurpose = typeof p.fundingPurpose === "string" ? p.fundingPurpose : "";
  const safeProblem = typeof p.problemStatement === "string" ? p.problemStatement : "";
  const safeSolution = typeof p.solutionArchitecture === "string" ? p.solutionArchitecture : "";
  const text = `${safeIndustry} ${safePurpose} ${safeProblem} ${safeSolution}`;
  const ind = safeIndustry
    .trim()
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  const purpose = safePurpose
    .trim()
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  const intent = `${safeProblem} ${safeSolution}`.toLowerCase();
  const demographicKeywords: string[] = [];
  const demographicPatterns: Array<[RegExp, string[]]> = [
    [/black|african diaspora/, ["Black-owned small business grants", "minority business grants"]],
    [/hispanic|latino/, ["Hispanic-owned small business grants"]],
    [/asian/, ["Asian-owned small business grants"]],
    [/pacific islander|native hawaiian/, ["Native Hawaiian and Pacific Islander business grants"]],
    [
      /indigenous|native american|alaska native|tribal/,
      ["Native American and tribal business grants"],
    ],
    [/middle eastern|north african|mena/, ["MENA entrepreneur grants"]],
    [/immigrant|refugee|first generation/, ["immigrant entrepreneur grants"]],
    [/women owned|woman owned|female|wosb/, ["women-owned small business grants"]],
    [/lgbtq/, ["LGBTQ-owned small business grants"]],
    [/veteran/, ["veteran-owned small business grants"]],
    [/disability|disabled founder/, ["disability-owned small business grants"]],
    [/rural/, ["rural small business grants"]],
    [/hubzone/, ["HUBZone small business grants"]],
    [/opportunity zone|low income|lmi/, ["LMI and Opportunity Zone small business grants"]],
    [/sedi/, ["SEDI small business grants"]],
    [
      /minority|underrepresented|underserved/,
      ["minority business grants", "underserved small business grants"],
    ],
  ];
  for (const tag of p.demographics ?? []) {
    const normalized = tag.toLowerCase().replace(/[_-]+/g, " ");
    const match = demographicPatterns.find(([pattern]) => pattern.test(normalized));
    if (match) demographicKeywords.push(...match[1]);
  }
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
    "community impact",
    "business council",
  ];
  const matchedIntentPhrases = intentPhrases.filter((phrase) => intent.includes(phrase));

  const domainKeywords: string[] = [];
  if (/\b(food|hospitality|restaurant|cater|kitchen|agriculture)\b/i.test(text)) {
    domainKeywords.push("food service", "kitchen equipment", "agriculture", "supply chain");
  } else if (/\b(mining|mineral|industrial|extraction)\b/i.test(text)) {
    domainKeywords.push(
      "mineral exploration",
      "industrial machinery",
      "clean extraction",
      "export",
    );
  } else if (/\b(arts?|humanities|cultural|oral history|performing)\b/i.test(text)) {
    domainKeywords.push("cultural preservation", "performing arts", "youth mentorship");
  }

  const anchors = `${safeProblem} ${safeSolution}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= 4 && !KEYWORD_STOP_WORDS.has(word));
  const capabilityKeywords: string[] = [];
  if (TECH.test(text)) {
    capabilityKeywords.push(
      entityMode(p.entityType) === "forprofit" ? "SBIR" : "technology capacity",
      "artificial intelligence",
      "software",
    );
  } else if (entityMode(p.entityType) === "forprofit") {
    capabilityKeywords.push("small business grants");
  } else {
    capabilityKeywords.push("community grants");
  }
  return [
    ...new Set(
      [
        ind,
        purpose,
        ...demographicKeywords,
        ...capabilityKeywords,
        ...matchedIntentPhrases,
        ...domainKeywords,
        ...anchors.slice(0, 3),
      ]
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 5);
}

/** Tech profiles also search Science & Technology alongside their sector. */
export function scoutCategories(
  sector: string | null | undefined,
  industry: string | null | undefined,
): string {
  const safeSector = typeof sector === "string" ? sector : "";
  const safeIndustry = typeof industry === "string" ? industry : "";
  const set = new Set([safeSector, ...(TECH.test(safeIndustry) ? ["ST"] : [])].filter(Boolean));
  return [...set].join("|");
}

const INSTITUTION_ONLY =
  /\b(colleges?|universit(y|ies)|tribal|tribes?|hispanic[- ]serving|HBCUs?|invasive species)\b/i;
/** Blocks university/tribal-only programs that slip into for-profit feeds via "Others". */
export function isInstitutionOnlyTitle(
  title: string | null | undefined,
  mode: EntityMode,
): boolean {
  if (typeof title !== "string") return false;
  return mode === "forprofit" && INSTITUTION_ONLY.test(title);
}

export type HonestEligibilityProfile = {
  state?: string | null;
  entity_type?: string | null;
  lifecycle_stage?: string | null;
  months_in_business?: number | null;
  annual_revenue?: number | null;
  funding_goal?: number | string | null;
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
  cost_share_percentage?: number | null;
  amount_min?: number | null;
  amount_max?: number | null;
  award_floor?: number | null;
  award_ceiling?: number | null;
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

  const states = grant.states?.length ? grant.states : (grant.eligible_states ?? []);
  const profileState = stateCodeFromLocation(profile.state) || (profile.state ?? "").toUpperCase();
  if (
    states.length > 0 &&
    !states.some((state) => ["ALL", "US", "NATIONAL"].includes(state.toUpperCase())) &&
    !states.some(
      (state) =>
        stateCodeFromLocation(state) === profileState || state.toUpperCase() === profileState,
    )
  ) {
    reasons.push(
      `Restricted to businesses in: ${states.join(", ")}. Your profile is set to ${profile.state ?? "unspecified"}.`,
    );
  }

  const entityTypes = grant.eligible_entity_types ?? [];
  const normalizedEntity = (profile.entity_type ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const entityMatches = (entityType: string) => {
    const required = entityType
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (required === normalizedEntity) return true;
    if (required.includes("sole") || required.includes("individual")) {
      return /sole|individual|pre formation/.test(normalizedEntity);
    }
    if (required.includes("for profit") || required.includes("small business")) {
      return !/nonprofit|non profit|government|tribal/.test(normalizedEntity);
    }
    if (required.includes("nonprofit"))
      return /nonprofit|non profit|501 c 3/.test(normalizedEntity);
    return false;
  };
  if (entityTypes.length > 0 && (!normalizedEntity || !entityTypes.some(entityMatches))) {
    reasons.push(`Requires entity type: ${entityTypes.join(", ")}.`);
  }

  const stage = (profile.lifecycle_stage ?? "").toLowerCase();
  const derivedMonths = /pre.?launch|idea|not operating/.test(stage)
    ? 0
    : /early|startup|under 1 year|0.to.12/.test(stage)
      ? 6
      : /established|operating|growth/.test(stage)
        ? 12
        : null;
  const monthsInBusiness = profile.months_in_business ?? derivedMonths ?? 0;
  const minimumMonths = grant.min_months_in_business ?? 0;
  if (minimumMonths > monthsInBusiness) {
    reasons.push(
      `Requires at least ${minimumMonths} months in business (you entered ${monthsInBusiness}).`,
    );
  }

  const profileTags = profile.demographic_tags ?? [];
  const grantTags = grant.demographic_tags ?? [];
  if (grant.requires_strict_demographic === true && grantTags.length > 0) {
    if (!demographicRequirementMatches(grantTags, profileTags)) {
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

  const stageTags = (grant.stage_tags ?? []).map((tag) =>
    tag.toLowerCase().replace(/[^a-z0-9+]+/g, "_"),
  );
  let operatingStage = 10;
  const exactStage =
    (stageTags.some((tag) => /0\+|all_stages|pre_launch|0_to_12_months/.test(tag)) &&
      monthsInBusiness < 12) ||
    (stageTags.some((tag) => /early_stage/.test(tag)) &&
      monthsInBusiness >= 12 &&
      monthsInBusiness < 36) ||
    (stageTags.some((tag) => /established/.test(tag)) && monthsInBusiness >= 12);
  if (exactStage || grant.min_months_in_business === 0) {
    operatingStage = 15;
  } else if (
    stageTags.some((tag) => /pre_launch|startup|early_stage|established|operating|growth/.test(tag))
  ) {
    operatingStage = 5;
  }

  const amountMin = grant.amount_min ?? grant.award_floor ?? null;
  const amountMax = grant.amount_max ?? grant.award_ceiling ?? null;
  const fundingGoal = Number(String(profile.funding_goal ?? "").replace(/[^0-9.]/g, ""));
  let awardSizeFit = 7;
  if (
    Number.isFinite(fundingGoal) &&
    fundingGoal > 0 &&
    (amountMin !== null || amountMax !== null)
  ) {
    const withinRange =
      (amountMin === null || amountMin <= fundingGoal) &&
      (amountMax === null || amountMax >= fundingGoal);
    if (withinRange) {
      awardSizeFit = 10;
    } else {
      const nearestBound = amountMin !== null && fundingGoal < amountMin ? amountMin : amountMax;
      const relativeGap =
        nearestBound === null || nearestBound === 0
          ? 1
          : Math.abs(fundingGoal - nearestBound) / fundingGoal;
      awardSizeFit = relativeGap <= 0.25 ? 8 : relativeGap <= 0.75 ? 6 : 3;
    }
  }
  let matchBurdenFit = 5;
  if (grant.cost_sharing_required) {
    const contributionPenalty =
      grant.cost_share_percentage == null
        ? 1
        : Math.min(3, Math.ceil(grant.cost_share_percentage / 20));
    const capacityPenalty = monthsInBusiness < 12 && (profile.annual_revenue ?? 0) < 50000 ? 2 : 0;
    matchBurdenFit = Math.max(0, 5 - contributionPenalty - capacityPenalty);
  }
  const awardAndMatchBurden = awardSizeFit + matchBurdenFit;

  const matchesPriority = demographicRequirementMatches(grantTags, profileTags);
  const hasStateRestriction =
    states.length > 0 &&
    !states.some((state) => ["ALL", "US", "NATIONAL"].includes(state.toUpperCase()));
  const demographicAndGeographicPriority = matchesPriority
    ? 10
    : grantTags.length > 0
      ? 0
      : hasStateRestriction
        ? 10
        : 5;

  const requiredDocuments = grant.required_documents ?? [];
  const ready = new Set(uploadedDocumentKeys);
  const matched = requiredDocuments.filter((document) => ready.has(document)).length;
  const vaultReadiness =
    requiredDocuments.length === 0 ? 10 : Math.round((matched / requiredDocuments.length) * 10);

  const requiresSamWarning =
    requiredDocuments.includes("sam_gov_registration") ||
    requiredDocuments.includes("uei_number") ||
    requiredDocuments.includes("uei");

  return {
    eligible: true,
    fitScore:
      operatingStage + awardAndMatchBurden + demographicAndGeographicPriority + vaultReadiness,
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
