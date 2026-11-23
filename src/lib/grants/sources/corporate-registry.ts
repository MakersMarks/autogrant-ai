import type { UnifiedGrant } from "../../grants";

export const corporateRegistry: UnifiedGrant[] = [
  {
    id: "fast-break-legalzoom",directoryOnly: false, poolTier: "corporate_diversity", title: "Amber Grant for Women",
    funderName: "Amber Grant Foundation", funderType: "corporate", awardFloor: 15000, awardCeiling: 15000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: ["women_owned"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://ambergrantsforwomen.com/get-an-amber-grant/apply-now/", isFreeToApply: false,
    summaryText: "Monthly grant for women-owned businesses. Verify the current cycle, fee, categories, and award amounts with WomensNet.",
    sourceSolicitationUrl: "https://ambergrantsforwomen.com/",
    publicWinnerHistoryUrl: "https://ambergrantsforwomen.com/business_category/amber-grant-winners/",
  },
  {
    id: "black-ambition-prize", directoryOnly: false, poolTier: "corporate_diversity", title: "Black Ambition Prize",
    funderName: "Black Ambition", funderType: "corporate", awardFloor: 10000, awardCeiling: 100000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: ["african_diaspora"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://blackambitionprize.com/", isFreeToApply: true,
    summaryText: "Non-dilutive funding and mentorship for Black and African American founders.",
    publicWinnerHistoryUrl: "https://blackambitionprize.com/prize_winners/expert-iep/",
  },
  {
    id: "tory-burch-fellows", directoryOnly: false, poolTier: "corporate_diversity", title: "Tory Burch Fellows",
    funderName: "Tory Burch Foundation", funderType: "corporate", awardFloor: 5000, awardCeiling: 5000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: ["women_owned"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://www.toryburchfoundation.org/fellows", isFreeToApply: true,
    summaryText: "Capital, education, and peer support for women entrepreneurs."
  },
  {
    id: "fedex-small-business", directoryOnly: false, poolTier: "corporate_diversity", title: "FedEx Small Business Grant",
    funderName: "FedEx", funderType: "corporate", awardFloor: 5000, awardCeiling: 50000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: [], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://www.fedex.com/en-us/small-business/grant.html", isFreeToApply: true,
    summaryText: "Annual prizes for innovative small businesses."
  },
  {
    id: "fast-break-legalzoom", directoryOnly: true, poolTier: "corporate_diversity", title: "Fast Break for Small Business",
    funderName: "NBA/WNBA/LegalZoom", funderType: "corporate", awardFloor: 5000, awardCeiling: 50000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: [], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://www.legalzoom.com/fast-break-for-small-business", isFreeToApply: true,
    summaryText: "Sports-community small-business grant combining cash and legal services."
  },
  {
    id: "bob-woodruff-venture", directoryOnly: true, poolTier: "foundation", title: "Bob Woodruff Foundation Veteran Grant",
    funderName: "Bob Woodruff Foundation", funderType: "private_foundation", awardFloor: 25000, awardCeiling: 100000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit", "nonprofit_501c3"], demographicSetAsides: ["veteran_owned"], geographicScope: { level: "national" },
    applicationMethod: "online_portal", directApplyUrl: "https://bobwoodrufffoundation.org/grants/", isFreeToApply: true,
    summaryText: "Funding and service support for veterans, families, and communities."
  }
];
