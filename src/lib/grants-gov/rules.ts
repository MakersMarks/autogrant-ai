// Pure, testable rules for the live Grants.gov feed.
export type LiveGrant = {
  id: string; number: string; title: string; agency: string;
  openDate: string; closeDate: string; daysLeft: number | null;
  awardCeiling: number | null; awardFloor: number | null; numberOfAwards: number | null;
  eligibility: string[]; url: string; matchedKeyword?: string;
};

export const ELIGIBILITY_OPTIONS = [
  { value: "23|22|99|25", label: "For-profit & small business (all)" },
  { value: "12|13|99|25", label: "Nonprofits (all)" },
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

export type GrantAwardScaleSignal = "award_ceiling_at_most_100k" | "at_least_10_awards_listed";

/** Funding-scale indicators only; Grants.gov listings here do not report applicant counts or win rates. */
export function grantAwardScaleSignals(
  g: Pick<LiveGrant, "awardCeiling" | "numberOfAwards">,
): GrantAwardScaleSignal[] {
  const signals: GrantAwardScaleSignal[] = [];
  if (g.awardCeiling !== null && g.awardCeiling > 0 && g.awardCeiling <= 100_000) {
    signals.push("award_ceiling_at_most_100k");
  }
  if ((g.numberOfAwards ?? 0) >= 10) signals.push("at_least_10_awards_listed");
  return signals;
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

export function stateCodeFromLocation(location: string): string {
  const state = stateFromLocation(location);
  return state ? Object.entries(STATES).find(([, name]) => name === state)?.[0] ?? "" : "";
}

/** True when a grant title is restricted to a different named state than the user's. */
export function isOtherStateOnly(title: string, userState: string | null): boolean {
  if (!userState) return false;
  const named = Object.values(STATES).filter((s) => new RegExp(`\\b${s}\\b`, "i").test(title));
  if (named.length === 0) return false;
  if (userState === "Virginia" && named.every((s) => s === "West Virginia")) return true;
  return !named.includes(userState);
}

export type EntityMode = "forprofit" | "nonprofit";
export function entityMode(entityType: string): EntityMode {
  return /non-?profit|501|charit|foundation/i.test(entityType) ? "nonprofit" : "forprofit";
}
export function eligibilityCodesFor(mode: EntityMode): string {
  return mode === "nonprofit" ? "12|13|99|25" : "23|22|99|25";
}

/** Hard gate: hide grants whose listed applicant types exclude the user's entity type. */
export function isEntityEligible(applicantTypes: string[], mode: EntityMode): boolean {
  if (applicantTypes.length === 0) return true;
  return applicantTypes.some((t) => /unrestricted|^others?\b/i.test(t.trim()) ||
    (mode === "forprofit" ? /small business|for[- ]profit/i.test(t) : /non-?profit/i.test(t) && !/other than nonprofit/i.test(t)));
}

const TECH = /\b(ai|a\.i\.|artificial intelligence|machine learning|software|saas|tech|data|automation|platform|app)\b/i;
/** Derive targeted Grants.gov keywords from the intake profile (max 4). */
export function scoutKeywords(p: { industry: string; fundingPurpose?: string; entityType: string }): string[] {
  const text = `${p.industry} ${p.fundingPurpose ?? ""}`;
  const out: string[] = [];
  const ind = p.industry.trim().replace(/[^\w\s&-]/g, " ").replace(/\s+/g, " ").slice(0, 60);
  if (ind) out.push(ind);
  if (TECH.test(text)) out.push("artificial intelligence", entityMode(p.entityType) === "forprofit" ? "SBIR" : "technology capacity", "software");
  else if (entityMode(p.entityType) === "forprofit") out.push("small business");
  else out.push("community");
  return [...new Set(out.map((k) => k.toLowerCase()))].slice(0, 4);
}

/** Tech profiles also search Science & Technology alongside their sector. */
export function scoutCategories(sector: string, industry: string): string {
  const set = new Set([sector, ...(TECH.test(industry) ? ["ST"] : [])].filter(Boolean));
  return [...set].join("|");
}

const INSTITUTION_ONLY = /\b(colleges?|universit(y|ies)|tribal|tribes?|hispanic[- ]serving|HBCUs?|invasive species)\b/i;
/** Blocks university/tribal-only programs that slip into for-profit feeds via "Others". */
export function isInstitutionOnlyTitle(title: string, mode: EntityMode): boolean {
  return mode === "forprofit" && INSTITUTION_ONLY.test(title);
}
