import { describe, expect, it } from "vitest";
import { parseSbirSolicitations } from "@/lib/grants-gov/sbir";

describe("SBIR solicitation response parsing", () => {
  it("normalizes official API records while accepting only HTTPS detail links", () => {
    expect(parseSbirSolicitations([{
      solicitation_title: "Open innovation topic",
      agency: "NSF",
      program: "SBIR",
      phase: "I",
      close_date: "2026-12-01",
      current_status: "Open",
      solicitation_topics: [{ topic_title: "Food safety" }, { topic_number: "NSF-26-01" }],
      solicitation_agency_url: "https://agency.gov/notice",
    }])).toEqual([{
      title: "Open innovation topic",
      agency: "NSF",
      program: "SBIR",
      phase: "I",
      closeDate: "2026-12-01",
      status: "Open",
      topics: ["Food safety", "NSF-26-01"],
      agencyUrl: "https://agency.gov/notice",
    }]);
  });

  it("rejects malformed result sets instead of presenting them as empty", () => {
    expect(() => parseSbirSolicitations({ message: "maintenance" })).toThrow(/unexpected solicitation response/);
    expect(() => parseSbirSolicitations([{ solicitation_title: "" }])).toThrow(/without a title/);
    expect(parseSbirSolicitations([{ solicitation_title: "Example", solicitation_agency_url: "javascript:alert(1)" }])[0]?.agencyUrl).toBeNull();
  });
});
