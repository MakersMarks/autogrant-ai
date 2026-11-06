export interface ProposalDraft {
  id: string;
  grantId: string;
  grantTitle: string;
  generatedContent: string;
  status: 'draft' | 'submitted';
  createdAt: string;
}

export function generateAutopilotProposal(
  grantId: string,
  grantTitle: string,
  businessProfile: { companyName: string; coreFocus: string }
): ProposalDraft {
  return {
    id: `prop_${Date.now()}`,
    grantId,
    grantTitle,
    generatedContent: `# Executive Summary for ${grantTitle}\n**Applicant:** ${businessProfile.companyName}\n\nOur venture aligns with ${grantTitle} to deliver measurable regional growth.`,
    status: 'draft',
    createdAt: new Date().toISOString()
  };
}
