import type { UnifiedGrant } from "../../grants";

export const stateRegistry: UnifiedGrant[] = [
  {
    id: "tn-taep", directoryOnly: false, grantTier: "State", poolTier: "state_territory", title: "Tennessee Agricultural Enhancement Program",
    funderName: "Tennessee Department of Agriculture", funderType: "government", awardFloor: 500, awardCeiling: 50000,
    deadline: "Rolling", isRolling: true, costSharingRequired: true,
    eligibleEntityTypes: ["for_profit", "individual"], demographicSetAsides: ["rural"], geographicScope: { level: "state_specific", allowedStates: ["TN"] },
    applicationMethod: "online_portal", directApplyUrl: "https://www.tn.gov/agriculture/farms/taep.html", isFreeToApply: true,
    summaryText: "Tennessee cost-share program for farm and agricultural business equipment, facilities, and efficiency improvements."
  },
  {
    id: "tn-launchtn-innovation", directoryOnly: false, poolTier: "state_territory", title: "LaunchTN SBIR/STTR Matching Grant",
    funderName: "LaunchTN / Tennessee ECD", funderType: "government", awardFloor: 25000, awardCeiling: 500000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit"], demographicSetAsides: [], geographicScope: { level: "state_specific", allowedStates: ["TN"] },
    applicationMethod: "online_portal", directApplyUrl: "https://launchtn.org/", isFreeToApply: true,
    summaryText: "Tennessee entrepreneurship, innovation, and capital-readiness programs."
  },
  {
    id: "ny-esd-grants", directoryOnly: false, poolTier: "state_territory", title: "Empire State Development Grants",
    funderName: "Empire State Development", funderType: "government", awardFloor: 50000, awardCeiling: 1000000,
    deadline: "Rolling", isRolling: true, costSharingRequired: false,
    eligibleEntityTypes: ["for_profit", "nonprofit_501c3"], demographicSetAsides: [], geographicScope: { level: "state_specific", allowedStates: ["NY"] },
    applicationMethod: "online_portal", directApplyUrl: "https://esd.ny.gov/funding-opportunities", isFreeToApply: true,
    summaryText: "New York state economic-development, expansion, and revitalization funding."
  }
];
