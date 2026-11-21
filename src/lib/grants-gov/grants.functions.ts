import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { daysUntil, grantUrl, isEntityEligible, isInstitutionOnlyTitle, entityMode, type LiveGrant } from "./rules";
import { corporateRegistry } from "@/lib/grants/sources/corporate-registry";
import { stateRegistry } from "@/lib/grants/sources/state-registry";
import type { UnifiedGrant } from "@/lib/grants";

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
  keywords: z.array(z.string().max(100)).max(5).default([]),
  category: z.string().max(30).default(""),
  eligibility: z.string().max(30).default(""),
  entityType: z.string().max(100).default(""),
});

export const searchLiveGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => searchSchema.parse(i))
  .handler(async ({ data }) => {
    const queries = data.keywords.length ? data.keywords : [""];
    const results = await Promise.all(queries.map(async (keyword) => {
      try {
        const res = await gov("search2", { keyword, rows: queries.length > 1 ? 15 : 40, oppStatuses: "posted", sortBy: "closeDate|asc", fundingCategories: data.category, eligibilities: data.eligibility });
        return { keyword, hits: (res?.oppHits ?? []) as any[], total: Number(res?.hitCount ?? 0) };
      } catch { return { keyword, hits: [] as any[], total: 0 }; }
    }));
    const seen = new Map<string, { h: any; keyword: string }>();
    for (const r of results) for (const h of r.hits) if (!seen.has(String(h.id))) seen.set(String(h.id), { h, keyword: r.keyword });
    const grants: LiveGrant[] = await Promise.all([...seen.values()].map(async ({ h, keyword }) => {
      let extra = { awardCeiling: null as number | null, awardFloor: null as number | null, numberOfAwards: null as number | null, eligibility: [] as string[] };
      try { extra = await detail(String(h.id)); } catch { /* keep listing without amounts */ }
      return {
        id: String(h.id), number: String(h.number), title: String(h.title), agency: String(h.agency ?? h.agencyCode),
        openDate: String(h.openDate ?? ""), closeDate: String(h.closeDate ?? ""), daysLeft: daysUntil(String(h.closeDate ?? "")),
        awardCeiling: extra.awardCeiling, awardFloor: extra.awardFloor, numberOfAwards: extra.numberOfAwards,
        eligibility: extra.eligibility, url: grantUrl(String(h.id)), ...(keyword ? { matchedKeyword: keyword } : {}),
      };
    }));
    const mode = entityMode(data.entityType);
    const kept = grants.filter((g) => (g.daysLeft === null || g.daysLeft >= 0) && (!data.entityType || isEntityEligible(g.eligibility, mode) && !isInstitutionOnlyTitle(g.title, mode)));
    return { total: results.reduce((n, r) => n + r.total, 0), grants: kept };
  });

export const getMultiPoolRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    state: z.string().max(2).default(""),
  }).parse(i))
  .handler(async ({ data }): Promise<{ pools: Record<string, UnifiedGrant[]> }> => {
    const stateMatches = stateRegistry.filter((grant) =>
      !data.state || !grant.geographicScope.allowedStates?.length
      || grant.geographicScope.allowedStates.includes(data.state.toUpperCase()),
    );
    return {
      pools: {
        Federal: [],
        State: stateMatches,
        Corporate: corporateRegistry,
        Foundation: corporateRegistry.filter((grant) => grant.poolTier === "foundation"),
      },
    };
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

export const auditGrantFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().regex(/^\d+$/), title: z.string().max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const [d, { data: p }] = await Promise.all([detail(data.id), context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle()]);
    const { generateWithGemini } = await import("@/lib/ai/ai.server");
    const profile = p ? `Name: ${p.project_name}\nEntity: ${p.entity_type}\nIndustry: ${p.industry}\nStage: ${p.lifecycle_stage}\nLocation: ${p.location}\nFunding goal: ${p.funding_goal}\nUse of funds: ${p.funding_purpose}\nDemographics: ${(p.demographics ?? []).join(", ")}` : "No profile on file.";
    const text = await generateWithGemini(
      "You are a veteran federal grant consultant doing a fast Go/No-Go screen before a founder spends time writing. Use only the facts given. Be blunt. Never invent rules; if unclear say 'Not stated — confirm with the program officer'.",
      `APPLICANT\n${profile}\n\nGRANT: ${data.title}\nEligible applicants: ${d.eligibility.join("; ") || "Not stated"}\nEligibility notes: ${d.eligibilityNotes.slice(0, 3000)}\nCost sharing flag: ${d.costSharing ? "REQUIRED" : "not required"}\nAward: ${d.awardFloor ?? "?"} - ${d.awardCeiling ?? "?"}\nDescription: ${d.description.slice(0, 10000)}\n\nReply in exactly this plain-text format, no markdown:\nVERDICT: GO or CAUTION or NO-GO\nEntity fit: one sentence\nCost share: one sentence (amount/percent if stated)\nTopic fit: one sentence on how well the applicant's business matches what is funded\nRegistrations needed: SAM.gov/UEI/Grants.gov/other, one line\nNext steps: 2-3 short actions separated by semicolons`,
    );
    const v = /VERDICT:\s*(NO-GO|CAUTION|GO)/i.exec(text)?.[1]?.toUpperCase() ?? "CAUTION";
    return { verdict: (d.costSharing && v === "GO" ? "CAUTION" : v) as "GO" | "CAUTION" | "NO-GO", costSharing: d.costSharing, report: text.replace(/^VERDICT:.*\n?/im, "").trim() };
  });
