import { describe, expect, it } from "vitest";
import { stateFundingPortals } from "@/lib/grants/sources/state-portals";
import { stateCodeFromLocation } from "@/lib/grants-gov/rules";

describe("state funding source directory", () => {
  it("routes all 50 states to an agency website without presenting it as live grant data", () => {
    expect(stateFundingPortals).toHaveLength(50);
    expect(new Set(stateFundingPortals.map((portal) => portal.stateCode)).size).toBe(50);
    expect(stateFundingPortals.every((portal) => portal.url.startsWith("https://"))).toBe(true);
  });

  it("resolves full state names and postal codes from the applicant location", () => {
    expect(stateCodeFromLocation("Nashville, TN")).toBe("TN");
    expect(stateCodeFromLocation("New York")).toBe("NY");
    expect(stateCodeFromLocation("Unknown")).toBe("");
  });
});
