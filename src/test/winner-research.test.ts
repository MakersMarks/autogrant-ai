import { describe, expect, it } from "vitest";
import {
  programGuidanceForProgram,
  winnerResearchForProgram,
} from "@/lib/grants/sources/winner-research";

describe("program-specific public research", () => {
  it("keeps each winner research corpus scoped to its program", () => {
    expect(programGuidanceForProgram("amber-foundation-grant")).toHaveLength(1);
    expect(winnerResearchForProgram("amber-foundation-grant")).toHaveLength(2);
    expect(programGuidanceForProgram("black-ambition-prize")).toEqual([]);
    expect(winnerResearchForProgram("black-ambition-prize")).toHaveLength(1);
    for (const programId of [
      "tory-burch-fellows",
      "fedex-small-business",
      "fast-break-legalzoom",
      "bob-woodruff-venture",
      "tn-launchtn-innovation",
      "ny-esd-grants",
    ]) {
      expect(programGuidanceForProgram(programId)).toEqual([]);
      expect(winnerResearchForProgram(programId)).toEqual([]);
    }
  });
});
