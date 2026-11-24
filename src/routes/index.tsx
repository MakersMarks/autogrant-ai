// src/routes/index.tsx
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationTracker } from '../components/ApplicationTracker';
import { AuthModal } from '../components/AuthModal';
import { deleteVaultDocument, processDocumentUpload } from '../lib/vault';
import { Grant, type UnifiedGrant } from '../lib/grants';
import { LiveGrantsFeed } from '@/components/autogrant/LiveGrantsFeed';
import { applicationToProposal } from '../lib/autopilot';
import { useServerFn } from '@tanstack/react-start';
import type { Session } from '@supabase/supabase-js';
import { saveIntake, updateApplicationStatus } from '@/lib/ai/ai.functions';
import { IntakeStudio } from '@/components/autogrant/IntakeStudio';
import { DocumentViewer } from '@/components/autogrant/DocumentViewer';
import type { Intake } from '@/lib/ai/proposal-policy';
import { Button } from '@/components/ui/button';
import { supabase } from '../integrations/supabase/client';
import { VaultDocument, ProposalDraft, EntityType } from '../lib/types';
import { ProposalStudio } from '@/components/autogrant/ProposalStudio';
import { BudgetBuilder } from '@/components/autogrant/BudgetBuilder';
import type { LiveGrant } from '@/lib/grants-gov/rules';
import { getIndustryDocumentRequirements } from '@/lib/compliance/industry-documents';
import { evaluateAutopilotGate } from '@/lib/grants-gov/scoring';
import { CopilotDrawer } from '@/components/autogrant/CopilotDrawer';
import { Onboarding, type ProfileInput } from '@/components/autogrant/Onboarding';
import type { CopilotAction } from '@/lib/ai/ai.functions';

export interface LinkedBusinessBankAccount {
  connected: boolean;
  provider: 'manual' | 'plaid_ready';
  institutionName: string;
  accountType: 'checking' | 'savings';
  mask: string;
  routingLast4: string;
  lastSyncedAt: string | null;
}

export interface BankDepositRecord {
  id: string;
  amount: number;
  sourceLabel: string;
  postedAt: string;
  matchedApplicationId?: string;
}

const DEFAULT_BANK_ACCOUNT: LinkedBusinessBankAccount = {
  connected: false,
  provider: 'plaid_ready',
  institutionName: '',
  accountType: 'checking',
  mask: '',
  routingLast4: '',
  lastSyncedAt: null,
};

function parseAmountNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(cleaned) && cleaned > 0 ? cleaned : 0;
}

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
  const [voiceProfile, setVoiceProfile] = useState('');
  const [viewing, setViewing] = useState<VaultDocument | null>(null);
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);
  const [uploadCategory, setUploadCategory] = useState<"legal_tax" | "license_permit" | "vendor_quote" | "financial">("legal_tax");
  const [uploadSlotKey, setUploadSlotKey] = useState("");
  const persistIntake = useServerFn(saveIntake);
  const persistApplicationStatus = useServerFn(updateApplicationStatus);
  const [copilotQuestion, setCopilotQuestion] = useState<{ id: number; text: string } | undefined>();
  const activeProject = intake?.project_name || 'No project specified';
  const [fundingGoal, setFundingGoal] = useState<number>(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');

  const [bankAccount, setBankAccount] = useState<LinkedBusinessBankAccount>(DEFAULT_BANK_ACCOUNT);
  const [bankDeposits, setBankDeposits] = useState<BankDepositRecord[]>([]);
  const [syncingBank, setSyncingBank] = useState(false);

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
  const [cockpitView, setCockpitView] = useState<'Dashboard' | 'Profile' | 'Grants' | 'Budget' | 'Vault' | 'Tracker' | 'Studio' | 'Settings'>('Dashboard');
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsEmail, setSettingsEmail] = useState("");
  const [settingsPhone, setSettingsPhone] = useState("");
  const [settingsProjectName, setSettingsProjectName] = useState("");
  const [settingsLocation, setSettingsLocation] = useState("");
  const [settingsFundingGoal, setSettingsFundingGoal] = useState("");
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

  const persistBankState = useCallback(
    async (nextAccount: LinkedBusinessBankAccount, nextDeposits: BankDepositRecord[]) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('autogrant.bankAccount', JSON.stringify(nextAccount));
        window.localStorage.setItem('autogrant.bankDeposits', JSON.stringify(nextDeposits));
      }
      if (userSession) {
        await supabase.auth.updateUser({
          data: {
            business_bank_account: nextAccount,
            business_bank_deposits: nextDeposits,
          },
        }).catch(() => undefined);
      }
    },
    [userSession],
  );

  const linkBusinessBankAccount = useCallback(
    async (details: Omit<LinkedBusinessBankAccount, 'connected' | 'lastSyncedAt'>) => {
      const updated: LinkedBusinessBankAccount = {
        ...details,
        connected: Boolean(details.institutionName.trim() && details.mask.trim()),
        lastSyncedAt: new Date().toISOString(),
      };
      setBankAccount(updated);
      await persistBankState(updated, bankDeposits);
      setStatusMessage(
        updated.connected
          ? `Linked ${updated.institutionName} (${updated.accountType} ••••${updated.mask}).`
          : 'Saved bank profile details.',
      );
    },
    [bankDeposits, persistBankState],
  );

  const recordBankDeposit = useCallback(
    async (input: { amount: number; sourceLabel: string; matchedApplicationId?: string }) => {
      if (!Number.isFinite(input.amount) || input.amount <= 0) return;
      const newRecord: BankDepositRecord = {
        id: crypto.randomUUID(),
        amount: input.amount,
        sourceLabel: input.sourceLabel.trim() || 'Grant Deposit',
        postedAt: new Date().toISOString(),
        ...(input.matchedApplicationId ? { matchedApplicationId: input.matchedApplicationId } : {}),
      };
      const updatedDeposits = [newRecord, ...bankDeposits];
      const updatedAccount: LinkedBusinessBankAccount = {
        ...bankAccount,
        lastSyncedAt: new Date().toISOString(),
      };
      setBankDeposits(updatedDeposits);
      setBankAccount(updatedAccount);
      await persistBankState(updatedAccount, updatedDeposits);
      setStatusMessage(
        `Recorded $${input.amount.toLocaleString()} deposit (${newRecord.sourceLabel}) and updated awarded funds.`,
      );
    },
    [bankAccount, bankDeposits, persistBankState],
  );

  const bankContextSummary = useMemo(() => {
    const parts: string[] = [];
    if (bankAccount.institutionName || bankAccount.mask) {
      parts.push(
        `Bank: ${bankAccount.institutionName || 'Unspecified'} (${bankAccount.accountType}, ending in ${bankAccount.mask || 'N/A'}, routing last 4: ${bankAccount.routingLast4 || 'N/A'}, status: ${bankAccount.connected ? 'Linked' : 'Unlinked'})`,
      );
    }
    if (bankDeposits.length > 0) {
      parts.push(
        `Recorded deposits: ${bankDeposits
          .map((d) => `$${d.amount.toLocaleString()} from "${d.sourceLabel}" (${new Date(d.postedAt).toLocaleDateString()})`)
          .join('; ')}`,
      );
    }
    return parts.join(' | ');
  }, [bankAccount, bankDeposits]);

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

    const metaBank = authData.user?.user_metadata?.['business_bank_account'] as LinkedBusinessBankAccount | undefined;
    const metaDeposits = authData.user?.user_metadata?.['business_bank_deposits'] as BankDepositRecord[] | undefined;
    if (metaBank) {
      setBankAccount({ ...DEFAULT_BANK_ACCOUNT, ...metaBank });
    } else if (typeof window !== 'undefined') {
      const rawBank = window.localStorage.getItem('autogrant.bankAccount');
      if (rawBank) {
        try {
          setBankAccount({ ...DEFAULT_BANK_ACCOUNT, ...JSON.parse(rawBank) });
        } catch {
          setBankAccount(DEFAULT_BANK_ACCOUNT);
        }
      }
    }
    if (Array.isArray(metaDeposits)) {
      setBankDeposits(metaDeposits);
    } else if (typeof window !== 'undefined') {
      const rawDeposits = window.localStorage.getItem('autogrant.bankDeposits');
      if (rawDeposits) {
        try {
          const parsed = JSON.parse(rawDeposits);
          if (Array.isArray(parsed)) setBankDeposits(parsed);
        } catch {
          setBankDeposits([]);
        }
      }
    }

    if (profile) {
      setIntake({ project_name: profile.project_name, industry: profile.industry, lifecycle_stage: profile.lifecycle_stage, sector_code: profile.sector_code, entity_type: profile.entity_type, funding_goal: profile.funding_goal, demographics: profile.demographics, location: profile.location, funding_purpose: profile.funding_purpose });
      setShowQuestionnaire(profile.onboarded !== true);
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
      setVoiceProfile(profile.voice_profile ?? "");
      setSettingsEmail(profile.email ?? "");
      setSettingsProjectName(profile.project_
