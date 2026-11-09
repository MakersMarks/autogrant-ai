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

const STATES: Record<string, string> = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico",GU:"Guam" };

/** Resolve the user's state name from free-text location like "Nashville, TN". */
export function stateFromLocation(location: string): string | null {
  const t = location.trim();
  if (!t) return null;
  const abbr = /\b([A-Z]{2})\b/.exec(t.toUpperCase().replace(/[^A-Z ,]/g, " ").split(",").pop() ?? "")?.[1];
  if (abbr && STATES[abbr]) return STATES[abbr]!;
  const low = t.toLowerCase();
  return Object.values(STATES).find((s) => low.includes(s.toLowerCase())) ?? null;
}

/** True when a grant title is restricted to a different named state than the user's. */
export function isOtherStateOnly(title: string, userState: string | null): boolean {
  if (!userState) return false;
  const named = Object.values(STATES).filter((s) => new RegExp(`\\b${s}\\b`, "i").test(title));
  if (named.length === 0) return false;
  if (userState === "Virginia" && named.every((s) => s === "West Virginia")) return true;
  return !named.includes(userState);
}
