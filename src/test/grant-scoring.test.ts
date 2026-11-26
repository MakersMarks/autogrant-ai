import { describe, expect, it } from "vitest";
import {
  evaluateAutopilotGate,
  scoreGrantOpportunity,
  scoringInputFromUnifiedGrant,
  type GrantScoringEvidence,
  type GrantScoringProfile,
} from "@/lib/grants-gov/scoring";
import { corporateRegistry } from "@/lib/grants/sources/corporate-registry";

const profile: GrantScoringProfile = {
  projectName: "Rural Kitchen Expansion",
  entityType: "LLC / Corporation",
  sectorCode: "BC",
  industry: "Food restaurant catering",
  lifecycleStage: "Established profitable business",
  fundingPurpose: "Equipment & Machinery",
  fundingGoal: "50000",
  location: "Nashville, TN",
  demographics: ["Woman-Owned", "Rural County (<50k pop)"],
};

const evidence: GrantScoringEvidence[] = [
  { slotKey: "ein" },
  { slotKey: "tax_returns" },
  { slotKey: "good_standing" },
  { slotKey: "photo_id" },
];

const opportunity = {
  id: "tn-equipment-grant",
  title: "Tennessee Equipment Grants for Established Businesses",
  categories: ["BC - Business and Commerce"],
  eligibleEntityTypes: ["for_profit"] as const,
  demographicSetAsides: ["women_owned", "rural"] as const,
  geographicScope: { level: "state_specific" as const, allowedStates: ["TN"] },
  summaryText: "Equipment and machinery support for established profitable businesses.",
};

describe("grant eligibility and competition scoring", () => {
  it("separates hard eligibility checks from the 50-point fit score", () => {
    const result = scoreGrantOpportunity({ opportunity, profile, evidence });

    expect(result.eligible).toBe(true);
    expect(result.fitScore).toBeGreaterThan(0);
    expect(result.fitScore).toBeLessThanOrEqual(50);
    expect(Object.values(result.fitBreakdown).reduce((sum, score) => sum + score, 0)).toBe(result.fitScore);
    expect(result.eligibilityReasons).toContain(
      "Applicant entity matches the listed type: LLC / Corporation.",
    );
    expect(result.vaultReadiness.score).toBe(100);
  });

  it("can award all 50 fit points when every listed criterion aligns", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        stageTags: ["established"],
        awardFloor: 1000,
        awardCeiling: 100000,
        costSharingRequired: false,
      },
      profile,
      evidence,
    });

    expect(result.fitScore).toBe(50);
  });

  it("keeps a strong profile discoverable with an empty Vault and reports missing documents as readiness tasks", () => {
    const result = scoreGrantOpportunity({ opportunity, profile, evidence: [] });

    expect(result.eligible).toBe(true);
    expect(result.fitScore).toBeGreaterThan(0);
    expect(result.hardDisqualifiers.join(" ")).not.toMatch(/Vault evidence is missing/i);
    expect(result.vaultReadiness.score).toBe(0);
    expect(result.vaultReadiness.readyDocuments).toBe(0);
    expect(result.vaultReadiness.totalDocuments).toBeGreaterThan(0);
    expect(result.vaultReadiness.missing.length).toBe(result.vaultReadiness.totalDocuments);
  });

  it("uses the four specified fit pillars and returns no points after a strict demographic failure", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        demographicTags: ["veteran_owned"],
        requiresStrictDemographic: true,
        requiredDocuments: ["ein", "sam_gov_registration"],
      },
      profile,
      evidence: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.fitScore).toBe(0);
    expect(result.hardDisqualifiers).toContain("Restricted to founders matching: veteran_owned.");
    expect(Object.keys(result.fitBreakdown)).toEqual([
      "operatingStage",
      "awardAndMatchBurden",
      "demographicAndGeographicPriority",
      "vaultReadiness",
    ]);
  });

  it("excludes the Amber Grant unless the business is self-reported as woman-owned", () => {
    const amber = corporateRegistry.find((grant) => grant.id === "amber-grant-for-women");
    if (!amber) throw new Error("Amber Grant fixture is missing.");

    const maleApplicant = scoreGrantOpportunity({
      opportunity: scoringInputFromUnifiedGrant(amber),
      profile: { ...profile, demographics: ["Male"] },
      evidence: [],
    });
    const womanOwnedBusiness = scoreGrantOpportunity({
      opportunity: scoringInputFromUnifiedGrant(amber),
      profile: { ...profile, demographics: ["Woman-Owned"] },
      evidence: [],
    });

    expect(maleApplicant.eligible).toBe(false);
    expect(maleApplicant.hardDisqualifiers).toContain(
      "Restricted to founders matching: women_owned.",
    );
    expect(womanOwnedBusiness.eligible).toBe(true);
  });

  it("matches an explicit minority-owned requirement to a saved Black-owned profile tag", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        demographicSetAsides: [],
        demographicTags: ["minority_owned"],
        requiresStrictDemographic: true,
      },
      profile: { ...profile, demographics: ["black_owned"] },
      evidence,
    });

    expect(result.eligible).toBe(true);
    expect(result.hardDisqualifiers).not.toContain(
      "Restricted to founders matching: minority_owned.",
    );
  });

  it("scores required Vault documents and warns when SAM.gov registration is not active", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        stageTags: ["established"],
        costSharingRequired: false,
        requiredDocuments: ["ein", "sam_gov_registration"],
      },
      profile,
      evidence: [{ slotKey: "ein" }],
    });

    expect(result.eligible).toBe(true);
    expect(result.fitBreakdown.vaultReadiness).toBe(5);
    expect(result.requiresSamWarning).toBe(true);
  });

  it("rewards awards within the requested budget more than a substantially oversized award", () => {
    const inRange = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        awardFloor: 10000,
        awardCeiling: 75000,
        costSharingRequired: false,
      },
      profile,
      evidence,
    });
    const oversized = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        awardFloor: 200000,
        awardCeiling: 500000,
        costSharingRequired: false,
      },
      profile,
      evidence,
    });

    expect(inRange.fitBreakdown.awardAndMatchBurden).toBeGreaterThan(
      oversized.fitBreakdown.awardAndMatchBurden,
    );
  });

  it("reduces fit for high co-funding requirements", () => {
    const noMatch = scoreGrantOpportunity({
      opportunity: { ...opportunity, costSharingRequired: false },
      profile,
      evidence,
    });
    const highMatch = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        costSharingRequired: true,
        costSharePercentage: 60,
      },
      profile,
      evidence,
    });

    expect(highMatch.fitBreakdown.awardAndMatchBurden).toBeLessThan(
      noMatch.fitBreakdown.awardAndMatchBurden,
    );
  });

  it("does not hide a national opportunity because its title mentions another state", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        title: "California National Small Business Equipment Program",
        geographicScope: { level: "national" },
      },
      profile,
      evidence,
    });

    expect(result.eligible).toBe(true);
    expect(result.hardDisqualifiers).not.toContain(
      "The opportunity title restricts eligibility to a different state.",
    );
  });

  it("does not turn a low text-fit score into a false eligibility failure", () => {
    const result = scoreGrantOpportunity({
      opportunity,
      profile: {
        ...profile,
        sectorCode: "ST",
        industry: "Quantum biotechnology",
        lifecycleStage: "Pre-revenue clinical trials",
        fundingPurpose: "Clinical trials",
      },
      evidence,
    });

    expect(result.eligible).toBe(true);
    expect(result.fitScore).toBeLessThan(50);
    expect(result.hardDisqualifiers).toEqual([]);
  });

  it("hard-fails mismatched entity, geography, and set-aside while keeping mandatory evidence as readiness", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        eligibleEntityTypes: ["nonprofit_501c3"],
        demographicSetAsides: ["veteran_owned"],
        geographicScope: { level: "state_specific", allowedStates: ["NY"] },
        requiredEvidence: [
          {
            evidenceId: "health_permit",
            autoMatchVaultTag: "health_permit",
            category: "license_permit",
            isMandatory: true,
          },
        ],
      },
      profile,
      evidence,
    });

    expect(result.eligible).toBe(false);
    expect(result.hardDisqualifiers.join(" ")).toMatch(
      /entity types|geographic/,
    );
    expect(result.vaultReadiness.missing).toContain("health_permit");
  });

  it("hard-fails closed listings, out-of-state businesses, and verified insufficient tenure", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        status: "closed",
        eligibleStates: ["IA"],
        minMonthsInBusiness: 18,
      },
      profile: { ...profile, monthsInBusiness: 12 },
      evidence,
    });

    expect(result.eligible).toBe(false);
    expect(result.hardDisqualifiers).toContain("This opportunity is closed or inactive.");
    expect(result.hardDisqualifiers.join(" ")).toMatch(/limited to IA/);
    expect(result.hardDisqualifiers.join(" ")).toMatch(/requires at least 18 months/);
  });

  it("allows a day-one business when the grant has no minimum tenure", () => {
    const result = scoreGrantOpportunity({
      opportunity,
      profile: { ...profile, lifecycleStage: "Idea / Pre-Launch", monthsInBusiness: 0 },
      evidence,
    });

    expect(result.eligible).toBe(true);
  });

  it("does not claim a business meets a tenure requirement the profile cannot verify", () => {
    const result = scoreGrantOpportunity({
      opportunity: { ...opportunity, minMonthsInBusiness: 18 },
      profile,
      evidence,
    });

    expect(result.eligible).toBe(false);
    expect(result.hardDisqualifiers.join(" ")).toMatch(/does not confirm the full requirement/);
  });

  it("weights available competition metrics and reports award rate from reported history", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        eligibility: ["Small businesses", "Nonprofit organizations"],
        numberOfAwards: 5,
        competitionMetrics: {
          historicalAwards: { value: 10, sourceUrl: "https://funder.gov/results" },
          historicalApplications: { value: 100, sourceUrl: "https://funder.gov/results" },
          applicantCount: { value: 500, sourceUrl: "https://funder.gov/results" },
        },
      },
      profile,
      evidence,
    });

    expect(result.lowCompetitionScore).toBe(40);
    expect(result.personalLowCompetitionScore).toBe(34);
    expect(result.competitionDataStatus).toBe("mixed");
    expect(result.historicalAwardRatePct).toBe(10);
    expect(result.lowCompetitionTier).toBe("Moderate");
  });

  it("does not invent a historical award rate when applicant history is unavailable", () => {
    const result = scoreGrantOpportunity({ opportunity, profile, evidence });

    expect(result.historicalAwardRatePct).toBeNull();
    expect(result.competitionDataStatus).toBe("estimated");
  });

  it("adds real-world structural low-competition signals for a matching state grant", () => {
    const result = scoreGrantOpportunity({
      opportunity: {
        ...opportunity,
        grantTier: "State",
        openDate: "2026-11-01",
        closeDate: "2026-11-20",
        prerequisites: ["SAM.gov/UEI", "State registration", "Cost-share/match"],
        costSharePercentage: 10,
        competitionMetrics: {
          historicalAwards: { value: 30, sourceUrl: "https://state.gov/awards" },
          historicalApplications: { value: 100, sourceUrl: "https://state.gov/awards" },
        },
      },
      profile,
      evidence: [...evidence, { slotKey: "sam_registration_record" }, { slotKey: "good_standing" }, { slotKey: "financial" }],
    });

    expect(result.eligible).toBe(true);
    expect(result.lowCompetitionScore).toBeGreaterThanOrEqual(70);
    expect(result.dataConfidence).toBe("Reported");
    expect(result.whyLowCompetition.join(" ")).toMatch(/Geographic fence|Fast-turnaround|SAM.gov|Historical award/);
  });
});

describe("Autopilot three-item gate", () => {
  it("requires project name, photo ID, and at least one Vault document", () => {
    expect(evaluateAutopilotGate({ projectName: "", evidence: [] })).toEqual({
      allowed: false,
      missing: ["Project Name", "Photo ID", "Vault document"],
    });
    expect(
      evaluateAutopilotGate({ projectName: "Project", evidence: [{ slotKey: "photo_id" }] }),
    ).toEqual({ allowed: true, missing: [] });
    expect(
      evaluateAutopilotGate({ projectName: "Project", evidence: [{ slotKey: "vendor_quote" }] }),
    ).toEqual({ allowed: false, missing: ["Photo ID"] });
  });
});
