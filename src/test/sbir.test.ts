import { describe, expect, it } from "vitest";
import {
  parseSbirSolicitations,
  sbirToUnifiedGrant,
  shouldSearchSbirSolicitations,
} from "@/lib/grants-gov/sbir";

describe("SBIR solicitation response parsing", () => {
  it("normalizes official API records while accepting only HTTPS detail links", () => {
    expect(
      parseSbirSolicitations([
        {
          solicitation_title: "Open innovation topic",
          agency: "NSF",
          program: "SBIR",
          phase: "I",
          close_date: "2026-12-01",
          current_status: "Open",
          solicitation_topics: [{ topic_title: "Food safety" }, { topic_number: "NSF-26-01" }],
          solicitation_agency_url: "https://agency.gov/notice",
        },
      ]),
    ).toEqual([
      {
        title: "Open innovation topic",
        agency: "NSF",
        program: "SBIR",
        phase: "I",
        closeDate: "2026-12-01",
        status: "Open",
        topics: ["Food safety", "NSF-26-01"],
        agencyUrl: "https://agency.gov/notice",
      },
    ]);
  });

  it("rejects malformed result sets instead of presenting them as empty", () => {
    expect(() => parseSbirSolicitations({ message: "maintenance" })).toThrow(
      /unexpected solicitation response/,
    );
    expect(() => parseSbirSolicitations([{ solicitation_title: "" }])).toThrow(/without a title/);
    expect(
      parseSbirSolicitations([
        { solicitation_title: "Example", solicitation_agency_url: "javascript:alert(1)" },
      ])[0]?.agencyUrl,
    ).toBeNull();
  });

  it("adds relevant open SBIR topics to the unified grant feed and drops expired topics", () => {
    const solicitation = parseSbirSolicitations([
      {
        solicitation_title: "Open innovation topic",
        agency: "NSF",
        program: "SBIR",
        phase: "I",
        close_date: "2026-12-01",
        solicitation_topics: [{ topic_title: "Food safety" }],
      },
    ])[0]!;
    const grant = sbirToUnifiedGrant(solicitation, new Date("2026-11-22T00:00:00Z"));

    expect(grant).toMatchObject({
      poolTier: "federal",
      grantTier: "Federal",
      eligibleEntityTypes: ["for_profit"],
      geographicScope: { level: "national" },
      directApplyUrl: "https://www.sbir.gov/topics",
    });
    expect(grant?.awardCeiling).toBe(0);
    expect(sbirToUnifiedGrant(solicitation, new Date("2026-12-02T00:00:00Z"))).toBeNull();
    expect(sbirToUnifiedGrant({ ...solicitation, closeDate: "", status: "Closed" })).toBeNull();
  });

  it("only searches SBIR for relevant profile sectors or innovation-related queries", () => {
    expect(shouldSearchSbirSolicitations("ST", "Food service", [])).toBe(true);
    expect(shouldSearchSbirSolicitations("BC", "Catering", ["innovation grants"])).toBe(true);
    expect(shouldSearchSbirSolicitations("BC", "Catering", ["local equipment"])).toBe(false);
  });
});
