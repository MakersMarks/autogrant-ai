// Pure, testable rules for the live Grants.gov feed.
export type LiveGrant = {
  id: string; number: string; title: string; agency: string;
  openDate: string; closeDate: string; daysLeft: number | null;
  awardCeiling: number | null; awardFloor: number | null; numberOfAwards: number | null;
  eligibility: string[]; url: string;
};

export const ELIGIBILITY_OPTIONS = [
  { value: "", label: "Any eligibility" },
  { value: "23", label: "Small businesses" },
  { value: "22", label: "For-profit (not small business)" },
  { value: "12", label: "Nonprofit 501(c)(3)" },
  { value: "21", label: "Individuals" },
  { value: "07", label: "Native American tribal governments" },
  { value: "06", label: "Public colleges & universities" },
  { value: "25", label: "Others" },
] as const;

/** Parse Grants.gov MM/DD/YYYY. */
export function parseGovDate(s: string | null | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? "");
  return m ? new Date(Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!)) : null;
}

export function daysUntil(close: string, now = new Date()): number | null {
  const d = parseGovDate(close);
  if (!d) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d.getTime() - today) / 86400000);
}

/** Last Chance = closes within 2–7 days (inclusive). */
export function isLastChance(days: number | null): boolean {
  return days !== null && days >= 2 && days <= 7;
}

/** Low-competition signal: small award ceiling (≤ $100k) or many awards (≥ 10). */
export function isLowCompetition(g: Pick<LiveGrant, "awardCeiling" | "numberOfAwards">): boolean {
  return (g.awardCeiling !== null && g.awardCeiling > 0 && g.awardCeiling <= 100_000) || (g.numberOfAwards ?? 0) >= 10;
}

export function matchesAmount(g: Pick<LiveGrant, "awardCeiling">, min: number, max: number): boolean {
  if (!min && !max) return true;
  if (g.awardCeiling === null) return false;
  return (!min || g.awardCeiling >= min) && (!max || g.awardCeiling <= max);
}

export function formatMoney(n: number | null): string {
  return n === null || n <= 0 ? "Not listed" : `$${n.toLocaleString("en-US")}`;
}

export function grantUrl(id: string) {
  return `https://www.grants.gov/search-results-detail/${id}`;
}
