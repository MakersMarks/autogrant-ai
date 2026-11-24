import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  daysUntil,
  grantUrl,
  isEntityEligible,
  isInstitutionOnlyTitle,
  entityMode,
  stateFromLocation,
  type LiveGrant,
} from "./rules";
import { corporateRegistry } from "@/lib/grants/sources/corporate-registry";
import { stateRegistry } from "@/lib/grants/sources/state-registry";
import { localRegistry } from "@/lib/grants/sources/local-registry";
import { isUnifiedGrantOpen, type UnifiedGrant } from "@/lib/grants";
import { parseSbirSolicitations } from "./sbir";

const GRANTS_GOV_API = "https://api.grants.gov/v1/api";
const SIMPLER_GRANTS_API = "https://api.simpler.grants.gov";
const SAM_OPPORTUNITIES_API = "https://api.sam.gov/opportunities/v2/search";
const MAX_DETAIL_LOOKUPS = 12;

type JsonRecord = Record<string, unknown>;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const serverCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = serverCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    serverCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = 10 * 60 * 1000): T {
  serverCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const strip = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .replace(/&/g, "&")
    .replace(/'|’/g, "'")
    .replace(/"|“|”/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

async function gov(path: string, body: unknown) {
  const cacheKey = `grantsgov:${path}:${JSON.stringify(body)}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached !== null) return cached;

  const res = await fetch(`${GRANTS_GOV_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error("Grants.gov is not responding right now. Try again shortly.");
  }
  const json: unknown = await res.json();
  if (!isJsonRecord(json)) {
    throw new Error("Grants.gov returned an invalid response.");
  }
  if (json["errorcode"] !== 0) {
    throw new Error("Grants.gov rejected the search.");
  }
  return setCached(cacheKey, json["data"]);
}

async function fetchUsaspendingAwardCount(assistanceListingNumber: string): Promise<number | null> {
  const cacheKey = `usaspending:${assistanceListingNumber}`; const cached = getCached<number \vert{} null>(cacheKey); if (cached !== null) return cached;  try { const usaspending = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ filters: { time_period: [{ start_date: "2020-10-01", end_date: new Date().toISOString().slice(0, 10) }], cfda: assistanceListingNumber, award_type: ["02", "03", "04", "05"], }, fields: ["Award ID", "Award Amount"], page: 1, limit: 1, sort: "Award Amount", order: "desc", }), }); if (!usaspending.ok) return null; const payload = (await usaspending.json()) as { page_metadata?: { total?: number } }; const total = Number(payload.page_metadata?.total); if (!Number.isFinite(total) \vert{}\vert{} total < 0) return null; return setCached(cacheKey, total, 30 * 60 * 1000); } catch { return null; } }  async function detail(id: string) { const cacheKey = `detail:${id}`;
  const cached = getCached<Awaited<ReturnType<typeof loadDetail>>>(cacheKey);
  if (cached !== null) return cached;
  const loaded = await loadDetail(id);
  return setCached(cacheKey, loaded);
}

async function loadDetail(id: string) {
  const response = await gov("fetchOpportunity", { opportunityId: Number(id) });
  if (!isJsonRecord(response)) {
    throw new Error("Grants.gov returned an invalid opportunity detail.");
  }
  const s = isJsonRecord(response["synopsis"]) ? response["synopsis"] : {};
  const applicantTypes = Array.isArray(s["applicantTypes"]) ? s["applicantTypes"] : [];
  const fundingActivityCategories = Array.isArray(s["fundingActivityCategories"])
    ? s["fundingActivityCategories"]
    : [];
  const assistanceListingNumber =
    typeof s["assistanceListingNumber"] === "string"
      ? s["assistanceListingNumber"]
      : typeof s["cfdaNumber"] === "string"
        ? s["cfdaNumber"]
        : null;

  const historicalAwards = assistanceListingNumber
    ? await fetchUsaspendingAwardCount(assistanceListingNumber)
    : null;

  return {
    awardCeiling: num(s["awardCeiling"]),
    awardFloor: num(s["awardFloor"]),
    numberOfAwards: num(s["numberOfAwards"]),
    eligibility: applicantTypes
      .filter(isJsonRecord)
      .map((type) => String(type["description"] ?? "")),
    description: strip(String(s["synopsisDesc"] ?? "")),
    eligibilityNotes: strip(String(s["applicantEligibilityDesc"] ?? "")),
    estimatedFunding: num(s["estimatedFunding"]),
    costSharing:
      s["costSharing"] === true || s["costSharing"] === "Y"
        ? true
        : s["costSharing"] === false || s["costSharing"] === "N"
          ? false
          : null,
    contact: strip(
      [s["agencyContactName"], s["agencyContactEmail"], s["agencyContactPhone"]]
        .filter(Boolean)
        .join(" · "),
    ),
    moreInfoUrl:
      typeof s["fundingDescLinkUrl"] === "string" && /^https?:\/\//.test(s["fundingDescLinkUrl"])
        ? s["fundingDescLinkUrl"]
        : null,
    categories: fundingActivityCategories
      .filter(isJsonRecord)
      .map((category) => String(category["description"] ?? "")),
    assistanceListingNumber,
    historicalAwards,
  };
}

async function searchSimplerGrants(query: string): Promise<LiveGrant[]> {
  const apiKey = process.env["SIMPLER_GRANTS_API_KEY"]?.trim();
  if (!apiKey) return [];

  const cacheKey = `simpler:${query}`; const cached = getCached<LiveGrant[]>(cacheKey); if (cached !== null) return cached;  const res = await fetch(`${SIMPLER_GRANTS_API}/v1/opportunities/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      query,
      pagination: { page_offset: 1, page_size: 15 },
    }),
  });

  if (res.status === 429) {
    throw new Error("Simpler.Grants.gov rate limit reached. Try again shortly.");
  }
  if (!res.ok) {
    throw new Error(`Simpler.Grants
