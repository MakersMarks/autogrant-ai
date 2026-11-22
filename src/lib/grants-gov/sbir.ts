import type { UnifiedGrant } from "@/lib/grants";

export type SbirSolicitation = {
  title: string;
  agency: string;
  program: string;
  phase: string;
  closeDate: string;
  status: string;
  topics: string[];
  agencyUrl: string | null;
};

export function shouldSearchSbirSolicitations(
  sectorCode: string,
  industry: string,
  keywords: readonly string[],
): boolean {
  return (
    sectorCode.toUpperCase() === "ST" ||
    /\b(?:technology|tech|software|research|product|engineering|science|innovation|sbir|sttr|biotech|hardware|robotics|artificial intelligence)\b/i.test(
      `${industry} ${keywords.join(" ")}`,
    )
  );
}

export function sbirToUnifiedGrant(
  solicitation: SbirSolicitation,
  now = new Date(),
): UnifiedGrant | null {
  if (/\b(?:closed|archived|expired|cancelled|canceled)\b/i.test(solicitation.status)) return null;

  if (solicitation.closeDate) {
    const closeDate = new Date(solicitation.closeDate);
    if (Number.isNaN(closeDate.getTime())) {
      throw new Error("SBIR.gov returned an invalid solicitation close date.");
    }
    if (closeDate.toISOString().slice(0, 10) < now.toISOString().slice(0, 10)) return null;
  }

  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const id =
    `sbir-${slug(solicitation.agency)}-${slug(solicitation.program)}-${slug(solicitation.phase)}-${slug(solicitation.title)}`.slice(
      0,
      120,
    );
  return {
    id,
    grantTier: "Federal",
    poolTier: "federal",
    title: solicitation.title,
    funderName:
      solicitation.agency && solicitation.program
        ? `${solicitation.agency} (${solicitation.program})`
        : solicitation.agency || solicitation.program || "SBIR/STTR",
    funderType: "government",
    awardFloor: 0,
    awardCeiling: 0,
    deadline: solicitation.closeDate || "Not listed",
    ...(solicitation.closeDate ? { closeDate: solicitation.closeDate } : {}),
    isRolling: false,
    costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"],
    demographicSetAsides: [],
    geographicScope: { level: "national" },
    applicationMethod: "online_portal",
    directApplyUrl: solicitation.agencyUrl || "https://www.sbir.gov/topics",
    isFreeToApply: true,
    summaryText: `Official SBIR/STTR solicitation from ${solicitation.agency || "the listed agency"}. Topics: ${solicitation.topics.slice(0, 3).join(", ") || "See official notice"}.`,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function parseSbirSolicitations(payload: unknown): SbirSolicitation[] {
  const root = record(payload);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.["solicitations"])
      ? root["solicitations"]
      : Array.isArray(root?.["data"])
        ? root["data"]
        : null;
  if (!rows) throw new Error("SBIR.gov returned an unexpected solicitation response.");

  return rows.map((row): SbirSolicitation => {
    const item = record(row);
    if (!item) throw new Error("SBIR.gov returned an invalid solicitation record.");
    const title = text(item["solicitation_title"]);
    if (!title) throw new Error("SBIR.gov returned a solicitation without a title.");
    const rawTopics = item["solicitation_topics"];
    const topics = Array.isArray(rawTopics)
      ? rawTopics
          .map((topic) => {
            const detail = record(topic);
            return text(detail?.["topic_title"] ?? detail?.["topic_number"] ?? topic);
          })
          .filter(Boolean)
      : [];
    const rawUrl = text(item["solicitation_agency_url"]);

    return {
      title,
      agency: text(item["agency"]),
      program: text(item["program"]),
      phase: text(item["phase"]),
      closeDate: text(item["close_date"] ?? item["application_due_date"]),
      status: text(item["current_status"]),
      topics,
      agencyUrl: /^https:\/\//i.test(rawUrl) ? rawUrl : null,
    };
  });
}
