import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { daysUntil, grantUrl, type LiveGrant } from "./rules";

const API = "https://api.grants.gov/v1/api";

async function gov(path: string, body: unknown) {
  const res = await fetch(`${API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Grants.gov is not responding right now. Try again shortly.");
  const json = (await res.json()) as { errorcode: number; data: any };
  if (json.errorcode !== 0) throw new Error("Grants.gov rejected the search.");
  return json.data;
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const strip = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/\n{3,}/g, "\n\n").trim();

async function detail(id: string) {
  const d = await gov("fetchOpportunity", { opportunityId: Number(id) });
  const s = d?.synopsis ?? {};
  return {
    awardCeiling: num(s.awardCeiling), awardFloor: num(s.awardFloor), numberOfAwards: num(s.numberOfAwards),
    eligibility: (s.applicantTypes ?? []).map((t: any) => String(t.description)),
    description: strip(String(s.synopsisDesc ?? "")),
    eligibilityNotes: strip(String(s.applicantEligibilityDesc ?? "")),
    estimatedFunding: num(s.estimatedFunding),
    costSharing: s.costSharing === true || s.costSharing === "Y",
    contact: strip([s.agencyContactName, s.agencyContactEmail, s.agencyContactPhone].filter(Boolean).join(" · ")),
    moreInfoUrl: typeof s.fundingDescLinkUrl === "string" && /^https?:\/\//.test(s.fundingDescLinkUrl) ? s.fundingDescLinkUrl : null,
    categories: (s.fundingActivityCategories ?? []).map((c: any) => String(c.description)),
  };
}

const searchSchema = z.object({
  keyword: z.string().max(200).default(""),
  category: z.string().max(10).default(""),
  eligibility: z.string().max(10).default(""),
});

export const searchLiveGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => searchSchema.parse(i))
  .handler(async ({ data }) => {
    const res = await gov("search2", {
      keyword: data.keyword, rows: 40, oppStatuses: "posted", sortBy: "closeDate|asc",
      fundingCategories: data.category, eligibilities: data.eligibility,
    });
    const hits: any[] = res?.oppHits ?? [];
    const grants: LiveGrant[] = await Promise.all(hits.map(async (h) => {
      let extra = { awardCeiling: null as number | null, awardFloor: null as number | null, numberOfAwards: null as number | null, eligibility: [] as string[] };
      try { extra = await detail(String(h.id)); } catch { /* keep listing without amounts */ }
      return {
        id: String(h.id), number: String(h.number), title: String(h.title), agency: String(h.agency ?? h.agencyCode),
        openDate: String(h.openDate ?? ""), closeDate: String(h.closeDate ?? ""), daysLeft: daysUntil(String(h.closeDate ?? "")),
        awardCeiling: extra.awardCeiling, awardFloor: extra.awardFloor, numberOfAwards: extra.numberOfAwards,
        eligibility: extra.eligibility, url: grantUrl(String(h.id)),
      };
    }));
    return { total: Number(res?.hitCount ?? 0), grants: grants.filter((g) => g.daysLeft === null || g.daysLeft >= 0) };
  });

export const getGrantDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().regex(/^\d+$/) }).parse(i))
  .handler(async ({ data }) => detail(data.id));

export const summarizeGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().regex(/^\d+$/), title: z.string().max(500) }).parse(i))
  .handler(async ({ data }) => {
    const d = await detail(data.id);
    const { generateWithGemini } = await import("@/lib/ai/ai.server");
    const text = await generateWithGemini(
      "You summarize federal grant solicitations for small-business founders in plain English. Use only the facts given; if something is not stated, say 'Not stated in the listing'. Never invent amounts, dates, or rules.",
      `Grant: ${data.title}\nAward floor/ceiling: ${d.awardFloor ?? "?"} / ${d.awardCeiling ?? "?"}\nNumber of awards: ${d.numberOfAwards ?? "?"}\nCost sharing required: ${d.costSharing ? "yes" : "no"}\nEligible applicants: ${d.eligibility.join("; ") || "Not stated"}\nEligibility notes: ${d.eligibilityNotes.slice(0, 3000)}\nDescription: ${d.description.slice(0, 12000)}\n\nWrite four short labeled lines: Who qualifies:, What they fund:, Award size:, Watch out for: (common reasons applications get rejected for this program). Plain sentences, no markdown symbols.`,
    );
    return { summary: text };
  });
