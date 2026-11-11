import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { generateGrantDocument } from "@/lib/ai/ai.functions";
import { documentSpecs, documentTypes, toCleanText, wordCount, type DocumentType } from "@/lib/ai/proposal-policy";
import type { Grant } from "@/lib/grants";

type Section = { title: string; body: string };

export function ProposalStudio({ grant, voiceCalibrated, onClose, onSaved }: { grant: Grant; voiceCalibrated: boolean; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<DocumentType>("executive_summary");
  const [docs, setDocs] = useState<Partial<Record<DocumentType, { sections: Section[]; fileName: string }>>>({});
  const [appId, setAppId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const gen = useServerFn(generateGrantDocument);
  const current = docs[type];

  const run = async () => {
    setBusy(true);
    try {
      const r = await gen({ data: { type, title: grant.title, funder: grant.funder, amount: grant.amount, eligibilityReason: grant.eligibilityReason, grantId: grant.id, applicationId: appId } });
      setDocs((d) => ({ ...d, [type]: { sections: r.sections, fileName: r.fileName } }));
      setAppId(r.applicationId);
      toast.success(`Saved to Vault: ${r.fileName}`);
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Generation failed"); }
    setBusy(false);
  };

  const plain = (s: Section[]) => s.map((x) => `${x.title}\n\n${toCleanText(x.body)}`).join("\n\n");
  const copy = async () => { if (current) { await navigator.clipboard.writeText(plain(current.sections)); toast.success("Clean text copied"); } };
  const download = () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([plain(current.sections)], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = current.fileName; a.click(); URL.revokeObjectURL(url);
  };
  const updateBody = (i: number, body: string) => current && setDocs((d) => ({ ...d, [type]: { ...current, sections: current.sections.map((s, j) => (j === i ? { ...s, body } : s)) } }));

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-start border-b border-border p-5 gap-4">
          <div>
            <h3 className="text-lg font-display font-bold">Proposal Studio</h3>
            <p className="text-xs text-muted-foreground">{grant.title} · {grant.funder}</p>
            <span className={`inline-block mt-2 text-[11px] px-2 py-0.5 rounded-full border ${voiceCalibrated ? "border-success/40 text-success" : "border-primary/40 text-primary"}`}>
              {voiceCalibrated ? "Voice: calibrated from your writing sample" : "Voice: mirrored from your intake answers (calibrate in Vault for better match)"}
            </span>
          </div>
          <button aria-label="Close" onClick={onClose} className="text-muted-foreground">✕</button>
        </div>
        <div className="flex gap-2 px-5 pt-4 flex-wrap">
          {documentTypes.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${t === type ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
              {documentSpecs[t].label}{docs[t] ? " ✓" : ""}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {busy ? (
            <div className="h-60 flex items-center justify-center gap-2 text-sm text-primary"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Writing your {documentSpecs[type].label} in your voice…</div>
          ) : current ? (
            <>
              <p className="text-xs text-muted-foreground">Saved to Vault as <span className="text-foreground font-medium">{current.fileName}</span></p>
              {current.sections.map((s, i) => {
                const max = documentSpecs[type].sections[i]?.maxWords;
                const wc = wordCount(s.body);
                return (
                  <details key={s.title} open className="bg-background border border-border rounded-xl">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold flex justify-between">
                      <span>{i + 1}. {s.title}</span>
                      <span className={`text-xs ${max && wc > max ? "text-destructive" : "text-muted-foreground"}`}>{wc}{max ? ` / ${max}` : ""} words · {s.body.length} chars</span>
                    </summary>
                    <textarea value={s.body} onChange={(e) => updateBody(i, e.target.value)} className="w-full min-h-40 bg-transparent border-t border-border p-4 text-sm leading-relaxed focus:outline-none" />
                  </details>
                );
              })}
            </>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center text-center gap-2 text-sm text-muted-foreground">
              <p>{documentSpecs[type].sections.length} sections: {documentSpecs[type].sections.map((s) => s.title).join(" · ")}</p>
              <p className="text-xs">Built from your intake and Vault documents.</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 border-t border-border p-5 flex-wrap">
          <button disabled={busy} onClick={run} className="flex-1 py-2.5 bg-primary text-primary-foreground font-bold rounded-lg text-sm disabled:opacity-40">{current ? "Regenerate" : "Generate"} {documentSpecs[type].label}</button>
          <button disabled={!current || busy} onClick={copy} className="px-4 py-2.5 border border-border rounded-lg text-sm font-semibold disabled:opacity-40">Copy Clean Text</button>
          <button disabled={!current || busy} onClick={download} className="px-4 py-2.5 border border-border rounded-lg text-sm font-semibold disabled:opacity-40">Download</button>
        </div>
      </div>
    </div>
  );
}
