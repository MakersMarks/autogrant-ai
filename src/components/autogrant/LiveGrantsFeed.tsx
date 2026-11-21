import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchLiveGrants, getGrantDetail, summarizeGrant, auditGrantFit } from "@/lib/grants-gov/grants.functions";
import { ELIGIBILITY_OPTIONS, entityMode, eligibilityCodesFor, scoutKeywords, scoutCategories, formatMoney, isOtherStateOnly, stateFromLocation, isLastChance, isLowCompetition, matchesAmount, type LiveGrant } from "@/lib/grants-gov/rules";
import { OFFICIAL_SECTORS } from "@/lib/grants";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Detail = Awaited<ReturnType<typeof getGrantDetail>>;
const DEADLINES = [
  { value: "any", label: "Any deadline" },
  { value: "last", label: "Last Chance (2–7 days)" },
  { value: "30", label: "Closing within 30 days" },
  { value: "90", label: "Closing within 90 days" },
];

export function LiveGrantsFeed({ signedIn, drafting, onDraft, profile }: { signedIn: boolean; drafting: boolean; onDraft: (g: LiveGrant) => void; profile?: { sector: string; industry: string; location: string; entityType: string; fundingPurpose?: string } | undefined }) {
  const userState = stateFromLocation(profile?.location ?? "");
  const search = useServerFn(searchLiveGrants);
  const fetchDetail = useServerFn(getGrantDetail);
  const summarize = useServerFn(summarizeGrant);
  const [keyword, setKeyword] = useState("");
  const audit = useServerFn(auditGrantFit);
  const mode = entityMode(profile?.entityType ?? "");
  const scout = profile ? scoutKeywords({ industry: profile.industry, fundingPurpose: profile.fundingPurpose ?? "", entityType: profile.entityType }) : [];
  const [category, setCategory] = useState(profile ? scoutCategories(profile.sector, profile.industry) : "BC");
  const [eligibility, setEligibility] = useState(eligibilityCodesFor(mode));
  const [fit, setFit] = useState<Awaited<ReturnType<typeof auditGrantFit>> | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [fitErr, setFitErr] = useState("");
  const [localOnly, setLocalOnly] = useState(true);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !profile || (!profile.sector && !profile.industry)) return;
    setSeeded(true);
    setCategory(scoutCategories(profile.sector, profile.industry));
    setEligibility(eligibilityCodesFor(entityMode(profile.entityType)));
  }, [profile, seeded]);
  const [deadline, setDeadline] = useState("any");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [grants, setGrants] = useState<LiveGrant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<LiveGrant | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  const run = async () => {
    if (!signedIn) return;
    setLoading(true); setError("");
    try {
      const r = await search({ data: { keywords: keyword.trim() ? [keyword.trim()] : scout, category, eligibility, entityType: profile?.entityType ?? "" } });
      setGrants(r.grants); setTotal(r.total);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void run(); }, [signedIn, category, eligibility]);

  const shown = useMemo(() => grants.filter((g) => {
    if (deadline === "last" && !isLastChance(g.daysLeft)) return false;
    if ((deadline === "30" || deadline === "90") && (g.daysLeft === null || g.daysLeft > Number(deadline))) return false;
    if (lowOnly && !isLowCompetition(g)) return false;
    if (localOnly && isOtherStateOnly(g.title, userState)) return false;
    return matchesAmount(g, Number(minAmt) || 0, Number(maxAmt) || 0);
  }).sort((a, b) => Number(isLowCompetition(b)) - Number(isLowCompetition(a)) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)), [grants, deadline, lowOnly, minAmt, maxAmt, localOnly, userState]);
  const lastChanceCount = grants.filter((g) => isLastChance(g.daysLeft)).length;

  const openReader = async (g: LiveGrant) => {
    setOpen(g); setDetail(null); setDetailErr(""); setSummary(""); setFit(null); setFitErr("");
    try { setDetail(await fetchDetail({ data: { id: g.id } })); } catch (e) { setDetailErr(e instanceof Error ? e.message : "Could not load grant."); }
  };
  const runSummary = async () => {
    if (!open || summarizing) return;
    setSummarizing(true); setSummary("");
    try { setSummary((await summarize({ data: { id: open.id, title: open.title } })).summary); }
    catch (e) { setSummary(e instanceof Error ? e.message : "Summary failed."); }
    finally { setSummarizing(false); }
  };

  const runAudit = async () => {
    if (!open || auditing) return;
    setAuditing(true); setFit(null); setFitErr("");
    try { setFit(await audit({ data: { id: open.id, title: open.title } })); }
    catch (e) { setFitErr(e instanceof Error ? e.message : "Fit check failed."); }
    finally { setAuditing(false); }
  };

  const field = "bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white";
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Live Federal Opportunities — Grants.gov</h2>
        {userState && <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)} />Hide grants limited to other states (you: {userState})</label>}
        <span className="text-xs text-slate-400">{signedIn ? `${shown.length} shown of ${total} open matches` : "Sign in to search"}</span>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input aria-label="Search grants" className={`${field} flex-1`} placeholder="Search keyword (e.g. food, SBIR, rural)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <Button type="submit" disabled={loading || !signedIn} className="text-xs">Search</Button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <select aria-label="Sector" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All sectors</option>
          {OFFICIAL_SECTORS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <select aria-label="Eligibility" className={field} value={eligibility} onChange={(e) => setEligibility(e.target.value)}>
          {ELIGIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="Deadline" className={field} value={deadline} onChange={(e) => setDeadline(e.target.value)}>
          {DEADLINES.map((o) => <option key={o.value} value={o.value}>{o.label}{o.value === "last" ? ` (${lastChanceCount})` : ""}</option>)}
        </select>
        <input aria-label="Minimum award" className={field} inputMode="numeric" placeholder="Min award $" value={minAmt} onChange={(e) => setMinAmt(e.target.value.replace(/\D/g, ""))} />
        <input aria-label="Maximum award" className={field} inputMode="numeric" placeholder="Max award $" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value.replace(/\D/g, ""))} />
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low-competition only</label>
      </div>

      {!keyword.trim() && scout.length > 0 && <p className="text-[11px] text-slate-400">Scouting from your intake for: {scout.map((k) => <span key={k} className="inline-block mr-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200">{k}</span>)} · only grants open to {mode === "nonprofit" ? "nonprofits" : "for-profit / small businesses"}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {loading ? <p className="text-xs text-slate-400">Loading live grants from Grants.gov…</p> : (
        <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
          {signedIn && shown.length === 0 && !error && <p className="text-xs text-slate-400">No open grants match these filters right now.</p>}
          {shown.map((g) => (
            <div key={g.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2 hover:border-slate-600 transition">
              <button type="button" onClick={() => openReader(g)} className="text-left w-full">
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-blue-400 hover:underline">{g.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{g.agency} · {g.number}</p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-bold whitespace-nowrap">Up to {formatMoney(g.awardCeiling)}</span>
                </div>
              </button>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">[Federal]</span>
                {g.matchedKeyword && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">Matches "{g.matchedKeyword}"</span>}
                {isLastChance(g.daysLeft) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">Last Chance</span>}
                {isLowCompetition(g) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">Low competition</span>}
                {g.eligibility.slice(0, 2).map((e) => <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">{e}</span>)}
              </div>
              <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-400 font-mono">Closes {g.closeDate || "—"}{g.daysLeft !== null ? ` · ${g.daysLeft} days left` : ""}</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => openReader(g)} className="text-xs h-8">Read grant</Button>
                  <Button disabled={drafting} onClick={() => onDraft(g)} className="text-xs h-8">{drafting ? "Drafting…" : "Draft with Autopilot"}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {open && (<>
            <SheetHeader><SheetTitle className="pr-6">{open.title}</SheetTitle></SheetHeader>
            <div className="space-y-4 text-sm mt-4">
              <p className="text-muted-foreground">{open.agency} · {open.number}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><b>Closes:</b> {open.closeDate} ({open.daysLeft ?? "?"} days)</div>
                <div><b>Award range:</b> {formatMoney(open.awardFloor)} – {formatMoney(open.awardCeiling)}</div>
                <div><b>Number of awards:</b> {open.numberOfAwards ?? "Not listed"}</div>
                <div><b>Cost sharing:</b> {detail ? (detail.costSharing ? "Required" : "Not required") : "…"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={runAudit} disabled={auditing}>{auditing ? "Checking fit…" : "Go / No-Go check"}</Button>
                <Button variant="outline" onClick={runSummary} disabled={summarizing}>{summarizing ? "Summarizing…" : "Summarize with AI"}</Button>
                <Button variant="outline" asChild><a href={open.url} target="_blank" rel="noreferrer">Open on Grants.gov</a></Button>
                <Button variant="outline" disabled={drafting} onClick={() => onDraft(open)}>Draft proposal</Button>
              </div>
              {fitErr && <p className="text-xs text-red-400">{fitErr}</p>}
              {fit && <div className={`rounded-lg border p-3 text-xs space-y-1 ${fit.verdict === "GO" ? "border-emerald-600" : fit.verdict === "NO-GO" ? "border-red-600" : "border-amber-500"}`}>
                <p className={`font-bold text-sm ${fit.verdict === "GO" ? "text-emerald-500" : fit.verdict === "NO-GO" ? "text-red-500" : "text-amber-500"}`}>{fit.verdict === "GO" ? "GO — clear to pursue" : fit.verdict === "NO-GO" ? "NO-GO — skip this one" : "CAUTION — check before writing"}</p>
                {fit.costSharing && <p className="font-semibold text-amber-500">Cost share / matching funds required by this listing.</p>}
                <p className="whitespace-pre-wrap leading-relaxed">{fit.report}</p>
              </div>}
              {summary && <div className="rounded-lg border p-3 whitespace-pre-wrap text-xs leading-relaxed">{summary}</div>}
              {detailErr && <p className="text-xs text-red-400">{detailErr}</p>}
              {!detail && !detailErr && <p className="text-xs text-muted-foreground">Loading full solicitation…</p>}
              {detail && (<>
                <section><h4 className="font-semibold mb-1">Who can apply</h4><p className="text-xs">{detail.eligibility.join("; ") || "Not listed"}</p>{detail.eligibilityNotes && <p className="text-xs mt-1 whitespace-pre-wrap">{detail.eligibilityNotes}</p>}</section>
                <section><h4 className="font-semibold mb-1">Full description</h4><p className="text-xs whitespace-pre-wrap leading-relaxed">{detail.description || "No description provided."}</p></section>
                {detail.contact && <section><h4 className="font-semibold mb-1">Agency contact</h4><p className="text-xs">{detail.contact}</p></section>}
                {detail.moreInfoUrl && <a className="text-xs underline" href={detail.moreInfoUrl} target="_blank" rel="noreferrer">Full announcement from the agency</a>}
              </>)}
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}
