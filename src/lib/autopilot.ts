// src/lib/autopilot.ts

export interface ProposalDraft {
  id: string;
  grantId: string;
  grantTitle: string;
  generatedContent: string;
  status: 'draft' | 'submitted';
  createdAt: string;
}

/** Adapter for persisted application rows; AI generation is server-only in ai.functions.ts. */
export function applicationToProposal(row: { id: string; grant_id: string; name: string; narrative: string; status: string; created_at: string }): ProposalDraft {
  return { id: row.id, grantId: row.grant_id, grantTitle: row.name, generatedContent: row.narrative, status: row.status === 'submitted' || row.status === 'Submitted & Queued' ? 'submitted' : 'draft', createdAt: row.created_at };
}
