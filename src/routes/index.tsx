// src/routes/index.tsx
import React, { useCallback, useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationTracker } from '../components/ApplicationTracker';
import { AuthModal } from '../components/AuthModal';
import { deleteVaultDocument, processDocumentUpload } from '../lib/vault';
import { Grant, OFFICIAL_SECTORS, type UnifiedGrant } from '../lib/grants';
import { LiveGrantsFeed } from '@/components/autogrant/LiveGrantsFeed';
import { applicationToProposal } from '../lib/autopilot';
import { useServerFn } from '@tanstack/react-start';
import type { Session } from '@supabase/supabase-js';
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
import { evaluateAutopilotGate } from '@/lib/grants-gov/scoring';
import { CopilotDrawer } from '@/components/autogrant/CopilotDrawer';
import type { CopilotAction } from '@/lib/ai/ai.functions';

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
  const [userSession, setUserSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>('BC');
  const [entityType, setEntityType] = useState<EntityType>('Established Operating Business');
  const [businessStage, setBusinessStage] = useState<'pre_launch' | 'established'>(() => {
    if (typeof window === 'undefined') return 'established';
    return window.localStorage.getItem('autogrant.businessStage') === 'pre_launch' ? 'pre_launch' : 'established';
  });
  const [intake, setIntake] = useState<Intake | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [summary, setSummary] = useState('');
  const [viewing, setViewing] = useState<VaultDocument | null>(null);
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);
  const [uploadCategory, setUploadCategory] = useState<"legal_tax" | "license_permit" | "vendor_quote" | "financial">("legal_tax");
  const [uploadSlotKey, setUploadSlotKey] = useState("");
  const persistIntake = useServerFn(saveIntake);
  const activeProject = intake?.project_name || 'No project specified';
  const [fundingGoal, setFundingGoal] = useState<number>(0);
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
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [cockpitView, setCockpitView] = useState<'Dashboard' | 'Profile' | 'Grants' | 'Vault' | 'Tracker' | 'Settings'>('Dashboard');
  const [settingsName, setSettingsName] = useState("");
  const [settingsEmail, setSettingsEmail] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [showAutopilotGate, setShowAutopilotGate] = useState(false);
  const [gateProjectName, setGateProjectName] = useState("");
  const [savingGateProject, setSavingGateProject] = useState(false);
  const [deletingVaultId, setDeletingVaultId] = useState<string | null>(null);
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
  const autopilotGate = evaluateAutopilotGate({
    projectName: intake?.project_name ?? "",
    evidence: vaultDocs.map((doc) => ({ slotKey: doc.slotKey ?? "" })),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserSession(session);
      if (session) setShowAuth(false);
    });


    return () => subscription.unsubscribe();
  }, []);

  const reloadWorkspace = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setStatusMessage(`Could not verify the current user while reloading: ${authError.message}`);
      return;
    }
    const [profileResult, documentsResult, applicationsResult] = await Promise.all([
      supabase.from('profiles').select('*').maybeSingle(),
      supabase.from('vault_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('applications').select('*').order('created_at', { ascending: false }),
    ]);
    const loadErrors = [profileResult.error, documentsResult.error, applicationsResult.error].filter(Boolean);
    if (loadErrors.length) {
      setStatusMessage(`Workspace could not be fully loaded: ${loadErrors.map((error) => error?.message).join("; ")}`);
      return;
    }
    const profile = profileResult.data;
    const documents = documentsResult.data;
    const applications = applicationsResult.data;
    if (profile) {
      setIntake({ project_name: profile.project_name, industry: profile.industry, lifecycle_stage: profile.lifecycle_stage, sector_code: profile.sector_code, entity_type: profile.entity_type, funding_goal: profile.funding_goal, demographics: profile.demographics, location: profile.location, funding_purpose: profile.funding_purpose });
      setSelectedSector(profile.sector_code);
      setEntityType(profile.entity_type as EntityType);
      const persistedStage =
        authData.user?.user_metadata?.["business_stage"] ??
        window.localStorage.getItem('autogrant.businessStage');
      if (persistedStage === 'pre_launch' || persistedStage === 'established') {
        setBusinessStage(persistedStage);
      } else {
        const stage = profile.entity_type === 'Idea / Pre-Launch Founder' ? 'pre_launch' : 'established';
        setBusinessStage(stage);
        window.localStorage.setItem('autogrant.businessStage', stage);
      }
      setFundingGoal(Number(profile.funding_goal.replace(/[^0-9.]/g, '')) || 0);
      setAutopilot(!!profile.autopilot);
      setSettingsEmail(profile.email ?? "");
    }
    setSettingsName(authData.user?.user_metadata?.["name"] ?? "");
    setNotificationsEnabled(authData.user?.user_metadata?.["notification_opt_in"] === true);
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
  }, []);
  const activeUserId = userSession?.user?.id;
  useEffect(() => {
    setIntake(null); setVaultDocs([]); setProposals([]); setSummary('');
    if (activeUserId) void reloadWorkspace();
  }, [activeUserId, reloadWorkspace]);

  const uploadVaultFile = async (
    file: File,
    options: { categoryTag?: VaultDocument["categoryTag"]; slotKey?: string; autoCategorize?: boolean } = {},
  ) => {
    try {
      setStatusMessage(`Uploading ${file.name} (Max 15MB)...`);
      const categoryTag = options.autoCategorize ? options.categoryTag : options.categoryTag ?? uploadCategory;
      const doc = await processDocumentUpload(file, {
        ...(categoryTag ? { categoryTag } : {}),
        ...(selectedGrant?.id ? { grantId: selectedGrant.id } : {}),
        ...(options.slotKey ? { slotKey: options.slotKey } : uploadSlotKey ? { slotKey: uploadSlotKey } : {}),
      });
      setVaultDocs((prev) => [doc, ...prev]);
      setStatusMessage(doc.metadataWarning ? `${doc.metadataWarning} Saved: ${doc.name}` : `Saved successfully: ${doc.name}`);
      return true;
    } catch (err) {
      setStatusMessage(`Upload error: ${err instanceof Error ? err.message : "Unknown upload error."}`);
      return false;
    }
  };
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadVaultFile(file);
    e.target.value = "";
  };

  const enableAutopilot = async () => {
    if (!autopilotGate.allowed) {
      setGateProjectName(intake?.project_name ?? "");
      setShowAutopilotGate(true);
      return;
    }
    if (!userSession) { setShowAuth(true); return; }
    const { error } = await supabase.from("profiles").update({ autopilot: true }).eq("id", userSession.user.id);
    if (error) { setStatusMessage(`Could not enable Autopilot: ${error.message}`); return; }
    setAutopilot(true);
    setStatusMessage("Autopilot preference enabled. Applications still require your review and portal submission.");
  };

  const saveGateProjectName = async () => {
    const projectName = gateProjectName.trim();
    if (!projectName || !userSession) {
      setStatusMessage("Enter a Project Name and sign in before saving.");
      return;
    }
    setSavingGateProject(true);
    const { error } = await supabase.from("profiles")
      .update({ project_name: projectName, updated_at: new Date().toISOString() })
      .eq("id", userSession.user.id);
    setSavingGateProject(false);
    if (error) { setStatusMessage(`Project Name could not be saved: ${error.message}`); return; }
    setIntake((current) => current ? { ...current, project_name: projectName } : current);
    setStatusMessage("Project Name saved.");
  };

  const saveSettings = async () => {
    if (!userSession) { setShowAuth(true); return; }
    setSettingsSaving(true);
    const { error: emailError } = await supabase.from("profiles")
      .update({ email: settingsEmail.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", userSession.user.id);
    if (emailError) {
      setSettingsSaving(false);
      setStatusMessage(`Notification email could not be saved: ${emailError.message}`);
      return;
    }
    const { data, error: metadataError } = await supabase.auth.updateUser({
      data: { name: settingsName.trim(), notification_opt_in: notificationsEnabled },
    });
    setSettingsSaving(false);
    if (metadataError) {
      setStatusMessage(`Notification email was saved, but name/preferences were not: ${metadataError.message}`);
      return;
    }
    if (data.user) setUserSession((current) => current ? { ...current, user: data.user } : current);
    setStatusMessage("Settings saved. Notification opt-in is recorded, but email alerts are not currently sent by AutoGrant.");
  };

  const deleteDocument = async (doc: VaultDocument) => {
    if (!window.confirm(`Permanently delete "${doc.name}" from your Vault?`)) return;
    setDeletingVaultId(doc.id);
    try {
      await deleteVaultDocument(doc);
      const remaining = vaultDocs.filter((item) => item.id !== doc.id);
      setVaultDocs(remaining);
      if (viewing?.id === doc.id) setViewing(null);
      const remainingGate = evaluateAutopilotGate({
        projectName: intake?.project_name ?? "",
        evidence: remaining.map((item) => ({ slotKey: item.slotKey ?? "" })),
      });
      if (autopilot && !remainingGate.allowed && userSession) {
        setAutopilot(false);
        const { error } = await supabase.from("profiles").update({ autopilot: false }).eq("id", userSession.user.id);
        if (error) setStatusMessage(`Document deleted, but Autopilot could not be locked in storage: ${error.message}`);
        else setStatusMessage(`Deleted ${doc.name}. Autopilot is locked until you restore: ${remainingGate.missing.join(", ")}.`);
      } else {
        setStatusMessage(`Deleted ${doc.name} from your Vault.`);
      }
    } catch (error) {
      setStatusMessage(`Could not delete ${doc.name}: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setDeletingVaultId(null);
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

  const totalAwarded = 0;
  const remainingNeeded = Math.max(fundingGoal - totalAwarded, 0);
  const fundingProgress = fundingGoal > 0 ? Math.min(Math.round((totalAwarded / fundingGoal) * 100), 100) : 0;

  return (
    <div className="operator-workspace min-h-screen bg-slate-950 text-white p-4 sm:p-6 font-sans space-y-6">
      {showAuth && <AuthModal onSuccess={() => setShowAuth(false)} onClose={() => setShowAuth(false)} />}
      {showAutopilotGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="autopilot-gate-title">
          <section className="w-full max-w-lg space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="autopilot-gate-title" className="text-lg font-bold">Autopilot readiness</h2>
                <p className="mt-1 text-xs text-slate-400">Before enabling, add a Project Name, Photo ID, and at least one Vault document.</p>
              </div>
              <button type="button" aria-label="Close Autopilot readiness" onClick={() => setShowAutopilotGate(false)} className="rounded border border-slate-700 px-2 py-1 text-sm">Close</button>
            </div>
            <ul className="space-y-1 text-xs">
              {["Project Name", "Photo ID", "Vault document"].map((item) => {
                const missing = autopilotGate.missing.includes(item);
                return <li key={item} className={missing ? "text-amber-300" : "text-emerald-300"}>{missing ? "○" : "✓"} {item}{missing ? " — needed" : " — ready"}</li>;
              })}
            </ul>
            {autopilotGate.missing.includes("Project Name") && (
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <label htmlFor="gate-project-name" className="block text-xs text-slate-300">Project Name</label>
                <div className="flex gap-2">
                  <input id="gate-project-name" value={gateProjectName} onChange={(event) => setGateProjectName(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                  <Button onClick={() => void saveGateProjectName()} disabled={savingGateProject || !gateProjectName.trim()}>{savingGateProject ? "Saving…" : "Save"}</Button>
                </div>
              </div>
            )}
            {autopilotGate.missing.includes("Photo ID") && (
              <label className="flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-600 px-3 py-3 text-xs hover:border-emerald-500">
                Upload Photo ID
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadVaultFile(file, { categoryTag: "legal_tax", slotKey: "photo_id" });
                    event.target.value = "";
                  }}
                />
              </label>
            )}
            {autopilotGate.missing.includes("Vault document") && (
              <label className="flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-600 px-3 py-3 text-xs hover:border-emerald-500">
                Upload a Vault document
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadVaultFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <Button variant="outline" onClick={() => setShowAutopilotGate(false)}>Cancel</Button>
              <Button disabled={!autopilotGate.allowed} onClick={() => { setShowAutopilotGate(false); void enableAutopilot(); }}>
                {autopilotGate.allowed ? "Enable Autopilot" : "Complete required items"}
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">Autopilot does not submit applications to funder portals. Review every draft and submit it yourself.</p>
          </section>
        </div>
      )}

      {/* Header & Workspace Bar */}
      <header className="border-b border-slate-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            AutoGrant AI <span className="text-xs font-mono bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800">v2.6 Secure Live</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {businessStage === 'pre_launch'
              ? 'Pre-Launch · prototype, seed, local innovation, and foundational setup'
              : 'Established · scale-up, equipment, matching, compliance, and capital allocation'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-1">
            <button
              type="button"
              aria-pressed={!autopilot}
              onClick={async () => {
                if (userSession) {
                  const { error } = await supabase.from("profiles").update({ autopilot: false }).eq("id", userSession.user.id);
                  if (error) { setStatusMessage(`Could not disable Autopilot: ${error.message}`); return; }
                }
                setAutopilot(false);
              }}
              className={`px-2.5 py-1.5 rounded text-xs font-bold ${!autopilot ? "bg-slate-700 text-white" : "text-slate-400"}`}
            >
              Manual
            </button>
            <button
              type="button"
              aria-pressed={autopilot}
              onClick={() => void enableAutopilot()}
              className={`px-2.5 py-1.5 rounded text-xs font-bold ${autopilot ? "bg-emerald-600 text-white" : "text-slate-400"}`}
            >
              Auto
            </button>
          </div>
          <span className="hidden text-[10px] text-slate-400 xl:inline">Auto mode is a saved preference; applications are never submitted automatically.</span>
          <select
            value={entityType}
            onChange={(e) => {
              const next = e.target.value as EntityType;
              const stage: 'pre_launch' | 'established' =
                next === 'Idea / Pre-Launch Founder' ? 'pre_launch' : 'established';
              setEntityType(next);
              setBusinessStage(stage);
              window.localStorage.setItem('autogrant.businessStage', stage);
              if (userSession) {
                void supabase.auth.updateUser({ data: { business_stage: stage } }).catch(() => undefined);
              }
            }}
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

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 sm:grid-cols-5" aria-label="Funding summary">
        <div><p className="text-[10px] uppercase text-slate-400">Stage</p><p className="text-xs font-bold">{businessStage === 'pre_launch' ? 'Pre-Launch' : 'Established'}</p></div>
        <div><p className="text-[10px] uppercase text-slate-400">Funding Goal</p><p className="text-xs font-bold">${fundingGoal.toLocaleString()}</p></div>
        <div><p className="text-[10px] uppercase text-slate-400">Awarded</p><p className="text-xs font-bold">$0</p></div>
        <div><p className="text-[10px] uppercase text-slate-400">Remaining</p><p className="text-xs font-bold">${remainingNeeded.toLocaleString()}</p></div>
        <div><p className="text-[10px] uppercase text-slate-400">Progress</p><p className="text-xs font-bold">{fundingProgress}%</p></div>
      </div>

      <main className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-4 items-start">
        <nav aria-label="Workspace pages" className="operator-rail md:sticky md:top-4 flex md:min-h-[calc(100vh-3rem)] md:flex-col gap-2 overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl p-2">
          {([
            ["Dashboard", "Overview & Grants"],
            ["Profile", "Intake"],
            ["Grants", "Grants"],
            ["Vault", "Smart Vault"],
            ["Tracker", "Proposals"],
            ["Settings", "Tippie Studio"],
          ] as const).map(([view, label]) => (
            <button
              key={view}
              type="button"
              aria-current={cockpitView === view ? "page" : undefined}
              onClick={() => setCockpitView(view)}
              className={`shrink-0 md:w-full px-3 py-3 rounded-lg text-left text-xs font-bold transition ${view === "Settings" ? "md:mt-auto" : ""} ${cockpitView === view ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            >
              {label}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase">Active funding project</p>
                <p className="text-sm font-bold text-blue-400 truncate">{activeProject}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase">Verified awarded funds</p>
                <p className="text-lg font-mono font-bold text-emerald-400">${totalAwarded.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase">Remaining needed</p>
                <p className="text-lg font-mono font-bold text-slate-100">${remainingNeeded.toLocaleString()}</p>
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
              <p className="text-[11px] text-slate-400">Submitted grant requests are not counted as awards. This account does not yet store verified award amounts, so awarded funds remain $0 and progress is not evidence of funding received.</p>
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
              profile={intake ? {
                sector: intake.sector_code,
                projectName: intake.project_name,
                industry: intake.industry,
                lifecycleStage: intake.lifecycle_stage,
                location: intake.location,
                entityType: intake.entity_type,
                fundingPurpose: intake.funding_purpose,
                fundingGoal: intake.funding_goal,
                demographics: intake.demographics,
              } : undefined}
              evidence={vaultDocs.map((doc) => ({
                slotKey: doc.slotKey ?? "",
                ...(doc.categoryTag ? { categoryTag: doc.categoryTag } : {}),
                ...(doc.grantId ? { grantId: doc.grantId } : {}),
              }))}
              signedIn={!!userSession}
              enabled={intakeComplete}
              drafting={drafting}
              onDraft={(g) => {
                if ("agency" in g) {
                  const federal = g as LiveGrant;
                  void handleDraftProposal({ id: federal.id, title: federal.title, funder: federal.agency, amount: federal.awardCeiling ? `Up to $${federal.awardCeiling.toLocaleString("en-US")}` : "Not listed", fit: "", tier: "[Federal]", categoryCode: selectedSector, eligibilityReason: `Grants.gov ${federal.number}. Eligible: ${federal.eligibility.join("; ") || "see listing"}. Closes ${federal.closeDate}.`.slice(0, 500), deadline: federal.closeDate, officialUrl: federal.url });
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
                    officialUrl: pool.directApplyUrl,
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
                {vaultDocs.map((doc) => (
                  <div key={doc.id} className="flex min-w-0 items-center gap-2 rounded border border-slate-800 bg-slate-950 p-2">
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-xs text-slate-200 hover:text-emerald-300" onClick={() => setViewing(doc)}>{doc.name}</button>
                    <button
                      type="button"
                      aria-label={`Delete ${doc.name}`}
                      disabled={deletingVaultId === doc.id}
                      onClick={() => void deleteDocument(doc)}
                      className="shrink-0 rounded border border-red-900 px-2 py-1 text-[10px] text-red-300 hover:bg-red-950 disabled:opacity-50"
                    >
                      {deletingVaultId === doc.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                ))}
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

          <section className={cockpitView === "Settings" ? "space-y-4" : "hidden"}>
            <div>
              <h2 className="text-lg font-bold">Settings</h2>
              <p className="text-xs text-slate-400">Save your display name and the email address to use for future notifications.</p>
            </div>
            <form className="max-w-2xl space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-4" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
              <label className="block space-y-1 text-xs">
                <span>Name</span>
                <input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} maxLength={120} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
              </label>
              <label className="block space-y-1 text-xs">
                <span>Notification email</span>
                <input type="email" value={settingsEmail} onChange={(event) => setSettingsEmail(event.target.value)} maxLength={254} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} />
                <span>Opt in to future AutoGrant email alerts. AutoGrant does not currently send these alerts.</span>
              </label>
              <Button type="submit" disabled={settingsSaving || !userSession}>{settingsSaving ? "Saving…" : "Save settings"}</Button>
              {!userSession && <p className="text-xs text-amber-600">Sign in to save settings.</p>}
            </form>
          </section>

          <DocumentViewer
            doc={viewing}
            onClose={() => setViewing(null)}
            onSaved={(id, size) => setVaultDocs((current) => current.map((doc) => doc.id === id ? { ...doc, size } : doc))}
          />
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
      <CopilotDrawer
        onUploadFile={(file) => {
          const name = file.name.toLowerCase();
          const options = /photo.?id|passport|driver.?license/.test(name)
            ? { categoryTag: "legal_tax" as const, slotKey: "photo_id" }
            : /permit|license|inspection/.test(name)
              ? { categoryTag: "license_permit" as const, slotKey: "license_permit" }
              : /quote|vendor|estimate/.test(name)
                ? { categoryTag: "vendor_quote" as const, slotKey: "vendor_quote" }
                : /financial|statement|tax|balance/.test(name)
                  ? { categoryTag: "financial" as const, slotKey: "financial" }
                  : { slotKey: `chat-upload-${crypto.randomUUID()}`, autoCategorize: true };
          return uploadVaultFile(file, options);
        }}
        onActionComplete={(action: Exclude<CopilotAction, { type: "none" }>) => {
          if (action.type === "search_grants") setCockpitView("Grants");
          if (action.type === "delete_vault_file" && viewing?.id === action.documentId) setViewing(null);
          setStatusMessage("AutoGrant Agent action completed and saved.");
          void reloadWorkspace();
        }}
      />
      <button type="button" onClick={() => setCockpitView("Settings")} className="fixed bottom-4 right-36 z-30 rounded border border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-800 shadow-lg">
        Settings
      </button>
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
