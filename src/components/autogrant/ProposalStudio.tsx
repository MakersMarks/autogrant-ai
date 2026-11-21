import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { generateGrantDocument, saveProposalDraft } from "@/lib/ai/ai.functions";
import { documentSpecs, documentTypes, toCleanText, wordCount, type DocumentType } from "@/lib/ai/proposal-policy";
import type { Grant } from "@/lib/grants";
import { evaluateProposalRedTeam } from "@/lib/ai/red-team";
import type { GrantRequirementBOM } from "@/lib/ai/rfp-parser";
import { buildBudgetJustification, type BudgetInput, BudgetCalculation } from "@/lib/budget";
import { BudgetBuilder } from "./BudgetBuilder";

type Section = { title: string; body: string };

export function ProposalStudio({
  grant,
  voiceCalibrated,
  availableEvidenceIds = [],
  onClose,
  onSaved,
}: {
  grant: Grant;
  voiceCalibrated: boolean;
  availableEvidenceIds?: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<DocumentType>("executive_summary");
  const [view, setView] = useState<"documents" | "budget" | "audit">("documents");
  const [docs, setDocs] = useState<Partial<Record<DocumentType, { sections: Section[]; fileName: string }>>>({});
  const [appId, setAppId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [budgetInput, setBudgetInput] = useState<BudgetInput | null>(null);
  const [budgetCalculation, setBudgetCalculation] = useState<BudgetCalculation | null>(null);
  const gen = useServerFn(generateGrantDocument);
  const saveDraft = useServerFn(saveProposalDraft);
  const [dirty, setDirty] = useState(false);
  const current = docs[type];

  const run = async () => {
    setBusy(true);
    try {
      const r = await gen({ data: { type, title: grant.title, funder: grant.funder, amount: grant.amount, eligibilityReason: grant.eligibilityReason, grantId: grant.id, applicationId: appId } });
      setDocs((d) => ({ ...d, [type]: { sections: r.sections, fileName: r.fileName } }));
      setAppId(r.applicationId);
      setDirty(false);
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
  const updateBody = (i: number, body: string) => {
    if (!current) return;
    setDirty(true);
    setDocs((d) => ({ ...d, [type]: { ...current, sections: current.sections.map((s, j) => (j === i ? { ...s, body } : s)) } }));
  };
  const saveEdits = async () => {
    const text = Object.values(docs).flatMap((doc) => doc?.sections ?? []).map((section) => `## ${section.title}\n\n${toCleanText(section.body)}`).join("\n\n");
    if (!text.trim()) { toast.error("Generate at least one proposal document before saving."); return; }
    setBusy(true);
    try {
      const budgetJustification = budgetInput && budgetCalculation?.valid
        ? buildBudgetJustification(budgetInput, budgetCalculation)
        : undefined;
      const r = await saveDraft({ data: {
        applicationId: appId,
        grantId: grant.id,
        title: grant.title,
        funder: grant.funder,
        amount: grant.amount,
        narrative: text,
        budgetJustification,
      } });
      setAppId(r.applicationId);
      setDirty(false);
      toast.success("Proposal edits saved");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save edits"); }
    setBusy(false);
  };
  const bom: GrantRequirementBOM = {
    grantId: grant.id,
    grantTitle: grant.title,
    formatting: { wordCountLimit: type === "executive_summary" ? 1500 : 5000, submissionMedium: "portal_text_fields" },
    aiDraftableDocuments: [{ documentType: type, requiredHeadings: documentSpecs[type].sections.map((section) => section.title) }],
    userRequiredEvidence: [],
  };
  const proposalText = Object.values(docs).flatMap((doc) => doc?.sections ?? []).map((section) => `## ${section.title}\n${section.body}`).join("\n\n");
  const audit = proposalText
    ? evaluateProposalRedTeam({
      proposalText,
      bom,
      availableEvidenceIds,
      budget: {
        requestedAmount: budgetCalculation?.valid ? budgetCalculation.grantRequest : undefined,
        ceiling: budgetInput?.awardCeiling ?? undefined,
        matchRequired: budgetInput?.costSharingPercentage != null,
        matchRate: budgetInput?.costSharingPercentage != null ? budgetInput.costSharingPercentage / 100 : undefined,
        requiredMatchAmount: budgetCalculation?.valid ? budgetCalculation.requiredMatch : undefined,
        committedMatchAmount: undefined,
      },
    })
    : null;
  const moduleLabels: Record<string, string> = {
    structure: "Format & Word Counts",
    evidence: "Vault Evidence",
    writing: "Anti-AI Diction",
    budgetCeiling: "Budget Math",
    matchConsistency: "Mandatory Headings",
  };

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
          <button aria-label="Close" onClick={() => {
            if (dirty && !window.confirm("Discard unsaved proposal edits?")) return;
            onClose();
          }} className="text-muted-foreground">✕</button>
        </div>
        <div className="flex gap-2 px-5 pt-4 flex-wrap">
          <button onClick={() => setView("documents")} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${view === "documents" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            Proposal documents
          </button>
          <button onClick={() => setView("budget")} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${view === "budget" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            Budget Builder
          </button>
          <button onClick={() => setView("audit")} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${view === "audit" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            Audit &amp; Score (0–100)
          </button>
          {view === "documents" && documentTypes.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${t === type ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
              {documentSpecs[t].label}{docs[t] ? " ✓" : ""}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {view === "budget" ? (
            <BudgetBuilder
              onChange={(input, calculation) => {
                setBudgetInput(input);
                setBudgetCalculation(calculation);
              }}
            />
          ) : view === "audit" ? (
            audit ? (
              <div className="space-y-5">
                <div className="flex items-end justify-between p-5 bg-background border border-border rounded-xl">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground">Red-Team Score</p>
                    <p className="text-4xl font-display font-bold text-primary">{audit.score}<span className="text-lg text-muted-foreground">/{audit.maxScore}</span></p>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-xs text-right">{audit.assessment}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {audit.modules.map((module) => (
                    <div key={module.id} className="p-4 bg-background border border-border rounded-xl space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">{moduleLabels[module.id] ?? module.id}</span>
                        <span className="text-muted-foreground">{module.score}/{module.weight}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${module.weight ? (module.score / module.weight) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-5 bg-background border border-border rounded-xl">
                  <h4 className="text-sm font-bold mb-3">Fixes Needed Before Submitting</h4>
                  <ul className="space-y-2">
                    {audit.modules.flatMap((module) => module.findings.filter((finding) => !/present|met|available|no_|unspecified|within|not_required/.test(finding.code))).map((finding) => (
                      <li key={finding.code} className="text-xs text-destructive">• {finding.message}</li>
                    ))}
                  </ul>
                  {!audit.modules.some((module) => module.findings.some((finding) => !/present|met|available|no_|unspecified|within|not_required/.test(finding.code))) && (
                    <p className="text-xs text-success">No critical fixes detected by the deterministic audit.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">Generate or edit proposal documents to run the audit.</div>
            )
          ) : busy ? (
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
        {view === "documents" && <div className="flex gap-3 border-t border-border p-5 flex-wrap">
          <button disabled={busy} onClick={run} className="flex-1 py-2.5 bg-primary text-primary-foreground font-bold rounded-lg text-sm disabled:opacity-40">{current ? "Regenerate" : "Generate"} {documentSpecs[type].label}</button>
          <button disabled={!current || busy} onClick={saveEdits} className="px-4 py-2.5 border border-primary/50 text-primary rounded-lg text-sm font-semibold disabled:opacity-40">{dirty ? "Save Edits" : "Save"}</button>
          <button disabled={!current || busy} onClick={copy} className="px-4 py-2.5 border border-border rounded-lg text-sm font-semibold disabled:opacity-40">Copy Clean Text</button>
          <button disabled={!current || busy} onClick={download} className="px-4 py-2.5 border border-border rounded-lg text-sm font-semibold disabled:opacity-40">Download</button>
        </div>}
      </div>
    </div>
  );
}
