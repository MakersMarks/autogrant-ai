export type VaultDocumentTier = 1 | 2 | 3;

export type VaultDocumentTaxonomyEntry = {
  doc_key: string;
  name: string;
  doc_tier: VaultDocumentTier;
  provider: "Owner provides" | "AI generates" | "App pre-fills" | "Owner/partner signs";
};

export const VAULT_DOCUMENT_TAXONOMY: readonly VaultDocumentTaxonomyEntry[] = [
  {
    doc_key: "ein_letter",
    name: "IRS EIN Confirmation Letter (CP 575)",
    doc_tier: 1,
    provider: "Owner provides",
  },
  { doc_key: "irs_w9", name: "Signed IRS Form W-9", doc_tier: 1, provider: "App pre-fills" },
  {
    doc_key: "formation_articles",
    name: "Articles of Organization / Incorporation / 501(c)(3) Letter",
    doc_tier: 1,
    provider: "Owner provides",
  },
  {
    doc_key: "good_standing_cert",
    name: "Secretary of State Certificate of Good Standing",
    doc_tier: 1,
    provider: "Owner provides",
  },
  {
    doc_key: "dba_filing",
    name: "DBA / Fictitious Business Name Filing",
    doc_tier: 1,
    provider: "Owner provides",
  },
  {
    doc_key: "local_business_license",
    name: "City/County Business License or Seller's Permit",
    doc_tier: 1,
    provider: "Owner provides",
  },
  {
    doc_key: "operating_agreement",
    name: "Signed Operating Agreement / Bylaws / Stock Ledger / Board Roster",
    doc_tier: 1,
    provider: "Owner provides",
  },
  {
    doc_key: "owner_photo_id",
    name: "Government-Issued Photo ID",
    doc_tier: 1,
    provider: "Owner provides",
  },
  {
    doc_key: "bank_verification",
    name: "Voided Business Check / Bank Letter / ACH Form",
    doc_tier: 1,
    provider: "Owner provides",
  },
  {
    doc_key: "project_narrative",
    name: "Tailored Project Narrative / Executive Summary",
    doc_tier: 2,
    provider: "AI generates",
  },
  {
    doc_key: "use_of_funds_budget",
    name: "Itemized Use-of-Funds Budget & Budget Narrative",
    doc_tier: 2,
    provider: "AI generates",
  },
  {
    doc_key: "ytd_pnl",
    name: "Year-to-Date Profit & Loss Statement",
    doc_tier: 2,
    provider: "Owner provides",
  },
  {
    doc_key: "balance_sheet",
    name: "Current Balance Sheet",
    doc_tier: 2,
    provider: "Owner provides",
  },
  {
    doc_key: "business_tax_returns",
    name: "Filed Business Tax Returns",
    doc_tier: 2,
    provider: "Owner provides",
  },
  {
    doc_key: "bank_statements",
    name: "Recent Business Bank Statements",
    doc_tier: 2,
    provider: "Owner provides",
  },
  {
    doc_key: "vendor_quotes",
    name: "Written Vendor Quotes / Bids",
    doc_tier: 2,
    provider: "Owner provides",
  },
  { doc_key: "founder_bios", name: "Founder 1-Page Bios", doc_tier: 2, provider: "AI generates" },
  {
    doc_key: "support_letters",
    name: "Letters of Support / Partner MOUs",
    doc_tier: 2,
    provider: "AI generates",
  },
  {
    doc_key: "diversity_certification",
    name: "MBE / WBE / WOSB / VOSB / LGBTBE / DOBE / 8(a) / HUBZone Certificate",
    doc_tier: 2,
    provider: "Owner provides",
  },
  {
    doc_key: "login_gov_account",
    name: "Login.gov Account for an AOR",
    doc_tier: 3,
    provider: "Owner provides",
  },
  {
    doc_key: "uei_number",
    name: "SAM.gov Unique Entity Identifier",
    doc_tier: 3,
    provider: "Owner provides",
  },
  {
    doc_key: "sam_gov_registration",
    name: "Active Annual SAM.gov Entity Registration",
    doc_tier: 3,
    provider: "Owner provides",
  },
  {
    doc_key: "grants_gov_workspace",
    name: "Grants.gov Workspace Profile with AOR Role",
    doc_tier: 3,
    provider: "Owner provides",
  },
  {
    doc_key: "sf_424_cover",
    name: "Application for Federal Assistance (SF-424)",
    doc_tier: 3,
    provider: "App pre-fills",
  },
  {
    doc_key: "sf_424a_budget",
    name: "Budget Information (SF-424A)",
    doc_tier: 3,
    provider: "AI generates",
  },
  {
    doc_key: "sf_424b_assurances",
    name: "Assurances (SF-424B)",
    doc_tier: 3,
    provider: "App pre-fills",
  },
  {
    doc_key: "sf_lll_lobbying",
    name: "Disclosure of Lobbying Activities (SF-LLL)",
    doc_tier: 3,
    provider: "App pre-fills",
  },
  {
    doc_key: "project_abstract",
    name: "Federal Project Abstract Summary",
    doc_tier: 3,
    provider: "AI generates",
  },
  {
    doc_key: "match_commitment_letter",
    name: "Matching Funds / Cost-Sharing Commitment Letter",
    doc_tier: 3,
    provider: "Owner/partner signs",
  },
  {
    doc_key: "nicra_agreement",
    name: "Negotiated Indirect Cost Rate Agreement",
    doc_tier: 3,
    provider: "Owner provides",
  },
  {
    doc_key: "commercial_insurance_cert",
    name: "Commercial Liability / Workers' Comp Certificate",
    doc_tier: 3,
    provider: "Owner provides",
  },
];
