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
  const [narrative, setNarrative] = useState("");
  const [drafting, setDrafting] = useState(false);
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

  const openDraft = async (g: Grant) => {
    setSelected(g); setNarrative(""); setDrafting(true);
    try { const r = await draft({ data: { title: g.title, funder: g.funder, amount: g.amount, eligibilityReason: g.eligibilityReason } }); setNarrative(r.narrative); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Drafting failed"); }
    setDrafting(false);
  };

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
      const { data, error } = await supabase.from("profiles").update({ ...p, onboarded: true, updated_at: new Date().toISOString() }).eq("id", userId).select().single();
      if (error) return void toast.error(error.message);
      setProfile(data);
    }} />;
  }

  const slots = coreDocSlots(profile.entity_type);
  const verified = slots.filter((s) => docs.some((d) => d.slot_key === s.key)).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" }, { id: "discovery", label: "Grant Discovery (50 Cards)" },
    { id: "vault", label: "Document Vault" }, { id: "tracker", label: "Application Tracker" },
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

      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
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

        {tab === "dashboard" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Stat label="Verified Credentials" value={`${verified} / ${slots.length}`} tone="text-primary" />
            <Stat label="Active Sector Matches" value={`${grants.length} Grants`} tone="text-success" />
            <Stat label="Applications Queued" value={String(apps.length)} tone="" />
          </div>
        )}
        {tab === "discovery" && <Discovery grants={grants} index={deckIndex} setIndex={setDeckIndex} sector={sectorName(profile.sector_code)} submittedIds={submittedIds} onOpenDraft={openDraft} />}
        {tab === "vault" && <Vault userId={userId} entityType={profile.entity_type} docs={docs} reload={loadDocs} voiceSample={profile.voice_sample} voiceProfile={profile.voice_profile} onVoiceSaved={loadProfile} />}
        {tab === "tracker" && <Tracker applications={apps} />}
      </main>

      {selected && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div><h3 className="text-lg font-display font-bold">AI Proposal Editor</h3><p className="text-xs text-muted-foreground">{selected.title}</p></div>
              <button aria-label="Close" onClick={() => setSelected(null)} className="text-muted-foreground">✕</button>
            </div>
            {drafting ? (
              <div className="h-72 flex items-center justify-center gap-2 text-sm text-primary"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Drafting your proposal with AI…</div>
            ) : (
              <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} className="w-full h-72 bg-background border border-border rounded-xl p-4 text-xs font-mono focus:outline-none focus:border-primary" />
            )}
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="flex-1 py-2.5 bg-secondary rounded-lg text-sm font-semibold">Discard</button>
              <button disabled={drafting} onClick={() => openDraft(selected)} className="px-4 py-2.5 border border-primary/40 text-primary rounded-lg text-sm font-semibold disabled:opacity-40">Regenerate</button>
              <button disabled={drafting || !narrative.trim()} onClick={async () => {
                try { await saveApplication(selected, narrative, "Submitted & Queued"); await loadApps(); setSelected(null); setDeckIndex(deckIndex + 1); toast.success("Application saved to tracker"); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
              }} className="flex-1 py-2.5 bg-success text-primary-foreground font-bold rounded-lg text-sm disabled:opacity-40">Approve & Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="bg-card p-6 rounded-xl border border-border"><span className="text-muted-foreground text-sm">{label}</span><h2 className={`text-3xl font-display font-bold mt-2 ${tone}`}>{value}</h2></div>;
}
