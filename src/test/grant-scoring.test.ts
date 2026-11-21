import { describe, expect, it } from "vitest";
import {
  evaluateAutopilotGate,
  scoreGrantOpportunity,
  type GrantScoringEvidence,
  type GrantScoringProfile,
} from "@/lib/grants-gov/scoring";

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
  it("scores only applicants that pass hard rules and reach 70 eligibility points", () => {
    const result = scoreGrantOpportunity({ opportunity, profile, evidence });

    expect(result.eligible).toBe(true);
    expect(result.eligibilityScore).toBeGreaterThanOrEqual(70);
    expect(result.eligibilityReasons).toContain(
      "Applicant entity matches the listed type: LLC / Corporation.",
    );
    expect(result.eligibilityBreakdown.vaultReadiness).toBe(100);
  });

  it("excludes a grant when its eligibility score is below 70 even if no hard rule fails", () => {
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

    expect(result.eligibilityScore).toBeLessThan(70);
    expect(result.eligible).toBe(false);
    expect(result.hardDisqualifiers).toContain(
      `Eligibility score ${result.eligibilityScore} is below the 70-point threshold.`,
    );
  });

  it("hard-fails mismatched entity, geography, set-aside, and mandatory evidence", () => {
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
      /entity types|demographic|geographic|Vault evidence/,
    );
  });

  it("weights each available competition metric equally and estimates win rate only from reported history", () => {
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
    expect(result.personalLowCompetitionScore).toBe(40);
    expect(result.competitionDataStatus).toBe("mixed");
    expect(result.estimatedWinRatePct).toBe(10);
    expect(result.lowCompetitionTier).toBe("Moderate");
  });

  it("does not invent an estimated win rate when applicant history is unavailable", () => {
    const result = scoreGrantOpportunity({ opportunity, profile, evidence });

    expect(result.estimatedWinRatePct).toBeNull();
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
