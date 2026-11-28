import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const fs = require("node:fs");

const nowIso = new Date().toISOString();
function recordDatabaseSyncSkipped(skipped) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) fs.appendFileSync(outputPath, `db_sync_skipped=${skipped}\n`);
}

const PROGRAMS = [
  [
    "naacp-grants",
    "NAACP Grants",
    "NAACP",
    "https://naacp.org/find-resources/grants",
    ["black_owned"],
  ],
  [
    "black-girl-ventures",
    "Black Girl Ventures",
    "Black Girl Ventures",
    "https://blackgirlventures.org",
    ["black_owned", "women_owned"],
  ],
  [
    "coalition-back-black-business",
    "Coalition to Back Black Businesses",
    "CBBB",
    "https://www.coalitiontobackblackbusinesses.com",
    ["black_owned"],
  ],
  [
    "ushcc",
    "U.S. Hispanic Chamber of Commerce Grants",
    "US Hispanic Chamber of Commerce",
    "https://www.ushcc.com",
    ["hispanic_owned"],
  ],
  ["lban", "Latino Business Action Network", "LBAN", "https://lbaf.org", ["hispanic_owned"]],
  [
    "first-nations",
    "First Nations Development Institute Grants",
    "First Nations Development Institute",
    "https://www.firstnations.org",
    ["indigenous_owned"],
  ],
  [
    "native-cdfi-network",
    "Native CDFI Network Programs",
    "Native CDFI Network",
    "https://nativecdfi.net",
    ["indigenous_owned"],
  ],
  [
    "bia-ibip",
    "BIA Indian Business Incubators Program",
    "U.S. Bureau of Indian Affairs",
    "https://www.bia.gov",
    ["indigenous_owned"],
  ],
  [
    "national-ace",
    "National ACE Programs",
    "National ACE",
    "https://www.nationalace.org",
    ["asian_owned"],
  ],
  [
    "gold-house-ventures",
    "Gold House Ventures",
    "Gold House",
    "https://goldhouse.org",
    ["asian_owned"],
  ],
  [
    "nglcc",
    "National LGBT Chamber of Commerce Programs",
    "NGLCC",
    "https://nglcc.org",
    ["lgbtq_owned"],
  ],
  ["startout", "StartOut Programs", "StartOut", "https://startout.org", ["lgbtq_owned"]],
  [
    "wes-mariam-assefa",
    "Mariam Assefa Fund",
    "WES",
    "https://www.wes.org/mariam-assefa-fund",
    ["immigrant_owned"],
  ],
  [
    "upwardly-global",
    "Upwardly Global Entrepreneurship Resources",
    "Upwardly Global",
    "https://www.upwardlyglobal.org",
    ["immigrant_owned"],
  ],
  [
    "mbda",
    "MBDA Financial Resources",
    "Minority Business Development Agency",
    "https://www.mbda.gov/financial-resources/grants",
    ["minority_owned"],
  ],
  [
    "hello-alice",
    "Hello Alice Grants",
    "Hello Alice",
    "https://www.helloalice.com",
    ["black_owned", "hispanic_owned", "women_owned", "veteran_owned"],
  ],
  ["ifundwomen", "iFundWomen Grants", "iFundWomen", "https://ifundwomen.com", ["women_owned"]],
  [
    "usda-rdbg",
    "USDA Rural Business Development Grants",
    "USDA Rural Development",
    "https://www.rd.usda.gov/programs-services/business-programs/rural-business-development-grants",
    ["rural_business"],
  ],
  [
    "grants-gov-small-business",
    "Grants.gov Small Business Listings",
    "U.S. Federal Agencies",
    "https://www.grants.gov",
    ["women_owned", "minority_owned", "veteran_owned", "rural_business"],
  ],
];

const grants = PROGRAMS.map(([id, title, funder, portalUrl, demographicTags]) => ({
  id,
  title,
  funder,
  funder_name: funder,
  amount_min: 0,
  amount_max: 0,
  award_floor: 0,
  award_ceiling: 0,
  eligible_entity_types: ["for_profit", "small_business", "nonprofit_501c3"],
  states: ["ALL"],
  eligible_states: ["ALL"],
  stage_tags: ["0_plus", "all_stages"],
  demographic_tags: demographicTags,
  required_documents: [],
  cost_sharing_required: false,
  min_months_in_business: 0,
  requires_strict_demographic: false,
  deadline: "Check Current Cycle",
  status: "unknown",
  portal_url: portalUrl,
  direct_apply_url: portalUrl,
  directory_only: true,
  summary_text: `${title} opportunity or resource directory maintained by ${funder}.`,
  prerequisites: ["Review current eligibility and open funding cycle on the official portal."],
  source_system: "minority_national_curated_registry",
  updated_at: nowIso,
  last_synced_at: nowIso,
}));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  recordDatabaseSyncSkipped(true);
  console.log(
    JSON.stringify({
      ok: true,
      upsertedCount: 0,
      dbSyncSkipped: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
      count: grants.length,
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await supabase.from("site_grants").upsert(grants, { onConflict: "id" });
if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
recordDatabaseSyncSkipped(false);
console.log(JSON.stringify({ ok: true, upsertedCount: grants.length }));
