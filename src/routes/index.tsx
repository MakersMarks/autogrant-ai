// src/routes/index.tsx
import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationTracker } from '../components/ApplicationTracker';
import { AuthModal } from '../components/AuthModal';
import { processDocumentUpload } from '../lib/vault';
import { Grant, OFFICIAL_SECTORS, type UnifiedGrant } from '../lib/grants';
import { LiveGrantsFeed } from '@/components/autogrant/LiveGrantsFeed';
import { applicationToProposal } from '../lib/autopilot';
import { useServerFn } from '@tanstack/react-start';
import { saveIntake } from '@/lib/ai/ai.functions';
import { IntakeStudio } from '@/components/autogrant/IntakeStudio';
import { DocumentViewer } from '@/components/autogrant/DocumentViewer';
import type { Intake } from '@/lib/ai/proposal-policy';
import { Button } from '@/components/ui/button';
import { supabase } from '../integrations/supabase/client';
import { VaultDocument, ProposalDraft, EntityType } from '../lib/types';
import { ProposalStudio } from '@/components/autogrant/ProposalStudio';
import type { LiveGrant } from '@/lib/grants-gov/rules';
import { getIndustryDocumentRequirements } from '@/lib/compliance/industry-documents';

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
  const [viewing, setViewing] = useState<VaultDocument | null>(null);
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);
  const [uploadCategory, setUploadCategory] = useState<"legal_tax" | "license_permit" | "vendor_quote" | "financial">("legal_tax");
  const [uploadSlotKey, setUploadSlotKey] = useState("");
  const persistIntake = useServerFn(saveIntake);
  const activeProject = intake?.project_name || 'No project specified';
  const [fundingGoal, setFundingGoal] = useState<number>(250000);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const saveGoal = async () => {
    if (!editingGoal) return;
    setEditingGoal(false);
    const n = Number(goalDraft) || 0;
    if (!n || n === fundingGoal || !userSession) return;
    const prev = fundingGoal;
    setFundingGoal(n);
    const { error } = await supabase.from('profiles').update({ funding_goal: String(n), updated_at: new Date().toISOString() }).eq('id', userSession.user.id);
    if (error) { setFundingGoal(prev); setStatusMessage('Could not save funding goal.'); return; }
    setIntake((cur) => (cur ? { ...cur, funding_goal: String(n) } : cur));
    setStatusMessage('Funding goal saved.');
  };
  const [totalAwarded, setTotalAwarded] = useState<number>(0);
  
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [cockpitView, setCockpitView] = useState<'Dashboard' | 'Profile' | 'Grants' | 'Vault' | 'Tracker'>('Dashboard');
  const [autopilot, setAutopilot] = useState(false);
  const profileMissingFields = intake
    ? [
      ...(!intake.project_name?.trim() ? ["Project name"] : []),
      ...(!intake.industry?.trim() ? ["Industry"] : []),
      ...(!intake.lifecycle_stage?.trim() ? ["Business stage"] : []),
      ...(!intake.location?.trim() ? ["Location"] : []),
      ...(!intake.funding_purpose?.trim() ? ["Funding purpose"] : []),
      ...(!intake.funding_goal?.trim() ? ["Funding goal"] : []),
    ]
    : ["Sign in and complete your profile"];
  const intakeComplete = profileMissingFields.length === 0;

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
      setAutopilot(!!profile.autopilot);
    }
    setVaultDocs((documents ?? []).map((d) => ({
      id: d.id,
      name: d.file_name,
      size: d.size_bytes,
      type: d.mime_type,
      uploadedAt: d.created_at,
      storagePath: d.storage_path,
      slotKey: d.slot_key,
      ...(d.category_tag ? { categoryTag: d.category_tag } : {}),
      ...(d.grant_id ? { grantId: d.grant_id } : {}),
    })));
    setProposals((applications ?? []).map(applicationToProposal));
    const awarded = (applications ?? []).reduce((sum, application) => {
      if (!String(application.status).toLowerCase().startsWith("submitted")) return sum;
      const match = /\$[\d,]+(?:\.\d+)?/.exec(application.amount);
      return sum + (match ? Number(match[0].replace(/[$,]/g, "")) : 0);
    }, 0);
    setTotalAwarded(awarded);
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
        const doc = await processDocumentUpload(file, {
          categoryTag: uploadCategory,
          ...(selectedGrant?.id ? { grantId: selectedGrant.id } : {}),
          ...(uploadSlotKey ? { slotKey: uploadSlotKey } : {}),
        });
        setVaultDocs((prev) => [doc, ...prev]);
        setStatusMessage(doc.metadataWarning ? `${doc.metadataWarning} Saved: ${doc.name}` : `Saved successfully: ${doc.name}`);
      } catch (err: any) {
        setStatusMessage(`Upload error: ${err.message}`);
      }
    }
  };

  const handleDraftProposal = async (grant: Grant) => {
    if (!userSession) { setShowAuth(true); return; }
    if (!intakeComplete) {
      setStatusMessage('Complete the mission-critical profile fields before opening Proposal Studio.');
      return;
    }
    try {
      await persistIntake({ data: { ...intake!, sector_code: selectedSector, entity_type: entityType } });
      setSelectedGrant(grant);
      setStatusMessage(`Proposal Studio opened for ${grant.title}.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Could not open Proposal Studio.');
    }
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
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-1">
            <button
              type="button"
              aria-pressed={!autopilot}
              onClick={async () => {
                setAutopilot(false);
                if (userSession) await supabase.from("profiles").update({ autopilot: false }).eq("id", userSession.user.id);
              }}
              className={`px-2.5 py-1.5 rounded text-xs font-bold ${!autopilot ? "bg-slate-700 text-white" : "text-slate-400"}`}
            >
              Manual
            </button>
            <button
              type="button"
              aria-pressed={autopilot}
              onClick={async () => {
                setAutopilot(true);
                if (userSession) await supabase.from("profiles").update({ autopilot: true }).eq("id", userSession.user.id);
              }}
              className={`px-2.5 py-1.5 rounded text-xs font-bold ${autopilot ? "bg-emerald-600 text-white" : "text-slate-400"}`}
            >
              Auto
            </button>
          </div>
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

      <main className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-4 items-start">
        <nav aria-label="Workspace pages" className="md:sticky md:top-4 flex md:flex-col gap-2 overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl p-2">
          {(["Dashboard", "Profile", "Grants", "Vault", "Tracker"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-current={cockpitView === view ? "page" : undefined}
              onClick={() => setCockpitView(view)}
              className={`shrink-0 md:w-full px-3 py-3 rounded-lg text-left text-xs font-bold transition ${cockpitView === view ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            >
              {view}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {statusMessage && (
            <p role={/error|could not|failed/i.test(statusMessage) ? "alert" : "status"} className={`text-xs p-3 rounded-lg border ${/error|could not|failed/i.test(statusMessage) ? "text-red-400 border-red-800" : "text-emerald-400 border-slate-800"}`}>
              {statusMessage}
            </p>
          )}

          <section className={cockpitView === "Dashboard" ? "space-y-4" : "hidden"}>
            <h2 className="text-lg font-bold">Dashboard</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase">Active funding project</p>
                <p className="text-sm font-bold text-blue-400 truncate">{activeProject}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase">Total awarded funds</p>
                <p className="text-lg font-mono font-bold text-emerald-400">${totalAwarded.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase">Funding goal</p>
                {editingGoal ? (
                  <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void saveGoal(); }}>
                    <input autoFocus aria-label="Funding goal" inputMode="numeric" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-white" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value.replace(/\D/g, ""))} onBlur={() => void saveGoal()} />
                  </form>
                ) : (
                  <button type="button" title="Click to edit" onClick={() => { setGoalDraft(String(fundingGoal || "")); setEditingGoal(true); }} className="text-lg font-mono font-bold text-white hover:underline decoration-dotted">${fundingGoal.toLocaleString()} <span className="text-[10px] text-slate-400 font-sans">edit</span></button>
                )}
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase">Goal progress ({fundingProgress}%)</p>
                <div className="w-full bg-slate-950 rounded-full h-2 mt-2 border border-slate-800 overflow-hidden">
                  <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${fundingProgress}%` }} />
                </div>
              </div>
            </div>
            {!intakeComplete && (
              <section role="alert" className="border border-amber-700 bg-amber-950/40 rounded-xl p-4 text-xs text-amber-200">
                Complete these profile fields before drafting: {profileMissingFields.join(", ")}.
                <button type="button" onClick={() => setCockpitView("Profile")} className="ml-2 underline">Open profile</button>
              </section>
            )}
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <div>
                <h3 className="font-bold">Grant readiness</h3>
                <p className="text-xs text-slate-400">Profile and evidence currently in your workspace.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ReadinessItem label="Profile complete" ready={intakeComplete} />
                <ReadinessItem label="Legal / tax evidence" ready={vaultDocs.some((doc) => doc.categoryTag === "legal_tax")} />
                <ReadinessItem label="Vendor quotes" ready={vaultDocs.some((doc) => doc.categoryTag === "vendor_quote")} />
                <ReadinessItem label="Active proposal" ready={!!selectedGrant} />
              </div>
              {intake && getIndustryDocumentRequirements(intake.industry, intake.entity_type).length > 0 && (
                <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
                  <p className="text-slate-400">Industry evidence checklist</p>
                  {getIndustryDocumentRequirements(intake.industry, intake.entity_type).map((requirement) => (
                    <ReadinessItem key={requirement.key} label={requirement.name} ready={vaultDocs.some((doc) => doc.slotKey === requirement.key)} />
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setCockpitView("Grants")} className="px-4 py-2 rounded-lg bg-blue-600 text-xs font-bold">Find grants</button>
            </section>
          </section>

          <section className={cockpitView === "Profile" ? "space-y-4" : "hidden"}>
            <div>
              <h2 className="text-lg font-bold">Profile &amp; intake</h2>
              <p className="text-xs text-slate-400">Update your applicant details; these guide grant matching and AI drafts.</p>
            </div>
            {!intakeComplete && (
              <section role="alert" className="border border-amber-700 bg-amber-950/40 rounded-xl p-4 text-xs text-amber-200">
                Complete these profile fields before drafting: {profileMissingFields.join(", ")}.
              </section>
            )}
            {intake && <IntakeStudio initial={{ ...intake, sector_code: selectedSector, entity_type: entityType }} onSaved={(value) => { setIntake(value); setFundingGoal(Number(value.funding_goal.replace(/[^0-9.]/g, "")) || 0); setStatusMessage("Intake saved."); }} onError={setStatusMessage} onSummary={(text) => { setSummary(text); setStatusMessage("Executive summary saved to your private Vault."); void reloadWorkspace(); }} />}
            {summary && <section className="bg-slate-900 border border-slate-800 rounded-xl p-4"><h3 className="text-sm font-semibold mb-2">Executive summary</h3><pre className="whitespace-pre-wrap text-sm text-slate-200">{summary}</pre></section>}
          </section>

          <section className={cockpitView === "Grants" ? "space-y-4 min-w-0" : "hidden"}>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-base font-bold">Proposal workspace</h2><p className="text-xs text-slate-400">{selectedGrant ? selectedGrant.title : "Choose a grant below to start a draft."}</p></div>
                {selectedGrant && <button type="button" onClick={() => setSelectedGrant(selectedGrant)} className="px-3 py-2 rounded-lg bg-blue-600 text-xs font-bold">Open editor</button>}
              </div>
            </div>
            <LiveGrantsFeed
              key={intake?.sector_code ?? "none"}
              profile={intake ? { sector: intake.sector_code, industry: intake.industry, location: intake.location, entityType: intake.entity_type, fundingPurpose: intake.funding_purpose } : undefined}
              signedIn={!!userSession}
              enabled={intakeComplete}
              drafting={drafting}
              onDraft={(g) => {
                if ("agency" in g) {
                  const federal = g as LiveGrant;
                  void handleDraftProposal({ id: federal.id, title: federal.title, funder: federal.agency, amount: federal.awardCeiling ? `Up to $${federal.awardCeiling.toLocaleString("en-US")}` : "Not listed", fit: "", tier: "[Federal]", categoryCode: selectedSector, eligibilityReason: `Grants.gov ${federal.number}. Eligible: ${federal.eligibility.join("; ") || "see listing"}. Closes ${federal.closeDate}.`.slice(0, 500), deadline: federal.closeDate });
                } else {
                  const pool = g as UnifiedGrant;
                  void handleDraftProposal({
                    id: pool.id,
                    title: pool.title,
                    funder: pool.funderName,
                    amount: pool.directoryOnly ? "Check the official program for current award details" : pool.awardCeiling ? `$${pool.awardFloor.toLocaleString("en-US")} - $${pool.awardCeiling.toLocaleString("en-US")}` : "Not listed",
                    fit: "",
                    tier: `[${pool.poolTier === "state_territory" ? "State" : pool.poolTier === "corporate_diversity" ? "Corporate" : "Foundation"}]`,
                    categoryCode: selectedSector,
                    eligibilityReason: `${pool.summaryText} Confirm current eligibility and open funding cycle on the official funder site.`,
                    deadline: pool.directoryOnly ? "Check current cycle" : pool.isRolling ? "Rolling" : pool.deadline,
                    ...(pool.publicWinnerHistoryUrl ? { publicWinnerHistoryUrl: pool.publicWinnerHistoryUrl } : {}),
                  });
                }
              }}
            />
          </section>

          <section className={cockpitView === "Vault" ? "space-y-4" : "hidden"}>
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div><h2 className="text-base font-bold">Evidence Vault</h2><p className="text-xs text-slate-400">Upload and categorize supporting documents.</p></div>
                <span className="text-[10px] font-mono text-blue-300">{vaultDocs.length} saved</span>
              </div>
              <label className="block text-xs text-slate-400">Evidence category
                <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as typeof uploadCategory)} className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-white">
                  <option value="legal_tax">Legal / Tax</option>
                  <option value="license_permit">License / Permit</option>
                  <option value="vendor_quote">Vendor Quote</option>
                  <option value="financial">Financial</option>
                </select>
              </label>
              <label className="block text-xs text-slate-400">Upload file
                <input type="file" aria-label="Upload evidence" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileUpload} className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white" />
              </label>
              {vaultDocs.length === 0 && <p className="text-xs text-slate-400">No evidence uploaded yet.</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {vaultDocs.map((doc) => <Button key={doc.id} variant="ghost" size="sm" className="max-w-full whitespace-normal text-left justify-start" onClick={() => setViewing(doc)}>{doc.name}</Button>)}
              </div>
            </section>
          </section>

          <section className={cockpitView === "Tracker" ? "space-y-4 min-w-0" : "hidden"}>
            <div><h2 className="text-lg font-bold">Application tracker</h2><p className="text-xs text-slate-400">Track drafts and record external submissions; AutoGrant does not submit to funder portals.</p></div>
            <ApplicationTracker proposals={proposals} onStatusChange={async (id, status, confirmation) => {
              const persistedStatus = status === "submitted" ? `submitted${confirmation ? `::${confirmation}` : ""}` : "draft";
              const { error } = await supabase.from("applications").update({ status: persistedStatus }).eq("id", id);
              if (error) setStatusMessage("Status could not be saved.");
              else {
                setStatusMessage(status === "submitted" ? "Submission confirmation saved." : "Application moved back to draft.");
                await reloadWorkspace();
              }
            }} />
          </section>

          <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
        </div>
      </main>
      {selectedGrant && (
        <ProposalStudio
          grant={selectedGrant}
          voiceCalibrated={false}
          availableEvidenceIds={vaultDocs.flatMap((doc) => [doc.slotKey, doc.categoryTag].filter((value): value is string => !!value))}
          vaultAttachments={vaultDocs.flatMap((doc) => doc.storagePath ? [{ fileName: doc.name, storagePath: doc.storagePath }] : [])}
          onClose={() => setSelectedGrant(null)}
          onSaved={() => void reloadWorkspace()}
        />
      )}
    </div>
  );
}

function ReadinessItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-300">{label}</span>
      <span className={ready ? "text-emerald-400" : "text-amber-400"}>{ready ? "✓" : "!"}</span>
    </div>
  );
}
