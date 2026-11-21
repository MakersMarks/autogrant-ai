import { useState } from "react";
import { OFFICIAL_SECTORS, sectorName } from "@/lib/grants";

export type ProfileInput = {
  entity_type: string;
  sector_code: string;
  industry?: string;
  funding_goal: string;
  demographics: string[];
  lifecycle_stage: string;
  location: string;
  funding_purpose: string;
};

export const DEMOGRAPHIC_OPTIONS = [
  "Woman-Owned",
  "Black/African Diaspora",
  "Hispanic/Latino",
  "Native American",
  "Veteran / Disabled Veteran",
  "First-Gen American",
] as const;

export const GEOGRAPHY_OPTIONS = [
  "Rural County (<50k pop)",
  "SBA HUBZone",
  "Federal Opportunity Zone",
  "Appalachian/Delta Region",
  "State of Headquarters",
] as const;

export const ENTITY_OPTIONS = [
  "For-Profit LLC",
  "C-Corp",
  "Sole Proprietorship",
  "501(c)(3) Nonprofit",
  "Fiscal Sponsorship",
  "Faith-Based Church",
] as const;

export const STAGE_OPTIONS = [
  "Idea / Pre-Revenue (<1 yr)",
  "Early Operating (1–2 yrs)",
  "Established (>2 yrs profitable)",
] as const;

export const CAPITAL_OPTIONS = [
  "Equipment & Machinery",
  "Working Capital & Payroll",
  "Real Estate / Rent",
  "R&D / Prototype",
  "Community Program",
] as const;

export const UNIQUE_OPTIONS = [
  "Neurodivergent/Disabled Founder",
  "University Tech Spinout",
  "Patent Pending",
  "Former Incarcerated Entrepreneur",
] as const;

export function mergeDemographicTags(existing: string[], removals: readonly string[], additions: string[]) {
  const removalSet = new Set(removals);
  const preserved = existing.filter((tag) => !removalSet.has(tag));
  return Array.from(new Set([...preserved, ...additions]));
}

export function Onboarding({ initial, onComplete }: { initial: ProfileInput; onComplete: (p: ProfileInput) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [p, setP] = useState<ProfileInput>({
    ...initial,
    industry: initial.industry ?? "",
    lifecycle_stage: initial.lifecycle_stage ?? "",
    location: initial.location ?? "",
    funding_purpose: initial.funding_purpose ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [qualifierCard, setQualifierCard] = useState(0);
  const [uniqueSelections, setUniqueSelections] = useState<string[]>([]);
  const opt = (active: boolean) => `w-full p-4 rounded-xl border text-left font-semibold transition ${active ? "bg-primary/10 border-primary text-primary" : "bg-background border-border"}`;
  const list = (title: string, items: { v: string; label: string }[], field: "entity_type" | "sector_code" | "funding_goal") => (
    <div className="space-y-3">
      <h2 className="text-xl font-display font-bold">{title}</h2>
      {items.map((i) => <button key={i.v} onClick={() => setP({ ...p, [field]: i.v })} className={opt(p[field] === i.v)}>{i.label}</button>)}
    </div>
  );
  const s = (arr: string[]) => arr.map((v) => ({ v, label: v }));
  const toggleDemographicTag = (option: string) => {
    const alias = option === "Woman-Owned" ? "Women-Owned" : option === "Veteran / Disabled Veteran" ? "Veteran-Owned" : "";
    const active = p.demographics.includes(option) || (alias ? p.demographics.includes(alias) : false);
    const demographics = mergeDemographicTags(p.demographics, [option, ...(alias ? [alias] : [])], active ? [] : [option]);
    setP({ ...p, demographics });
  };
  const toggleGeographyTag = (option: string) => {
    const active = p.demographics.includes(option) || (option === "SBA HUBZone" && p.demographics.includes("HubZone / Low-Income Area"));
    const legacyHubZone = option === "SBA HUBZone" ? "HubZone / Low-Income Area" : "";
    const demographics = mergeDemographicTags(p.demographics, [option, ...(legacyHubZone ? [legacyHubZone] : [])], active ? [] : [option]);
    setP({ ...p, demographics });
  };
  const qualifierCards = [
    {
      title: "Demographics & Heritage",
      content: (
        <div className="space-y-2">
          {DEMOGRAPHIC_OPTIONS.map((option) => {
            const alias = option === "Woman-Owned" ? "Women-Owned" : option === "Veteran / Disabled Veteran" ? "Veteran-Owned" : "";
            const active = p.demographics.includes(option) || (alias ? p.demographics.includes(alias) : false);
            return <button type="button" key={option} aria-pressed={active} onClick={() => toggleDemographicTag(option)} className={opt(active)}>{option}{active ? " ✓" : ""}</button>;
          })}
        </div>
      ),
    },
    {
      title: "Location & Geography",
      content: (
        <div className="space-y-3">
          {GEOGRAPHY_OPTIONS.map((option) => {
            const active = p.demographics.includes(option) || (option === "SBA HUBZone" && p.demographics.includes("HubZone / Low-Income Area"));
            return <button type="button" key={option} aria-pressed={active} onClick={() => toggleGeographyTag(option)} className={opt(active)}>{option}{active ? " ✓" : ""}</button>;
          })}
          <label className="block space-y-1 text-xs text-muted-foreground">
            State of headquarters
            <input aria-label="State of headquarters" value={p.location} onChange={(e) => setP({ ...p, location: e.target.value })} placeholder="e.g., TN" className="w-full p-3 rounded-xl border border-border bg-background text-foreground" />
          </label>
        </div>
      ),
    },
    {
      title: "Entity & Structure",
      content: <div className="space-y-2">{ENTITY_OPTIONS.map((option) => <button type="button" key={option} aria-pressed={p.entity_type === option} onClick={() => setP({ ...p, entity_type: option })} className={opt(p.entity_type === option)}>{option}{p.entity_type === option ? " ✓" : ""}</button>)}</div>,
    },
    {
      title: "Business Stage",
      content: <div className="space-y-2">{STAGE_OPTIONS.map((option) => <button type="button" key={option} aria-pressed={p.lifecycle_stage === option} onClick={() => setP({ ...p, lifecycle_stage: option })} className={opt(p.lifecycle_stage === option)}>{option}{p.lifecycle_stage === option ? " ✓" : ""}</button>)}</div>,
    },
    {
      title: "Primary Capital Need",
      content: <div className="space-y-2">{CAPITAL_OPTIONS.map((option) => <button type="button" key={option} aria-pressed={p.funding_purpose === option} onClick={() => setP({ ...p, funding_purpose: option })} className={opt(p.funding_purpose === option)}>{option}{p.funding_purpose === option ? " ✓" : ""}</button>)}</div>,
    },
    {
      title: "Unique Identifiers",
      content: (
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-muted-foreground">
            Industry
            <select aria-label="Industry" value={p.industry} onChange={(e) => setP({ ...p, industry: e.target.value })} className="w-full p-3 rounded-xl border border-border bg-background text-foreground">
              <option value="">Select industry</option>
              <option value="Food / Restaurant / Catering">Food / Restaurant / Catering</option>
              <option value="Mining / Mineral Extraction">Mining / Mineral Extraction</option>
              <option value="Nonprofit">Nonprofit</option>
              <option value="Creative / Media / Arts">Creative / Media / Arts</option>
              <option value="Technology / General Business">Technology / General Business</option>
            </select>
          </label>
          {UNIQUE_OPTIONS.map((option) => {
            const active = uniqueSelections.includes(option);
            return <button type="button" key={option} aria-pressed={active} onClick={() => setUniqueSelections(active ? uniqueSelections.filter((x) => x !== option) : [...uniqueSelections, option])} className={opt(active)}>{option}{active ? " ✓" : ""}</button>;
          })}
          <p className="text-xs leading-relaxed text-muted-foreground border-t border-border pt-3">Not saved: the current profile schema has no safe dedicated field for these identifiers. Existing profile values are never replaced to approximate this category.</p>
        </div>
      ),
    },
  ];
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="bg-card border border-border p-8 rounded-2xl max-w-lg w-full space-y-6 shadow-2xl">
        <div className="flex justify-between text-xs text-muted-foreground border-b border-border pb-3">
          <span className="font-bold text-primary uppercase tracking-wider">Step {step} of 5</span><span>Setup Wizard</span>
        </div>
        {step === 1 && list("What is your business entity type?", s(["Idea / Pre-Launch Founder", "Sole Proprietorship", "LLC / Corporation", "Non-Profit Organization"]), "entity_type")}
        {step === 2 && list("Select official Grants.gov sector", OFFICIAL_SECTORS.map((x) => ({ v: x.code, label: x.name })), "sector_code")}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold">What is your funding objective?</h2>
            {s(["Tech Development & Scaling", "Equipment & Assets", "R&D / Product Innovation", "General Working Capital"]).map((item) => (
              <button key={item.v} type="button" onClick={() => setP({ ...p, funding_purpose: item.v })} className={opt(p.funding_purpose === item.v)}>{item.label}</button>
            ))}
            <label className="block space-y-1 text-xs text-muted-foreground">
              Funding goal amount
              <input
                aria-label="Funding goal amount"
                type="number"
                min="1"
                value={p.funding_goal.replace(/[^\d]/g, "")}
                onChange={(e) => setP({ ...p, funding_goal: e.target.value })}
                placeholder="e.g., 250000"
                className="w-full p-3 rounded-xl border border-border bg-background text-foreground"
              />
            </label>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-bold">{qualifierCards[qualifierCard]!.title}</h2>
              <span className="text-xs text-muted-foreground">Card {qualifierCard + 1} of 6</span>
            </div>
            <div role="group" aria-label={`Qualifier card ${qualifierCard + 1} of 6: ${qualifierCards[qualifierCard]!.title}`} className="max-h-[420px] overflow-y-auto pr-1">
              {qualifierCards[qualifierCard]!.content}
            </div>
            <div className="flex gap-2" aria-label="Qualifier card navigation">
              <button type="button" disabled={qualifierCard === 0} onClick={() => setQualifierCard((i) => i - 1)} className="px-4 py-2 rounded-lg border border-border disabled:opacity-40">Previous</button>
              <button type="button" disabled={qualifierCard === 5} onClick={() => setQualifierCard((i) => i + 1)} className="flex-1 px-4 py-2 rounded-lg border border-primary text-primary disabled:opacity-40">Next</button>
            </div>
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
              <p><strong>Lifecycle:</strong> {p.lifecycle_stage || "Not specified"}</p>
              <p><strong>Location:</strong> {p.location || "Not specified"}</p>
              <p><strong>Capital Need:</strong> {p.funding_purpose || "Not specified"}</p>
            </div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          {step > 1 && <button onClick={() => setStep(step - 1)} className="px-5 py-3 bg-secondary text-secondary-foreground font-bold rounded-xl text-xs uppercase">Back</button>}
          <button disabled={saving} onClick={async () => {
            if (step < 5) return setStep(step + 1);
            setSaving(true);
            setSaveError("");
            try { await onComplete(p); }
            catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save your profile. Please try again."); }
            finally { setSaving(false); }
          }} className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-xs uppercase disabled:opacity-50">
            {step === 5 ? (saving ? "Saving…" : "Launch Web Platform") : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
