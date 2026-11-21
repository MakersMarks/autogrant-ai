export type PublishedWinnerCaseStudy = {
  programId: string;
  winner: string;
  awardDate: string;
  awardAmount: string;
  sourceUrl: string;
  sourceName: string;
  publishedFacts: string[];
  interpretationLimit: string;
};

export type PublishedProgramGuidance = {
  programId: string;
  sourceUrl: string;
  sourceName: string;
  publishedGuidance: string[];
  interpretationLimit: string;
};

export const publishedProgramGuidance: PublishedProgramGuidance[] = [
  {
    programId: "amber-foundation-grant",
    sourceUrl: "https://ambergrantsforwomen.com/get-an-amber-grant/apply-now/",
    sourceName: "WomensNet application advice",
    publishedGuidance: [
      "WomensNet advises applicants to speak from the heart rather than sound corporate.",
      "WomensNet says its judges look for passion as well as business smarts and emphasizes the founder behind the business.",
    ],
    interpretationLimit: "This is the funder's published application advice, not a guarantee or a statement of why any specific winner was selected.",
  },
];

export const publishedWinnerCaseStudies: PublishedWinnerCaseStudy[] = [
  {
    programId: "black-ambition-prize",
    winner: "Expert IEP",
    awardDate: "2023",
    awardAmount: "Not stated in the published winner story",
    sourceUrl: "https://blackambitionprize.com/prize_winners/expert-iep/",
    sourceName: "Black Ambition Prize winner story",
    publishedFacts: [
      "Expert IEP is described as a parent-facing app using predictive AI to help optimize Individualized Education Plans.",
      "The story describes helping parents of students who think and learn differently navigate special education and advocate for their children.",
    ],
    interpretationLimit: "The published story describes the product and intended users, but does not state why Black Ambition selected this winner or the award amount.",
  },
  {
    programId: "amber-foundation-grant",
    winner: "The Data Love Co. — Jasmine Motupalli",
    awardDate: "October 2026",
    awardAmount: "$15,000",
    sourceUrl: "https://ambergrantsforwomen.com/october-2026-amber-grant-awarded-to-the-data-love-co/",
    sourceName: "WomensNet winner interview",
    publishedFacts: [
      "The founder described building an AI data agent for nonprofits and public-sector organizations that need reporting and compliance support.",
      "The interview emphasized deterministic calculations with source citations, human review, and flagging uncertain results rather than guessing.",
      "The founder described one food-access network report taking about seven weeks manually and about 20 minutes to rebuild, at a reported 99% accuracy checked by a human analyst.",
    ],
    interpretationLimit: "The interview describes the business and its evidence; WomensNet does not state that these details caused the award decision.",
  },
  {
    programId: "amber-foundation-grant",
    winner: "Your Sober Pal LLC — Laura Van Antwerp",
    awardDate: "June 2023",
    awardAmount: "$10,000",
    sourceUrl: "https://ambergrantsforwomen.com/june-2023-amber-grant-awarded-to-your-sober-pal/",
    sourceName: "WomensNet winner interview",
    publishedFacts: [
      "The founder described a business supporting the recovery community and said she applied to fund wilderness treks, backpacking courses, and retreats for women in recovery.",
      "The interview connected the proposed service to the founder's lived experience and described audience engagement through sobriety-focused social media and requests from women interested in learning outdoor skills.",
    ],
    interpretationLimit: "The interview describes the founder's story, proposed use, and reported audience interest; WomensNet does not state that these details caused the award decision.",
  },
];

export function winnerResearchForProgram(programId: string) {
  return publishedWinnerCaseStudies.filter((caseStudy) => caseStudy.programId === programId);
}

export function programGuidanceForProgram(programId: string) {
  return publishedProgramGuidance.filter((guidance) => guidance.programId === programId);
}
