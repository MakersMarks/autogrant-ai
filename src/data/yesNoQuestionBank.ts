export type YesNoQuestion = {
  id: string;
  tag: string;
  category: string;
  question: string;
  helper: string;
  parentTag?: string;
  satisfiedByDocument?: readonly string[];
};

const STARTER: Omit<YesNoQuestion, "id">[] = [
  {
    tag: "black_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% Black or African American-owned?",
    helper: "Unlocks Black-founder programs and community grants.",
  },
  {
    tag: "hispanic_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% Hispanic or Latino-owned?",
    helper: "Unlocks Latino founder and Hispanic Chamber opportunities.",
  },
  {
    tag: "asian_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% Asian American-owned?",
    helper: "Unlocks AAPI entrepreneur programs.",
  },
  {
    tag: "pacific_islander_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% Native Hawaiian or Pacific Islander-owned?",
    helper: "Unlocks Native Hawaiian and Pacific Islander opportunities.",
  },
  {
    tag: "indigenous_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% Indigenous, Native American, or Alaska Native-owned?",
    helper: "Unlocks tribal and Native CDFI programs.",
  },
  {
    tag: "mena_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% Middle Eastern or North African-owned?",
    helper: "Unlocks MENA founder opportunities.",
  },
  {
    tag: "immigrant_owned",
    category: "Identity & Heritage",
    question:
      "Is the business founded or primarily owned by an immigrant, refugee, or first-generation founder?",
    helper: "Unlocks immigrant and newcomer programs.",
  },
  {
    tag: "women_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% woman-owned?",
    helper:
      "This is about business ownership, not your personal gender; unlocks women-owned programs.",
  },
  {
    tag: "lgbtq_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% LGBTQ+-owned?",
    helper: "Unlocks NGLCC, Pride, and LGBTQ+ founder programs.",
  },
  {
    tag: "veteran_owned",
    category: "Service & Community",
    question: "Is your business at least 51% veteran- or service-disabled-veteran-owned?",
    helper: "Unlocks veteran and service-member programs.",
  },
  {
    tag: "military_spouse_owned",
    category: "Service & Community",
    question: "Are you a military spouse who owns or operates this business?",
    helper: "Unlocks military-spouse entrepreneur programs.",
  },
  {
    tag: "disability_owned",
    category: "Identity & Heritage",
    question: "Is your business at least 51% owned by a founder with a disability?",
    helper: "Unlocks disability-led and vocational opportunities.",
  },
  {
    tag: "rural_business",
    category: "Location & Stage",
    question: "Is your business in a USDA-eligible rural area or small town?",
    helper: "Unlocks rural business and community development programs.",
  },
  {
    tag: "hubzone_or_low_income",
    category: "Location & Stage",
    question: "Is your business in a HUBZone, Opportunity Zone, or low-income tract?",
    helper: "Unlocks place-based and CDFI opportunities.",
  },
  {
    tag: "student_founder",
    category: "Education",
    question: "Are you currently enrolled at a college or university?",
    helper: "Unlocks student competitions and entrepreneurship scholarships.",
  },
  {
    tag: "campus_incubator",
    category: "Education",
    question: "Does your business participate in a campus incubator or accelerator?",
    helper: "Unlocks university-affiliated accelerators and founder awards.",
  },
  {
    tag: "pre_launch",
    category: "Business Stage",
    question: "Has the business not started selling yet, or is it still in pre-launch?",
    helper: "Keeps pre-revenue and 0-month opportunities in your results.",
  },
  {
    tag: "early_stage",
    category: "Business Stage",
    question: "Has the business been operating for less than three years?",
    helper: "Finds early-stage programs without excluding pre-launch founders.",
  },
  {
    tag: "ein_ready",
    category: "Documents & Readiness",
    question: "Does the business already have an EIN confirmation letter?",
    helper: "Helps identify grants you can prepare for right away.",
    satisfiedByDocument: ["ein", "ein_letter"],
  },
  {
    tag: "sam_ready",
    category: "Documents & Readiness",
    question: "Does the business have an active SAM.gov registration and UEI?",
    helper: "Highlights federal opportunities and registration lead time.",
    satisfiedByDocument: ["sam_registration_record", "sam_gov_registration", "uei_number"],
  },
  {
    tag: "technology_business",
    category: "Industry & Project",
    question: "Does the business develop software, AI, hardware, or another technology product?",
    helper: "Unlocks technology commercialization and R&D funding.",
  },
  {
    tag: "research_development",
    category: "Industry & Project",
    question: "Are you conducting research, testing a prototype, or developing new technology?",
    helper: "Surfaces research and SBIR/STTR-related opportunities.",
  },
  {
    tag: "food_agriculture",
    category: "Industry & Project",
    question:
      "Does the business produce, process, distribute, or sell food or agricultural products?",
    helper: "Unlocks agriculture, food systems, and rural programs.",
  },
  {
    tag: "equipment_purchase",
    category: "Industry & Project",
    question: "Do you need funding for business equipment, machinery, or facility improvements?",
    helper: "Prioritizes equipment and capital investment opportunities.",
  },
  {
    tag: "hiring_workers",
    category: "Industry & Project",
    question: "Do you plan to hire employees or expand your workforce in the next year?",
    helper: "Finds workforce, training, and job-creation programs.",
  },
];

const FOLLOW_UPS: Record<string, [string, string, string]> = {
  black_owned: [
    "Do you hold or plan to pursue MBE certification?",
    "Would business coaching or technical assistance be useful alongside funding?",
    "Are you seeking capital for business growth within the next year?",
  ],
  hispanic_owned: [
    "Would bilingual business support help you apply for funding?",
    "Are you connected with a Hispanic-serving business organization?",
    "Would export or market-expansion assistance help your business?",
  ],
  asian_owned: [
    "Would support tailored to first-generation business owners be useful?",
    "Are you pursuing a new product or market launch?",
    "Would mentorship from an experienced founder be valuable?",
  ],
  pacific_islander_owned: [
    "Does your business serve Native Hawaiian or Pacific Islander communities?",
    "Would culturally specific business support help your growth?",
    "Are you seeking funds for equipment or expansion?",
  ],
  indigenous_owned: [
    "Is your business tribally enrolled, certified, or affiliated?",
    "Does your project benefit a tribal or Native community?",
    "Would help navigating federal programs be useful?",
  ],
  mena_owned: [
    "Would immigrant-founder business advising be helpful?",
    "Does your business serve a multilingual customer base?",
    "Are you seeking funds to expand into a new market?",
  ],
  immigrant_owned: [
    "Would help documenting foreign credentials or experience support your business?",
    "Would language-accessible business advising be useful?",
    "Is the business creating jobs in your local community?",
  ],
  women_owned: [
    "Do you hold or plan to pursue WBE or WOSB certification?",
    "Would women-founder mentorship support your growth?",
    "Are you seeking working capital or equipment funding?",
  ],
  lgbtq_owned: [
    "Would LGBTQ+-affirming business mentorship be helpful?",
    "Are you interested in supplier-diversity certification?",
    "Would a pitch competition or accelerator fit your plans?",
  ],
  veteran_owned: [
    "Are you service-disabled-veteran-owned or pursuing SDVOSB certification?",
    "Would veteran-specific procurement assistance be useful?",
    "Does your business provide services to military communities?",
  ],
  military_spouse_owned: [
    "Would flexible or remote business support suit your circumstances?",
    "Do frequent relocations affect your business operations?",
    "Would a military-family entrepreneur network be useful?",
  ],
  disability_owned: [
    "Would accessibility improvements or adaptive equipment support your business?",
    "Would disability-owned business certification help you compete?",
    "Would accessible coaching or application assistance be valuable?",
  ],
  rural_business: [
    "Is your business in a town with fewer than 50,000 residents?",
    "Does your project create or retain jobs locally?",
    "Would broadband or infrastructure investment help the business?",
  ],
  hubzone_or_low_income: [
    "Is the business located in an SBA-designated HUBZone?",
    "Is the business in a federally designated Opportunity Zone?",
    "Does the project primarily serve a low-income community?",
  ],
  student_founder: [
    "Would a student startup pitch competition be useful?",
    "Is the business connected to a university research project?",
    "Would mentorship from a campus entrepreneurship center help?",
  ],
  campus_incubator: [
    "Are you currently receiving support from a campus incubator?",
    "Has the incubator provided a mentor or faculty advisor?",
    "Would a university-affiliated pitch competition fit your business?",
  ],
  pre_launch: [
    "Have you chosen the business's legal structure yet?",
    "Do you have a prototype or initial service offering?",
    "Are you planning to launch in the next 12 months?",
  ],
  early_stage: [
    "Has the business generated revenue in the last 12 months?",
    "Are you seeking funds to validate product-market fit?",
    "Would founder coaching or commercialization support help?",
  ],
  ein_ready: [
    "Is the business bank account open and ready to receive funds?",
    "Have you completed a W-9 for the business?",
    "Are your formation documents easy to access?",
  ],
  sam_ready: [
    "Is the entity registration active through the current SAM.gov renewal date?",
    "Is your UEI associated with the correct legal business name?",
    "Does an authorized representative have Grants.gov Workspace access?",
  ],
  technology_business: [
    "Is the product at prototype or testing stage?",
    "Are you seeking funding for software or hardware R&D?",
    "Would commercialization or intellectual-property support be useful?",
  ],
  research_development: [
    "Do you have a working prototype or proof of concept?",
    "Are you interested in SBIR or STTR federal funding?",
    "Would testing or validation equipment advance the project?",
  ],
  food_agriculture: [
    "Do you process or add value to locally produced agricultural products?",
    "Would food-safety or production equipment expand capacity?",
    "Does the business operate in a rural area?",
  ],
  equipment_purchase: [
    "Do you have vendor quotes or estimates for the equipment?",
    "Will the purchase increase production capacity?",
    "Can the business provide matching funds if required?",
  ],
  hiring_workers: [
    "Would employee training or upskilling be part of the expansion?",
    "Will the planned hires be located in a rural or distressed area?",
    "Do you have a hiring timeline and job descriptions?",
  ],
};

export const STARTER_QUESTIONS: readonly YesNoQuestion[] = STARTER.map((question, index) => ({
  ...question,
  id: `starter-${index + 1}`,
}));

export const FOLLOW_UP_QUESTION_BANK: readonly YesNoQuestion[] = STARTER.flatMap(
  (question, index) =>
    FOLLOW_UPS[question.tag]!.map((prompt, followUpIndex) => ({
      id: `${question.tag}-followup-${followUpIndex + 1}`,
      tag: `${question.tag}_detail_${followUpIndex + 1}`,
      category: question.category,
      question: prompt,
      helper: `Helps prioritize ${question.category.toLowerCase()} opportunities.`,
      parentTag: question.tag,
    })),
);

export const YES_NO_QUESTION_BANK: readonly YesNoQuestion[] = [
  ...STARTER_QUESTIONS,
  ...FOLLOW_UP_QUESTION_BANK,
];
