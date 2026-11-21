import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { draftProposal } from "@/lib/ai/ai.functions";
import { coreDocSlots, generateDailyGrants, sectorName, type Grant } from "@/lib/grants";
import { AuthScreen } from "./AuthScreen";
import { Onboarding, type ProfileInput } from "./Onboarding";
import { Discovery } from "./Discovery";
import { Vault, type VaultDoc } from "./Vault";
import { Tracker, type AppRow } from "./Tracker";
import { Logo } from "./Logo";
import { ProposalStudio } from "./ProposalStudio";
import { getIndustryDocumentRequirements } from "@/lib/compliance/industry-documents";

type Tab = "dashboard" | "discovery" | "vault" | "tracker";

export function AutoGrantApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="min-h-screen bg-background" />;
  if (!session) return <AuthScreen />;
  return <Platform key={session.user.id} userId={session.user.id} />;
}

function Platform({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [deckIndex, setDeckIndex] = useState(0);
  const [selected, setSelected] = useState<Grant | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const draft = useServerFn(draftProposal);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) return setProfile(data);
    const { data: created } = await supabase.from("profiles").insert({ id: userId }).select().single();
    setProfile(created);
  }, [userId]);
  const loadDocs = useCallback(async () => {
    const { data } = await supabase.from("vault_documents").select("id, slot_key, file_name, storage_path");
    setDocs(data ?? []);
  }, []);
  const loadApps = useCallback(async () => {
    const { data } = await supabase.from("applications").select("*").order("created_at", { ascending: false });
    setApps((data ?? []) as AppRow[] & Tables<"applications">[]);
  }, []);

  useEffect(() => { loadProfile(); loadDocs(); loadApps(); }, [loadProfile, loadDocs, loadApps]);

  const grants = useMemo(() => generateDailyGrants(profile?.sector_code ?? "BC"), [profile?.sector_code]);
  const submittedIds = useMemo(() => new Set((apps as (AppRow & { grant_id?: string })[]).map((a) => a.grant_id ?? "")), [apps]);

  const saveApplication = async (g: Grant, text: string, status: string) => {
    const { error } = await supabase.from("applications").insert({ user_id: userId, grant_id: g.id, name: g.title, funder: g.funder, amount: g.amount, narrative: text, status });
    if (error) throw new Error(error.message);
  };

  const openDraft = (g: Grant) => setSelected(g);

  const toggleAutopilot = async () => {
    if (!profile || autoRunning) return;
    const next = !profile.autopilot;
    setProfile({ ...profile, autopilot: next });
    await supabase.from("profiles").update({ autopilot: next }).eq("id", userId);
    if (!next) return;
    const targets = grants.filter((g) => !submittedIds.has(g.id)).slice(0, 3);
    setAutoRunning(true);
    try {
      for (const g of targets) {
        const r = await draft({ data: { title: g.title, funder: g.funder, amount: g.amount, eligibilityReason: g.eligibilityReason } });
        await saveApplication(g, r.narrative, "Auto-Drafted by Autopilot");
      }
      toast.success(`Autopilot drafted ${targets.length} proposals`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Autopilot stopped"); }
    await loadApps();
    setAutoRunning(false);
  };

  if (!profile) return <div className="min-h-screen bg-background" />;

  if (!profile.onboarded) {
    return <Onboarding initial={profile} onComplete={async (p: ProfileInput) => {
      const { data, error } = await supabase.from("profiles").update({
        entity_type: p.entity_type,
        sector_code: p.sector_code,
        industry: p.industry,
        funding_goal: p.funding_goal,
        demographics: p.demographics,
        lifecycle_stage: p.lifecycle_stage,
        location: p.location,
        funding_purpose: p.funding_purpose,
        onboarded: true,
        updated_at: new Date().toISOString(),
      }).eq("id", userId).select().single();
      if (error) {
        toast.error(error.message);
        throw new Error(error.message);
      }
      setProfile(data);
    }} />;
  }

  const slots = coreDocSlots(profile.entity_type);
  const verified = slots.filter((s) => docs.some((d) => d.slot_key === s.key)).length;
  const industryRequirements = getIndustryDocumentRequirements(profile.industry ?? "", profile.entity_type);
  const industryReady = industryRequirements.filter((requirement) => docs.some((doc) => doc.slot_key === requirement.key)).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Inn-Flo Command Center" },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className="w-full md:w-64 bg-card p-6 flex flex-col justify-between border-r border-border">
        <div>
          <div className="mb-8"><Logo small /></div>
          <nav className="space-y-2">
            {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${tab === t.id ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:bg-muted"}`}>{t.label}</button>)}
          </nav>
        </div>
        <div className="pt-6 border-t border-border space-y-3">
          <button onClick={() => supabase.from("profiles").update({ onboarded: false }).eq("id", userId).then(loadProfile)} className="w-full text-xs text-muted-foreground hover:text-foreground">Edit business profile</button>
          <button onClick={() => supabase.auth.signOut()} className="w-full py-2.5 bg-destructive/10 text-destructive font-bold text-xs uppercase rounded-lg border border-destructive/30">Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 p-4 lg:p-6 max-w-[1800px] mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card p-6 rounded-2xl border border-border mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold">Autopilot Engine Switch</h1>
            <p className="text-sm text-muted-foreground">{autoRunning ? "Autopilot is drafting proposals with AI…" : "Automate matching and AI narrative drafting for your top 3 matches."}</p>
          </div>
          <div className="flex items-center gap-4 bg-background px-5 py-3 rounded-xl border border-border">
            <span className={`text-sm font-semibold ${!profile.autopilot ? "" : "text-muted-foreground"}`}>Manual Review</span>
            <button aria-label="Toggle autopilot" disabled={autoRunning} onClick={toggleAutopilot} className={`w-14 h-8 flex items-center rounded-full p-1 transition ${profile.autopilot ? "bg-success justify-end" : "bg-secondary justify-start"}`}>
              <div className="bg-foreground w-6 h-6 rounded-full shadow" />
            </button>
            <span className={`text-sm font-semibold ${profile.autopilot ? "text-success" : "text-muted-foreground"}`}>Autopilot</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(420px,1fr)_340px] gap-5">
          <aside className="space-y-4">
            <div className="bg-card p-5 rounded-xl border border-border">
              <h2 className="text-sm font-display font-bold">Profile &amp; Readiness</h2>
              <div className="mt-4 space-y-3">
                <Stat label="Verified Credentials" value={`${verified} / ${slots.length}`} tone="text-primary" />
                <Stat label="Industry Documents" value={`${industryReady} / ${industryRequirements.length}`} tone="text-success" />
                <Stat label="Applications Queued" value={String(apps.length)} tone="" />
              </div>
              {industryRequirements.length > 0 && (
                <div className="mt-4 border-t border-border pt-4 space-y-2">
                  {industryRequirements.map((requirement) => {
                    const ready = docs.some((doc) => doc.slot_key === requirement.key);
                    return (
                      <div key={requirement.key} className="flex items-center justify-between gap-2 text-xs">
                        <span>{requirement.name}</span>
                        <span className={ready ? "text-success font-bold" : "text-destructive"}>{ready ? "✓ Ready" : "○ Missing"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
          <section className="min-w-0">
            <Discovery
              grants={grants}
              index={deckIndex}
              setIndex={setDeckIndex}
              sector={sectorName(profile.sector_code)}
              submittedIds={submittedIds}
              onOpenDraft={openDraft}
              evidenceReady={industryReady}
              missingEvidence={industryRequirements.filter((requirement) => !docs.some((doc) => doc.slot_key === requirement.key)).map((requirement) => requirement.name)}
            />
          </section>
          <aside className="space-y-4">
            <div className="bg-card p-4 rounded-xl border border-border max-h-[55vh] overflow-y-auto">
              <Vault userId={userId} entityType={profile.entity_type} industry={profile.industry} docs={docs} reload={loadDocs} voiceSample={profile.voice_sample} voiceProfile={profile.voice_profile} onVoiceSaved={loadProfile} />
            </div>
            <div className="bg-card p-4 rounded-xl border border-border max-h-[35vh] overflow-y-auto">
              <h2 className="text-sm font-display font-bold mb-3">Application Tracker</h2>
              <Tracker applications={apps} />
            </div>
          </aside>
        </div>
      </main>

      {selected && <ProposalStudio grant={selected} voiceCalibrated={!!profile.voice_profile} onClose={() => { setSelected(null); setDeckIndex(deckIndex + 1); }} onSaved={() => { loadApps(); loadDocs(); }} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="bg-card p-6 rounded-xl border border-border"><span className="text-muted-foreground text-sm">{label}</span><h2 className={`text-3xl font-display font-bold mt-2 ${tone}`}>{value}</h2></div>;
}
