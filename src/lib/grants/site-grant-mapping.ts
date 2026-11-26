import type { UnifiedGrant } from "@/lib/grants";

export interface SiteGrantRow {
  id: string;
  funder?: string | null;
  pool_tier: UnifiedGrant["poolTier"] | null;
  grant_tier: UnifiedGrant["grantTier"] | null;
  title: string;
  funder_name: string | null;
  funder_type: UnifiedGrant["funderType"] | null;
  amount_min?: number | null;
  amount_max?: number | null;
  award_floor: number | null;
  award_ceiling: number | null;
  min_months_in_business: number | null;
  eligible_states: string[] | null;
  states?: string[] | null;
  stage_tags?: string[] | null;
  demographic_tags?: string[] | null;
  required_documents?: string[] | null;
  requires_strict_demographic?: boolean | null;
  status?: "open" | "closed" | "unknown" | null;
  application_time_minutes: number | null;
  deadline: string | null;
  open_date: string | null;
  close_date: string | null;
  is_rolling: boolean | null;
  cost_sharing_required: boolean | null;
  cost_sharing_percentage: number | null;
  eligible_entity_types: string[] | null;
  demographic_set_asides: string[] | null;
  geographic_restriction: string | null;
  geographic_scope: UnifiedGrant["geographicScope"] | null;
  application_method: string | null;
  direct_apply_url: string | null;
  official_application_url: string | null;
  portal_url: string | null;
  source_solicitation_url: string | null;
  is_free_to_apply: boolean | null;
  directory_only: boolean | null;
  summary_text: string | null;
  prerequisites: string[] | null;
}

export function mapSiteGrantToUnified(row: SiteGrantRow): UnifiedGrant {
  const states = row.states?.length
    ? row.states
    : row.eligible_states?.length
      ? row.eligible_states
      : ["ALL"];
  const portalUrl = row.portal_url || row.direct_apply_url || row.official_application_url || "";
  const parsedCloseDate = row.close_date ? new Date(row.close_date) : null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  parsedCloseDate?.setUTCHours(0, 0, 0, 0);
  const expired =
    !!parsedCloseDate && !Number.isNaN(parsedCloseDate.getTime()) && parsedCloseDate < today;
  const statusValue = row.status?.trim().toLowerCase() ?? "";
  const statusClosed = /\b(closed|inactive|expired|archived|ended)\b/.test(statusValue);
  const deadlineClosed = /\b(closed|inactive|expired|archived|ended)\b/i.test(row.deadline ?? "");
  const status =
    statusClosed || expired || deadlineClosed
      ? "closed"
      : row.directory_only
        ? "unknown"
        : statusValue || (row.is_rolling ? "open" : "unknown");

  return {
    id: row.id,
    poolTier: row.pool_tier ?? "state_territory",
    grantTier: row.grant_tier ?? "State",
    title: row.title,
    funderName: row.funder || row.funder_name || "",
    funderType: row.funder_type ?? "government",
    awardFloor: Number(row.amount_min ?? row.award_floor ?? 0),
    awardCeiling: Number(row.amount_max ?? row.award_ceiling ?? 0),
    ...(row.min_months_in_business !== null
      ? { minMonthsInBusiness: row.min_months_in_business }
      : {}),
    eligibleStates: states,
    stageTags: row.stage_tags ?? [],
    demographicTags: row.demographic_tags ?? [],
    requiredDocuments: row.required_documents ?? [],
    requiresStrictDemographic: row.requires_strict_demographic ?? false,
    status,
    ...(row.application_time_minutes !== null
      ? { applicationTimeMinutes: row.application_time_minutes }
      : {}),
    deadline: row.deadline ?? "Rolling",
    ...(row.open_date ? { openDate: row.open_date } : {}),
    ...(row.close_date ? { closeDate: row.close_date } : {}),
    isRolling: row.is_rolling ?? true,
    costSharingRequired: row.cost_sharing_required ?? false,
    ...(row.cost_sharing_percentage !== null
      ? { costSharingPercentage: row.cost_sharing_percentage }
      : {}),
    eligibleEntityTypes: (row.eligible_entity_types ?? [
      "for_profit",
    ]) as UnifiedGrant["eligibleEntityTypes"],
    demographicSetAsides: (row.demographic_set_asides ??
      []) as UnifiedGrant["demographicSetAsides"],
    geographicRestriction: (row.geographic_restriction ?? "state") as NonNullable<
      UnifiedGrant["geographicRestriction"]
    >,
    geographicScope: row.geographic_scope ?? {
      level: "state_specific",
      allowedStates: states,
    },
    applicationMethod: (row.application_method ??
      "online_portal") as UnifiedGrant["applicationMethod"],
    directApplyUrl: portalUrl,
    officialApplicationUrl: row.official_application_url ?? portalUrl,
    ...(portalUrl ? { portalUrl } : {}),
    ...(row.source_solicitation_url ? { sourceSolicitationUrl: row.source_solicitation_url } : {}),
    isFreeToApply: row.is_free_to_apply ?? true,
    directoryOnly: row.directory_only ?? false,
    summaryText: row.summary_text ?? "",
    prerequisites: row.prerequisites ?? [],
  };
}
