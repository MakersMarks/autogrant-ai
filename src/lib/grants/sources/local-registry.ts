import type { UnifiedGrant } from "../../grants";

export const localRegistry: UnifiedGrant[] = [
  {
    id: "nashville-metro-business-directory",
    grantTier: "Local",
    directoryOnly: false,
    poolTier: "state_territory",
    title: "Metro Arts Nashville Microgrant",
    funderName: "Metro Arts Nashville",
    funderType: "government",
    awardFloor: 1000,
    awardCeiling: 5000,
    deadline: "Rolling",
    isRolling: true,
    costSharingRequired: false,
    eligibleEntityTypes: ["for_profit", "nonprofit_501c3", "individual"],
    demographicSetAsides: [],
    geographicScope: { level: "local_county", allowedStates: ["TN"] },
    applicationMethod: "online_portal",
    directApplyUrl: "https://www.metroartsnashville.com/grants",
    isFreeToApply: true,
    summaryText: "Metro Arts microgrant funding for Nashville artists and arts organizations.",
  },
];
