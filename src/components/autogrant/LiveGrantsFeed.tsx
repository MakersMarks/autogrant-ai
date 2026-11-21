import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchLiveGrants, getGrantDetail, summarizeGrant, auditGrantFit, getMultiPoolRegistry } from "@/lib/grants-gov/grants.functions";
import { ELIGIBILITY_OPTIONS, entityMode, eligibilityCodesFor, scoutKeywords, scoutCategories, formatMoney, isOtherStateOnly, stateFromLocation, stateCodeFromLocation, isLastChance, grantAwardScaleSignals, matchesAmount, type LiveGrant } from "@/lib/grants-gov/rules";
import { OFFICIAL_SECTORS, type UnifiedGrant } from "@/lib/grants";
import type { StateFundingPortal } from "@/lib/grants/sources/state-portals";
import { SamRegistrationCheck } from "@/components/autogrant/SamRegistrationCheck";
import { SbirSolicitationSearch } from "@/components/autogrant/SbirSolicitationSearch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Detail = Awaited<ReturnType<typeof getGrantDetail>>;
const DEADLINES = [
  { value: "any", label: "Any deadline" },
  { value: "last", label: "Last Chance (2–7 days)" },
  { value: "30", label: "Closing within 30 days" },
  { value: "90", label: "Closing within 90 days" },
];

export function LiveGrantsFeed({
  signedIn,
  drafting,
  onDraft,
  enabled = true,
  profile,
}: {
  signedIn: boolean;
  drafting: boolean;
  enabled?: boolean;
  onDraft: (g: LiveGrant | UnifiedGrant) => void;
  profile?: { sector: string; industry: string; location: string; entityType: string; fundingPurpose?: string } | undefined;
}) {
  const userState = stateFromLocation(profile?.location ?? "");
  const registryStateCode = stateCodeFromLocation(profile?.location ?? "");
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
  const [awardScaleOnly, setAwardScaleOnly] = useState(false);
  const [grants, setGrants] = useState<LiveGrant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<LiveGrant | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const pool = useServerFn(getMultiPoolRegistry);
  const [poolGrants, setPoolGrants] = useState<UnifiedGrant[]>([]);
  const [statePortal, setStatePortal] = useState<StateFundingPortal | null>(null);
  const [poolError, setPoolError] = useState("");
  useEffect(() => {
    if (!signedIn) return;
    void pool({ data: { state: registryStateCode } })
      .then((result) => {
        setPoolGrants([
          ...(result.pools["State"] ?? []),
          ...(result.pools["Corporate"] ?? []),
          ...(result.pools["Foundation"] ?? []),
        ]);
        setStatePortal(result.statePortal);
        setPoolError("");
      })
      .catch((e) => {
        setPoolGrants([]);
        setStatePortal(null);
        setPoolError(e instanceof Error ? e.message : "Could not load the program directory.");
      });
  }, [signedIn, registryStateCode, pool]);

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
    if (awardScaleOnly && grantAwardScaleSignals(g).length === 0) return false;
    if (localOnly && isOtherStateOnly(g.title, userState)) return false;
    return matchesAmount(g, Number(minAmt) || 0, Number(maxAmt) || 0);
  }).sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)), [grants, deadline, awardScaleOnly, minAmt, maxAmt, localOnly, userState]);
  const lastChanceCount = grants.filter((g) => isLastChance(g.daysLeft)).length;

  const openReader = async (g: LiveGrant) => {
    setOpen(g); setDetail(null); setDetailErr(""); setSummary(""); setFit(null); setFitErr("");
    try { setDetail(await fetchDetail({ data: { id: g.id } })); } catch (e) { setDetailErr(e instanceof Error ? e.message : "Could not load grant."); }
  };
  const runSummary = async () => {
    if (!open || summarizing) return;
    setSummarizing(true); setSummary("");
    try { setSummary((await summarize({ data: { id: open.id, title: open.title, closeDate: open.closeDate } })).summary); }
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
      {signedIn && <><SbirSolicitationSearch /><SamRegistrationCheck /></>}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input aria-label="Search grants" className={`${field} flex-1`} placeholder="Search keyword (e.g. food, SBIR, rural)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <Button type="submit" disabled={loading || !signedIn || !enabled} className="text-xs">Search</Button>
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
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={awardScaleOnly} onChange={(e) => setAwardScaleOnly(e.target.checked)} />
          Funding-scale signal only
        </label>
      </div>
      <p className="text-[11px] text-slate-400">
        This signal means an award ceiling ≤ $100,000 or at least 10 awards listed. Grants.gov does not provide applicant counts or win rates here, so this is not a measure or prediction of competition.
      </p>

      {!keyword.trim() && scout.length > 0 && <p className="text-[11px] text-slate-400">Scouting from your intake for: {scout.map((k) => <span key={k} className="inline-block mr-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200">{k}</span>)} · only grants open to {mode === "nonprofit" ? "nonprofits" : "for-profit / small businesses"}</p>}
      {poolGrants.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Corporate, State & Foundation Opportunities</h3>
          <p className="text-[11px] text-slate-400">Program directory only. Funding cycles, amounts, eligibility, and open status vary; confirm all details on the official funder site.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {poolGrants.map((grant) => (
              <div key={grant.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-950 text-violet-300 border border-violet-800">
                    [{grant.poolTier === "state_territory" ? "State" : grant.poolTier === "corporate_diversity" ? "Corporate" : "Foundation"}]
                  </span>
                  <span className="text-[10px] text-slate-300 font-mono">{grant.directoryOnly ? "Check current award" : `$${grant.awardCeiling.toLocaleString("en-US")}`}</span>
                </div>
                <p className="text-sm font-bold text-blue-400">{grant.title}</p>
                <p className="text-xs text-slate-400">{grant.funderName} · {grant.directoryOnly ? "Check current cycle" : grant.isRolling ? "Rolling" : grant.deadline}</p>
                <div className="flex gap-2">
                  <Button variant="outline" asChild className="text-xs h-8"><a href={grant.directApplyUrl} target="_blank" rel="noreferrer">View funder</a></Button>
                  {grant.publicWinnerHistoryUrl && <Button variant="outline" asChild className="text-xs h-8"><a href={grant.publicWinnerHistoryUrl} target="_blank" rel="noreferrer">Past winners</a></Button>}
                  <Button disabled={drafting || !enabled} onClick={() => onDraft(grant)} className="text-xs h-8">{drafting ? "Drafting…" : "Open in Studio"}</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {statePortal && (
        <section className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
          <div>
            <h3 className="text-xs font-bold">{statePortal.stateName} funding source</h3>
            <p className="text-[11px] text-slate-400">{statePortal.agency} · Official agency directory, not a live feed of all state grants. Confirm current programs and requirements with the agency.</p>
          </div>
          <Button variant="outline" asChild className="text-xs h-8"><a href={statePortal.url} target="_blank" rel="noreferrer">Explore {statePortal.stateName} programs</a></Button>
        </section>
      )}
      {poolError && <p role="alert" className="text-xs text-red-400">Program directory: {poolError}</p>}
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
                {grantAwardScaleSignals(g).map((signal) => (
                  <span key={signal} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                    {signal === "award_ceiling_at_most_100k" ? "Award ceiling ≤ $100k" : "10+ awards listed"}
                  </span>
                ))}
                {g.eligibility.slice(0, 2).map((e) => <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">{e}</span>)}
              </div>
              <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-400 font-mono">Closes {g.closeDate || "—"}{g.daysLeft !== null ? ` · ${g.daysLeft} days left` : ""}</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => openReader(g)} className="text-xs h-8">Read grant</Button>
                  <Button disabled={drafting || !enabled} onClick={() => onDraft(g)} className="text-xs h-8">{drafting ? "Drafting…" : "Open in Studio"}</Button>
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
              <div className="rounded-lg border border-blue-900 bg-blue-950/30 p-3 space-y-1">
                <p className="text-xs font-semibold">Read the official announcement before applying</p>
                <a className="text-xs underline break-all" href={detail?.moreInfoUrl || open.url} target="_blank" rel="noreferrer">
                  {detail?.moreInfoUrl ? "Open full announcement from the agency" : "Open official Grants.gov opportunity"}
                </a>
                <p className="text-[11px] text-muted-foreground">The information below is the Grants.gov listing; it may not contain the full announcement or application forms.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><b>Closes:</b> {open.closeDate} ({open.daysLeft ?? "?"} days)</div>
                <div><b>Award range:</b> {formatMoney(open.awardFloor)} – {formatMoney(open.awardCeiling)}</div>
                <div><b>Number of awards:</b> {open.numberOfAwards ?? "Not listed"}</div>
                <div><b>Cost sharing:</b> {detail ? detail.costSharing === null ? "Not stated" : detail.costSharing ? "Required" : "Not required" : "…"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={runAudit} disabled={auditing}>{auditing ? "Checking fit…" : "Go / No-Go check"}</Button>
                <Button variant="outline" onClick={runSummary} disabled={summarizing}>{summarizing ? "Summarizing…" : "Summarize with AI"}</Button>
                <Button variant="outline" asChild><a href={open.url} target="_blank" rel="noreferrer">Open on Grants.gov</a></Button>
                <Button variant="outline" disabled={drafting || !enabled} onClick={() => onDraft(open)}>Open in Studio</Button>
              </div>
              {fitErr && <p className="text-xs text-red-400">{fitErr}</p>}
              {fit && <div className={`rounded-lg border p-3 text-xs space-y-1 ${fit.verdict === "GO" ? "border-emerald-600" : fit.verdict === "NO-GO" ? "border-red-600" : "border-amber-500"}`}>
                <p className={`font-bold text-sm ${fit.verdict === "GO" ? "text-emerald-500" : fit.verdict === "NO-GO" ? "text-red-500" : "text-amber-500"}`}>{fit.verdict === "GO" ? "GO — clear to pursue" : fit.verdict === "NO-GO" ? "NO-GO — skip this one" : "CAUTION — check before writing"}</p>
                {fit.costSharing && <p className="font-semibold text-amber-500">Cost share / matching funds required by this listing.</p>}
                <p className="whitespace-pre-wrap leading-relaxed">{fit.report}</p>
              </div>}
              {summary && <div className="rounded-lg border p-3 space-y-2"><h4 className="font-semibold">AI summary — based on the listing only</h4><p className="whitespace-pre-wrap text-xs leading-relaxed">{summary}</p></div>}
              {detailErr && <p className="text-xs text-red-400">{detailErr}</p>}
              {!detail && !detailErr && <p className="text-xs text-muted-foreground">Loading Grants.gov listing details…</p>}
              {detail && (<>
                <section><h4 className="font-semibold mb-1">Who can apply</h4><p className="text-xs">{detail.eligibility.join("; ") || "Not listed"}</p>{detail.eligibilityNotes && <p className="text-xs mt-1 whitespace-pre-wrap">{detail.eligibilityNotes}</p>}</section>
                <section><h4 className="font-semibold mb-1">Grants.gov listing synopsis</h4><p className="text-xs whitespace-pre-wrap leading-relaxed">{detail.description || "No description provided in the listing."}</p></section>
                {detail.contact && <section><h4 className="font-semibold mb-1">Agency contact</h4><p className="text-xs">{detail.contact}</p></section>}
                <p className="text-[11px] text-muted-foreground">The Grants.gov synopsis may omit mandatory forms, attachment formats, evaluation criteria, or other application instructions. Verify those in the official announcement.</p>
              </>)}
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}
