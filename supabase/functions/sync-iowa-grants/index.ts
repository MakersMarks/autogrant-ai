import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { inferEntityTypes, inferOpportunityColumns, stripHtml } from "./rules.ts";

interface SiteGrantUpsert {
  id: string;
  pool_tier: "federal" | "state_territory" | "corporate_diversity" | "foundation";
  grant_tier: "Federal" | "State" | "Local" | "Foundation";
  title: string;
  funder_name: string;
  funder_type: "government" | "corporate" | "private_foundation" | "nonprofit";
  award_floor: number;
  award_ceiling: number;
  min_months_in_business: number | null;
  eligible_states: string[];
  application_time_minutes: number | null;
  deadline: string;
  open_date: string | null;
  close_date: string | null;
  is_rolling: boolean;
  cost_sharing_required: boolean;
  cost_sharing_percentage: number | null;
  eligible_entity_types: string[];
  demographic_set_asides: string[];
  geographic_restriction: string;
  geographic_scope: { level: string; allowedStates: string[]; counties?: string[] };
  application_method: string;
  direct_apply_url: string;
  official_application_url: string;
  portal_url: string | null;
  source_solicitation_url: string | null;
  is_free_to_apply: boolean;
  directory_only: boolean;
  summary_text: string;
  prerequisites: string[];
  source_system: string;
  source_external_id: string | null;
  last_synced_at: string;
  updated_at: string;
}

async function fetchIowaGrantsGov(): Promise<SiteGrantUpsert[]> {
  const url = "https://www.iowagrants.gov/storefrontFOList.do";
  const nowIso = new Date().toISOString();

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AutoGrantSync/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      console.warn(`[IowaGrants.gov] HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    const parsed: SiteGrantUpsert[] = [];

    for (const match of rowMatches) {
      const rowHtml = match[1];
      const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((c) => c[1]);
      if (cells.length < 4) continue;

      const hrefMatch = rowHtml.match(
        /href=["']([^"']*(?:foId|fundingOpportunity|storefront)[^"']*)["']/i,
      );
      const rawId = stripHtml(cells[0]);
      const { title: rawTitle, agency: rawAgency } = inferOpportunityColumns(
        cells.map((cell) => stripHtml(cell)),
      );
      const title = rawTitle;
      const agency = rawAgency;
      const closeDate = stripHtml(cells[cells.length - 1]);

      if (!title || title.length < 4 || /opportunity title/i.test(title)) continue;

      const slugId = (rawId || title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64);

      const detailUrl = hrefMatch
        ? new URL(hrefMatch[1].replace(/&/g, "&"), "https://www.iowagrants.gov/").toString()
        : url;

      const isRolling = !closeDate || /rolling|continuous|ongoing|open/i.test(closeDate);

      parsed.push({
        id: `iowagrants-${slugId}`,
        pool_tier: "state_territory",
        grant_tier: "State",
        title,
        funder_name: agency || "State of Iowa (IowaGrants.gov)",
        funder_type: "government",
        award_floor: 0,
        award_ceiling: 0,
        min_months_in_business: null,
        eligible_states: ["IA"],
        application_time_minutes: 120,
        deadline: closeDate || "Check IowaGrants.gov",
        open_date: null,
        close_date: isRolling ? null : closeDate,
        is_rolling: isRolling,
        cost_sharing_required: false,
        cost_sharing_percentage: null,
        eligible_entity_types: inferEntityTypes(title, agency),
        demographic_set_asides: [],
        geographic_restriction: "state",
        geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
        application_method: "online_portal",
        direct_apply_url: detailUrl,
        official_application_url: detailUrl,
        portal_url: url,
        source_solicitation_url: detailUrl,
        is_free_to_apply: true,
        directory_only: false,
        summary_text: `Active State of Iowa funding opportunity administered by ${agency || "a participating Iowa state agency"} via IowaGrants.gov.`,
        prerequisites: [
          "Iowa-based applicant or eligible Iowa project",
          "Free IowaGrants.gov applicant registration",
        ],
        source_system: "iowagrants_gov",
        source_external_id: rawId || slugId,
        last_synced_at: nowIso,
        updated_at: nowIso,
      });
    }

    return parsed;
  } catch (err) {
    console.warn("[IowaGrants.gov] Fetch error:", err);
    return [];
  }
}

function getStructuredIowaCatalog(): SiteGrantUpsert[] {
  const nowIso = new Date().toISOString();
  const base = {
    eligible_states: ["IA"],
    is_free_to_apply: true,
    directory_only: false,
    last_synced_at: nowIso,
    updated_at: nowIso,
  };

  return [
    {
      ...base,
      id: "ia-ieda-pocr",
      pool_tier: "state_territory",
      grant_tier: "State",
      title: "Proof of Commercial Relevance (POCR)",
      funder_name: "Iowa Economic Development Authority (IEDA)",
      funder_type: "government",
      award_floor: 10000,
      award_ceiling: 50000,
      min_months_in_business: 0,
      application_time_minutes: 180,
      deadline: "Rolling (TCC Review Cycles)",
      open_date: null,
      close_date: null,
      is_rolling: true,
      cost_sharing_required: true,
      cost_sharing_percentage: 50,
      eligible_entity_types: ["for_profit", "small_business"],
      demographic_set_asides: [],
      geographic_restriction: "state",
      geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
      application_method: "email_package",
      direct_apply_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding/proof-commercial-relevance",
      official_application_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding/proof-commercial-relevance",
      portal_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      source_solicitation_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding/proof-commercial-relevance",
      summary_text:
        "Supports Iowa-based startups in advanced manufacturing, biosciences, or IT with functional prototypes to validate market potential and commercial feasibility.",
      prerequisites: [
        "Iowa-registered business (fewer than 500 employees)",
        "Functional prototype / proof-of-concept",
        "1:2 non-state matching funds",
      ],
      source_system: "ieda_catalog",
      source_external_id: "ieda-pocr",
    },
    {
      ...base,
      id: "ia-ieda-demonstration-fund",
      pool_tier: "state_territory",
      grant_tier: "State",
      title: "Iowa Demonstration Fund",
      funder_name: "Iowa Economic Development Authority (IEDA)",
      funder_type: "government",
      award_floor: 25000,
      award_ceiling: 100000,
      min_months_in_business: 0,
      application_time_minutes: 240,
      deadline: "Rolling (TCC Review Cycles)",
      open_date: null,
      close_date: null,
      is_rolling: true,
      cost_sharing_required: true,
      cost_sharing_percentage: 50,
      eligible_entity_types: ["for_profit", "small_business"],
      demographic_set_asides: [],
      geographic_restriction: "state",
      geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
      application_method: "email_package",
      direct_apply_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding/demonstration-fund",
      official_application_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding/demonstration-fund",
      portal_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      source_solicitation_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding/demonstration-fund",
      summary_text:
        "Assists Iowa companies with market-ready innovative technologies in advanced manufacturing, biosciences, or IT for marketing, equipment, and business development.",
      prerequisites: [
        "Iowa-based company (fewer than 500 employees)",
        "Market-ready innovative product",
        "1:2 non-state matching funds",
      ],
      source_system: "ieda_catalog",
      source_external_id: "ieda-demonstration-fund",
    },
    {
      ...base,
      id: "ia-ieda-sbir-sttr-match",
      pool_tier: "state_territory",
      grant_tier: "State",
      title: "Iowa SBIR / STTR State Matching Grant (America's Seed Fund)",
      funder_name: "Iowa Economic Development Authority (IEDA)",
      funder_type: "government",
      award_floor: 25000,
      award_ceiling: 75000,
      min_months_in_business: 0,
      application_time_minutes: 120,
      deadline: "Rolling",
      open_date: null,
      close_date: null,
      is_rolling: true,
      cost_sharing_required: false,
      cost_sharing_percentage: null,
      eligible_entity_types: ["for_profit", "small_business"],
      demographic_set_asides: [],
      geographic_restriction: "state",
      geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
      application_method: "online_portal",
      direct_apply_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      official_application_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      portal_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      source_solicitation_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      summary_text:
        "Provides proposal preparation support and state matching commitments for Iowa small businesses pursuing federal Phase I and Phase II SBIR/STTR research awards.",
      prerequisites: [
        "Iowa-based small business",
        "Federal SBIR or STTR Phase I/II applicant or awardee",
      ],
      source_system: "ieda_catalog",
      source_external_id: "ieda-sbir-sttr-match",
    },
    {
      ...base,
      id: "ia-ieda-innovation-acceleration",
      pool_tier: "state_territory",
      grant_tier: "State",
      title: "Innovation Acceleration Fund",
      funder_name: "Iowa Economic Development Authority (IEDA)",
      funder_type: "government",
      award_floor: 50000,
      award_ceiling: 150000,
      min_months_in_business: 0,
      application_time_minutes: 240,
      deadline: "Rolling (TCC Review Cycles)",
      open_date: null,
      close_date: null,
      is_rolling: true,
      cost_sharing_required: true,
      cost_sharing_percentage: 50,
      eligible_entity_types: ["for_profit", "small_business"],
      demographic_set_asides: [],
      geographic_restriction: "state",
      geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
      application_method: "email_package",
      direct_apply_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      official_application_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      portal_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      source_solicitation_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      summary_text:
        "Promotes formation and rapid market expansion of high-growth Iowa technology transfer companies creating skilled jobs and private capital investment.",
      prerequisites: [
        "Iowa-based high-growth technology company",
        "Documented private matching investment",
      ],
      source_system: "ieda_catalog",
      source_external_id: "ieda-innovation-acceleration",
    },
    {
      ...base,
      id: "ia-ieda-manufacturing-4-0",
      pool_tier: "state_territory",
      grant_tier: "State",
      title: "Manufacturing 4.0 Technology Investment Grant",
      funder_name: "Iowa Economic Development Authority (IEDA)",
      funder_type: "government",
      award_floor: 25000,
      award_ceiling: 75000,
      min_months_in_business: 12,
      application_time_minutes: 180,
      deadline: "Periodic Funding Rounds",
      open_date: null,
      close_date: null,
      is_rolling: false,
      cost_sharing_required: true,
      cost_sharing_percentage: 50,
      eligible_entity_types: ["for_profit", "small_business"],
      demographic_set_asides: [],
      geographic_restriction: "state",
      geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
      application_method: "online_portal",
      direct_apply_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      official_application_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      portal_url: "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      source_solicitation_url:
        "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
      summary_text:
        "Helps small-to-mid-sized Iowa manufacturers adopt automation, smart sensors, robotics, and manufacturing software.",
      prerequisites: [
        "Iowa manufacturing facility (3 to 150 employees)",
        "1:1 matching capital investment",
      ],
      source_system: "ieda_catalog",
      source_external_id: "ieda-manufacturing-4-0",
    },
    {
      ...base,
      id: "ia-ieda-targeted-small-business",
      pool_tier: "state_territory",
      grant_tier: "State",
      title: "Iowa Targeted Small Business (TSB) Sole Source & Financing Program",
      funder_name: "Iowa Economic Development Authority (IEDA)",
      funder_type: "government",
      award_floor: 5000,
      award_ceiling: 50000,
      min_months_in_business: 0,
      application_time_minutes: 120,
      deadline: "Rolling",
      open_date: null,
      close_date: null,
      is_rolling: true,
      cost_sharing_required: false,
      cost_sharing_percentage: null,
      eligible_entity_types: ["for_profit", "small_business"],
      demographic_set_asides: [
        "women_owned",
        "minority_owned",
        "veteran_owned",
        "disability_owned",
      ],
      geographic_restriction: "state",
      geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
      application_method: "online_portal",
      direct_apply_url: "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
      official_application_url:
        "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
      portal_url: "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
      source_solicitation_url:
        "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
      summary_text:
        "Supports certified Iowa Targeted Small Businesses (51% or more owned and operated by women, minorities, service-disabled veterans, or people with disabilities).",
      prerequisites: [
        "Iowa Targeted Small Business (TSB) certification",
        "51% or more majority ownership by eligible group",
      ],
      source_system: "ieda_catalog",
      source_external_id: "ieda-tsb",
    },
    {
      ...base,
      id: "ia-idals-choose-iowa-value-added",
      pool_tier: "state_territory",
      grant_tier: "State",
      title: "Choose Iowa Value-Added Agricultural Grant",
      funder_name: "Iowa Department of Agriculture and Land Stewardship (IDALS)",
      funder_type: "government",
      award_floor: 5000,
      award_ceiling: 25000,
      min_months_in_business: 0,
      application_time_minutes: 120,
      deadline: "Annual Cycle",
      open_date: null,
      close_date: null,
      is_rolling: false,
      cost_sharing_required: true,
      cost_sharing_percentage: 50,
      eligible_entity_types: ["for_profit", "small_business", "nonprofit_501c3"],
      demographic_set_asides: [],
      geographic_restriction: "state",
      geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
      application_method: "online_portal",
      direct_apply_url: "https://www.chooseiowa.com/grants",
      official_application_url: "https://www.chooseiowa.com/grants",
      portal_url: "https://www.chooseiowa.com/grants",
      source_solicitation_url: "https://www.chooseiowa.com/grants",
      summary_text:
        "Cost-share grants for Iowa farmers, food processors, and small businesses expanding processing, packaging, or distribution of Iowa agricultural products.",
      prerequisites: ["Iowa-based agricultural or food business", "1:1 dollar-for-dollar match"],
      source_system: "idals_catalog",
      source_external_id: "choose-iowa-value-added",
    },
    {
      ...base,
      id: "ia-cfgdm-community-grants",
      pool_tier: "foundation",
      grant_tier: "Foundation",
      title: "Community Foundation of Greater Des Moines — Leadership & Community Grants",
      funder_name: "Community Foundation of Greater Des Moines",
      funder_type: "private_foundation",
      award_floor: 2500,
      award_ceiling: 50000,
      min_months_in_business: null,
      application_time_minutes: 150,
      deadline: "Quarterly / Semi-Annual Cycles",
      open_date: null,
      close_date: null,
      is_rolling: false,
      cost_sharing_required: false,
      cost_sharing_percentage: null,
      eligible_entity_types: ["nonprofit_501c3", "fiscal_sponsor"],
      demographic_set_asides: [],
      geographic_restriction: "county",
      geographic_scope: {
        level: "local_county",
        allowedStates: ["IA"],
        counties: ["Polk", "Dallas", "Warren"],
      },
      application_method: "online_portal",
      direct_apply_url: "https://www.desmoinesfoundation.org/nonprofits/grants",
      official_application_url: "https://www.desmoinesfoundation.org/nonprofits/grants",
      portal_url: "https://www.desmoinesfoundation.org/nonprofits/grants",
      source_solicitation_url: "https://www.desmoinesfoundation.org/nonprofits/grants",
      summary_text:
        "Supports charitable projects, community development, and regional initiatives serving Central Iowa and Greater Des Moines.",
      prerequisites: ["501(c)(3) nonprofit or eligible fiscal sponsor in Greater Des Moines"],
      source_system: "foundation_catalog",
      source_external_id: "cfgdm-leadership",
    },
    {
      ...base,
      id: "ia-qccf-community-impact",
      pool_tier: "foundation",
      grant_tier: "Foundation",
      title: "Quad Cities Community Foundation — Community Impact & Transformation Grants",
      funder_name: "Quad Cities Community Foundation",
      funder_type: "private_foundation",
      award_floor: 5000,
      award_ceiling: 100000,
      min_months_in_business: null,
      application_time_minutes: 150,
      deadline: "Annual / Semi-Annual Cycles",
      open_date: null,
      close_date: null,
      is_rolling: false,
      cost_sharing_required: false,
      cost_sharing_percentage: null,
      eligible_entity_types: ["nonprofit_501c3"],
      demographic_set_asides: [],
      geographic_restriction: "county",
      geographic_scope: {
        level: "local_county",
        allowedStates: ["IA", "IL"],
        counties: ["Scott", "Muscatine", "Rock Island"],
      },
      application_method: "online_portal",
      direct_apply_url: "https://www.qccommunityfoundation.org/grants",
      official_application_url: "https://www.qccommunityfoundation.org/grants",
      portal_url: "https://www.qccommunityfoundation.org/grants",
      source_solicitation_url: "https://www.qccommunityfoundation.org/grants",
      summary_text:
        "Funds nonprofits strengthening Scott and Muscatine counties in eastern Iowa (and Rock Island County, IL).",
      prerequisites: ["501(c)(3) nonprofit serving Scott or Muscatine County, IA"],
      source_system: "foundation_catalog",
      source_external_id: "qccf-impact",
    },
    {
      ...base,
      id: "ia-cfjc-community-grants",
      pool_tier: "foundation",
      grant_tier: "Local",
      title: "Community Foundation of Johnson County — Competitive Community Grants",
      funder_name: "Community Foundation of Johnson County",
      funder_type: "private_foundation",
      award_floor: 1000,
      award_ceiling: 15000,
      min_months_in_business: null,
      application_time_minutes: 90,
      deadline: "Annual Cycle",
      open_date: null,
      close_date: null,
      is_rolling: false,
      cost_sharing_required: false,
      cost_sharing_percentage: null,
      eligible_entity_types: ["nonprofit_501c3", "government_entity"],
      demographic_set_asides: [],
      geographic_restriction: "county",
      geographic_scope: { level: "local_county", allowedStates: ["IA"], counties: ["Johnson"] },
      application_method: "online_portal",
      direct_apply_url: "https://cfjc.org/grants/",
      official_application_url: "https://cfjc.org/grants/",
      portal_url: "https://cfjc.org/grants/",
      source_solicitation_url: "https://cfjc.org/grants/",
      summary_text:
        "Supports charitable programs, community projects, and local initiatives benefiting residents across Johnson County, Iowa.",
      prerequisites: ["501(c)(3) nonprofit or public entity serving Johnson County, IA"],
      source_system: "foundation_catalog",
      source_external_id: "cfjc-competitive",
    },
  ];
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [liveIowaGrants, structuredCatalog] = await Promise.all([
      fetchIowaGrantsGov(),
      Promise.resolve(getStructuredIowaCatalog()),
    ]);

    const byId = new Map<string, SiteGrantUpsert>();
    for (const grant of [...structuredCatalog, ...liveIowaGrants]) {
      byId.set(grant.id, grant);
    }

    const records = Array.from(byId.values());
    const { error } = await supabase.from("site_grants").upsert(records, { onConflict: "id" });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        upsertedCount: records.length,
        liveIowaGrantsCount: liveIowaGrants.length,
        structuredCatalogCount: structuredCatalog.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
