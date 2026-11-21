// src/lib/autopilot.ts

export interface ProposalDraft {
  id: string;
  grantId: string;
  grantTitle: string;
  generatedContent: string;
  status: 'draft' | 'submitted';
  createdAt: string;
  confirmation?: string;
}

/** Adapter for persisted application rows; AI generation is server-only in ai.functions.ts. */
export function applicationToProposal(row: { id: string; grant_id: string; name: string; narrative: string; status: string; created_at: string }): ProposalDraft {
  const submitted = row.status.trim().toLowerCase().startsWith("submitted");
  const confirmation = submitted && row.status.includes("::") ? row.status.slice(row.status.indexOf("::") + 2) : undefined;
  return {
    id: row.id,
    grantId: row.grant_id,
    grantTitle: row.name,
    generatedContent: row.narrative,
    status: submitted ? 'submitted' : 'draft',
    createdAt: row.created_at,
    ...(confirmation === undefined ? {} : { confirmation }),
  };
}
