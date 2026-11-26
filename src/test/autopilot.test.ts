import { describe, expect, it } from "vitest";
import {
  applicationToProposal,
  canTransitionProposalStatus,
  createPostAwardChecklist,
  proposalPreflightBlockers,
  proposalStatusBlockers,
} from "@/lib/autopilot";

const row = (status: string) => ({
  id: "application-id",
  grant_id: "grant-id",
  name: "Community Grant",
  narrative: "Saved draft",
  status,
  created_at: "2026-01-01T00:00:00.000Z",
});

describe("application tracker status adapter", () => {
  it("keeps submission readiness separate from portal submission", () => {
    expect(applicationToProposal(row("submission_ready")).status).toBe("submission_ready");
    expect(applicationToProposal(row("draft")).status).toBe("draft");
  });

  it("retains a real external submission confirmation", () => {
    expect(applicationToProposal(row("submitted::receipt-123"))).toMatchObject({
      status: "submitted",
      confirmation: "receipt-123",
    });
  });

  it("tracks review and award outcomes without losing a submission receipt", () => {
    expect(applicationToProposal(row("under_review::receipt-123"))).toMatchObject({
      status: "under_review",
      confirmation: "receipt-123",
    });
    expect(applicationToProposal(row("awarded::receipt-123"))).toMatchObject({
      status: "awarded",
      confirmation: "receipt-123",
    });
    expect(applicationToProposal(row("not_selected")).status).toBe("not_selected");
  });

  it("allows only forward tracker status transitions", () => {
    expect(canTransitionProposalStatus("submission_ready", "submitted")).toBe(true);
    expect(canTransitionProposalStatus("submitted", "draft")).toBe(true);
    expect(canTransitionProposalStatus("submitted", "under_review")).toBe(true);
    expect(canTransitionProposalStatus("under_review", "awarded")).toBe(true);
    expect(canTransitionProposalStatus("draft", "awarded")).toBe(false);
    expect(canTransitionProposalStatus("awarded", "draft")).toBe(false);
    expect(canTransitionProposalStatus("not_selected", "submitted")).toBe(false);
  });

  it("blocks unresolved missing-evidence placeholders in a proposal preflight", () => {
    expect(
      proposalPreflightBlockers(
        "## Plan\n[Needs evidence: current revenue] and [MISSING_USER_EVIDENCE: vendor quote]",
      ),
    ).toEqual(["[Needs evidence: current revenue]", "[MISSING_USER_EVIDENCE: vendor quote]"]);
    expect(proposalPreflightBlockers("All figures are supported by the uploaded records.")).toEqual(
      [],
    );
  });

  it("requires saved content, all attestations, and resolved evidence before submission-ready", () => {
    const attestations = {
      accuracy: true,
      funderRules: true,
      requirements: true,
      auditReviewed: true,
      freshEyes: true,
    };
    expect(
      proposalStatusBlockers({
        currentStatus: "draft",
        nextStatus: "submission_ready",
        narrative: "A reviewed proposal.",
        attestations,
      }),
    ).toEqual([]);
    expect(
      proposalStatusBlockers({
        currentStatus: "draft",
        nextStatus: "submission_ready",
        narrative: "Draft contains [MISSING_USER_EVIDENCE: current revenue].",
        attestations,
      }),
    ).toEqual(["[MISSING_USER_EVIDENCE: current revenue]"]);
    expect(
      proposalStatusBlockers({
        currentStatus: "draft",
        nextStatus: "submission_ready",
        narrative: "A reviewed proposal.",
      }),
    ).toContain("All human review confirmations are required.");
  });

  it("requires a ready status and explicit manual submission confirmation", () => {
    expect(
      proposalStatusBlockers({
        currentStatus: "draft",
        nextStatus: "submitted",
        narrative: "A proposal.",
        externalSubmissionConfirmed: true,
      }),
    ).toContain("Confirm manual submission from the submission-ready state.");
    expect(
      proposalStatusBlockers({
        currentStatus: "submission_ready",
        nextStatus: "submitted",
        narrative: "A proposal.",
        externalSubmissionConfirmed: true,
      }),
    ).toEqual([]);
  });

  it("creates a post-award follow-through checklist", () => {
    const checklist = createPostAwardChecklist({
      grantTitle: "Community Grant",
      funder: "Example Foundation",
    });

    expect(checklist).toContain("# Post-award follow-through: Community Grant");
    expect(checklist).toContain("Funder: Example Foundation");
    expect(checklist).toContain("Record report and deliverable due dates");
  });

  it("preserves persisted award amount and funder", () => {
    expect(
      applicationToProposal({
        ...row("draft"),
        amount: "$5,000",
        funder: "Community Foundation",
      }),
    ).toMatchObject({
      amount: "$5,000",
      funder: "Community Foundation",
    });
  });
});
