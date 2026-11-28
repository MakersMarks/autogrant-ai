import { describe, expect, it } from "vitest";
import { stateFundingPortals } from "@/lib/grants/sources/state-portals";
import { stateCodeFromLocation } from "@/lib/grants-gov/rules";

describe("state funding source directory", () => {
  it("routes all 50 states and five inhabited territories to a source without presenting it as live grant data", () => {
    expect(stateFundingPortals).toHaveLength(55);
    expect(new Set(stateFundingPortals.map((portal) => portal.stateCode)).size).toBe(55);
    expect(stateFundingPortals.every((portal) => portal.url.startsWith("https://"))).toBe(true);
    expect(
      ["AS", "GU", "MP", "PR", "VI"].every((code) =>
        stateFundingPortals.some((portal) => portal.stateCode === code),
      ),
    ).toBe(true);
  });

  it("resolves states and territories from a full business address with a ZIP code", () => {
    expect(stateCodeFromLocation("Nashville, TN")).toBe("TN");
    expect(stateCodeFromLocation("123 Main St, St. Thomas, U.S. Virgin Islands 00802")).toBe("VI");
    expect(stateCodeFromLocation("Pago Pago, American Samoa 96799")).toBe("AS");
    expect(stateCodeFromLocation("Saipan, MP 96950")).toBe("MP");
    expect(stateCodeFromLocation("New York")).toBe("NY");
    expect(stateCodeFromLocation("Unknown")).toBe("");
  });
});
