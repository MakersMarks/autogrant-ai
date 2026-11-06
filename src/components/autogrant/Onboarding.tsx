import { useState } from "react";
import { OFFICIAL_SECTORS, sectorName } from "@/lib/grants";

export type ProfileInput = { entity_type: string; sector_code: string; funding_goal: string; demographics: string[] };

export function Onboarding({ initial, onComplete }: { initial: ProfileInput; onComplete: (p: ProfileInput) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [p, setP] = useState<ProfileInput>(initial);
  const [saving, setSaving] = useState(false);
  const opt = (active: boolean) => `w-full p-4 rounded-xl border text-left font-semibold transition ${active ? "bg-primary/10 border-primary text-primary" : "bg-background border-border"}`;
  const list = (title: string, items: { v: string; label: string }[], field: "entity_type" | "sector_code" | "funding_goal") => (
    <div className="space-y-3">
      <h2 className="text-xl font-display font-bold">{title}</h2>
      {items.map((i) => <button key={i.v} onClick={() => setP({ ...p, [field]: i.v })} className={opt(p[field] === i.v)}>{i.label}</button>)}
    </div>
  );
  const s = (arr: string[]) => arr.map((v) => ({ v, label: v }));
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="bg-card border border-border p-8 rounded-2xl max-w-lg w-full space-y-6 shadow-2xl">
        <div className="flex justify-between text-xs text-muted-foreground border-b border-border pb-3">
          <span className="font-bold text-primary uppercase tracking-wider">Step {step} of 5</span><span>Setup Wizard</span>
        </div>
        {step === 1 && list("What is your business entity type?", s(["Idea / Pre-Launch Founder", "Sole Proprietorship", "LLC / Corporation", "Non-Profit Organization"]), "entity_type")}
        {step === 2 && list("Select official Grants.gov sector", OFFICIAL_SECTORS.map((x) => ({ v: x.code, label: x.name })), "sector_code")}
        {step === 3 && list("What is your funding objective?", s(["Tech Development & Scaling", "Equipment & Assets", "R&D / Product Innovation", "General Working Capital"]), "funding_goal")}
        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-xl font-display font-bold">Select founder demographics</h2>
            {["Minority-Owned", "Women-Owned", "Veteran-Owned", "HubZone / Low-Income Area"].map((d) => {
              const on = p.demographics.includes(d);
              return <button key={d} onClick={() => setP({ ...p, demographics: on ? p.demographics.filter((x) => x !== d) : [...p.demographics, d] })}
                className={`w-full p-4 rounded-xl border text-left font-semibold transition ${on ? "bg-success/10 border-success text-success" : "bg-background border-border"}`}>{d} {on ? "✓" : ""}</button>;
            })}
          </div>
        )}
        {step === 5 && (
          <div className="space-y-3">
            <h2 className="text-xl font-display font-bold">Profile Setup Complete</h2>
            <div className="p-4 rounded-xl bg-background border border-border text-xs space-y-2">
              <p><strong>Entity Stage:</strong> {p.entity_type}</p>
              <p><strong>Sector:</strong> {sectorName(p.sector_code)}</p>
              <p><strong>Goal:</strong> {p.funding_goal}</p>
              <p><strong>Demographics:</strong> {p.demographics.join(", ") || "None"}</p>
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          {step > 1 && <button onClick={() => setStep(step - 1)} className="px-5 py-3 bg-secondary text-secondary-foreground font-bold rounded-xl text-xs uppercase">Back</button>}
          <button disabled={saving} onClick={async () => {
            if (step < 5) return setStep(step + 1);
            setSaving(true); await onComplete(p); setSaving(false);
          }} className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-xs uppercase disabled:opacity-50">
            {step === 5 ? (saving ? "Saving…" : "Launch Web Platform") : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
