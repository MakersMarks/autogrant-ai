import { describe, it, expect } from "vitest";
import { daysUntil, isLastChance, isLowCompetition, matchesAmount } from "@/lib/grants-gov/rules";

describe("live grant rules", () => {
  const now = new Date(Date.UTC(2026, 10, 8));
  it("counts days to the Grants.gov close date", () => expect(daysUntil("11/10/2026", now)).toBe(2));
  it("Last Chance means closing in 2 to 7 days", () => {
    expect(isLastChance(1)).toBe(false); expect(isLastChance(2)).toBe(true);
    expect(isLastChance(7)).toBe(true); expect(isLastChance(8)).toBe(false);
  });
  it("low competition = ceiling up to $100k or 10+ awards", () => {
    expect(isLowCompetition({ awardCeiling: 100000, numberOfAwards: 1 })).toBe(true);
    expect(isLowCompetition({ awardCeiling: 500000, numberOfAwards: 10 })).toBe(true);
    expect(isLowCompetition({ awardCeiling: 500000, numberOfAwards: 2 })).toBe(false);
  });
  it("amount filter uses award ceiling", () => {
    expect(matchesAmount({ awardCeiling: 50000 }, 10000, 60000)).toBe(true);
    expect(matchesAmount({ awardCeiling: null }, 10000, 0)).toBe(false);
  });
});
