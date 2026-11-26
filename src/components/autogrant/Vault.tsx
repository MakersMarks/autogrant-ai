import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calibrateVoice } from "@/lib/ai/ai.functions";
import { CUSTOM_DOC_SLOTS, coreDocSlots, validateVaultFile, type DocSlot } from "@/lib/grants";
import { getIndustryDocumentRequirements } from "@/lib/compliance/industry-documents";
import { trackLovableEvent } from "@/lib/lovable-error-reporting";

export type VaultDoc = {
  id: string;
  slot_key: string;
  file_name: string;
  storage_path: string;
  category_tag?: "legal_tax" | "license_permit" | "vendor_quote" | "financial";
  grant_id?: string;
};

export function Vault({ userId, entityType, lifecycleStage = "", industry = "", docs, reload, voiceSample, voiceProfile, onVoiceSaved }: {
  userId: string; entityType: string; lifecycleStage?: string; industry?: string; docs: VaultDoc[]; reload: () => Promise<void>;
  voiceSample: string; voiceProfile: string; onVoiceSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sample, setSample] = useState(voiceSample);
  const [demo, setDemo] = useState("");
  const [calibrating, setCalibrating] = useState(false);
  const calibrate = useServerFn(calibrateVoice);
  const industryRequirements = getIndustryDocumentRequirements(industry, entityType);

  const upload = async (slot: DocSlot, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateVaultFile(file);
    setErrors((p) => ({ ...p, [slot.key]: err ?? "" }));
    if (err) return;
    setBusy((p) => ({ ...p, [slot.key]: true }));
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${userId}/${slot.key}-${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("vault").upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      setErrors((p) => ({ ...p, [slot.key]: upErr.message }));
    } else {
      const old = docs.find((d) => d.slot_key === slot.key);
      const { error } = await supabase.from("vault_documents").upsert(
        { user_id: userId, slot_key: slot.key, file_name: file.name, storage_path: path, mime_type: file.type || "application/octet-stream", size_bytes: file.size },
        { onConflict: "user_id,slot_key" },
      );
      if (error) {
        await supabase.storage.from("vault").remove([path]);
        setErrors((p) => ({ ...p, [slot.key]: `Could not save document metadata: ${error.message}` }));
      } else {
        if (old?.storage_path && old.storage_path !== path) await supabase.storage.from("vault").remove([old.storage_path]);
        trackLovableEvent("vault_document_uploaded");
      }
      await reload();
    }
    setBusy((p) => ({ ...p, [slot.key]: false }));
  };

  const remove = async (doc: VaultDoc) => {
    setBusy((p) => ({ ...p, [doc.slot_key]: true }));
    const { error } = await supabase.from("vault_documents").delete().eq("id", doc.id);
    if (error) {
      setErrors((p) => ({ ...p, [doc.slot_key]: `Could not remove document: ${error.message}` }));
    } else {
      const { error: storageError } = await supabase.storage.from("vault").remove([doc.storage_path]);
      if (storageError) setErrors((p) => ({ ...p, [doc.slot_key]: `Metadata removed, but storage cleanup failed: ${storageError.message}` }));
    }
    await reload();
    setBusy((p) => ({ ...p, [doc.slot_key]: false }));
  };

  const open = async (doc: VaultDoc) => {
    const { data, error } = await supabase.storage.from("vault").createSignedUrl(doc.storage_path, 60);
    if (error || !data) { toast.error("Could not open file."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const slotCard = (slot: DocSlot) => {
    const doc = docs.find((d) => d.slot_key === slot.key);
    const err = errors[slot.key];
    return (
      <div key={slot.key} className="p-4 bg-background rounded-lg border border-border space-y-3">
        <div className="flex justify-between items-start gap-2">
          <div>
            <p className="text-sm font-semibold">{slot.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Status: <span className={doc ? "text-success font-bold" : err ? "text-destructive font-bold" : ""}>
              {doc ? `Uploaded (${doc.file_name})` : err ? "Validation Error" : slot.required ? "Not uploaded yet" : "Optional"}</span></p>
          </div>
          {doc && !busy[slot.key] && (
            <div className="flex gap-3">
              <button onClick={() => open(doc)} className="text-xs text-primary hover:underline font-semibold">View</button>
              <button onClick={() => remove(doc)} className="text-xs text-destructive hover:underline font-semibold">Remove</button>
            </div>
          )}
        </div>
        {busy[slot.key] && <div className="flex items-center gap-2 text-xs text-primary font-mono"><div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />Working…</div>}
        {err && !busy[slot.key] && <p className="text-xs text-destructive font-semibold">{err}</p>}
        {!doc && !busy[slot.key] && (
          <label className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-4 flex flex-col items-center cursor-pointer bg-card/50">
            <span className="text-xs font-semibold">📁 Browse for PDF, DOCX, TXT, JPG, or PNG</span>
            <span className="text-[10px] text-muted-foreground mt-1">Max size: 15MB</span>
            <input
              type="file"
              aria-label={`Upload ${slot.name}`}
              accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png"
              onChange={(e) => upload(slot, e)}
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
            />
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-success/10 border border-success/30 p-4 rounded-xl">
        <span className="text-xs font-bold text-success uppercase tracking-wider block">🔒 Private Encrypted Vault</span>
        <p className="text-xs mt-1">Files are stored privately, encrypted at rest, and only visible to your account.</p>
      </div>
      <section id="industry-compliance" className="bg-card p-6 rounded-xl border border-border">
        <h3 className="text-lg font-display font-bold mb-1">Core Credentials ({entityType})</h3>
        <p className="text-xs text-muted-foreground mb-4">Required to verify legal status and federal compliance.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{coreDocSlots(entityType, lifecycleStage).map(slotCard)}</div>
      </section>
      <section className="bg-card p-6 rounded-xl border border-border">
        <h3 className="text-lg font-display font-bold mb-1">Additional Business Assets & Pitch Documents</h3>
        <p className="text-xs text-muted-foreground mb-4">Pitch decks, business plans, or market research (PDF/DOCX).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{CUSTOM_DOC_SLOTS.map(slotCard)}</div>
      </section>
      {industryRequirements.length > 0 && (
        <section className="bg-card p-6 rounded-xl border border-border">
          <h3 className="text-lg font-display font-bold mb-1">Industry Compliance Documents</h3>
          <p className="text-xs text-muted-foreground mb-4">Required evidence generated from your industry and entity profile.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {industryRequirements.map((requirement) => slotCard({
              key: requirement.key,
              name: `${requirement.name} (${requirement.category.replace("_", " ")})`,
              required: true,
            }))}
          </div>
        </section>
      )}
      <section className="bg-card p-6 rounded-xl border border-border space-y-4">
        <h3 className="text-lg font-display font-bold">Personal Writing Style & Tone Calibration</h3>
        <textarea value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Paste your writing samples here..." className="w-full h-28 bg-background border border-border rounded-lg p-4 text-xs focus:outline-none focus:border-primary" />
        <button disabled={calibrating} onClick={async () => {
          if (!sample.trim()) { toast.error("Please enter a sample first."); return; }
          setCalibrating(true);
          try { const r = await calibrate({ data: { sample } }); setDemo(r.demo); await onVoiceSaved(); toast.success("AI voice updated"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Calibration failed"); }
          setCalibrating(false);
        }} className="px-5 py-2.5 bg-primary text-primary-foreground font-bold text-xs uppercase rounded-lg disabled:opacity-50">
          {calibrating ? "Analyzing your style…" : "Retrain & Update AI Voice"}</button>
        {voiceProfile && (
          <div className="p-4 bg-background border border-primary/30 rounded-xl space-y-2">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Your AI Voice Profile</span>
            <p className="text-xs">{voiceProfile}</p>
            {demo && <p className="text-xs font-mono italic text-muted-foreground">“{demo}”</p>}
          </div>
        )}
      </section>
    </div>
  );
}
