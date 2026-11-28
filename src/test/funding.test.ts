import { describe, expect, it } from "vitest";
import {
  RECORDED_AWARDED_LABEL,
  RECORDED_AWARDED_NOTE,
  parseRecordedAmount,
  recordedAwardedTotal,
} from "@/lib/funding";

describe("recorded awarded funds", () => {
  it("sums only deposits the applicant recorded", () => {
    expect(recordedAwardedTotal([{ amount: 1500 }, { amount: "2500.50" }])).toBe(4000.5);
  });

  it("ignores blank, zero and unusable amounts", () => {
    expect(recordedAwardedTotal([{ amount: "" }, { amount: 0 }, { amount: "n/a" }])).toBe(0);
  });

  it("parses currency-formatted input", () => {
    expect(parseRecordedAmount("$12,500")).toBe(12500);
  });

  it("counts nothing for a submitted application that is not a recorded deposit", () => {
    expect(recordedAwardedTotal([])).toBe(0);
    expect(recordedAwardedTotal([{ amount: 100 }])).toBe(100);
  });

  it("labels the total as recorded, never as verified", () => {
    expect(RECORDED_AWARDED_LABEL).toBe("Recorded awarded funds");
    expect(RECORDED_AWARDED_LABEL.toLowerCase()).not.toContain("verified");
    expect(RECORDED_AWARDED_NOTE).toContain("no bank connection");
    expect(RECORDED_AWARDED_NOTE).toContain("Submitted applications are not counted");
  });
});
