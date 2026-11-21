import type { UnifiedGrant } from "../../grants";

export const localRegistry: UnifiedGrant[] = [
  {
    id: "nashville-metro-business-directory",
    grantTier: "Local",
    directoryOnly: true,
    poolTier: "state_territory",
    title: "Nashville Metro Business and Community Funding Directory",
    funderName: "Metropolitan Government of Nashville and Davidson County",
    funderType: "government",
    awardFloor: 0,
    awardCeiling: 0,
    deadline: "Check current programs",
    isRolling: false,
    costSharingRequired: false,
    eligibleEntityTypes: ["for_profit", "nonprofit_501c3", "individual"],
    demographicSetAsides: [],
    geographicScope: { level: "local_county", allowedStates: ["TN"] },
    applicationMethod: "online_portal",
    directApplyUrl: "https://www.nashville.gov/departments/economic-and-community-development",
    isFreeToApply: true,
    summaryText: "Official Nashville Metro directory for economic-development, community, small-business, and capital programs. Individual opportunities are not listed as live grants until a current cycle is verified.",
  },
];
