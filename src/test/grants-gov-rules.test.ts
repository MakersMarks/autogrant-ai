import { describe, it, expect } from "vitest";
import { isUnifiedGrantOpen } from "@/lib/grants";
import {
  daysUntil,
  isLastChance,
  grantAwardScaleSignals,
  matchesAmount,
} from "@/lib/grants-gov/rules";

describe("live grant rules", () => {
  const now = new Date(Date.UTC(2026, 10, 8));
  it("counts days to the Grants.gov close date", () =>
    expect(daysUntil("11/10/2026", now)).toBe(2));
  it("Last Chance means closing in 2 to 7 days", () => {
    expect(isLastChance(1)).toBe(false);
    expect(isLastChance(2)).toBe(true);
    expect(isLastChance(7)).toBe(true);
    expect(isLastChance(8)).toBe(false);
  });

  describe("fixed grant deadlines", () => {
    const now = new Date("2026-11-22T03:13:00Z");

    it("keeps fixed-deadline grants open through the deadline day and closes them afterward", () => {
      expect(isUnifiedGrantOpen({ isRolling: false, closeDate: "2026-11-22" }, now)).toBe(true);
      expect(isUnifiedGrantOpen({ isRolling: false, closeDate: "2026-11-21" }, now)).toBe(false);
      expect(isUnifiedGrantOpen({ isRolling: true }, now)).toBe(true);
    });

    it("does not treat a fixed grant with no verifiable closing date as open", () => {
      expect(isUnifiedGrantOpen({ isRolling: false }, now)).toBe(false);
      expect(isUnifiedGrantOpen({ isRolling: false, closeDate: "not a date" }, now)).toBe(false);
    });
  });
  it("reports award-scale signals without treating them as competition statistics", () => {
    expect(grantAwardScaleSignals({ awardCeiling: 100000, numberOfAwards: 1 })).toEqual([
      "award_ceiling_at_most_100k",
    ]);
    expect(grantAwardScaleSignals({ awardCeiling: 500000, numberOfAwards: 10 })).toEqual([
      "at_least_10_awards_listed",
    ]);
    expect(grantAwardScaleSignals({ awardCeiling: 500000, numberOfAwards: 2 })).toEqual([]);
    expect(grantAwardScaleSignals({ awardCeiling: null, numberOfAwards: null })).toEqual([]);
  });
  it("amount filter uses award ceiling", () => {
    expect(matchesAmount({ awardCeiling: 50000 }, 10000, 60000)).toBe(true);
    expect(matchesAmount({ awardCeiling: null }, 10000, 0)).toBe(false);
  });
});

import { stateFromLocation, isOtherStateOnly } from "@/lib/grants-gov/rules";
describe("location relevance", () => {
  it("reads the state from 'Nashville, TN'", () =>
    expect(stateFromLocation("Nashville, TN")).toBe("Tennessee"));
  it("hides Alaska-only grants for a Nashville founder", () =>
    expect(isOtherStateOnly("Alaska Marine Education and Training", "Tennessee")).toBe(true));
  it("keeps national and same-state grants", () => {
    expect(isOtherStateOnly("SBIR Phase I Small Business Innovation", "Tennessee")).toBe(false);
    expect(isOtherStateOnly("Tennessee Rural Development", "Tennessee")).toBe(false);
  });
});

import {
  entityMode,
  eligibilityCodesFor,
  isEntityEligible,
  scoutKeywords,
} from "@/lib/grants-gov/rules";
describe("scout + entity gate", () => {
  it("nonprofits get nonprofit codes, companies get business codes", () => {
    expect(eligibilityCodesFor(entityMode("501(c)(3) Nonprofit"))).toBe("12|13|99|25");
    expect(eligibilityCodesFor(entityMode("LLC / Corporation"))).toBe("23|22|99|25");
  });
  it("hides university-only grants from a for-profit", () => {
    expect(
      isEntityEligible(
        ["Public and State controlled institutions of higher education"],
        "forprofit",
      ),
    ).toBe(false);
    expect(isEntityEligible(["Small businesses"], "forprofit")).toBe(true);
    expect(isEntityEligible(["Small businesses"], "nonprofit")).toBe(false);
  });
  it("does not treat missing or ambiguous applicant types as proof of eligibility", () => {
    expect(isEntityEligible([], "forprofit")).toBe(false);
    expect(isEntityEligible(["Others"], "forprofit")).toBe(false);
    expect(isEntityEligible(["Other than nonprofit organizations"], "nonprofit")).toBe(false);
    expect(isEntityEligible(["Unrestricted"], "forprofit")).toBe(true);
  });
  it("an AI company searches for AI and SBIR, never blank", () => {
    const k = scoutKeywords({ industry: "AI software", entityType: "LLC / Corporation" });
    expect(k).toContain("artificial intelligence");
    expect(k).toContain("sbir");
  });
  it("scouts specific project language and sector synonyms", () => {
    const k = scoutKeywords({
      industry: "Food service",
      entityType: "LLC / Corporation",
      problemStatement: "Our rural catering service needs a commercial kitchen.",
      solutionArchitecture: "Purchase kitchen equipment to expand local food service capacity.",
    });

    expect(k).toContain("commercial kitchen");
    expect(k).toContain("kitchen equipment");
    expect(k.length).toBeGreaterThanOrEqual(3);
    expect(k.length).toBeLessThanOrEqual(4);
  });
});

import { isInstitutionOnlyTitle } from "@/lib/grants-gov/rules";
describe("Others loophole", () => {
  it("hides tribal college grants from a small business", () =>
    expect(isInstitutionOnlyTitle("Tribal Colleges Research Grants Program", "forprofit")).toBe(
      true,
    ));
  it("keeps them for nonprofits and keeps normal business grants", () => {
    expect(isInstitutionOnlyTitle("Tribal Colleges Research Grants Program", "nonprofit")).toBe(
      false,
    );
    expect(isInstitutionOnlyTitle("SBIR Phase I Small Business Innovation", "forprofit")).toBe(
      false,
    );
  });
});
