// src/routes/index.tsx
import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationTracker } from '../components/ApplicationTracker';
import { AuthModal } from '../components/AuthModal';
import { processDocumentUpload } from '../lib/vault';
import { Grant, OFFICIAL_SECTORS } from '../lib/grants';
import { LiveGrantsFeed } from '@/components/autogrant/LiveGrantsFeed';
import { applicationToProposal } from '../lib/autopilot';
import { useServerFn } from '@tanstack/react-start';
import { draftProposal, saveIntake } from '@/lib/ai/ai.functions';
import { IntakeStudio } from '@/components/autogrant/IntakeStudio';
import type { Intake } from '@/lib/ai/proposal-policy';
import { Button } from '@/components/ui/button';
import { supabase } from '../integrations/supabase/client';
import { VaultDocument, ProposalDraft, EntityType } from '../lib/types';

export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({ meta: [
    { title: 'AutoGrant AI — Proposal Workspace' },
    { name: 'description', content: 'Create profile-aware executive summaries and grant proposals with private Vault evidence.' },
    { property: 'og:title', content: 'AutoGrant AI — Proposal Workspace' },
    { property: 'og:description', content: 'Institutional proposal drafting from your active intake and private documents.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: IndexComponent,
});

function IndexComponent() {
  const [userSession, setUserSession] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>('BC');
  const [entityType, setEntityType] = useState<EntityType>('Established Operating Business');
  const [intake, setIntake] = useState<Intake | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [summary, setSummary] = useState('');
  const draft = useServerFn(draftProposal);
  const persistIntake = useServerFn(saveIntake);
  const activeProject = intake?.project_name || 'No project specified';
  const [fundingGoal, setFundingGoal] = useState<number>(250000);
  const [totalAwarded, setTotalAwarded] = useState<number>(0);
  
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserSession(session);
      if (session) setShowAuth(false);
    });


    return () => subscription.unsubscribe();
  }, [selectedSector]);

  const reloadWorkspace = async () => {
    const [{ data: profile }, { data: documents }, { data: applications }] = await Promise.all([
      supabase.from('profiles').select('*').maybeSingle(),
      supabase.from('vault_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('applications').select('*').order('created_at', { ascending: false }),
    ]);
    if (profile) {
      setIntake({ project_name: profile.project_name, industry: profile.industry, lifecycle_stage: profile.lifecycle_stage, sector_code: profile.sector_code, entity_type: profile.entity_type, funding_goal: profile.funding_goal, demographics: profile.demographics, location: profile.location, funding_purpose: profile.funding_purpose });
      setSelectedSector(profile.sector_code);
      setEntityType(profile.entity_type as EntityType);
      setFundingGoal(Number(profile.funding_goal.replace(/[^0-9.]/g, '')) || 0);
    }
    setVaultDocs((documents ?? []).map((d) => ({ id: d.id, name: d.file_name, size: d.size_bytes, type: d.mime_type, uploadedAt: d.created_at, storagePath: d.storage_path })));
    setProposals((applications ?? []).map(applicationToProposal));
  };
  useEffect(() => {
    setIntake(null); setVaultDocs([]); setProposals([]); setSummary('');
    if (userSession) void reloadWorkspace();
  }, [userSession?.user?.id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setStatusMessage(`Uploading ${file.name} (Max 15MB)...`);
        const doc = await processDocumentUpload(file);
        setVaultDocs((prev) => [doc, ...prev]);
        setStatusMessage(`Saved successfully: ${doc.name}`);
      } catch (err: any) {
        setStatusMessage(`Upload error: ${err.message}`);
      }
    }
  };

  const handleDraftProposal = async (grant: Grant) => {
    if (!userSession) { setShowAuth(true); return; }
    if (!intake || drafting) return;
    setDrafting(true);
    try {
      setStatusMessage(`Drafting ${grant.title} from your active intake and Vault…`);
      await persistIntake({ data: { ...intake, sector_code: selectedSector, entity_type: entityType } });
      const result = await draft({ data: { grantId: grant.id, title: grant.title, funder: grant.funder, amount: grant.amount, eligibilityReason: grant.eligibilityReason } });
      setProposals((prev) => [applicationToProposal(result.application), ...prev]);
      setStatusMessage(`Proposal saved to the tracker: ${grant.title}`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Proposal generation failed.');
    } finally { setDrafting(false); }
  };

  const fundingProgress = fundingGoal > 0 ? Math.min(Math.round((totalAwarded / fundingGoal) * 100), 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 font-sans space-y-6">
      {showAuth && <AuthModal onSuccess={() => setShowAuth(false)} onClose={() => setShowAuth(false)} />}

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

      {intake && <IntakeStudio initial={{ ...intake, sector_code: selectedSector, entity_type: entityType }} onSaved={(value) => { setIntake(value); setFundingGoal(Number(value.funding_goal.replace(/[^0-9.]/g, '')) || 0); setStatusMessage('Intake saved.'); }} onError={setStatusMessage} onSummary={(text) => { setSummary(text); setStatusMessage('Executive summary saved to your private Vault.'); void reloadWorkspace(); }} />}
      {summary && <section className="border-b border-border py-4"><h2 className="text-lg font-semibold text-foreground">Executive summary</h2><pre className="whitespace-pre-wrap text-sm text-foreground">{summary}</pre></section>}
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

          {/* Secure AI Document Vault (15MB Limit) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-semibold text-white">AI Document Vault</h2>
                <p className="text-xs text-slate-400">Drag or upload business plans, pitch decks, or financial filings (15MB Max)</p>
              </div>
              <span className="text-[10px] font-mono bg-blue-950 text-blue-300 px-2.5 py-1 rounded border border-blue-800">
                {vaultDocs.length} Saved
              </span>
            </div>

            <input
              type="file"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
            />

            {vaultDocs.map((doc) => <Button key={doc.id} variant="ghost" size="sm" className="max-w-full whitespace-normal text-left" onClick={async () => { if (!doc.storagePath) return; const { data, error } = await supabase.storage.from('vault').download(doc.storagePath); if (error || !data) { setStatusMessage('Document could not be opened.'); return; } if (doc.type === 'text/plain') setSummary(await data.text()); else { const url = URL.createObjectURL(data); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } }}>{doc.name}</Button>)}
            {statusMessage && (
              <p className="text-xs text-emerald-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                {statusMessage}
              </p>
            )}
          </div>

          <LiveGrantsFeed key={intake.sector_code} profile={{ sector: intake.sector_code, industry: intake.industry, location: intake.location, entityType: intake.entity_type }} signedIn={!!userSession} drafting={drafting} onDraft={(g) => handleDraftProposal({ id: g.id, title: g.title, funder: g.agency, amount: g.awardCeiling ? `Up to $${g.awardCeiling.toLocaleString('en-US')}` : 'Not listed', fit: '', tier: '', categoryCode: selectedSector, eligibilityReason: `Grants.gov ${g.number}. Eligible: ${g.eligibility.join('; ') || 'see listing'}. Closes ${g.closeDate}.`.slice(0, 500), deadline: g.closeDate })} />

        </div>

        {/* Right Column: Application Tracker Drawer (5 Cols - Pinned) */}
        <div className="md:col-span-5">
          <div className="sticky top-6">
            <ApplicationTracker proposals={proposals} onStatusChange={async (id, status) => { const { error } = await supabase.from('applications').update({ status }).eq('id', id); if (error) setStatusMessage('Status could not be saved.'); else await reloadWorkspace(); }} />
          </div>
        </div>

      </main>
    </div>
  );
}
