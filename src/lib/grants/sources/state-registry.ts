import type { UnifiedGrant } from "../../grants";

export const stateRegistry: UnifiedGrant[] = [
  {
    id: "tn-launchtn-innovation", poolTier: "state_territory", title: "Tennessee Innovation Programs",
    funderName: "LaunchTN / Tennessee ECD", funderType: "government", awardFloor: 25000, awardCeiling: 500000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: [], geographicScope: { level: "state_specific", allowedStates: ["TN"] },
    applicationMethod: "online_portal", directApplyUrl: "https://launchtn.org/", isFreeToApply: true,
    summaryText: "Tennessee entrepreneurship, innovation, and capital-readiness programs."
  },
  {
    id: "ny-esd-grants", poolTier: "state_territory", title: "Empire State Development Grants",
    funderName: "Empire State Development", funderType: "government", awardFloor: 50000, awardCeiling: 1000000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit", "nonprofit_501c3"], demographicSetAsides: [], geographicScope: { level: "state_specific", allowedStates: ["NY"] },
    applicationMethod: "online_portal", directApplyUrl: "https://esd.ny.gov/funding-opportunities", isFreeToApply: true,
    summaryText: "New York state economic-development, expansion, and revitalization funding."
  }
];
