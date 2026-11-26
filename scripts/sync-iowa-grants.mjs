import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
import { deadlineHasPassed, normalizeGrantRecord, parseIowaGrantRow } from "./iowa-grant-normalizer.mjs";

const SNAPSHOT_PATH = path.resolve(process.cwd(), ".github/iowa-grants-snapshot.json");
const nowIso = new Date().toISOString();

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
    directory_only: true,
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
    award_floor: 0,
    award_ceiling: 0,
    min_months_in_business: 0,
    eligible_states: ["IA"],
    application_time_minutes: 120,
    deadline: "Check Current Cycle",
    open_date: null,
    close_date: null,
    is_rolling: false,
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
    directory_only: true,
    summary_text:
      "The previous official program page is unavailable. Verify current program availability, eligibility, and funding terms with IEDA before applying.",
    prerequisites: [
      "Contact IEDA to confirm current program eligibility and terms.",
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
    award_floor: 0,
    award_ceiling: 75000,
    min_months_in_business: 36,
    eligible_states: ["IA"],
    application_time_minutes: 180,
    deadline: "Jan 29, 2027",
    open_date: "Jan 4, 2027",
    close_date: "Jan 29, 2027",
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
      "Iowa manufacturers may apply for up to $75,000 toward smart technology adoption. Applications open January 4, 2027 and close January 29, 2027; an Industry 4.0 assessment is required, and the assessment request period is closed.",
    prerequisites: [
      "Iowa manufacturer operating for at least three years",
      "3 to 124 full-time employees",
      "Industry 4.0 assessment (request period closed)",
      "1:1 match",
    ],
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
    award_floor: 0,
    award_ceiling: 0,
    min_months_in_business: 0,
    eligible_states: ["IA"],
    application_time_minutes: 120,
    deadline: "Check Current Cycle",
    open_date: null,
    close_date: null,
    is_rolling: false,
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
    directory_only: true,
    summary_text:
      "The official page is a general IEDA grants directory, not a verified application page for this specific program. Confirm current program availability and terms before applying.",
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
    title: "2026 Community Foundation of Greater Des Moines Nonprofit Grant Programs",
    funder_name: "Community Foundation of Greater Des Moines",
    funder_type: "private_foundation",
    award_floor: 0,
    award_ceiling: 0,
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
    direct_apply_url: "https://www.desmoinesfoundation.org/nonprofit-resources/grantmaking",
    official_application_url: "https://www.desmoinesfoundation.org/nonprofit-resources/grantmaking",
    portal_url: "https://www.desmoinesfoundation.org/nonprofit-resources/grantmaking",
    source_solicitation_url: "https://www.desmoinesfoundation.org/nonprofit-resources/grantmaking",
    is_free_to_apply: true,
    directory_only: true,
    summary_text:
      "The 2026 program page lists Leadership, Capacity Building, and Strategic Alignment grants. Leadership has cycle deadlines; Capacity Building and Strategic Alignment applications are accepted throughout the year. Confirm the specific program's current deadline and award terms on the official page.",
    prerequisites: ["501(c)(3) nonprofit or eligible fiscal sponsor", "Greater Des Moines service area"],
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
            const table = tr.closest("table");
            const headerRow = table?.querySelector("tr:has(th)");
            const headers = Array.from(headerRow?.querySelectorAll("th") ?? []).map((th) =>
              (th.textContent ?? "").replace(/\s+/g, " ").trim(),
            );
            const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
              (td.textContent ?? "").replace(/\s+/g, " ").trim(),
            );
            const anchor = tr.querySelector("a[href]");
            return {
              cells,
              headers,
              href: anchor ? anchor.getAttribute("href") : null,
              linkText: anchor ? (anchor.textContent ?? "").replace(/\s+/g, " ").trim() : "",
            };
          })
          .filter((r) => r.cells.length >= 4);
      });

      for (const row of rows) {
        const parsedRow = parseIowaGrantRow(row);
        if (!parsedRow) continue;
        const { rawId, title, agency, deadline: closeDate, applyUrl, isClosed, isRolling, slug } =
          parsedRow;

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
            directory_only: false,
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
        const unavailable = status === 404 || status === 410;
        const explicitlyClosed =
          deadlineHasPassed(item.deadline) ||
          /\b(program closed|applications? closed|no longer accepting applications|funding exhausted)\b/i.test(
            bodyText,
          );

        const normalizedItem = normalizeGrantRecord(
          {
            ...item,
            ...(unavailable
              ? {
                  status: "unknown",
                  directory_only: true,
                  summary_text: `${item.summary_text} The official program page returned HTTP ${status}; verify current availability before applying.`,
                }
              : {}),
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
      .update({ status: "closed", updated_at: nowIso })
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
