export type StateWatchTarget = {
  id: string;
  category: "state" | "corporate" | "foundation";
  state?: string;
  label: string;
  url: string;
  directApplyUrl?: string;
};

export const stateWatchTargets: StateWatchTarget[] = [
  // --- High-Value Corporate & Diversity Programs (Nationwide) ---
  {
    id: "amber-grant-women",
    category: "foundation",
    label: "Amber Grant for Women ($10k-$25k Monthly)",
    url: "https://ambergrantsforwomen.com/get-an-amber-grant/apply-now/",
    directApplyUrl: "https://ambergrantsforwomen.com/get-an-amber-grant/apply-now/",
  },
  {
    id: "fedex-small-business",
    category: "corporate",
    label: "FedEx Small Business Grant ($30k-$50k)",
    url: "https://www.fedex.com/en-us/small-business/grants.html",
    directApplyUrl: "https://www.fedex.com/en-us/small-business/grants.html",
  },
  {
    id: "verizon-digital-ready",
    category: "corporate",
    label: "Verizon Small Business Digital Ready ($10k)",
    url: "https://www.verizon.com/about/responsibility/digital-inclusion/small-business-training",
    directApplyUrl: "https://www.verizon.com/about/responsibility/digital-inclusion/small-business-training",
  },
  {
    id: "hello-alice-small-biz",
    category: "corporate",
    label: "Hello Alice Grant Opportunities Portal",
    url: "https://helloalice.com/grants/",
    directApplyUrl: "https://helloalice.com/grants/",
  },

  // --- Verified State & Regional Programs ---
  {
    id: "tn-tda-taep",
    category: "state",
    state: "TN",
    label: "Tennessee Agricultural Enhancement Program (TAEP)",
    url: "https://www.tn.gov/agriculture/farms/taep.html",
    directApplyUrl: "https://www.tn.gov/agriculture/farms/taep.html",
  },
  {
    id: "tn-launchtn-matching",
    category: "state",
    state: "TN",
    label: "LaunchTN SBIR/STTR Matching Grant",
    url: "https://launchtn.org/commercialization/sbir-matching/",
    directApplyUrl: "https://launchtn.org/commercialization/sbir-matching/",
  },
  {
    id: "ia-choose-iowa",
    category: "state",
    state: "IA",
    label: "Choose Iowa Value-Added Grants",
    url: "https://www.chooseiowa.com/grants/valueadded",
    directApplyUrl: "https://www.chooseiowa.com/grants/valueadded",
  },
  {
    id: "ia-eda-targeted-small-biz",
    category: "state",
    state: "IA",
    label: "Iowa EDA Targeted Small Business Loans & Grants",
    url: "https://www.iowaeda.com/small-business/targeted-small-business/",
    directApplyUrl: "https://www.iowaeda.com/small-business/targeted-small-business/",
  },
  {
    id: "tx-edc-small-biz",
    category: "state",
    state: "TX",
    label: "Texas Economic Development Small Business Portal",
    url: "https://gov.texas.gov/business/page/small-business",
    directApplyUrl: "https://gov.texas.gov/business/page/small-business",
  },
];
