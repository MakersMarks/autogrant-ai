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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
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
      ? rawTopics.map((topic) => {
        const detail = record(topic);
        return text(detail?.["topic_title"] ?? detail?.["topic_number"] ?? topic);
      }).filter(Boolean)
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
