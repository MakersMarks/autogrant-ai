// src/routes/index.tsx
import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationTracker } from '../components/ApplicationTracker';
import { processDocumentUpload } from '../lib/vault';
import { fetchGrantOpportunities, GrantOpportunity } from '../lib/grants';
import { generateAutopilotProposal, ProposalDraft } from '../lib/autopilot';
import { supabase } from '../integrations/supabase/client';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [grants, setGrants] = useState<GrantOpportunity[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [userSession, setUserSession] = useState<any>(null);
  const [loadingGrants, setLoadingGrants] = useState<boolean>(true);

  useEffect(() => {
    // 1. Check active user session for data isolation & security
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserSession(session);
    });

    // 2. Load grant opportunities feed
    fetchGrantOpportunities().then((data) => {
      setGrants(data);
      setLoadingGrants(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploadStatus('Uploading to secure vault...');
        const doc = await processDocumentUpload(file);
        setUploadStatus(`Successfully uploaded: ${doc.name}`);
      } catch (err: any) {
        setUploadStatus(`Error: ${err.message}`);
      }
    }
  };

  const handleDraftProposal = async (grant: GrantOpportunity) => {
    try {
      setUploadStatus(`Generating AI proposal for ${grant.title}...`);
      const newDraft = await generateAutopilotProposal(
        grant.id,
        grant.title,
        { companyName: userSession?.user?.email ? 'Authenticated Applicant' : 'AutoGrant Applicant', coreFocus: grant.category }
      );
      setProposals((prev) => [newDraft, ...prev]);
      setUploadStatus(`Proposal successfully drafted for ${grant.title}`);
    } catch (err: any) {
      setUploadStatus(`Proposal generation error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 space-y-8 font-sans">
      <header className="border-b border-slate-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AutoGrant AI</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time synced grant proposal & document vault environment</p>
        </div>
        <div className="text-xs font-mono text-emerald-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded">
          {userSession ? `User: ${userSession.user.email}` : 'Session: Guest Mode'}
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Document Vault & Grant Feed */}
        <section className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">Document Vault</h2>
            <p className="text-xs text-slate-400 mb-4">Upload pitch decks, business plans, or financial records (Max 15MB)</p>
            <input 
              type="file" 
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
            />
            {uploadStatus && <p className="text-xs text-emerald-400 mt-2 font-mono">{uploadStatus}</p>}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Live Federal Grants Feed</h2>
            {loadingGrants ? (
              <p className="text-xs text-slate-400">Loading active opportunities...</p>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {grants.map((grant) => (
                  <div key={grant.id} className="p-4 bg-slate-950 border border-slate-800 rounded-md space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-sm text-blue-400">{grant.title}</h3>
                      <span className="text-xs font-mono text-emerald-400">${Number(grant.fundingAmount).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-400">{grant.description}</p>
                    <button 
                      onClick={() => handleDraftProposal(grant)}
                      className="mt-2 text-xs bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-3 rounded font-medium transition cursor-pointer"
                    >
                      Draft with Autopilot
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Application Tracker */}
        <section>
          <ApplicationTracker proposals={proposals} />
        </section>
      </main>
    </div>
  );
}

