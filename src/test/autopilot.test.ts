import { describe, expect, it } from "vitest";
import { applicationToProposal } from "@/lib/autopilot";

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
