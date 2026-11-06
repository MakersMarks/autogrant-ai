// src/routes/index.tsx
import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationTracker } from '../components/ApplicationTracker';
import { AuthModal } from '../components/AuthModal';
import { processDocumentUpload } from '../lib/vault';
import { generateDailyGrants, Grant, OFFICIAL_SECTORS } from '../lib/grants';
import { generateAutopilotProposal } from '../lib/autopilot';
import { supabase } from '../integrations/supabase/client';
import { VaultDocument, ProposalDraft, EntityType } from '../lib/types';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  const [userSession, setUserSession] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>('BC');
  const [entityType, setEntityType] = useState<EntityType>('Established Operating Business');
  const [activeProject, setActiveProject] = useState<string>('Center-Filled Functional Chewing Gum (BREAK)');
  const [fundingGoal, setFundingGoal] = useState<number>(250000);
  const [totalAwarded, setTotalAwarded] = useState<number>(75000);
  
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [loadingGrants, setLoadingGrants] = useState<boolean>(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserSession(session);
      if (session) setShowAuth(false);
    });

    setGrants(generateDailyGrants(selectedSector));
    setLoadingGrants(false);

    return () => subscription.unsubscribe();
  }, [selectedSector]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setStatusMessage(`Parsing and indexing ${file.name} (Max 50MB)...`);
        const doc = await processDocumentUpload(file, userSession?.user?.id || 'guest_user');
        setVaultDocs((prev) => [doc, ...prev]);
        setStatusMessage(`Indexed successfully: ${doc.name}`);
      } catch (err: any) {
        setStatusMessage(`Upload error: ${err.message}`);
      }
    }
  };

  const handleDraftProposal = async (grant: Grant) => {
    try {
      setStatusMessage(`AI Autopilot synthesizing vault records for ${grant.title}...`);
      const newDraft = await generateAutopilotProposal(
        grant.id,
        grant.title,
        {
          companyName: userSession?.user?.email ? 'Authenticated Applicant' : 'BreakGum LLC (BREAK)',
          coreFocus: grant.funder,
          fundingGoal
        },
        vaultDocs
      );
      setProposals((prev) => [newDraft, ...prev]);
      setStatusMessage(`Proposal generated for ${grant.title}`);
    } catch (err: any) {
      setStatusMessage(`Generation error: ${err.message}`);
    }
  };

  const fundingProgress = Math.min(Math.round((totalAwarded / fundingGoal) * 100), 100);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 font-sans space-y-6">
      {showAuth && <AuthModal onSuccess={() => setShowAuth(false)} />}

      {/* Header & Workspace Bar */}
      <header className="border-b border-slate-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            AutoGrant AI <span className="text-xs font-mono bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800">v2.6 Secure Live</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Autonomous Federal Grant Discovery & Proposal Engine</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-200 py-1.5 px-3 rounded focus:outline-none"
          >
            <option value="Idea / Pre-Launch Founder">Pre-Launch Founder</option>
            <option value="Established Operating Business">Established Operating Business</option>
          </select>

          <button
            onClick={() => setShowAuth(true)}
            className="text-xs font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1.5 rounded transition"
          >
            {userSession ? userSession.user.email : 'Sync Grants.gov / Auth'}
          </button>
        </div>
      </header>

      {/* Personal Dashboard Metrics Overview */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
          <p className="text-[11px] font-mono text-slate-400 uppercase">Active Funding Project</p>
          <p className="text-sm font-bold text-blue-400 truncate">{activeProject}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
          <p className="text-[11px] font-mono text-slate-400 uppercase">Total Awarded Funds</p>
          <p className="text-lg font-mono font-bold text-emerald-400">${totalAwarded.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
          <p className="text-[11px] font-mono text-slate-400 uppercase">Funding Goal</p>
          <p className="text-lg font-mono font-bold text-white">${fundingGoal.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
          <p className="text-[11px] font-mono text-slate-400 uppercase">Goal Progress ({fundingProgress}%)</p>
          <div className="w-full bg-slate-950 rounded-full h-2 mt-2 border border-slate-800 overflow-hidden">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${fundingProgress}%` }}></div>
          </div>
        </div>
      </section>

      {/* Locked Desktop Split-Screen Grid Layout */}
      <main className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Sector Feeds & Document Vault (7 Cols) */}
        <div className="md:col-span-7 space-y-6">
          
          {/* Sector Navigation Tabs */}
          <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex gap-2 overflow-x-auto">
            {OFFICIAL_SECTORS.map((sec) => (
              <button
                key={sec.code}
                onClick={() => setSelectedSector(sec.code)}
                className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                  selectedSector === sec.code ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {sec.name}
              </button>
            ))}
          </div>

          {/* Secure AI Document Vault (50MB Limit) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-semibold text-white">AI Document Vault</h2>
                <p className="text-xs text-slate-400">Drag or upload business plans, pitch decks, or financial filings (50MB Max)</p>
              </div>
              <span className="text-[10px] font-mono bg-blue-950 text-blue-300 px-2.5 py-1 rounded border border-blue-800">
                {vaultDocs.length} Indexed
              </span>
            </div>

            <input
              type="file"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
            />

            {statusMessage && (
              <p className="text-xs text-emerald-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                {statusMessage}
              </p>
            )}
          </div>

          {/* Live Federal Grants Feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <h2 className="text-base font-semibold text-white">Live Federal Opportunities ({grants.length})</h2>

            {loadingGrants ? (
              <p className="text-xs text-slate-400">Loading federal feed...</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {grants.map((grant) => (
                  <div key={grant.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2 hover:border-slate-700 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-sm text-blue-400">{grant.title}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{grant.funder}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-emerald-400 block font-bold">{grant.amount}</span>
                        <span className="text-[10px] bg-slate-900 text-blue-300 px-1.5 py-0.5 rounded font-mono">{grant.fit}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 bg-slate-900 p-2.5 rounded border border-slate-800/60">
                      {grant.eligibilityReason}
                    </p>

                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[11px] text-slate-500 font-mono">Deadline: {grant.deadline}</span>
                      <button
                        onClick={() => handleDraftProposal(grant)}
                        className="text-xs bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-3 rounded-lg font-medium transition cursor-pointer shadow"
                      >
                        Draft with Autopilot
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Application Tracker Drawer (5 Cols - Pinned) */}
        <div className="md:col-span-5">
          <div className="sticky top-6">
            <ApplicationTracker proposals={proposals} />
          </div>
        </div>

      </main>
    </div>
  );
}
