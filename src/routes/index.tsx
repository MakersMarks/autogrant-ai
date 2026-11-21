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
  const [cockpitView, setCockpitView] = useState<'Dashboard' | 'Vault' | 'Feed' | 'Tracker'>('Dashboard');
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
      categoryTag: d.category_tag ?? undefined,
      grantId: d.grant_id ?? undefined,
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
          grantId: selectedGrant?.id,
          slotKey: uploadSlotKey || undefined,
        });
        setVaultDocs((prev) => [doc, ...prev]);
        setStatusMessage(`Saved successfully: ${doc.name}`);
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
          {editingGoal ? (
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void saveGoal(); }}>
              <input autoFocus aria-label="Funding goal" inputMode="numeric" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-white" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value.replace(/\D/g, ''))} onBlur={() => void saveGoal()} />
            </form>
          ) : (
            <button type="button" title="Click to edit" onClick={() => { setGoalDraft(String(fundingGoal || '')); setEditingGoal(true); }} className="text-lg font-mono font-bold text-white hover:underline decoration-dotted">${fundingGoal.toLocaleString()} <span className="text-[10px] text-slate-400 font-sans">edit</span></button>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
          <p className="text-[11px] font-mono text-slate-400 uppercase">Goal Progress ({fundingProgress}%)</p>
          <div className="w-full bg-slate-950 rounded-full h-2 mt-2 border border-slate-800 overflow-hidden">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${fundingProgress}%` }}></div>
          </div>
        </div>
      </section>

      {intake && <IntakeStudio initial={{ ...intake, sector_code: selectedSector, entity_type: entityType }} onSaved={(value) => { setIntake(value); setFundingGoal(Number(value.funding_goal.replace(/[^0-9.]/g, '')) || 0); setStatusMessage('Intake saved.'); }} onError={setStatusMessage} onSummary={(text) => { setSummary(text); setStatusMessage('Executive summary saved to your private Vault.'); void reloadWorkspace(); }} />}
      {!intakeComplete && (
        <section role="alert" className="border border-amber-700 bg-amber-950/40 rounded-xl p-4 text-xs text-amber-200">
          Complete these profile fields before drafting: {profileMissingFields.join(", ")}.
        </section>
      )}
      {summary && <section className="border-b border-border py-4"><h2 className="text-lg font-semibold text-foreground">Executive summary</h2><pre className="whitespace-pre-wrap text-sm text-foreground">{summary}</pre></section>}
      <main id="cockpit" className="grid grid-cols-1 md:grid-cols-[92px_minmax(240px,0.7fr)_minmax(420px,1.35fr)_minmax(300px,0.85fr)] gap-4 items-start">
        <aside className="md:sticky md:top-4 bg-slate-900 border border-slate-800 rounded-xl p-2 space-y-2">
          {(["Dashboard", "Vault", "Feed", "Tracker"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={cockpitView === view}
              onClick={() => {
                setCockpitView(view);
                const target = view === "Vault" ? "cockpit-vault" : view === "Feed" ? "cockpit-feed" : view === "Tracker" ? "cockpit-tracker" : "cockpit";
                document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`w-full px-2 py-3 rounded-lg text-[11px] font-bold transition ${cockpitView === view ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            >
              {view}
            </button>
          ))}
        </aside>

        <aside id="cockpit-readiness" className="md:sticky md:top-4 space-y-4">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-500">Column 1</p>
              <h2 className="text-base font-bold">Grant Readiness</h2>
            </div>
            <div className="space-y-2">
              <ReadinessItem label="Profile complete" ready={intakeComplete} />
              <ReadinessItem label="Legal / tax evidence" ready={vaultDocs.some((doc) => doc.categoryTag === "legal_tax")} />
              <ReadinessItem label="Vendor quotes" ready={vaultDocs.some((doc) => doc.categoryTag === "vendor_quote")} />
              <ReadinessItem label="Budget grid" ready={false} />
            </div>
            {intake && (
              <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
                <p className="text-slate-400">Funder checklist</p>
                {getIndustryDocumentRequirements(intake.industry, intake.entity_type).map((requirement) => (
                  <ReadinessItem
                    key={requirement.key}
                    label={requirement.name}
                    ready={vaultDocs.some((doc) => doc.slotKey === requirement.key)}
                  />
                ))}
              </div>
            )}
          </section>
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sector</h3>
            <div className="flex flex-wrap gap-1.5">
              {OFFICIAL_SECTORS.map((sec) => (
                <button
                  key={sec.code}
                  type="button"
                  onClick={() => setSelectedSector(sec.code)}
                  className={`text-[10px] px-2 py-1.5 rounded border ${selectedSector === sec.code ? "border-blue-500 bg-blue-950 text-blue-300" : "border-slate-700 text-slate-400"}`}
                >
                  {sec.code}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => document.querySelector('[aria-label="State of headquarters"]')?.scrollIntoView({ behavior: "smooth" })} className="w-full py-2 rounded-lg border border-slate-700 text-xs text-slate-300">
              Edit profile
            </button>
          </section>
        </aside>

        <section id="cockpit-feed" className="space-y-4 min-w-0">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500">Column 2</p>
                <h2 className="text-base font-bold">Active Proposal Studio</h2>
              </div>
              {selectedGrant && (
                <button type="button" onClick={() => setSelectedGrant(selectedGrant)} className="px-3 py-2 rounded-lg bg-blue-600 text-xs font-bold">
                  Open Editor
                </button>
              )}
            </div>
            {selectedGrant ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[["Section 1", "Need"], ["Section 2", "Plan"], ["Section 3", "Evaluation"]].map(([section, label]) => (
                  <button key={section} type="button" onClick={() => setSelectedGrant(selectedGrant)} className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-left">
                    <span className="block text-[10px] text-slate-500">{section}</span>
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Choose a matched grant to open the proposal editor.</p>
            )}
          </section>
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
                void handleDraftProposal({ id: pool.id, title: pool.title, funder: pool.funderName, amount: pool.awardCeiling ? `$${pool.awardFloor.toLocaleString("en-US")} - $${pool.awardCeiling.toLocaleString("en-US")}` : "Not listed", fit: "", tier: `[${pool.poolTier === "state_territory" ? "State" : pool.poolTier === "corporate_diversity" ? "Corporate" : "Foundation"}]`, categoryCode: selectedSector, eligibilityReason: pool.summaryText, deadline: pool.isRolling ? "Rolling" : pool.deadline });
              }
            }}
          />
        </section>

        <aside id="cockpit-tracker" className="space-y-4 min-w-0">
          <section id="cockpit-vault" className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500">Column 3</p>
                <h2 className="text-base font-bold">Evidence Vault</h2>
              </div>
              <span className="text-[10px] font-mono text-blue-300">{vaultDocs.length} saved</span>
            </div>
            <input
              type="file"
              aria-label="Upload evidence"
              accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white"
            />
            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs text-slate-400">Evidence category
                <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as typeof uploadCategory)} className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white">
                  <option value="legal_tax">Legal / Tax</option>
                  <option value="license_permit">License / Permit</option>
                  <option value="vendor_quote">Vendor Quote</option>
                  <option value="financial">Financial</option>
                </select>
              </label>
            </div>
            {vaultDocs.map((doc) => <Button key={doc.id} variant="ghost" size="sm" className="max-w-full whitespace-normal text-left" onClick={() => setViewing(doc)}>{doc.name}</Button>)}
            {statusMessage && (
              <p role={/error|could not|failed|complete/i.test(statusMessage) ? "alert" : "status"} className={`text-xs p-2.5 rounded-lg border ${/error|could not|failed|complete/i.test(statusMessage) ? "text-red-400 border-red-800" : "text-emerald-400 border-slate-800"}`}>{statusMessage}</p>
            )}
          </section>
          <section className="md:max-h-[520px] overflow-y-auto">
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
        </aside>
        <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
      </main>
      {selectedGrant && (
        <ProposalStudio
          grant={selectedGrant}
          voiceCalibrated={false}
          availableEvidenceIds={vaultDocs.map((doc) => doc.slotKey).filter((slot): slot is string => !!slot)}
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
