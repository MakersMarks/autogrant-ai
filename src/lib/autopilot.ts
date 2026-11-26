// src/lib/autopilot.ts

export interface ProposalDraft {
  id: string;
  grantId: string;
  grantTitle: string;
  amount?: string;
  funder?: string;
  generatedContent: string;
  status: "draft" | "submission_ready" | "submitted" | "under_review" | "awarded" | "not_selected";
  createdAt: string;
  confirmation?: string;
}

function isProposalStatus(value: string): value is ProposalDraft["status"] {
  return [
    "draft",
    "submission_ready",
    "submitted",
    "under_review",
    "awarded",
    "not_selected",
  ].includes(value);
}

const ALLOWED_STATUS_TRANSITIONS: Record<
  ProposalDraft["status"],
  readonly ProposalDraft["status"][]
> = {
  draft: ["submission_ready"],
  submission_ready: ["draft", "submitted"],
  submitted: ["draft", "under_review", "awarded", "not_selected"],
  under_review: ["awarded", "not_selected"],
  awarded: [],
  not_selected: [],
};

export function canTransitionProposalStatus(current: string, next: ProposalDraft["status"]) {
  return isProposalStatus(current) && ALLOWED_STATUS_TRANSITIONS[current].includes(next);
}

export function proposalPreflightBlockers(narrative: string): string[] {
  const markers = narrative.match(/\[(?:needs evidence|missing_user_evidence)\s*:?[^\]]*\]/giu) ?? [];
  return [...new Set(markers.map((marker) => marker.trim()))];
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
  const statusValue = row.status.split("::", 1)[0]!.trim().toLowerCase();
  const confirmation = row.status.includes("::")
    ? row.status.slice(row.status.indexOf("::") + 2)
    : undefined;
  return {
    id: row.id,
    grantId: row.grant_id,
    grantTitle: row.name,
    ...(row.amount === undefined ? {} : { amount: row.amount }),
    ...(row.funder === undefined ? {} : { funder: row.funder }),
    generatedContent: row.narrative,
    status: isProposalStatus(statusValue) ? statusValue : "draft",
    createdAt: row.created_at,
    ...(confirmation === undefined ? {} : { confirmation }),
  };
}

export function createPostAwardChecklist(proposal: Pick<ProposalDraft, "grantTitle" | "funder">) {
  const lines = [
    `# Post-award follow-through: ${proposal.grantTitle}`,
    ...(proposal.funder ? [`Funder: ${proposal.funder}`] : []),
    "",
    "- [ ] Review the award letter, approved scope, deliverables, and reporting conditions.",
    "- [ ] Record report and deliverable due dates and assign an owner for each.",
    "- [ ] Track project outcomes and retain evidence needed for required reports.",
    "- [ ] Ask the funder to approve scope or timeline changes before making them.",
    "- [ ] Keep copies of funder communications and submitted reports.",
    "",
  ];
  return lines.join("\n");
}
