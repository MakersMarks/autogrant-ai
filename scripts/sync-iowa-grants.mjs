import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const SNAPSHOT_PATH = path.resolve(process.cwd(), ".github/iowa-grants-snapshot.json");
const nowIso = new Date().toISOString();

function deadlineHasPassed(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (/\b(closed|expired|archived|ended)\b/i.test(value)) return true;

  const text = value.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const date = match
    ? new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])))
    : new Date(text);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  date.setUTCHours(0, 0, 0, 0);
  return date < today;
}

function normalizeGrantRecord(item, { isClosed = false } = {}) {
  const states =
    Array.isArray(item.states) && item.states.length > 0
      ? item.states
      : Array.isArray(item.eligible_states) && item.eligible_states.length > 0
        ? item.eligible_states
        : ["NATIONAL"];

  const amountMin =
    typeof item.amount_min === "number"
      ? item.amount_min
      : typeof item.award_floor === "number"
        ? item.award_floor
        : 0;

  const amountMax =
    typeof item.amount_max === "number"
      ? item.amount_max
      : typeof item.award_ceiling === "number"
        ? item.award_ceiling
        : 0;

  const stageTags = Array.isArray(item.stage_tags)
    ? item.stage_tags
    : [
        ...(item.is_rolling ? ["rolling"] : []),
        ...(amountMax > 0 && amountMax <= 25000 ? ["microgrant"] : []),
      ];

  const itemStatus =
    typeof item.status === "string" ? item.status.trim().toLowerCase() : "";
  const isInactive =
    isClosed ||
    /\b(closed|inactive|expired|archived|ended)\b/.test(itemStatus) ||
    deadlineHasPassed(item.deadline);
  const resolvedStatus = isInactive
    ? "closed"
    : itemStatus === "open" || itemStatus === "unknown"
      ? itemStatus
      : item.is_rolling || Boolean(item.deadline)
        ? "open"
        : "unknown";

  const resolvedPortalUrl =
    item.portal_url ||
    item.direct_apply_url ||
    item.official_application_url ||
    item.source_solicitation_url ||
    "";

  return {
    ...item,
    funder: item.funder ?? item.funder_name ?? "",
    funder_name: item.funder_name ?? item.funder ?? "",
    amount_min: amountMin,
    amount_max: amountMax,
    award_floor: amountMin,
    award_ceiling: amountMax,
    eligible_entity_types: Array.isArray(item.eligible_entity_types)
      ? item.eligible_entity_types
      : [],
    states,
    eligible_states: states,
    stage_tags: stageTags,
    deadline: isInactive ? "Closed / Inactive" : item.deadline || "Check Current Cycle",
    status: resolvedStatus,
    portal_url: resolvedPortalUrl,
    direct_apply_url: item.direct_apply_url || resolvedPortalUrl,
    directory_only: isInactive || Boolean(item.directory_only),
  };
}

const CURATED_IOWA_GRANTS = [
  {
    id: "ia-ieda-pocr",
    pool_tier: "state_territory",
    grant_tier: "State",
    title: "Proof of Commercial Relevance (POCR)",
    funder_name: "Iowa Economic Development Authority (IEDA)",
    funder_type: "government",
    award_floor: 10000,
    award_ceiling: 50000,
    min_months_in_business: 0,
    eligible_states: ["IA"],
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
    portal_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding/proof-commercial-relevance",
    source_solicitation_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding/proof-commercial-relevance",
    is_free_to_apply: true,
    directory_only: false,
    summary_text:
      "Supports Iowa-based startups in advanced manufacturing, biosciences, or IT with functional prototypes to validate market potential and commercial feasibility.",
    prerequisites: [
      "Iowa-registered business (fewer than 500 employees)",
      "Functional prototype / proof-of-concept",
      "1:2 non-state matching funds",
    ],
    source_system: "playwright_script",
    source_external_id: "ia-ieda-pocr",
  },
  {
    id: "ia-ieda-demonstration-fund",
    pool_tier: "state_territory",
    grant_tier: "State",
    title: "Iowa Demonstration Fund",
    funder_name: "Iowa Economic Development Authority (IEDA)",
    funder_type: "government",
    award_floor: 25000,
    award_ceiling: 100000,
    min_months_in_business: 0,
    eligible_states: ["IA"],
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
    portal_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding/demonstration-fund",
    source_solicitation_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding/demonstration-fund",
    is_free_to_apply: true,
    directory_only: false,
    summary_text:
      "Assists Iowa companies with market-ready innovative technologies in advanced manufacturing, biosciences, or IT for marketing, equipment, and business development.",
    prerequisites: [
      "Iowa-based company (fewer than 500 employees)",
      "Market-ready innovative product",
      "1:2 non-state matching funds",
    ],
    source_system: "playwright_script",
    source_external_id: "ia-ieda-demonstration-fund",
  },
  {
    id: "ia-ieda-tsb",
    pool_tier: "state_territory",
    grant_tier: "State",
    title: "Iowa Targeted Small Business (TSB) Program",
    funder_name: "Iowa Economic Development Authority (IEDA)",
    funder_type: "government",
    award_floor: 5000,
    award_ceiling: 50000,
    min_months_in_business: 0,
    eligible_states: ["IA"],
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
    direct_apply_url:
      "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
    official_application_url:
      "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
    portal_url:
      "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
    source_solicitation_url:
      "https://opportunityiowa.gov/business/start-grow/targeted-small-business",
    is_free_to_apply: true,
    directory_only: false,
    summary_text:
      "Supports certified Iowa Targeted Small Businesses owned and operated by women, minorities, service-disabled veterans, or people with disabilities.",
    prerequisites: [
      "Iowa Targeted Small Business (TSB) certification",
      "51%+ majority ownership by eligible group",
    ],
    source_system: "playwright_script",
    source_external_id: "ia-ieda-tsb",
  },
  {
    id: "ia-choose-iowa-value-added",
    pool_tier: "state_territory",
    grant_tier: "State",
    title: "Choose Iowa Value-Added Agricultural Grant",
    funder_name: "Iowa Department of Agriculture and Land Stewardship (IDALS)",
    funder_type: "government",
    award_floor: 5000,
    award_ceiling: 25000,
    min_months_in_business: 0,
    eligible_states: ["IA"],
    application_time_minutes: 120,
    deadline: "Check Current Cycle",
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
    is_free_to_apply: true,
    directory_only: false,
    summary_text:
      "Cost-share grants for Iowa farmers, food processors, and small businesses expanding processing, packaging, or distribution of Iowa agricultural products.",
    prerequisites: ["Iowa-based agricultural or food business", "1:1 dollar-for-dollar match"],
    source_system: "playwright_script",
    source_external_id: "ia-choose-iowa-value-added",
  },
  {
    id: "ia-ieda-manufacturing-4-0",
    pool_tier: "state_territory",
    grant_tier: "State",
    title: "Manufacturing 4.0 Technology Investment Grant",
    funder_name: "Iowa Economic Development Authority (IEDA) / CIRAS",
    funder_type: "government",
    award_floor: 25000,
    award_ceiling: 75000,
    min_months_in_business: 12,
    eligible_states: ["IA"],
    application_time_minutes: 180,
    deadline: "Check Current Cycle",
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
    direct_apply_url:
      "https://opportunityiowa.gov/business/financial-assistance/manufacturing-40-technology-investment",
    official_application_url:
      "https://opportunityiowa.gov/business/financial-assistance/manufacturing-40-technology-investment",
    portal_url:
      "https://opportunityiowa.gov/business/financial-assistance/manufacturing-40-technology-investment",
    source_solicitation_url:
      "https://opportunityiowa.gov/business/financial-assistance/manufacturing-40-technology-investment",
    is_free_to_apply: true,
    directory_only: false,
    summary_text:
      "Helps Iowa manufacturers adopt automation, smart sensors, robotics, and manufacturing software.",
    prerequisites: ["Iowa manufacturing facility", "Matching capital investment"],
    source_system: "playwright_script",
    source_external_id: "ia-ieda-manufacturing-4-0",
  },
  {
    id: "ia-ieda-sbir-sttr-match",
    pool_tier: "state_territory",
    grant_tier: "State",
    title: "Iowa SBIR / STTR State Matching Grant",
    funder_name: "Iowa Economic Development Authority (IEDA)",
    funder_type: "government",
    award_floor: 25000,
    award_ceiling: 75000,
    min_months_in_business: 0,
    eligible_states: ["IA"],
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
    direct_apply_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
    official_application_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
    portal_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
    source_solicitation_url:
      "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
    is_free_to_apply: true,
    directory_only: false,
    summary_text:
      "Supports Iowa small businesses pursuing federal SBIR/STTR awards with technical assistance and state matching commitments.",
    prerequisites: [
      "Iowa-based small business",
      "Federal SBIR/STTR Phase I or Phase II track",
    ],
    source_system: "playwright_script",
    source_external_id: "ia-ieda-sbir-sttr-match",
  },
  {
    id: "ia-cfgdm-community-grants",
    pool_tier: "foundation",
    grant_tier: "Foundation",
    title: "Greater Des Moines Leadership & Community Grants",
    funder_name: "Community Foundation of Greater Des Moines",
    funder_type: "private_foundation",
    award_floor: 2500,
    award_ceiling: 50000,
    min_months_in_business: null,
    eligible_states: ["IA"],
    application_time_minutes: 150,
    deadline: "Check Current Cycle",
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
    is_free_to_apply: true,
    directory_only: false,
    summary_text:
      "Supports charitable and community initiatives across Greater Des Moines and Central Iowa.",
    prerequisites: ["501(c)(3) nonprofit or eligible fiscal sponsor"],
    source_system: "playwright_script",
    source_external_id: "ia-cfgdm-community-grants",
  },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const upserts = [];
  const inactiveIds = [];

  try {
    const page = await context.newPage();

    try {
      await page.goto("https://www.iowagrants.gov/storefrontFOList.do", {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(1500);
      const rows = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("tr"))
          .map((tr) => {
            const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
              (td.textContent ?? "").replace(/\s+/g, " ").trim(),
            );
            const anchor = tr.querySelector("a[href]");
            return { cells, href: anchor ? anchor.getAttribute("href") : null };
          })
          .filter((r) => r.cells.length >= 4);
      });

      for (const row of rows) {
        const rawId = row.cells[0] ?? "";
        const title = row.cells[1] ?? "";
        const agency = row.cells[2] ?? "State of Iowa (IowaGrants.gov)";
        const closeDate = row.cells[row.cells.length - 1] ?? "";
        if (!title || title.length < 4 || /opportunity title/i.test(title)) continue;

        const slug = (rawId || title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 64);
        const applyUrl = row.href
          ? new URL(row.href, "https://www.iowagrants.gov/").toString()
          : "https://www.iowagrants.gov/storefrontFOList.do";
        const isClosed = deadlineHasPassed(closeDate);
        const isRolling = !closeDate || /rolling|continuous|ongoing|open/i.test(closeDate);

        const record = normalizeGrantRecord(
          {
            id: `iowagrants-${slug}`,
            pool_tier: "state_territory",
            grant_tier: "State",
            title,
            funder_name: agency,
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
            eligible_entity_types: ["for_profit", "small_business", "nonprofit_501c3"],
            demographic_set_asides: [],
            geographic_restriction: "state",
            geographic_scope: { level: "state_specific", allowedStates: ["IA"] },
            application_method: "online_portal",
            direct_apply_url: applyUrl,
            official_application_url: applyUrl,
            portal_url: applyUrl,
            source_solicitation_url: applyUrl,
            is_free_to_apply: true,
            directory_only: isClosed,
            summary_text: `State of Iowa opportunity listed on IowaGrants.gov under ${agency}.`,
            prerequisites: [
              "Iowa-eligible applicant or project",
              "IowaGrants.gov portal account",
            ],
            source_system: "playwright_script",
            source_external_id: rawId || slug,
            last_synced_at: nowIso,
            updated_at: nowIso,
          },
          { isClosed },
        );

        if (isClosed) inactiveIds.push(record.id);
        upserts.push(record);
      }
    } catch (err) {
      console.warn(
        "IowaGrants.gov crawl warning:",
        err instanceof Error ? err.message : String(err),
      );
    }

    for (const item of CURATED_IOWA_GRANTS) {
      try {
        const resp = await page.goto(item.direct_apply_url, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        const status = resp ? resp.status() : 0;
        if (status >= 500 || status === 0 || (status >= 400 && status !== 404 && status !== 410)) {
          console.warn(`Skipping ${item.id}: official page returned HTTP ${status || "no response"}.`);
          continue;
        }
        const bodyText = await page.evaluate(() =>
          (document.body?.innerText ?? "").slice(0, 4000),
        );
        const explicitlyClosed =
          status === 404 ||
          status === 410 ||
          deadlineHasPassed(item.deadline) ||
          /\b(program closed|applications? closed|no longer accepting applications|funding exhausted)\b/i.test(
            bodyText,
          );

        const normalizedItem = normalizeGrantRecord(
          {
            ...item,
            last_synced_at: nowIso,
            updated_at: nowIso,
          },
          { isClosed: explicitlyClosed },
        );

        upserts.push(normalizedItem);
        if (explicitlyClosed) inactiveIds.push(normalizedItem.id);
      } catch {
        console.warn(`Skipping ${item.id}: the official page could not be checked.`);
      }
    }
  } finally {
    await browser.close();
  }

  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify(
      {
        syncedAt: nowIso,
        count: upserts.length,
        inactiveCount: inactiveIds.length,
        grants: upserts,
      },
      null,
      2,
    ),
  );

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.log(
      JSON.stringify({
        ok: true,
        snapshotWritten: SNAPSHOT_PATH,
        crawledCount: upserts.length,
        inactiveMarkedCount: inactiveIds.length,
        dbSyncSkipped: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
      }),
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (upserts.length > 0) {
    const { error: upsertError } = await supabase
      .from("site_grants")
      .upsert(upserts, { onConflict: "id" });
    if (upsertError) throw new Error(`Supabase upsert failed: ${upsertError.message}`);
  }

  if (inactiveIds.length > 0) {
    const { error: inactiveError } = await supabase
      .from("site_grants")
      .update({ directory_only: true, status: "closed", updated_at: nowIso })
      .in("id", inactiveIds);
    if (inactiveError) {
      throw new Error(`Supabase inactive update failed: ${inactiveError.message}`);
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      snapshotWritten: SNAPSHOT_PATH,
      upsertedCount: upserts.length,
      inactiveMarkedCount: inactiveIds.length,
    }),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
