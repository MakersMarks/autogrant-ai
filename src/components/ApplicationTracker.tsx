import { useState } from "react";
import type { ProposalDraft } from "../lib/autopilot";

type StatusDetails = {
  confirmation?: string;
  attestations?: {
    accuracy: boolean;
    funderRules: boolean;
    requirements: boolean;
    auditReviewed: boolean;
    freshEyes: boolean;
  };
  externalSubmissionConfirmed?: boolean;
};

interface ApplicationTrackerProps {
  proposals: ProposalDraft[];
  onStatusChange?: (
    id: string,
    newStatus: "draft" | "submission_ready" | "submitted",
    details?: StatusDetails,
  ) => Promise<void>;
  onDeleteProposal?: (id: string) => Promise<void>;
}

export const ApplicationTracker = ({
  proposals,
  onStatusChange,
  onDeleteProposal,
}: ApplicationTrackerProps) => {
  const [selectedProposal, setSelectedProposal] = useState<ProposalDraft | null>(null);
  const [confirmSubmission, setConfirmSubmission] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [confirmReady, setConfirmReady] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  const [funderRulesConfirmed, setFunderRulesConfirmed] = useState(false);
  const [requirementsConfirmed, setRequirementsConfirmed] = useState(false);
  const [auditReviewed, setAuditReviewed] = useState(false);
  const [freshEyesConfirmed, setFreshEyesConfirmed] = useState(false);
  const [externalSubmissionConfirmed, setExternalSubmissionConfirmed] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState("");

  const handleExportMarkdown = (proposal: ProposalDraft) => {
    const blob = new Blob([proposal.generatedContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${proposal.grantTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_proposal.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const changeStatus = async (
    proposal: ProposalDraft,
    status: "draft" | "submission_ready" | "submitted",
    details?: StatusDetails,
  ) => {
    if (!onStatusChange) {
      setStatusError("Application status changes are unavailable.");
      return;
    }
    setSavingStatus(true);
    setStatusError("");
    try {
      await onStatusChange(proposal.id, status, details);
      setSelectedProposal({
        ...proposal,
        status,
        ...(details?.confirmation ? { confirmation: details.confirmation } : {}),
      });
      setConfirmReady(false);
      setConfirmSubmission(false);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Application status could not be saved.",
      );
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDelete = async (proposal: ProposalDraft) => {
    if (!onDeleteProposal) {
      setStatusError("Application deletion is unavailable.");
      return;
    }
    if (!window.confirm(`Delete "${proposal.grantTitle}" from your Application Tracker?`)) {
      return;
    }
    setDeletingId(proposal.id);
    setStatusError("");
    try {
      await onDeleteProposal(proposal.id);
      if (selectedProposal?.id === proposal.id) {
        setSelectedProposal(null);
      }
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Application could not be deleted.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-800 font-sans shadow-lg">
      <h2 className="text-xl font-bold mb-4">Application Tracker</h2>
      {proposals.length === 0 ? (
        <p className="text-slate-400 text-sm">
          No drafts or submissions yet. Choose a real opportunity to start a proposal.
        </p>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="p-3 bg-slate-800 hover:bg-slate-700 rounded flex justify-between items-center gap-3 transition"
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedProposal(proposal);
                  setStatusError("");
                  setConfirmReady(false);
                  setConfirmSubmission(false);
                }}
                className="min-w-0 flex-1 text-left cursor-pointer"
              >
                <p className="font-semibold text-sm truncate">{proposal.grantTitle}</p>
                <p className="text-xs text-slate-400">
                  Drafted: {new Date(proposal.createdAt).toLocaleDateString()}
                </p>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-1 text-xs rounded uppercase font-medium ${proposal.status === "submitted" ? "bg-emerald-600" : "bg-blue-600"}`}
                >
                  {proposal.status === "submission_ready" ? "Submission-ready" : proposal.status}
                </span>
                {onDeleteProposal && (
                  <button
                    type="button"
                    aria-label={`Delete ${proposal.grantTitle}`}
                    disabled={deletingId === proposal.id || savingStatus}
                    onClick={() => void handleDelete(proposal)}
                    className="px-2 py-1 text-xs rounded border border-red-800 text-red-300 hover:bg-red-950 disabled:opacity-50"
                  >
                    {deletingId === proposal.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedProposal && (
        <div className="mt-6 p-4 bg-slate-950 border border-slate-700 rounded-lg space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base text-blue-400">{selectedProposal.grantTitle}</h3>
            <button
              onClick={() => setSelectedProposal(null)}
              className="text-xs px-2 py-1 bg-red-600 rounded hover:bg-red-500 font-medium"
            >
              Close
            </button>
          </div>
          {selectedProposal.confirmation && (
            <p className="text-xs text-emerald-400">
              Submission confirmation:{" "}
              <span className="font-mono">{selectedProposal.confirmation}</span>
            </p>
          )}
          <pre className="text-sm whitespace-pre-wrap text-slate-300 font-sans max-h-60 overflow-y-auto p-2 bg-slate-900 rounded border border-slate-800">
            {selectedProposal.generatedContent}
          </pre>
          {statusError && (
            <p role="alert" className="text-xs text-red-300">
              {statusError}
            </p>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <button
              onClick={() => handleExportMarkdown(selectedProposal)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded border border-slate-700 font-medium transition"
            >
              Export as Markdown (.md)
            </button>
            {selectedProposal.status === "draft" ? (
              <button
                disabled={savingStatus || !selectedProposal.generatedContent.trim()}
                onClick={() => {
                  setStatusError("");
                  setConfirmReady(true);
                  setAccuracyConfirmed(false);
                  setFunderRulesConfirmed(false);
                  setRequirementsConfirmed(false);
                  setAuditReviewed(false);
                  setFreshEyesConfirmed(false);
                }}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
              >
                Mark Submission-Ready
              </button>
            ) : selectedProposal.status === "submission_ready" ? (
              <button
                disabled={savingStatus}
                onClick={() => {
                  setStatusError("");
                  setConfirmSubmission(true);
                  setExternalSubmissionConfirmed(false);
                  setConfirmation("");
                }}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
              >
                Confirm External Submission
              </button>
            ) : (
              <button
                disabled={savingStatus}
                onClick={() => void changeStatus(selectedProposal, "draft")}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
              >
                Move to Draft
              </button>
            )}
          </div>
          {confirmReady && (
            <div className="p-3 border border-amber-700 bg-amber-950/30 rounded-lg space-y-3">
              <p className="text-xs text-amber-200">
                This records your review; it is not legal advice or a funder compliance
                certification.
              </p>
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={accuracyConfirmed}
                  onChange={(event) => setAccuracyConfirmed(event.target.checked)}
                />
                I verified every statement, number, source, partner, and budget against my records.
              </label>
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={funderRulesConfirmed}
                  onChange={(event) => setFunderRulesConfirmed(event.target.checked)}
                />
                I checked the funder’s AI-use rules and completed any required disclosure.
              </label>
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={requirementsConfirmed}
                  onChange={(event) => setRequirementsConfirmed(event.target.checked)}
                />
                I checked the current solicitation, required forms, attachments, signatures, and
                portal steps.
              </label>
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={auditReviewed}
                  onChange={(event) => setAuditReviewed(event.target.checked)}
                />
                I reviewed the Proposal Studio self-check and resolved critical findings.
              </label>
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={freshEyesConfirmed}
                  onChange={(event) => setFreshEyesConfirmed(event.target.checked)}
                />
                I completed a separate fresh-eyes review of the full application package.
              </label>
              <div className="flex justify-end gap-2">
                <button
                  disabled={savingStatus}
                  onClick={() => setConfirmReady(false)}
                  className="text-xs px-3 py-1.5 rounded border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={
                    savingStatus ||
                    !accuracyConfirmed ||
                    !funderRulesConfirmed ||
                    !requirementsConfirmed ||
                    !auditReviewed ||
                    !freshEyesConfirmed
                  }
                  onClick={() =>
                    void changeStatus(selectedProposal, "submission_ready", {
                      attestations: {
                        accuracy: accuracyConfirmed,
                        funderRules: funderRulesConfirmed,
                        requirements: requirementsConfirmed,
                        auditReviewed,
                        freshEyes: freshEyesConfirmed,
                      },
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded bg-blue-600 font-semibold disabled:opacity-50"
                >
                  {savingStatus ? "Saving…" : "Confirm Review & Save"}
                </button>
              </div>
            </div>
          )}
          {confirmSubmission && (
            <div className="p-3 border border-amber-700 bg-amber-950/30 rounded-lg space-y-3">
              <p className="text-xs text-amber-200">
                Only confirm after you personally complete submission in the funder’s official
                portal.
              </p>
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={externalSubmissionConfirmed}
                  onChange={(event) => setExternalSubmissionConfirmed(event.target.checked)}
                />
                I submitted this application through the official portal.
              </label>
              <input
                aria-label="Submission confirmation number"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                maxLength={160}
                placeholder="Confirmation / receipt number (optional)"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  disabled={savingStatus}
                  onClick={() => setConfirmSubmission(false)}
                  className="text-xs px-3 py-1.5 rounded border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={savingStatus || !externalSubmissionConfirmed}
                  onClick={() =>
                    void changeStatus(selectedProposal, "submitted", {
                      ...(confirmation.trim() ? { confirmation: confirmation.trim() } : {}),
                      externalSubmissionConfirmed: true,
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded bg-emerald-600 font-semibold disabled:opacity-50"
                >
                  {savingStatus ? "Saving…" : "Confirm Submission"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
