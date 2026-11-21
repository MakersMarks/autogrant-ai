import type { UnifiedGrant } from "../../grants";

export const corporateRegistry: UnifiedGrant[] = [
  {
    id: "amber-foundation-grant", poolTier: "corporate_diversity", title: "Amber Grant for Women",
    funderName: "Amber Grant Foundation", funderType: "corporate", awardFloor: 10000, awardCeiling: 10000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: ["women_owned"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://ambergrantsforwomen.com/", isFreeToApply: false,
    summaryText: "Monthly small-business grant for women-owned businesses."
  },
  {
    id: "black-ambition-prize", poolTier: "corporate_diversity", title: "Black Ambition Prize",
    funderName: "Black Ambition", funderType: "corporate", awardFloor: 10000, awardCeiling: 100000,
    deadline: "2026-11-30", isRolling: false, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: ["african_diaspora"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://blackambitionprize.com/", isFreeToApply: true,
    summaryText: "Non-dilutive funding and mentorship for Black and African American founders."
  },
  {
    id: "tory-burch-fellows", poolTier: "corporate_diversity", title: "Tory Burch Fellows",
    funderName: "Tory Burch Foundation", funderType: "corporate", awardFloor: 5000, awardCeiling: 5000,
    deadline: "2026-12-15", isRolling: false, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: ["women_owned"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://www.toryburchfoundation.org/fellows", isFreeToApply: true,
    summaryText: "Capital, education, and peer support for women entrepreneurs."
  },
  {
    id: "fedex-small-business", poolTier: "corporate_diversity", title: "FedEx Small Business Grant",
    funderName: "FedEx", funderType: "corporate", awardFloor: 5000, awardCeiling: 50000,
    deadline: "2026-10-31", isRolling: false, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: [], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://www.fedex.com/en-us/small-business/grant.html", isFreeToApply: true,
    summaryText: "Annual prizes for innovative small businesses."
  },
  {
    id: "fast-break-legalzoom", poolTier: "corporate_diversity", title: "Fast Break for Small Business",
    funderName: "NBA/WNBA/LegalZoom", funderType: "corporate", awardFloor: 5000, awardCeiling: 50000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: [], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://www.legalzoom.com/fast-break-for-small-business", isFreeToApply: true,
    summaryText: "Sports-community small-business grant combining cash and legal services."
  },
  {
    id: "bob-woodruff-venture", poolTier: "foundation", title: "Bob Woodruff Foundation Veteran Grant",
    funderName: "Bob Woodruff Foundation", funderType: "private_foundation", awardFloor: 25000, awardCeiling: 100000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit", "nonprofit_501c3"], demographicSetAsides: ["veteran_owned"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://bobwoodrufffoundation.org/grants/", isFreeToApply: true,
    summaryText: "Funding and service support for veterans, families, and communities."
  }
];
