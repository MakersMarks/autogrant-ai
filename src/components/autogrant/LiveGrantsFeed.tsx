import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  searchLiveGrants,
  searchSbirSolicitations,
  getGrantDetail,
  summarizeGrant,
  auditGrantFit,
  getMultiPoolRegistry,
} from "@/lib/grants-gov/grants.functions";
import {
  ELIGIBILITY_OPTIONS,
  entityMode,
  eligibilityCodesFor,
  scoutKeywords,
  scoutCategories,
  formatMoney,
  isOtherStateOnly,
  stateFromLocation,
  stateCodeFromLocation,
  isLastChance,
  grantAwardScaleSignals,
  matchesAmount,
  type LiveGrant,
} from "@/lib/grants-gov/rules";
import { OFFICIAL_SECTORS, type UnifiedGrant } from "@/lib/grants";
import { mapSiteGrantToUnified, type SiteGrantRow } from "@/lib/grants/site-grant-mapping";
import { stateFundingPortals } from "@/lib/grants/sources/state-portals";
import { sbirToUnifiedGrant, shouldSearchSbirSolicitations } from "@/lib/grants-gov/sbir";
import {
  scoreGrantOpportunity,
  scoringInputFromLiveGrant,
  scoringInputFromUnifiedGrant,
  type GrantScoringEvidence,
  type GrantScoringProfile,
  type GrantScore,
} from "@/lib/grants-gov/scoring";
import { createGrantIssueUrl } from "@/lib/grant-feedback";
import { trackLovableEvent } from "@/lib/lovable-error-reporting";
import { SamRegistrationCheck } from "@/components/autogrant/SamRegistrationCheck";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Detail = Awaited<ReturnType<typeof getGrantDetail>>;
type SiteGrantsClient = {
  from(table: "site_grants"): {
    select(columns: "*"): PromiseLike<{
      data: SiteGrantRow[] | null;
      error: { message: string } | null;
    }>;
  };
};
const siteGrantsClient = supabase as unknown as SiteGrantsClient;

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
  evidence = [],
  showAdvancedCompliance = true,
}: {
  signedIn: boolean;
  drafting: boolean;
  enabled?: boolean;
  onDraft: (g: LiveGrant | UnifiedGrant) => void;
  profile?:
    | (Omit<GrantScoringProfile, "sectorCode"> & {
        sector: string;
        problemStatement?: string;
        solutionArchitecture?: string;
      })
    | undefined;
  evidence?: readonly GrantScoringEvidence[];
  showAdvancedCompliance?: boolean;
}) {
  const userState = stateFromLocation(profile?.location ?? "");
  const registryStateCode = stateCodeFromLocation(profile?.location ?? "");
  const statePortal = stateFundingPortals.find((portal) => portal.stateCode === registryStateCode);
  const [keyword, setKeyword] = useState("");
  const keywordRef = useRef("");
  const mode = entityMode(profile?.entityType ?? "");
  const hasProfile = profile !== undefined;
  const profileIndustry = profile?.industry ?? "";
  const profilePurpose = profile?.fundingPurpose ?? "";
  const profileEntityType = profile?.entityType ?? "";
  const profileProblem = profile?.problemStatement ?? "";
  const profileSolution = profile?.solutionArchitecture ?? "";
  const scout = useMemo(
    () =>
      hasProfile
        ? scoutKeywords({
            industry: profileIndustry,
            fundingPurpose: profilePurpose,
            entityType: profileEntityType,
            problemStatement: profileProblem,
            solutionArchitecture: profileSolution,
            fundingGoal: profile?.fundingGoal,
            demographics: profile?.demographics,
          })
        : [],
    [
      hasProfile,
      profileIndustry,
      profilePurpose,
      profileEntityType,
      profileProblem,
      profileSolution,
      profile?.fundingGoal,
      profile?.demographics,
    ],
  );
  const [category, setCategory] = useState(
    profile ? scoutCategories(profile.sector, profile.industry) : "BC",
  );
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
  const [tierFilter, setTierFilter] = useState<
    "All" | "Federal" | "State" | "Local" | "Corporate" | "Foundation"
  >("All");
  const includeFederal = tierFilter === "All" || tierFilter === "Federal";
  const [lowCompOnly, setLowCompOnly] = useState(false);
  const [showEligibilityReasons, setShowEligibilityReasons] = useState(false);
  const [grants, setGrants] = useState<LiveGrant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<LiveGrant | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [poolGrants, setPoolGrants] = useState<UnifiedGrant[]>([]);
  const [siteGrants, setSiteGrants] = useState<UnifiedGrant[]>([]);
  const [sbirGrants, setSbirGrants] = useState<UnifiedGrant[]>([]);
  const [sbirError, setSbirError] = useState("");
  const [poolError, setPoolError] = useState("");

  const matchingPoolGrants = useMemo(() => {
    const merged = [...siteGrants, ...poolGrants, ...sbirGrants];
    const seen = new Set<string>();
    return merged.filter((grant) => {
      if (seen.has(grant.id)) return false;
      seen.add(grant.id);
      return true;
    });
  }, [siteGrants, poolGrants, sbirGrants]);

  useEffect(() => {
    let active = true;
    void siteGrantsClient
      .from("site_grants")
      .select("*")
      .then(
        ({
          data,
          error: dbError,
        }: {
          data: SiteGrantRow[] | null;
          error: { message: string } | null;
        }) => {
          if (!active) return;
          if (dbError) {
            setSiteGrants([]);
            setPoolError((prev) => prev || dbError.message);
            return;
          }
          const targetState = registryStateCode || "IA";
          const targetStateName = stateFromLocation(profile?.location ?? "") ?? "Iowa";
          setSiteGrants(
            (data ?? [])
              .map(mapSiteGrantToUnified)
              .filter(
                (grant) =>
                  !grant.eligibleStates?.length ||
                  grant.eligibleStates.some(
                    (state) =>
                      ["ALL", "NATIONAL", "US", targetState].includes(state.toUpperCase()) ||
                      state.toLowerCase() === targetStateName.toLowerCase(),
                  ),
              ),
          );
        },
      );

    return () => {
      active = false;
    };
  }, [registryStateCode, profile?.location]);

  useEffect(() => {
    let active = true;
    void getMultiPoolRegistry({
      data: { state: registryStateCode, lifecycleStage: profile?.lifecycleStage ?? "" },
    })
      .then((result) => {
        if (!active) return;
        setPoolGrants([
          ...(result.pools["State"] ?? []),
          ...(result.pools["Local"] ?? []),
          ...(result.pools["Corporate"] ?? []),
          ...(result.pools["Foundation"] ?? []),
        ]);
        setPoolError("");
      })
      .catch((e) => {
        if (!active) return;
        setPoolGrants([]);
        setPoolError(e instanceof Error ? e.message : "Could not load the program directory.");
      });
    return () => {
      active = false;
    };
  }, [signedIn, registryStateCode, profile?.lifecycleStage]);

  const run = useCallback(
    async (keywords?: string[]) => {
      if (!signedIn) return;
      setLoading(true);
      setError("");
      setSbirGrants([]);
      setSbirError("");
      try {
        const searchKeywords =
          keywords ?? (keywordRef.current.trim() ? [keywordRef.current.trim()] : scout);
        const shouldSearchSbir = shouldSearchSbirSolicitations(
          profile?.sector ?? "",
          profileIndustry,
          searchKeywords,
        );
        const [r, sbirResult] = await Promise.all([
          searchLiveGrants({
            data: {
              keywords: searchKeywords,
              category,
              eligibility,
              entityType: profileEntityType,
              lifecycleStage: profile?.lifecycleStage ?? "",
              includeFederal,
            },
          }),
          shouldSearchSbir
            ? searchSbirSolicitations({
                data: {
                  keyword: searchKeywords[0] ?? "",
                  openOnly: true,
                  includeFederal,
                },
              })
                .then(({ solicitations }) => ({
                  grants: solicitations
                    .map((solicitation) => sbirToUnifiedGrant(solicitation))
                    .filter((grant): grant is UnifiedGrant => grant !== null),
                  error: "",
                }))
                .catch((cause) => ({
                  grants: [],
                  error: cause instanceof Error ? cause.message : "SBIR.gov search failed.",
                }))
            : Promise.resolve({ grants: [], error: "" }),
        ]);
        setGrants(r.grants);
        setTotal(r.total);
        setSbirGrants(sbirResult.grants);
        setSbirError(sbirResult.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    },
    [
      signedIn,
      scout,
      category,
      eligibility,
      profileEntityType,
      profile?.sector,
      profile?.lifecycleStage,
      profileIndustry,
      includeFederal,
    ],
  );
  useEffect(() => {
    void run();
  }, [run]);

  const scoreById = useMemo(() => {
    if (!profile) return new Map<string, GrantScore>();
    const scoringProfile = { ...profile, sectorCode: profile.sector };
    return new Map(
      [...grants, ...matchingPoolGrants].map((grant) => {
        const opportunity =
          "agency" in grant
            ? scoringInputFromLiveGrant(grant)
            : scoringInputFromUnifiedGrant(grant);
        return [
          grant.id,
          scoreGrantOpportunity({ opportunity, profile: scoringProfile, evidence }),
        ] as const;
      }),
    );
  }, [grants, matchingPoolGrants, profile, evidence]);

  const shown = useMemo(
    () =>
      grants
        .filter((g) => {
          if (!scoreById.get(g.id)?.eligible) return false;
          if (tierFilter !== "All" && tierFilter !== "Federal") return false;
          if (lowCompOnly && (scoreById.get(g.id)?.lowCompetitionScore ?? 0) < 70) return false;
          if (deadline === "last" && !isLastChance(g.daysLeft)) return false;
          if (
            (deadline === "30" || deadline === "90") &&
            (g.daysLeft === null || g.daysLeft > Number(deadline))
          ) {
            return false;
          }
          if (awardScaleOnly && grantAwardScaleSignals(g).length === 0) return false;
          if (
            localOnly &&
            g.geographicRestriction !== "national" &&
            isOtherStateOnly(g.title, userState)
          ) {
            return false;
          }
          return matchesAmount(g, Number(minAmt) || 0, Number(maxAmt) || 0);
        })
        .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)),
    [
      grants,
      deadline,
      awardScaleOnly,
      minAmt,
      maxAmt,
      localOnly,
      userState,
      scoreById,
      tierFilter,
      lowCompOnly,
    ],
  );

  const eligiblePoolGrants = matchingPoolGrants.filter((grant) => {
    const score = scoreById.get(grant.id);
    if (!score?.eligible || grant.directoryOnly || grant.status === "closed") return false;
    if (lowCompOnly && (score.lowCompetitionScore ?? 0) < 70) return false;
    if (tierFilter === "All") return true;
    const tier =
      grant.grantTier ??
      (grant.poolTier === "state_territory"
        ? "State"
        : grant.poolTier === "corporate_diversity"
          ? "Corporate"
          : "Foundation");
    return tier === tierFilter;
  });

  const allEligibleGrants = [...shown, ...eligiblePoolGrants].sort((a, b) => {
    const scoreA = scoreById.get(a.id);
    const scoreB = scoreById.get(b.id);
    return (scoreB?.fitScore ?? 0) - (scoreA?.fitScore ?? 0);
  });

  const closestMatches = [...grants, ...matchingPoolGrants]
    .filter((grant) => {
      const score = scoreById.get(grant.id);
      return (
        !("directoryOnly" in grant && grant.directoryOnly) &&
        !score?.eligible &&
        !score?.hardDisqualifiers.some((reason) =>
          reason.startsWith("Restricted to founders matching:"),
        )
      );
    })
    .sort((a, b) => (scoreById.get(b.id)?.fitScore ?? 0) - (scoreById.get(a.id)?.fitScore ?? 0))
    .slice(0, 8);
  const programDirectories = matchingPoolGrants.filter((grant) => grant.directoryOnly);
  const lastChanceCount = grants.filter((g) => isLastChance(g.daysLeft)).length;

  const openReader = async (g: LiveGrant) => {
    trackLovableEvent("grant_details_opened", { source: "grants_gov" });
    setOpen(g);
    setDetail(null);
    setDetailErr("");
    setSummary("");
    setFit(null);
    setFitErr("");
    try {
      setDetail(await getGrantDetail({ data: { id: g.id } }));
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "Could not load grant.");
    }
  };
  const runSummary = async () => {
    if (!open || summarizing) return;
    setSummarizing(true);
    setSummary("");
    try {
      const result = await summarizeGrant({
        data: { id: open.id, title: open.title, closeDate: open.closeDate },
      });
      setSummary(result.summary);
    } catch (e) {
      setSummary(e instanceof Error ? e.message : "Summary failed.");
    } finally {
      setSummarizing(false);
    }
  };

  const runAudit = async () => {
    if (!open || auditing) return;
    setAuditing(true);
    setFit(null);
    setFitErr("");
    try {
      setFit(await auditGrantFit({ data: { id: open.id, title: open.title } }));
    } catch (e) {
      setFitErr(e instanceof Error ? e.message : "Fit check failed.");
    } finally {
      setAuditing(false);
    }
  };

  const field = "bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white";
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-white">Matched Grants</h2>
        <p className="text-xs text-slate-400">
          Matched for {profile?.projectName || "your business"}
          {userState ? ` · ${userState}` : ""}
        </p>
        <a
          href="/discover-profile"
          className="inline-flex text-xs font-semibold text-emerald-300 underline underline-offset-2"
        >
          Improve matches with Smart Match
        </a>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          aria-label="Search grants"
          className={`${field} flex-1`}
          placeholder="Search grants"
          value={keyword}
          onChange={(e) => {
            keywordRef.current = e.target.value;
            setKeyword(e.target.value);
          }}
        />
        <Button type="submit" disabled={loading || !signedIn || !enabled} className="text-xs">
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {(["All", "Federal", "State", "Local", "Corporate", "Foundation"] as const).map((tier) => (
          <button
            key={tier}
            type="button"
            aria-pressed={tierFilter === tier}
            onClick={() => setTierFilter(tier)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tierFilter === tier ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}
          >
            {tier}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={lowCompOnly}
            onChange={(event) => setLowCompOnly(event.target.checked)}
          />
          Low-Comp Only
        </label>
      </div>

      <details className="rounded-lg border border-slate-800 bg-slate-950 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-200">
          More Filters & Registration Check
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            aria-label="Sector"
            className={field}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All sectors</option>
            {OFFICIAL_SECTORS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Eligibility"
            className={field}
            value={eligibility}
            onChange={(e) => setEligibility(e.target.value)}
          >
            {ELIGIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Deadline"
            className={field}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          >
            {DEADLINES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
                {o.value === "last" ? ` (${lastChanceCount})` : ""}
              </option>
            ))}
          </select>
          <input
            aria-label="Minimum award"
            className={field}
            inputMode="numeric"
            placeholder="Minimum award"
            value={minAmt}
            onChange={(e) => setMinAmt(e.target.value.replace(/\D/g, ""))}
          />
          <input
            aria-label="Maximum award"
            className={field}
            inputMode="numeric"
            placeholder="Maximum award"
            value={maxAmt}
            onChange={(e) => setMaxAmt(e.target.value.replace(/\D/g, ""))}
          />
          {userState && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={localOnly}
                onChange={(e) => setLocalOnly(e.target.checked)}
              />
              Focus on grants available in {userState}
            </label>
          )}
        </div>
        {signedIn && showAdvancedCompliance && (
          <div className="mt-3">
            <SamRegistrationCheck />
          </div>
        )}
      </details>

      {!keyword.trim() && scout.length > 0 && (
        <p className="text-[11px] text-slate-400">
          Scouting from your intake for:{" "}
          {scout.map((k) => (
            <span
              key={k}
              className="inline-block mr-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200"
            >
              {k}
            </span>
          ))}{" "}
          · only grants open to{" "}
          {mode === "nonprofit" ? "nonprofits" : "for-profit / small businesses"}
        </p>
      )}
      {poolError && (
        <p role="alert" className="text-xs text-red-400">
          Program directory: {poolError}
        </p>
      )}
      {sbirError && (
        <p role="alert" className="text-xs text-red-400">
          SBIR.gov: {sbirError}
        </p>
      )}
      {statePortal && (
        <p className="text-xs text-slate-300">
          Official {statePortal.stateName} business/economic development agency link (not a live
          grant listing):{" "}
          <a
            className="text-blue-300 underline"
            href={statePortal.url}
            target="_blank"
            rel="noreferrer"
          >
            {statePortal.agency}
          </a>
        </p>
      )}
      {userState &&
        !eligiblePoolGrants.some(
          (grant) =>
            grant.grantTier === "State" ||
            grant.grantTier === "Local" ||
            grant.poolTier === "state_territory",
        ) && (
          <p className="text-[11px] text-slate-400">
            No currently actionable state or local grant listings match this profile for {userState}
            . Program directories below link to additional sources but are not confirmed open
            awards.
          </p>
        )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {signedIn && closestMatches.length > 0 && shown.length > 0 && (
        <button
          type="button"
          aria-expanded={showEligibilityReasons}
          onClick={() => setShowEligibilityReasons((value) => !value)}
          className="text-xs font-semibold text-amber-300 underline underline-offset-2"
        >
          {showEligibilityReasons
            ? "Hide eligibility explanations"
            : `Show why ${closestMatches.length} other listings do not match`}
        </button>
      )}
      {loading ? (
        <p className="text-xs text-slate-400">Loading live grant sources…</p>
      ) : (
        <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
          {signedIn && programDirectories.length > 0 && (
            <section className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
              <div>
                <h3 className="text-sm font-bold text-slate-200">
                  Program directories ({programDirectories.length})
                </h3>
                <p className="text-xs text-slate-400">
                  These are funder portals, not confirmed open grant opportunities. Check each
                  official site for current programs, eligibility, and deadlines.
                </p>
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {programDirectories.map((grant) => {
                  const portalUrl =
                    grant.portalUrl || grant.directApplyUrl || grant.officialApplicationUrl;
                  return (
                    <article
                      key={grant.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200">{grant.title}</p>
                        <p className="text-[11px] text-slate-400">
                          {grant.funderName}
                          {grant.summaryText ? ` · ${grant.summaryText}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-3 text-xs">
                        {portalUrl && (
                          <a
                            href={portalUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => trackLovableEvent("grant_directory_opened")}
                            className="text-emerald-300 underline underline-offset-2"
                          >
                            Open directory
                          </a>
                        )}
                        <a
                          href={createGrantIssueUrl({
                            id: grant.id,
                            title: grant.title,
                            ...(portalUrl ? { sourceUrl: portalUrl } : {}),
                          })}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => trackLovableEvent("grant_listing_report_opened")}
                          className="text-slate-400 underline underline-offset-2"
                        >
                          Report issue
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {signedIn &&
            !error &&
            closestMatches.length > 0 &&
            (shown.length === 0 || showEligibilityReasons) && (
              <section className="space-y-2">
                <div>
                  <h3 className="text-sm font-bold text-amber-300">
                    Eligibility checks — needs review
                  </h3>
                  <p className="text-xs text-slate-400">
                    The reasons below explain why these programs are not currently shown as
                    eligible.
                  </p>
                </div>
                {closestMatches.map((grant) => {
                  const score = scoreById.get(grant.id);
                  const missing = score?.hardDisqualifiers.slice(0, 3) ?? [
                    "Complete the intake profile.",
                  ];
                  const tier =
                    "agency" in grant
                      ? "Federal"
                      : (grant.grantTier ??
                        (grant.poolTier === "foundation"
                          ? "Foundation"
                          : grant.poolTier === "corporate_diversity"
                            ? "Corporate"
                            : "State"));
                  const directUrl =
                    "agency" in grant
                      ? grant.url
                      : grant.portalUrl || grant.directApplyUrl || grant.officialApplicationUrl;
                  const closed =
                    "agency" in grant ? false : grant.status === "closed" || grant.directoryOnly;
                  return (
                    <div
                      key={grant.id}
                      className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-blue-300">{grant.title}</p>
                        <span className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300">
                          {tier}
                        </span>
                        {closed && (
                          <span className="rounded border border-red-800 bg-red-950 px-2 py-1 text-[10px] text-red-300">
                            Closed / inactive
                          </span>
                        )}
                      </div>
                      <ul className="list-disc pl-4 text-xs text-amber-200 space-y-1">
                        {missing.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      <div className="flex gap-2">
                        {"agency" in grant ? (
                          <Button
                            variant="outline"
                            onClick={() => openReader(grant)}
                            className="text-xs h-8"
                          >
                            Read Grant
                          </Button>
                        ) : (
                          <Button variant="outline" asChild className="text-xs h-8">
                            <a href={directUrl} target="_blank" rel="noreferrer">
                              Apply on Official Portal
                            </a>
                          </Button>
                        )}
                        <a
                          href={createGrantIssueUrl({
                            id: grant.id,
                            title: grant.title,
                            ...(directUrl ? { sourceUrl: directUrl } : {}),
                          })}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => trackLovableEvent("grant_listing_report_opened")}
                          className="inline-flex h-8 items-center text-xs text-slate-400 underline underline-offset-2"
                        >
                          Report issue
                        </a>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          {allEligibleGrants.map((grant) => {
            const isLiveGrant = "agency" in grant;
            const score = scoreById.get(grant.id);
            const tier = isLiveGrant
              ? "Federal"
              : (grant.grantTier ??
                (grant.poolTier === "state_territory"
                  ? "State"
                  : grant.poolTier === "corporate_diversity"
                    ? "Corporate"
                    : grant.poolTier === "foundation"
                      ? "Foundation"
                      : "Local"));
            const source = isLiveGrant
              ? /sbir|sttr/i.test(`${grant.title} ${grant.agency}`)
                ? "Federal — SBIR/STTR"
                : "Federal — Grants.gov"
              : `${tier} — ${grant.funderName}`;
            const award = isLiveGrant
              ? formatMoney(grant.awardCeiling)
              : formatMoney(grant.awardCeiling || null);
            const awardLabel = award === "Not listed" ? "Award not listed" : `Up to ${award}`;
            const closing = isLiveGrant
              ? grant.closeDate || "Not listed"
              : grant.directoryOnly
                ? "Check current cycle"
                : grant.isRolling
                  ? "Rolling"
                  : grant.deadline;
            const eligibilityText = isLiveGrant
              ? grant.eligibility.join("; ") || "See official listing"
              : grant.eligibleEntityTypes.map((entity) => entity.replaceAll("_", " ")).join(", ");
            const isClosed = !isLiveGrant && grant.status === "closed";
            const isDirectory = !isLiveGrant && grant.directoryOnly;
            const directApplyHref = isLiveGrant
              ? grant.url
              : grant.portalUrl || grant.directApplyUrl || grant.officialApplicationUrl;

            return (
              <article
                key={grant.id}
                className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2 hover:border-slate-600 transition"
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      {source}
                    </span>
                    {isDirectory && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                        Program directory
                      </span>
                    )}
                    {isClosed && !isDirectory && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                        Closed / inactive
                      </span>
                    )}
                    <h3 className="mt-1 font-bold text-sm text-blue-300">{grant.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isLiveGrant ? `${grant.agency} · ${grant.number}` : grant.summaryText}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-bold whitespace-nowrap">
                    {awardLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                    Deadline {closing}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                    Eligible: {eligibilityText}
                  </span>
                  {score && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Fit score {score.fitScore}/50
                    </span>
                  )}
                  {score && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                      {score.vaultReadiness.missing.length
                        ? `Requires ${score.vaultReadiness.missing.length} Vault ${score.vaultReadiness.missing.length === 1 ? "document" : "documents"}`
                        : "Ready to Draft"}
                    </span>
                  )}
                  {isLiveGrant && grant.matchedKeyword && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      Matches "{grant.matchedKeyword}"
                    </span>
                  )}
                  {isLiveGrant && isLastChance(grant.daysLeft) && (
                    <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                      Last Chance
                    </span>
                  )}
                </div>
                {score && (
                  <p className="rounded-md border border-emerald-900 bg-emerald-950/30 p-2 text-[11px] text-emerald-200">
                    <strong>Competition signals, not odds:</strong>{" "}
                    {score.whyLowCompetition.join(" ")}
                  </p>
                )}
                {score?.vaultReadiness.missing.length ? (
                  <p className="text-[11px] text-amber-200">
                    Vault readiness {score.vaultReadiness.readyDocuments}/
                    {score.vaultReadiness.totalDocuments}: add{" "}
                    {score.vaultReadiness.missing.join(", ")}.
                  </p>
                ) : null}
                {score?.requiresSamWarning && (
                  <p className="text-[11px] text-amber-200">
                    Requires active SAM.gov + UEI registration; start at least 10 business days
                    ahead. IRS or entity-validation delays may extend processing.
                  </p>
                )}
                {score && <ScoreBreakdown score={score} />}
                <div className="flex flex-wrap gap-2 pt-1">
                  {isLiveGrant ? (
                    <Button
                      variant="outline"
                      onClick={() => openReader(grant)}
                      className="text-xs h-8"
                    >
                      View Grants.gov Details
                    </Button>
                  ) : grant.publicWinnerHistoryUrl ? (
                    <Button variant="outline" asChild className="text-xs h-8">
                      <a href={grant.publicWinnerHistoryUrl} target="_blank" rel="noreferrer">
                        Past winners
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="outline" asChild className="text-xs h-8">
                    <a
                      href={directApplyHref}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => trackLovableEvent("grant_portal_opened")}
                    >
                      {isDirectory ? "Open Program Directory" : "Apply on Official Portal"}
                    </a>
                  </Button>
                  <a
                    href={createGrantIssueUrl({
                      id: grant.id,
                      title: grant.title,
                      ...(directApplyHref ? { sourceUrl: directApplyHref } : {}),
                    })}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackLovableEvent("grant_listing_report_opened")}
                    className="inline-flex h-8 items-center px-2 text-xs text-slate-400 underline underline-offset-2"
                  >
                    Report issue
                  </a>
                  <Button
                    disabled={drafting || !enabled || isDirectory}
                    onClick={() => {
                      trackLovableEvent("grant_proposal_started");
                      onDraft(grant);
                    }}
                    className="text-xs h-8"
                  >
                    {isDirectory ? "Directory Only" : drafting ? "Drafting…" : "Draft Proposal"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6">{open.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 text-sm mt-4">
                <p className="text-muted-foreground">
                  {open.agency} · {open.number}
                </p>
                <div className="rounded-lg border border-blue-900 bg-blue-950/30 p-3 space-y-1">
                  <p className="text-xs font-semibold">
                    Read the official announcement before applying
                  </p>
                  <a
                    className="text-xs underline break-all"
                    href={detail?.moreInfoUrl || open.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detail?.moreInfoUrl
                      ? "Open full announcement from the agency"
                      : "Open official Grants.gov opportunity"}
                  </a>
                  <p className="text-[11px] text-muted-foreground">
                    The information below is the Grants.gov listing; it may not contain the full
                    announcement or application forms.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <b>Closes:</b> {open.closeDate} ({open.daysLeft ?? "?"} days)
                  </div>
                  <div>
                    <b>Award range:</b> {formatMoney(open.awardFloor)} –{" "}
                    {formatMoney(open.awardCeiling)}
                  </div>
                  <div>
                    <b>Number of awards:</b> {open.numberOfAwards ?? "Not listed"}
                  </div>
                  <div>
                    <b>Cost sharing:</b>{" "}
                    {detail
                      ? detail.costSharing === null
                        ? "Not stated"
                        : detail.costSharing
                          ? "Required"
                          : "Not required"
                      : "…"}
                  </div>
                </div>
                {scoreById.get(open.id) && (
                  <section className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs space-y-2">
                    <p>
                      <strong>Grant Type:</strong> Federal ·{" "}
                      <strong>
                        {scoreById.get(open.id)?.lowCompetitionScore &&
                        scoreById.get(open.id)!.lowCompetitionScore! >= 70
                          ? "Low Competition"
                          : "Competition Level"}
                      </strong>
                    </p>
                    <p>
                      <strong>Why You Qualify:</strong>{" "}
                      {scoreById.get(open.id)?.whyLowCompetition.join(" ")}
                    </p>
                    <p>
                      <strong>Qualification proof:</strong>{" "}
                      {scoreById.get(open.id)?.qualificationProof.slice(0, 3).join(" ")}
                    </p>
                  </section>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={runAudit} disabled={auditing}>
                    {auditing ? "Checking fit…" : "Go / No-Go check"}
                  </Button>
                  <Button variant="outline" onClick={runSummary} disabled={summarizing}>
                    {summarizing ? "Summarizing…" : "Summarize with AI"}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={open.url} target="_blank" rel="noreferrer">
                      Open on Grants.gov
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={drafting || !enabled}
                    onClick={() => onDraft(open)}
                  >
                    {drafting ? "Drafting…" : "Run Autopilot"}
                  </Button>
                </div>
                {fitErr && <p className="text-xs text-red-400">{fitErr}</p>}
                {fit && (
                  <div
                    className={`rounded-lg border p-3 text-xs space-y-1 ${fit.verdict === "GO" ? "border-emerald-600" : "border-amber-500"}`}
                  >
                    <p
                      className={`font-bold text-sm ${fit.verdict === "GO" ? "text-emerald-500" : "text-amber-500"}`}
                    >
                      {fit.verdict === "GO"
                        ? "GO — clear to pursue"
                        : "CAUTION — check before writing"}
                    </p>
                    {fit.costSharing && (
                      <p className="font-semibold text-amber-500">
                        Cost share / matching funds required by this listing.
                      </p>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{fit.report}</p>
                  </div>
                )}
                {summary && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <h4 className="font-semibold">AI summary — based on the listing only</h4>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed">{summary}</p>
                  </div>
                )}
                {detailErr && <p className="text-xs text-red-400">{detailErr}</p>}
                {!detail && !detailErr && (
                  <p className="text-xs text-muted-foreground">
                    Loading Grants.gov listing details…
                  </p>
                )}
                {detail && (
                  <>
                    <section>
                      <h4 className="font-semibold mb-1">Who can apply</h4>
                      <p className="text-xs">{detail.eligibility.join("; ") || "Not listed"}</p>
                      {detail.eligibilityNotes && (
                        <p className="text-xs mt-1 whitespace-pre-wrap">
                          {detail.eligibilityNotes}
                        </p>
                      )}
                    </section>
                    <section>
                      <h4 className="font-semibold mb-1">Grants.gov listing synopsis</h4>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed">
                        {detail.description || "No description provided in the listing."}
                      </p>
                    </section>
                    <p className="text-[11px] text-muted-foreground">
                      The Grants.gov synopsis may omit mandatory forms, attachment formats,
                      evaluation criteria, or other application instructions. Verify those in the
                      official announcement.
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ScoreBreakdown({ score }: { score: GrantScore | undefined }) {
  if (!score) return null;
  const dimensions = [
    ["Operating stage & tenure", score.fitBreakdown.operatingStage, 15],
    ["Award size & match burden", score.fitBreakdown.awardAndMatchBurden, 15],
    ["Demographic & geographic priority", score.fitBreakdown.demographicAndGeographicPriority, 10],
    ["Vault document readiness", score.fitBreakdown.vaultReadiness, 10],
  ] as const;

  return (
    <details className="rounded border border-slate-800 bg-slate-900/70 p-2 text-[11px] text-slate-300">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-emerald-300">
          Small-business fit {score.fitScore}/50
        </span>
        <span>
          Low-competition: {score.lowCompetitionScore ?? "Not estimable"}
          {score.lowCompetitionTier !== "Insufficient data" ? ` · ${score.lowCompetitionTier}` : ""}
        </span>
        <span>
          Profile-adjusted competition signal:{" "}
          {score.personalLowCompetitionScore ?? "Not estimable"}
        </span>
        <span>
          Reported historical award rate:{" "}
          {score.historicalAwardRatePct === null
            ? "Not estimable"
            : `${score.historicalAwardRatePct}%`}
        </span>
      </summary>
      <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
        <div className="grid gap-1 sm:grid-cols-2">
          {dimensions.map(([label, value, maximum]) => (
            <span key={label}>
              {label}: {value}/{maximum}
            </span>
          ))}
        </div>
        <p>
          Legal eligibility is evaluated separately. Fit and competition signals are not award
          probabilities; any award rate shown is historical, not a prediction.
        </p>
        {score.eligibilityReasons.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4">
            {score.eligibilityReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {score.competitionComponents.length > 0 ? (
          <ul className="space-y-1">
            {score.competitionComponents.map((component) => (
              <li key={component.id}>
                <span className="font-medium">
                  {component.label}: {component.score}/100 ({component.source})
                </span>
                {" — "}
                {component.explanation}
                {component.sourceUrl && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      className="underline"
                      href={component.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      source
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No reported award, applicant, or award-cycle counts are available; low-competition score
            and estimated win rate are not shown.
          </p>
        )}
      </div>
    </details>
  );
}
