import { coreDocSlots, sectorName, type UnifiedGrant } from "@/lib/grants";
import {
  entityMode,
  isEntityEligible,
  isOtherStateOnly,
  stateCodeFromLocation,
  stateFromLocation,
  type LiveGrant,
} from "@/lib/grants-gov/rules";

export type GrantScoringProfile = {
  projectName: string;
  entityType: string;
  sectorCode: string;
  industry: string;
  lifecycleStage: string;
  fundingPurpose: string;
  fundingGoal: string;
  location: string;
  demographics: readonly string[];
  monthsInBusiness?: number | null;
};

export type GrantScoringEvidence = {
  slotKey: string;
  categoryTag?: string | null;
  grantId?: string | null;
};

export type ReportedMetric = {
  value: number;
  sourceUrl: string;
};

export type CompetitionMetrics = {
  historicalAwards?: ReportedMetric;
  historicalApplications?: ReportedMetric;
  applicantCount?: ReportedMetric;
  awardsPerCycle?: ReportedMetric;
  unspentFunds?: ReportedMetric;
};

type Requirement = {
  evidenceId: string;
  autoMatchVaultTag: string;
  category: string;
  isMandatory: boolean;
};

export type ScoringOpportunity = {
  id: string;
  title: string;
  grantTier?: "Federal" | "State" | "Local" | "Foundation";
  eligibility?: string[];
  categories?: string[];
  numberOfAwards?: number | null;
  naicsCodes?: readonly string[];
  openDate?: string | null;
  closeDate?: string | null;
  costSharePercentage?: number | null;
  prerequisites?: readonly string[];
  unspentFundsReported?: boolean;
  eligibleEntityTypes?: readonly UnifiedGrant["eligibleEntityTypes"][number][];
  demographicSetAsides?: readonly UnifiedGrant["demographicSetAsides"][number][];
  geographicScope?: UnifiedGrant["geographicScope"];
  geographicRestriction?: LiveGrant["geographicRestriction"];
  summaryText?: string;
  requiredEvidence?: Requirement[];
  competitionMetrics?: CompetitionMetrics;
  status?: "open" | "closed" | "unknown" | string;
  directoryOnly?: boolean;
  eligibleStates?: readonly string[] | null;
  minMonthsInBusiness?: number | null;
  stageTags?: readonly string[];
  awardFloor?: number | null;
  awardCeiling?: number | null;
  costSharingRequired?: boolean;
};

export type CompetitionComponent = {
  id: "award_rate" | "applicant_scarcity" | "awards_per_cycle" | "niche_advantage" | "geographic_fence" | "friction_passed" | "fast_turnaround" | "set_aside_lock";
  label: string;
  score: number;
  source: "reported" | "estimated";
  explanation: string;
  sourceUrl?: string;
};

export type GrantScore = {
  eligible: boolean;
  vaultReadiness: {
    score: number;
    readyDocuments: number;
    totalDocuments: number;
    missing: string[];
  };
  personalLowCompetitionScore: number | null;
  lowCompetitionScore: number | null;
  lowCompetitionTier: "Low" | "Moderate" | "High" | "Insufficient data";
  dataConfidence: "Reported" | "Estimated";
  whyLowCompetition: string[];
  qualificationProof: string[];
  historicalAwardRatePct: number | null;
  competitionDataStatus: "reported" | "mixed" | "estimated" | "partial" | "insufficient data";
  competitionComponents: CompetitionComponent[];
  eligibilityReasons: string[];
  hardDisqualifiers: string[];
  fitScore: number;
  fitBreakdown: {
    operatingStage: number;
    awardSuitability: number;
    matchingFunds: number;
    sectorAlignment: number;
    demographicAlignment: number;
  };
};

const COMPETITION_WEIGHTS = {
  award_rate: 25,
  applicant_scarcity: 25,
  awards_per_cycle: 25,
  niche_advantage: 25,
  geographic_fence: 45,
  friction_passed: 30,
  fast_turnaround: 15,
  set_aside_lock: 20,
} as const;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const words = (value: string) =>
  new Set(
    normalize(value)
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );

function overlapScore(needles: string[], haystack: string): number {
  const wanted = new Set(needles.flatMap((needle) => [...words(needle)]));
  if (!wanted.size || !haystack.trim()) return 0;
  const available = words(haystack);
  let matches = 0;
  for (const word of wanted) if (available.has(word)) matches += 1;
  return Math.round((matches / wanted.size) * 100);
}

function matchesSetAside(setAside: string, demographics: readonly string[]): boolean {
  const profileTags = demographics.map(normalize);
  const aliases: Record<string, string[]> = {
    women_owned: ["woman owned", "women owned", "female"],
    minority_owned: ["minority", "black african diaspora", "hispanic latino", "native american"],
    veteran_owned: ["veteran", "disabled veteran"],
    rural: ["rural county", "rural", "appalachian delta region"],
    african_diaspora: ["black african diaspora", "african diaspora", "black owned"],
    lgbtq: ["lgbtq", "lgbtq owned"],
  };
  const candidates = aliases[setAside] ?? [normalize(setAside)];
  return profileTags.some((tag) => candidates.some((candidate) => tag.includes(candidate)));
}

function entityMatchesUnifiedGrant(
  entityType: string,
  allowed: readonly UnifiedGrant["eligibleEntityTypes"][number][],
): boolean {
  const normalized = normalize(entityType);
  const applicantType = /church|faith/.test(normalized)
    ? "church"
    : /fiscal sponsor/.test(normalized)
      ? "fiscal_sponsor"
      : /501|nonprofit|non profit/.test(normalized)
        ? "nonprofit_501c3"
        : /individual|pre launch founder/.test(normalized)
          ? "individual"
          : "for_profit";
  return allowed.includes(applicantType);
}

function stateMatches(allowedStates: readonly string[], profileLocation: string): boolean {
  const stateCode = stateCodeFromLocation(profileLocation);
  const stateName = stateFromLocation(profileLocation);
  return allowedStates.some((allowed) => {
    const value = allowed.trim().toUpperCase();
    return value === "ALL" || value === "NATIONAL" || value === "US" ||
      value === stateCode || allowed.trim().toLowerCase() === stateName?.toLowerCase();
  });
}

function tenureRange(profile: GrantScoringProfile): { minimum: number; maximum: number | null } | null {
  const explicitMonths = profile.monthsInBusiness;
  if (typeof explicitMonths === "number" && Number.isFinite(explicitMonths) && explicitMonths >= 0) {
    return { minimum: explicitMonths, maximum: explicitMonths };
  }
  const stage = normalize(profile.lifecycleStage);
  if (/idea|pre launch|not registered/.test(stage)) return { minimum: 0, maximum: 0 };
  if (/new startup|under 1 year|early stage startup/.test(stage)) return { minimum: 0, maximum: 11 };
  if (/established|1\+ years|operating business|growth|expansion/.test(stage)) {
    return { minimum: 12, maximum: null };
  }
  return null;
}

function stageFit(
  profile: GrantScoringProfile,
  opportunity: ScoringOpportunity,
): number {
  const taggedStages = (opportunity.stageTags ?? []).filter((tag) =>
    /pre.?launch|startup|early.stage|established|operating|growth|mature/i.test(tag),
  );
  if (!taggedStages.length) return opportunity.minMonthsInBusiness != null ? 10 : 5;

  const stage = normalize(profile.lifecycleStage);
  const matches = taggedStages.some((tag) => {
    const normalizedTag = normalize(tag);
    if (/idea|pre launch/.test(stage)) return /pre launch|idea|startup|early stage/.test(normalizedTag);
    if (/new startup|under 1 year/.test(stage)) return /startup|early stage|pre launch/.test(normalizedTag);
    if (/established|1\+ years|operating business|growth|expansion/.test(stage)) {
      return /established|operating|growth|mature/.test(normalizedTag);
    }
    return false;
  });
  return matches ? 10 : 0;
}

function computeVaultReadiness(
  opportunity: ScoringOpportunity,
  profile: GrantScoringProfile,
  evidence: readonly GrantScoringEvidence[],
): { score: number; readyDocuments: number; totalDocuments: number; missing: string[]; reasons: string[] } {
  const mandatory = opportunity.requiredEvidence?.filter((item) => item.isMandatory) ?? [];
  const matchingEvidence = (tag: string) =>
    evidence.some(
      (doc) =>
        (doc.grantId === opportunity.id || !doc.grantId) &&
        (doc.slotKey === tag || doc.categoryTag === tag),
    );

  if (mandatory.length) {
    const missing = mandatory.filter(
      (item) => !matchingEvidence(item.evidenceId) && !matchingEvidence(item.autoMatchVaultTag),
    );
    return {
      score: Math.round(((mandatory.length - missing.length) / mandatory.length) * 100),
      readyDocuments: mandatory.length - missing.length,
      totalDocuments: mandatory.length,
      missing: missing.map((item) => item.evidenceId),
      reasons: missing.map((item) => `Required Vault evidence is missing: ${item.evidenceId}.`),
    };
  }

  const baseline = coreDocSlots(profile.entityType, profile.lifecycleStage).filter((slot) => slot.required);
  const available = baseline.filter((slot) => matchingEvidence(slot.key));
  const missing = baseline.filter((slot) => !matchingEvidence(slot.key));
  return {
    score: baseline.length ? Math.round((available.length / baseline.length) * 100) : 0,
    readyDocuments: available.length,
    totalDocuments: baseline.length,
    missing: missing.map((slot) => slot.key),
    reasons: [
      `${available.length} of ${baseline.length} baseline Vault documents are available; grant-specific requirements have not been parsed.`,
      ...missing.map((slot) => `Baseline Vault evidence is missing: ${slot.name}.`),
    ],
  };
}

function buildCompetitionComponents(
  opportunity: ScoringOpportunity,
  profile: GrantScoringProfile,
  evidence: readonly GrantScoringEvidence[],
): CompetitionComponent[] {
  const metrics = opportunity.competitionMetrics;
  const result: CompetitionComponent[] = [];

  const historicalAwards = metrics?.historicalAwards;
  const historicalApplications = metrics?.historicalApplications;
  if (historicalAwards && historicalApplications && historicalApplications.value > 0) {
    const awardCount = historicalAwards.value;
    const applications = historicalApplications.value;
    const sourceUrl = historicalAwards.sourceUrl;
    result.push({
      id: "award_rate",
      label: "Historical award rate",
      score: Math.round(Math.max(0, Math.min(awardCount / applications, 1)) * 100),
      source: "reported",
      explanation: `${awardCount} awards / ${applications} applications`,
      sourceUrl,
    });
  }

  if (metrics?.applicantCount) {
    const applicantCount = Math.max(0, metrics.applicantCount.value);
    result.push({
      id: "applicant_scarcity",
      label: "Applicant-volume scarcity",
      score: Math.round((1 - Math.min(applicantCount, 1000) / 1000) * 100),
      source: "reported",
      explanation: `${applicantCount} applicants reported; scale is 0 applicants = 100 and 1,000 or more = 0`,
      sourceUrl: metrics.applicantCount.sourceUrl,
    });
  }

  if (metrics?.unspentFunds && metrics.unspentFunds.value > 0) {
    result.push({
      id: "award_rate",
      label: "Unspent program funds",
      score: 100,
      source: "reported",
      explanation: `${metrics.unspentFunds.value.toLocaleString("en-US")} in reported unspent funds`,
      sourceUrl: metrics.unspentFunds.sourceUrl,
    });
  }

  const scope = opportunity.geographicScope;
  if (scope && opportunity.grantTier) {
    const stateMatch = !!scope.allowedStates?.includes(stateCodeFromLocation(profile.location));
    let geographicScore = 10;
    let geographicExplanation = "National / open geographic scope";
    if (scope.level === "local_county") {
      geographicScore = stateMatch ? 45 : 0;
      geographicExplanation = stateMatch
        ? "Local/county eligibility is restricted to your intake location"
        : "Local/county eligibility does not match your intake location";
    } else if (scope.level === "state_specific") {
      geographicScore = stateMatch ? 35 : 0;
      geographicExplanation = stateMatch
        ? "State-only eligibility matches your intake state"
        : "State-only eligibility does not match your intake state";
    } else if (/rural|hubzone/i.test(opportunity.summaryText ?? "")) {
      geographicScore = 35;
      geographicExplanation = "Federal rural/HUBZone geographic fence matches your profile";
    }
    result.push({
      id: "geographic_fence",
      label: "Geographic fence",
      score: geographicScore,
      source: geographicScore > 0 ? "reported" : "estimated",
      explanation: geographicExplanation,
    });
  }

  const prerequisites = opportunity.prerequisites ?? [];
  if (prerequisites.length) {
    const hasSam = prerequisites.some((item) => /SAM|UEI|CAGE/i.test(item));
    const hasRegistration = prerequisites.some((item) => /state|registration/i.test(item));
    const hasMatch = opportunity.costSharePercentage !== null &&
      opportunity.costSharePercentage !== undefined &&
      opportunity.costSharePercentage > 0;
    const samPassed = hasSam && evidence.some((doc) =>
      /sam|uei|cage/i.test(`${doc.slotKey} ${doc.categoryTag ?? ""}`),
    );
    const registrationPassed = hasRegistration && evidence.some((doc) =>
      /registration|good.standing|license|permit/i.test(`${doc.slotKey} ${doc.categoryTag ?? ""}`),
    );
    const matchPassed = evidence.some((doc) =>
      /financial|budget|match|cost.share|vendor.quote/i.test(`${doc.slotKey} ${doc.categoryTag ?? ""}`),
    );
    const passedCount = (samPassed ? 1 : 0) + (registrationPassed ? 1 : 0) + (hasMatch ? (matchPassed ? 1 : 0) : 0);
    if (passedCount > 0) {
      const passedLabels = [
        samPassed ? "SAM.gov/UEI" : "",
        registrationPassed ? "state registration" : "",
        hasMatch && matchPassed ? "cost-share/match" : "",
      ].filter(Boolean);
      result.push({
        id: "friction_passed",
        label: "Competitor-blocking friction passed",
        score: Math.min(30, 15 + passedCount * 5),
        source: "reported",
        explanation: `Your intake/Vault confirms: ${passedLabels.join(", ")}`,
      });
    }
  }

  const toDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = /^\d{2}\/\d{2}\/\d{4}$/.test(value)
      ? new Date(`${value.slice(6)}-${value.slice(0, 2)}-${value.slice(3, 5)}T00:00:00Z`)
      : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const open = toDate(opportunity.openDate);
  const close = toDate(opportunity.closeDate);
  if (open && close) {
    const windowDays = Math.ceil((close.getTime() - open.getTime()) / 86400000);
    if (windowDays > 0 && windowDays < 30) {
      const coreReady = evidence.some((doc) => /ein|business_plan|photo_id|pitch_deck/i.test(doc.slotKey));
      result.push({
        id: "fast_turnaround",
        label: "Fast-turnaround window",
        score: coreReady ? 15 : 0,
        source: "reported",
        explanation: `${windowDays}-day open-to-close window${coreReady ? "; required core Vault assets are ready" : "; core Vault assets are not yet confirmed"}`,
      });
    }
  }

  const setAsides = opportunity.demographicSetAsides ?? [];
  if (opportunity.grantTier && (opportunity.naicsCodes?.length || setAsides.length)) {
    const profileText = `${profile.industry} ${profile.sectorCode} ${profile.demographics.join(" ")}`.toLowerCase();
    const matchedSetAside = setAsides.some((item) => matchesSetAside(item, profile.demographics));
    const matchedNaics = opportunity.naicsCodes?.some((code) =>
      profileText.includes(code.toLowerCase()) || profile.industry.toLowerCase().includes(code.toLowerCase()),
    );
    if (matchedSetAside || matchedNaics) {
      result.push({
        id: "set_aside_lock",
        label: "Narrow NAICS/set-aside lock",
        score: 20,
        source: "reported",
        explanation: matchedSetAside
          ? "A profile-matched statutory set-aside narrows the applicant pool"
          : "Your profile matches a listed NAICS/sector lock",
      });
    }
  }

  const awardsPerCycle = metrics?.awardsPerCycle?.value ?? opportunity.numberOfAwards ?? null;
  if (awardsPerCycle !== null && Number.isFinite(awardsPerCycle)) {
    result.push({
      id: "awards_per_cycle",
      label: "Awards per cycle",
      score: Math.round((Math.min(Math.max(awardsPerCycle, 0), 10) / 10) * 100),
      source: metrics?.awardsPerCycle ? "reported" : "reported",
      explanation: `${awardsPerCycle} awards listed; scale is 0 awards = 0 and 10 or more = 100`,
      ...(metrics?.awardsPerCycle?.sourceUrl
        ? { sourceUrl: metrics.awardsPerCycle.sourceUrl }
        : {}),
    });
  }

  const applicantTypes =
    opportunity.eligibility?.filter((type) => !/unrestricted|^others?\b/i.test(type.trim())) ??
    opportunity.eligibleEntityTypes ??
    [];
  if (applicantTypes.length > 0) {
    result.push({
      id: "niche_advantage",
      label: "Niche eligibility advantage",
      score: Math.round(100 / applicantTypes.length),
      source: "estimated",
      explanation: `${applicantTypes.length} listed applicant group(s); narrower eligibility is treated as a possible niche advantage, not proof of lower competition`,
    });
  }
  return result;
}

export function scoreGrantOpportunity(input: {
  opportunity: ScoringOpportunity;
  profile: GrantScoringProfile;
  evidence: readonly GrantScoringEvidence[];
}): GrantScore {
  const { opportunity, profile, evidence } = input;
  const hardDisqualifiers: string[] = [];
  const eligibilityReasons: string[] = [];
  const missingProfile: Array<[keyof GrantScoringProfile, string]> = [
    ["projectName", "Project name"],
    ["entityType", "Entity type"],
    ["sectorCode", "Sector"],
    ["industry", "Industry"],
    ["lifecycleStage", "Business stage"],
    ["fundingPurpose", "Funding purpose"],
    ["fundingGoal", "Funding goal"],
  ];
  for (const [key, label] of missingProfile) {
    if (!String(profile[key]).trim())
      hardDisqualifiers.push(`Complete the intake field: ${label}.`);
  }

  if (opportunity.status === "closed" || opportunity.directoryOnly) {
    hardDisqualifiers.push(
      opportunity.status === "closed"
        ? "This opportunity is closed or inactive."
        : "This listing is directory-only and does not accept applications directly.",
    );
  }

  if (opportunity.eligibility) {
    if (!isEntityEligible(opportunity.eligibility, entityMode(profile.entityType))) {
      hardDisqualifiers.push(
        "The official applicant types do not explicitly include this entity, or applicant type is unverified.",
      );
    } else {
      eligibilityReasons.push(
        `Official applicant types include: ${opportunity.eligibility.join(", ")}.`,
      );
    }
    if (
      opportunity.geographicScope?.level !== "national" &&
      opportunity.geographicRestriction !== "national" &&
      isOtherStateOnly(opportunity.title, stateFromLocation(profile.location))
    ) {
      hardDisqualifiers.push("The opportunity title restricts eligibility to a different state.");
    }
  }

  if (opportunity.eligibleEntityTypes) {
    if (!entityMatchesUnifiedGrant(profile.entityType, opportunity.eligibleEntityTypes)) {
      hardDisqualifiers.push(
        "The directory's listed entity types do not include this applicant type.",
      );
    } else {
      eligibilityReasons.push(`Applicant entity matches the listed type: ${profile.entityType}.`);
    }
  }

  const allowedStates = opportunity.eligibleStates;
  if (allowedStates?.length && !stateMatches(allowedStates, profile.location)) {
    hardDisqualifiers.push(
      `The grant is limited to ${allowedStates.join(", ")}; the profile location is outside that area.`,
    );
  }

  const minimumMonths = opportunity.minMonthsInBusiness;
  if (typeof minimumMonths === "number" && minimumMonths > 0) {
    const tenure = tenureRange(profile);
    if (!tenure) {
      hardDisqualifiers.push(
        `This grant requires at least ${minimumMonths} months in business; the profile does not specify operating history.`,
      );
    } else if (tenure.maximum !== null && minimumMonths > tenure.maximum) {
      hardDisqualifiers.push(
        `This grant requires at least ${minimumMonths} months in business; the profile stage indicates fewer than ${minimumMonths} months.`,
      );
    } else if (minimumMonths > tenure.minimum) {
      hardDisqualifiers.push(
        `This grant requires at least ${minimumMonths} months in business; the profile confirms at least ${tenure.minimum} months but does not confirm the full requirement.`,
      );
    } else {
      eligibilityReasons.push(
        `The profile confirms at least ${tenure.minimum} months in business; this grant requires ${minimumMonths}.`,
      );
    }
  }

  const setAsides = opportunity.demographicSetAsides ?? [];
  const matchingSetAside = setAsides.find((item) => matchesSetAside(item, profile.demographics));
  if (matchingSetAside) {
    eligibilityReasons.push(
      `Self-reported profile qualification matches the listed ${matchingSetAside.replaceAll("_", " ")} set-aside; certification is not verified.`,
    );
  } else if (setAsides.length) {
    eligibilityReasons.push(
      `Listed set-aside(s) ${setAsides.map((item) => item.replaceAll("_", " ")).join(", ")} are not confirmed by the profile; verify the official eligibility rules.`,
    );
  } else {
    eligibilityReasons.push("No demographic/set-aside restriction is listed for this opportunity.");
  }

  const scope = opportunity.geographicScope;
  if (
    (scope?.level === "state_specific" || scope?.level === "local_county") &&
    (scope.allowedStates?.length ?? 0) > 0
  ) {
    const stateCode = stateCodeFromLocation(profile.location);
    if (!scope.allowedStates?.length || !stateMatches(scope.allowedStates, profile.location)) {
      hardDisqualifiers.push(
        "Applicant location does not match the listed geographic restriction.",
      );
    } else {
      eligibilityReasons.push(
        `Applicant location matches the listed ${stateCode} geographic scope.`,
      );
    }
  }

  const vault = computeVaultReadiness(opportunity, profile, evidence);
  const sectorText = opportunity.categories?.join(" ") ?? "";
  const sectorFit = opportunity.categories?.some(
    (category) =>
      normalize(category).includes(normalize(profile.sectorCode)) ||
      normalize(category).includes(normalize(sectorName(profile.sectorCode))) ||
      overlapScore([profile.industry], category) >= 50,
  )
    ? 100
    : overlapScore(
        [profile.industry],
        `${opportunity.title} ${opportunity.summaryText ?? ""} ${sectorText}`,
      );
  eligibilityReasons.push(
    sectorFit > 0
      ? "Published categories or opportunity text mention this business's sector."
      : "No published category or opportunity-text match was found for this business's sector.",
  );
  eligibilityReasons.push(
    ...vault.reasons.filter((reason) => !reason.startsWith("Required Vault evidence is missing")),
  );

  const awardGoal = Number(profile.fundingGoal.replace(/[^\d.]/g, ""));
  const awardFloor = opportunity.awardFloor ?? null;
  const awardCeiling = opportunity.awardCeiling ?? null;
  const awardSuitability =
    !Number.isFinite(awardGoal) || awardGoal <= 0 || (awardFloor === null && awardCeiling === null)
      ? 5
      : (awardFloor === null || awardGoal >= awardFloor) &&
          (awardCeiling === null || awardGoal <= awardCeiling)
        ? 10
        : (awardFloor === null || awardGoal >= awardFloor * 0.75) &&
            (awardCeiling === null || awardGoal <= awardCeiling * 1.25)
          ? 5
          : 0;
  const matchingFunds = opportunity.costSharingRequired
    ? opportunity.costSharePercentage == null
      ? 3
      : Math.max(0, 10 - Math.round(opportunity.costSharePercentage / 10) * 2)
    : 10;
  const fitBreakdown = {
    operatingStage: stageFit(profile, opportunity),
    awardSuitability,
    matchingFunds,
    sectorAlignment: Math.round(sectorFit / 10),
    demographicAlignment: setAsides.length
      ? matchingSetAside
        ? 10
        : 0
      : 10,
  };
  const fitScore = Object.values(fitBreakdown).reduce((total, points) => total + points, 0);
  const eligible = hardDisqualifiers.length === 0;

  const competitionComponents = buildCompetitionComponents(opportunity, profile, evidence);
  const legacyComponents = competitionComponents.filter((component) =>
    ["award_rate", "applicant_scarcity", "awards_per_cycle", "niche_advantage"].includes(component.id),
  );
  const legacyWeight = legacyComponents.reduce(
    (total, component) => total + COMPETITION_WEIGHTS[component.id],
    0,
  );
  const legacyScore = legacyWeight
    ? Math.round(
        legacyComponents.reduce(
          (total, component) => total + component.score * COMPETITION_WEIGHTS[component.id],
          0,
        ) / legacyWeight,
      )
    : null;
  const structuralComponents = competitionComponents.filter((component) =>
    ["geographic_fence", "friction_passed", "fast_turnaround", "set_aside_lock"].includes(component.id),
  );
  const structuralPoints = structuralComponents.reduce((total, component) => total + component.score, 0);
  const lowCompetitionScore = legacyScore !== null || structuralPoints > 0
    ? Math.min(100, (legacyScore ?? 35) + structuralPoints)
    : null;
  const personalLowCompetitionScore =
    eligible && lowCompetitionScore !== null
      ? Math.round((lowCompetitionScore * fitScore) / 50)
      : null;
  const awardRate = competitionComponents.find((component) => component.id === "award_rate");
  const historicalAwardRatePct = eligible && awardRate ? awardRate.score : null;
  const dataSources = new Set(competitionComponents.map((component) => component.source));
  const competitionDataStatus = !competitionComponents.length
    ? "insufficient data"
    : dataSources.size > 1
      ? "mixed"
      : competitionComponents.length < 4 && [...dataSources][0] === "reported"
        ? "partial"
        : [...dataSources][0]!;
  const lowCompetitionTier =
    lowCompetitionScore === null
      ? "Insufficient data"
      : lowCompetitionScore >= 70
        ? "Low"
        : lowCompetitionScore >= 40
          ? "Moderate"
          : "High";
  const hasReportedData = competitionComponents.some((component) => component.source === "reported");
  const dataConfidence: "Reported" | "Estimated" = hasReportedData ? "Reported" : "Estimated";
  const whyLowCompetition = competitionComponents
    .filter((component) =>
      ["geographic_fence", "friction_passed", "fast_turnaround", "set_aside_lock", "award_rate"].includes(component.id) &&
      component.score > 0,
    )
    .map((component) => `${component.label}: ${component.explanation}.`);
  if (!whyLowCompetition.length) {
    whyLowCompetition.push("Estimated low-competition score; verify applicant volume and current award history on the official source.");
  }
  const qualificationProof = [
    ...eligibilityReasons,
    ...vault.reasons.filter((reason) => !reason.startsWith("Required Vault evidence is missing")),
  ];

  return {
    eligible,
    vaultReadiness: {
      score: vault.score,
      readyDocuments: vault.readyDocuments,
      totalDocuments: vault.totalDocuments,
      missing: vault.missing,
    },
    personalLowCompetitionScore,
    lowCompetitionScore,
    lowCompetitionTier,
    dataConfidence,
    whyLowCompetition,
    qualificationProof,
    historicalAwardRatePct,
    competitionDataStatus,
    competitionComponents,
    eligibilityReasons,
    hardDisqualifiers,
    fitScore,
    fitBreakdown,
  };
}

export function evaluateAutopilotGate(input: {
  projectName: string;
  evidence: readonly GrantScoringEvidence[];
}): { allowed: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!input.projectName.trim()) missing.push("Project Name");
  if (!input.evidence.some((doc) => doc.slotKey === "photo_id")) missing.push("Photo ID");
  if (!input.evidence.length) missing.push("Vault document");
  return { allowed: missing.length === 0, missing };
}

export function scoringInputFromLiveGrant(grant: LiveGrant): ScoringOpportunity {
  const reportedApplicantCount = grant.historicalApplicantCount;
  const reportedAwards = grant.historicalAwards;
  return {
    id: grant.id,
    title: grant.title,
    grantTier: grant.grantTier ?? "Federal",
    eligibility: grant.eligibility,
    categories: grant.categories,
    awardFloor: grant.awardFloor,
    awardCeiling: grant.awardCeiling,
    geographicRestriction: grant.geographicRestriction,
    numberOfAwards: grant.numberOfAwards,
    ...(grant.naicsCodes ? { naicsCodes: grant.naicsCodes } : {}),
    openDate: grant.openDate,
    closeDate: grant.closeDate,
    ...(grant.costSharePercentage !== undefined ? { costSharePercentage: grant.costSharePercentage } : {}),
    costSharingRequired: (grant.costSharePercentage ?? 0) > 0,
    ...(grant.prerequisites ? { prerequisites: grant.prerequisites } : {}),
    competitionMetrics: {
      ...(reportedApplicantCount !== undefined
        ? { applicantCount: { value: reportedApplicantCount, sourceUrl: grant.url } }
        : {}),
      ...(reportedAwards !== undefined
        ? { historicalAwards: { value: reportedAwards, sourceUrl: grant.url } }
        : {}),
      ...(reportedApplicantCount !== undefined && reportedAwards !== undefined
        ? { historicalApplications: { value: reportedApplicantCount, sourceUrl: grant.url } }
        : {}),
      ...(grant.numberOfAwards !== null
        ? { awardsPerCycle: { value: grant.numberOfAwards, sourceUrl: grant.url } }
        : {}),
    },
  };
}

export function scoringInputFromUnifiedGrant(grant: UnifiedGrant): ScoringOpportunity {
  return {
    id: grant.id,
    title: grant.title,
    grantTier: grant.grantTier ??
      (grant.poolTier === "state_territory" ? "State" : grant.poolTier === "foundation" ? "Foundation" : "Federal"),
    eligibleEntityTypes: grant.eligibleEntityTypes,
    demographicSetAsides: grant.demographicSetAsides,
    geographicScope: grant.geographicScope,
    ...(grant.eligibleStates !== undefined ? { eligibleStates: grant.eligibleStates } : {}),
    ...(grant.minMonthsInBusiness !== undefined
      ? { minMonthsInBusiness: grant.minMonthsInBusiness }
      : {}),
    ...(grant.stageTags !== undefined ? { stageTags: grant.stageTags } : {}),
    awardFloor: grant.awardFloor,
    awardCeiling: grant.awardCeiling,
    costSharingRequired: grant.costSharingRequired,
    ...(grant.status !== undefined ? { status: grant.status } : {}),
    ...(grant.directoryOnly !== undefined ? { directoryOnly: grant.directoryOnly } : {}),
    summaryText: grant.summaryText,
    ...(grant.naicsCodes ? { naicsCodes: grant.naicsCodes } : {}),
    ...(grant.openDate ? { openDate: grant.openDate } : {}),
    ...(grant.closeDate ? { closeDate: grant.closeDate } : {}),
    ...(grant.costSharingPercentage !== undefined ? { costSharePercentage: grant.costSharingPercentage } : {}),
    ...(grant.prerequisites ? { prerequisites: grant.prerequisites } : {}),
    ...(grant.historicalApplicantCount !== undefined
      ? { competitionMetrics: { applicantCount: { value: grant.historicalApplicantCount, sourceUrl: grant.officialApplicationUrl ?? grant.directApplyUrl } } }
      : {}),
  };
}
