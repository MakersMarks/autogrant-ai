// src/components/ApplicationTracker.tsx
import React, { useState } from 'react';
import { ProposalDraft } from '../lib/autopilot';

interface ApplicationTrackerProps {
  proposals: ProposalDraft[];
  onStatusChange?: (id: string, newStatus: 'draft' | 'submitted', confirmation?: string) => void;
}

export const ApplicationTracker: React.FC<ApplicationTrackerProps> = ({ proposals, onStatusChange }) => {
  const [selectedProposal, setSelectedProposal] = useState<ProposalDraft | null>(null);
  const [confirmSubmission, setConfirmSubmission] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const handleExportMarkdown = (proposal: ProposalDraft) => {
    const blob = new Blob([proposal.generatedContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${proposal.grantTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_proposal.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-800 font-sans shadow-lg">
      <h2 className="text-xl font-bold mb-4">Application Tracker</h2>
      {proposals.length === 0 ? (
        <p className="text-slate-400 text-sm">No applications saved yet. Click "Draft with Autopilot" on a grant card.</p>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {proposals.map((prop) => (
            <button
              type="button"
              key={prop.id}
              onClick={() => setSelectedProposal(prop)}
              className="w-full text-left p-3 bg-slate-800 hover:bg-slate-700 cursor-pointer rounded flex justify-between items-center transition"
            >
              <div>
                <p className="font-semibold text-sm">{prop.grantTitle}</p>
                <p className="text-xs text-slate-400">Drafted: {new Date(prop.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`px-2 py-1 text-xs rounded uppercase font-medium ${prop.status === 'submitted' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                {prop.status}
              </span>
            </button>
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
            <p className="text-xs text-emerald-400">Submission confirmation: <span className="font-mono">{selectedProposal.confirmation}</span></p>
          )}
          <pre className="text-sm whitespace-pre-wrap text-slate-300 font-sans max-h-60 overflow-y-auto p-2 bg-slate-900 rounded border border-slate-800">
            {selectedProposal.generatedContent}
          </pre>
          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <button
              onClick={() => handleExportMarkdown(selectedProposal)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded border border-slate-700 font-medium transition"
            >
              Export as Markdown (.md)
            </button>
            {selectedProposal.status === 'draft' ? (
              <button
                onClick={() => setConfirmSubmission(true)}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded font-medium transition"
              >
                Confirm External Submission
              </button>
            ) : (
              <button
                onClick={() => {
                  setSelectedProposal({ ...selectedProposal, status: 'draft' });
                  if (onStatusChange) onStatusChange(selectedProposal.id, 'draft');
                }}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded font-medium transition"
              >
                Move to Draft
              </button>
            )}
          </div>
          {confirmSubmission && (
            <div className="p-3 border border-amber-700 bg-amber-950/30 rounded-lg space-y-3">
              <p className="text-xs text-amber-200">Only confirm after completing the submission in the funder's official portal.</p>
              <input
                aria-label="Submission confirmation number"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="Confirmation / receipt number (optional)"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmSubmission(false)} className="text-xs px-3 py-1.5 rounded border border-slate-700">Cancel</button>
                <button
                  onClick={() => {
                    setSelectedProposal({ ...selectedProposal, status: 'submitted' });
                    if (onStatusChange) onStatusChange(selectedProposal.id, 'submitted', confirmation.trim() || undefined);
                    setConfirmSubmission(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded bg-emerald-600 font-semibold"
                >
                  Confirm Submission
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
