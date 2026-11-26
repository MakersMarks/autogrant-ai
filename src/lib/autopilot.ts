// src/lib/autopilot.ts

export interface ProposalDraft {
  id: string;
  grantId: string;
  grantTitle: string;
  amount?: string;
  funder?: string;
  generatedContent: string;
  status: "draft" | "submission_ready" | "submitted";
  createdAt: string;
  confirmation?: string;
}

/** Adapter for persisted application rows; AI generation is server-only in ai.functions.ts. */
export function applicationToProposal(row: {
  id: string;
  grant_id: string;
  name: string;
  narrative: string;
  status: string;
  created_at: string;
  amount?: string;
  funder?: string;
}): ProposalDraft {
  const persistedStatus = row.status.trim().toLowerCase();
  const submitted = persistedStatus.startsWith("submitted");
  const confirmation =
    submitted && row.status.includes("::")
      ? row.status.slice(row.status.indexOf("::") + 2)
      : undefined;
  return {
    id: row.id,
    grantId: row.grant_id,
    grantTitle: row.name,
    ...(row.amount === undefined ? {} : { amount: row.amount }),
    ...(row.funder === undefined ? {} : { funder: row.funder }),
    generatedContent: row.narrative,
    status: submitted
      ? "submitted"
      : persistedStatus === "submission_ready"
        ? "submission_ready"
        : "draft",
    createdAt: row.created_at,
    ...(confirmation === undefined ? {} : { confirmation }),
  };
}
