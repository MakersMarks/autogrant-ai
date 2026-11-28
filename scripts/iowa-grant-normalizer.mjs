function parseDeadline(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/\b(closed|expired|archived|ended)\b/i.test(value)) return null;

  const text = value.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const date = match
    ? new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])))
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDay(value) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function deadlineHasPassed(value, now = new Date()) {
  if (typeof value === "string" && /\b(closed|expired|archived|ended)\b/i.test(value)) return true;
  const date = parseDeadline(value);
  return date !== null && utcDay(date) < utcDay(now);
}

export function parseIowaGrantRow(row) {
  const headers = row.headers ?? [];
  const cells = row.cells ?? [];
  const findColumn = (pattern) => headers.findIndex((header) => pattern.test(header));
  const titleIndex = findColumn(/^(?:(?:opportunity|program|grant)\s+)?(?:title|name)$/i);
  const agencyIndex = findColumn(/^(?:awarding\s+)?agency$/i);
  const deadlineIndex = findColumn(/(?:close|deadline|due date)/i);
  const title = row.linkText?.trim() || (titleIndex >= 0 ? cells[titleIndex] : "");
  const rawId = cells[0] ?? "";
  if (!title || title.length < 4 || /opportunity title/i.test(title)) return null;

  const slug = (rawId || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  const applyUrl = row.href
    ? new URL(row.href, "https://www.iowagrants.gov/").toString()
    : "https://www.iowagrants.gov/storefrontFOList.do";
  const deadline = deadlineIndex >= 0 ? (cells[deadlineIndex] ?? "") : "";
  return {
    rawId,
    title,
    agency: (agencyIndex >= 0 ? cells[agencyIndex] : "") || "State of Iowa (IowaGrants.gov)",
    deadline,
    applyUrl,
    isClosed: deadlineHasPassed(deadline),
    isRolling: /\brolling|continuous|ongoing\b/i.test(deadline),
    slug,
  };
}

export function normalizeGrantRecord(item, { isClosed = false, now = new Date() } = {}) {
  const states =
    Array.isArray(item.states) && item.states.length > 0
      ? item.states
      : Array.isArray(item.eligible_states) && item.eligible_states.length > 0
        ? item.eligible_states
        : ["NATIONAL"];

  const amountMin =
    typeof item.amount_min === "number"
      ? item.amount_min
      : typeof item.award_floor === "number"
        ? item.award_floor
        : 0;

  const amountMax =
    typeof item.amount_max === "number"
      ? item.amount_max
      : typeof item.award_ceiling === "number"
        ? item.award_ceiling
        : 0;

  const stageTags = Array.isArray(item.stage_tags)
    ? item.stage_tags
    : [
        ...(item.is_rolling ? ["rolling"] : []),
        ...(amountMax > 0 && amountMax <= 25000 ? ["microgrant"] : []),
      ];

  const itemStatus = typeof item.status === "string" ? item.status.trim().toLowerCase() : "";
  const opensInFuture = parseDeadline(item.open_date);
  const notOpenYet = opensInFuture !== null && utcDay(opensInFuture) > utcDay(now);
  const isInactive =
    isClosed ||
    /\b(closed|inactive|expired|archived|ended)\b/.test(itemStatus) ||
    deadlineHasPassed(item.deadline, now);
  const resolvedStatus = isInactive
    ? "closed"
    : notOpenYet
      ? "unknown"
      : itemStatus === "open" || itemStatus === "unknown"
        ? itemStatus
        : item.is_rolling || parseDeadline(item.deadline)
          ? "open"
          : "unknown";

  const resolvedPortalUrl =
    item.portal_url ||
    item.direct_apply_url ||
    item.official_application_url ||
    item.source_solicitation_url ||
    "";

  return {
    ...item,
    funder: item.funder ?? item.funder_name ?? "",
    funder_name: item.funder_name ?? item.funder ?? "",
    amount_min: amountMin,
    amount_max: amountMax,
    award_floor: amountMin,
    award_ceiling: amountMax,
    eligible_entity_types: Array.isArray(item.eligible_entity_types)
      ? item.eligible_entity_types
      : [],
    states,
    eligible_states: states,
    stage_tags: stageTags,
    deadline: isInactive ? "Closed / Inactive" : item.deadline || "Check Current Cycle",
    status: resolvedStatus,
    portal_url: resolvedPortalUrl,
    direct_apply_url: item.direct_apply_url || resolvedPortalUrl,
    directory_only: Boolean(item.directory_only),
  };
}
