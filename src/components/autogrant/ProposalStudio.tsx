import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildApplicationPackage, createPdf } from "@/lib/application-package";
import { analyzeGrantRequirements, generateGrantDocument, saveProposalDraft } from "@/lib/ai/ai.functions";
import { documentSpecs, documentTypes, toCleanText, wordCount, type DocumentType } from "@/lib/ai/proposal-policy";
import type { Grant } from "@/lib/grants";
import { evaluateProposalRedTeam } from "@/lib/ai/red-team";
import type { GrantRequirementBOM } from "@/lib/ai/rfp-parser";
import { buildBudgetJustification, type BudgetInput, BudgetCalculation } from "@/lib/budget";
import { programGuidanceForProgram, winnerResearchForProgram } from "@/lib/grants/sources/winner-research";
import { BudgetBuilder } from "./BudgetBuilder";

type Section = { title: string; body: string };
const REQUIREMENT_DOCUMENT_LABELS: Record<GrantRequirementBOM["aiDraftableDocuments"][number]["documentType"], string> = {
  executive_summary: "Executive Summary",
  institutional: "Institutional Proposal",
  portal_answers: "Portal Answers",
  project_narrative: "Project Narrative",
  letter_of_inquiry: "Letter of Inquiry",
  budget_justification: "Budget Justification",
  short_answers: "Short Answers",
  federal_biosketch: "Federal Biosketch",
  facilities_resources: "Facilities and Resources",
  letter_commitment_template: "Letter of Commitment",
  data_management_plan: "Data Management Plan",
  commercialization_roadmap: "Commercialization Roadmap",
  financial_projections: "Financial Projections",
  video_pitch_script: "Video Pitch Script",
};
const GENERATED_NARRATIVE_FORMATS = new Set(["pdf", "docx", "txt"]);
const findRequirementsForType = (bom: GrantRequirementBOM, type: DocumentType) => {
  const parsedTypes: string[] = [type];
  if (type === "institutional") parsedTypes.push("project_narrative");
  if (type === "portal_answers") parsedTypes.push("short_answers");
  return bom.aiDraftableDocuments.find((item) => parsedTypes.includes(item.documentType));
};
const isDocumentType = (value: string): value is DocumentType =>
  (documentTypes as readonly string[]).includes(value);

export function ProposalStudio({
  grant,
  voiceCalibrated,
  availableEvidenceIds = [],
  vaultAttachments = [],
  onClose,
  onSaved,
}: {
  grant: Grant;
  voiceCalibrated: boolean;
  availableEvidenceIds?: readonly string[];
  vaultAttachments?: readonly { fileName: string; storagePath: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<DocumentType>("executive_summary");
  const [view, setView] = useState<"documents" | "budget" | "audit" | "requirements" | "winners" | "submit">("documents");
  const [docs, setDocs] = useState<Partial<Record<DocumentType, { sections: Section[]; fileName: string }>>>({});
  const [appId, setAppId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [budgetInput, setBudgetInput] = useState<BudgetInput | null>(null);
  const [budgetCalculation, setBudgetCalculation] = useState<BudgetCalculation | null>(null);
  const [solicitationText, setSolicitationText] = useState("");
  const [parsedBOM, setParsedBOM] = useState<GrantRequirementBOM | null>(null);
  const [parseBusy, setParseBusy] = useState(false);
  const [parseError, setParseError] = useState("");
  const [includeVaultEvidence, setIncludeVaultEvidence] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const gen = useServerFn(generateGrantDocument);
  const parseRequirements = useServerFn(analyzeGrantRequirements);
  const saveDraft = useServerFn(saveProposalDraft);
  const [dirty, setDirty] = useState(false);
  const current = docs[type];
  const winnerResearch = winnerResearchForProgram(grant.id);
  const publicProgramGuidance = programGuidanceForProgram(grant.id);
  const chooseRequirementDocument = (documentType: string) => {
    if (documentType === "budget_justification") {
      setView("budget");
      return;
    }
    const mappedType = documentType === "project_narrative"
      ? "institutional"
      : documentType === "short_answers" ? "portal_answers" : documentType;
    if (!isDocumentType(mappedType)) return;
    setType(mappedType);
    setView("documents");
  };
  const defaultBOM: GrantRequirementBOM = {
    grantId: grant.id,
    grantTitle: grant.title,
    formatting: { submissionMedium: "not_stated" },
    aiDraftableDocuments: [{ documentType: type, requiredHeadings: documentSpecs[type].sections.map((section) => section.title) }],
    userRequiredEvidence: [],
  };
  const bom = parsedBOM ?? defaultBOM;
  const solicitationWordLimits = parsedBOM ? findRequirementsForType(parsedBOM, type)?.wordLimitsPerSection : undefined;

  const parseSolicitation = async () => {
    setParseBusy(true);
    setParseError("");
    try {
      const result = await parseRequirements({
        data: { grantId: grant.id, grantTitle: grant.title, solicitationText },
      });
      setParsedBOM(result);
      toast.success("Grant-specific requirements extracted; review them against the official notice.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not analyze the solicitation.";
      setParseError(message);
      toast.error(message);
    } finally {
      setParseBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const r = await gen({ data: {
        type,
        title: grant.title,
        funder: grant.funder,
        amount: grant.amount,
        eligibilityReason: grant.eligibilityReason,
        grantId: grant.id,
        applicationId: appId,
        requirements: parsedBOM ?? undefined,
      } });
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
  const downloadPdf = () => {
    if (!current) return;
    try {
      const bytes = createPdf({ fileName: current.fileName, sections: current.sections.map((section) => ({ ...section, body: toCleanText(section.body) })) });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = current.fileName.replace(/\.[^.]+$/u, "") + ".pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the PDF.");
    }
  };
  const exportPackage = async () => {
    const documents = Object.values(docs).flatMap((doc) => doc ? [doc] : []);
    const budget = budgetInput && budgetCalculation?.valid
      ? { input: budgetInput, calculation: budgetCalculation }
      : undefined;
    if (!documents.length && !budget) {
      toast.error("Generate a proposal document or a valid budget before exporting.");
      return;
    }

    setPackageBusy(true);
    try {
      const attachments: { fileName: string; bytes: Uint8Array }[] = [];
      if (includeVaultEvidence) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in again before exporting private Vault evidence.");
        let totalBytes = 0;
        if (vaultAttachments.length > 50) throw new Error("The Vault has too many files for one export. Select fewer evidence files first.");
        for (const attachment of vaultAttachments) {
          if (!attachment.storagePath.startsWith(`${user.id}/`)) throw new Error("A Vault file did not pass the ownership check; export stopped.");
          const { data, error } = await supabase.storage.from("vault").download(attachment.storagePath);
          if (error || !data) throw new Error(`Could not download Vault evidence: ${attachment.fileName}`);
          const bytes = new Uint8Array(await data.arrayBuffer());
          totalBytes += bytes.byteLength;
          if (totalBytes > 50 * 1024 * 1024) throw new Error("Vault evidence exceeds the 50MB package limit. Uncheck evidence or select fewer files.");
          attachments.push({ fileName: attachment.fileName, bytes });
        }
      }

      const bytes = buildApplicationPackage({
        grantTitle: grant.title,
        funder: grant.funder,
        amount: grant.amount,
        documents,
        ...(parsedBOM ? { requirements: parsedBOM } : {}),
        ...(budget ? { budget } : {}),
        attachments,
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${grant.title.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/gu, "").slice(0, 60) || "grant"}-application-package.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Application package downloaded. Review all drafts before submission.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export the application package.");
    } finally {
      setPackageBusy(false);
    }
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
  const proposalText = Object.values(docs).flatMap((doc) => doc?.sections ?? []).map((section) => `## ${section.title}\n${section.body}`).join("\n\n");
  const audit = proposalText
    ? evaluateProposalRedTeam({
      proposalText,
      bom,
      availableEvidenceIds,
      budget: {
        matchRequired: budgetInput?.costSharingPercentage != null,
        ...(budgetCalculation?.valid ? {
          requestedAmount: budgetCalculation.grantRequest,
          requiredMatchAmount: budgetCalculation.requiredMatch,
        } : {}),
        ...(budgetInput?.awardCeiling != null ? { ceiling: budgetInput.awardCeiling } : {}),
        ...(budgetInput?.costSharingPercentage != null ? { matchRate: budgetInput.costSharingPercentage / 100 } : {}),
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
          <button onClick={() => setView("requirements")} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${view === "requirements" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            Grant Requirements
          </button>
          <button onClick={() => setView("submit")} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${view === "submit" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            Prepare to Submit
          </button>
          {grant.publicWinnerHistoryUrl && <button onClick={() => setView("winners")} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${view === "winners" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>Winner Research</button>}
          {view === "documents" && documentTypes.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${t === type ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
              {documentSpecs[t].label}{docs[t] ? " ✓" : ""}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className={view === "budget" ? "" : "hidden"}>
            <BudgetBuilder
              onChange={(input, calculation) => {
                setBudgetInput(input);
                setBudgetCalculation(calculation);
              }}
            />
          </div>
          {view === "requirements" ? (
            <div className="space-y-5">
              <section className="space-y-3">
                <h4 className="font-bold text-sm">Extract this funder’s checklist</h4>
                <p className="text-xs text-muted-foreground">Paste the official notice or application instructions. Only explicitly stated requirements are extracted. This checklist is session-only; verify it against the funder’s current instructions.</p>
                <textarea
                  aria-label="Grant solicitation text"
                  value={solicitationText}
                  onChange={(event) => setSolicitationText(event.target.value)}
                  rows={9}
                  maxLength={30000}
                  placeholder="Paste the official solicitation or application instructions here (100–30,000 characters)…"
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{solicitationText.length}/30,000 characters</span>
                  <button type="button" disabled={parseBusy || solicitationText.trim().length < 100} onClick={parseSolicitation}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">
                    {parseBusy ? "Analyzing…" : parsedBOM ? "Re-analyze solicitation" : "Extract requirements"}
                  </button>
                </div>
                {parseError && <p role="alert" className="text-xs text-destructive">{parseError}</p>}
              </section>
              <section className="space-y-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <h4 className="font-bold text-sm">Requirement checklist</h4>
                  <span className="text-xs text-muted-foreground">Submission format: {bom.formatting.submissionMedium.replaceAll("_", " ")}</span>
                </div>
                {bom.formatting.pageLimit && <p className="text-xs">Page limit: {bom.formatting.pageLimit}</p>}
                {bom.formatting.wordCountLimit && <p className="text-xs">Word limit: {bom.formatting.wordCountLimit}</p>}
                {bom.formatting.fontFamilyRequired && <p className="text-xs">Required font: {bom.formatting.fontFamilyRequired}</p>}
                {bom.aiDraftableDocuments.map((item) => (
                  <div key={item.documentType}>
                    <p className="text-xs">
                      {REQUIREMENT_DOCUMENT_LABELS[item.documentType]} file format: {item.fileFormats?.join(", ") || "Not stated"}
                    </p>
                    {item.fileFormats?.some((format) => !GENERATED_NARRATIVE_FORMATS.has(format.toLowerCase().replace(/^\./u, ""))) && (
                      <p role="alert" className="text-xs text-amber-700">AutoGrant exports PDF, DOCX, and TXT narratives only. Create the required format in the funder’s official system or with an approved tool.</p>
                    )}
                  </div>
                ))}
                {bom.userRequiredEvidence.length ? bom.userRequiredEvidence.map((item) => {
                  const available = availableEvidenceIds.includes(item.evidenceId) || availableEvidenceIds.includes(item.autoMatchVaultTag);
                  return (
                    <div key={item.evidenceId} className="p-3 rounded-lg border border-border bg-background">
                      <p className="text-sm font-semibold"><span className={available ? "text-success" : "text-amber-600"}>{available ? "✓" : "!"}</span> {item.name} {item.isMandatory ? "(mandatory)" : "(requested)"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.reason} · {item.category.replaceAll("_", " ")}</p>
                      <p className="text-xs mt-1">Required file format: {item.fileFormats?.join(", ") || "Not stated"}</p>
                      <p className="text-xs mt-1">{available ? "Matching Vault slot or category tag found; confirm the file is the requested evidence." : "Not found in the matching Vault slot or category; upload or confirm the required evidence."}</p>
                    </div>
                  );
                }) : <p className="text-xs text-muted-foreground">{parsedBOM ? "The parser found no explicit evidence attachments. Check the original notice." : "Paste the solicitation above to extract required forms, attachments, and evidence."}</p>}
                <div className="space-y-2">
                  {bom.aiDraftableDocuments.map((item) => {
                    const documentType = item.documentType;
                    return (
                      <div key={`${documentType}-${item.requiredHeadings.join("|")}`} className="p-3 rounded-lg border border-border bg-background">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="text-sm font-semibold">{documentType.replaceAll("_", " ")}</p>
                          {(isDocumentType(documentType) || documentType === "project_narrative" || documentType === "short_answers" || documentType === "budget_justification") && (
                            <button type="button" onClick={() => chooseRequirementDocument(documentType)} className="text-xs text-primary underline">
                              {documentType === "budget_justification" ? "Open Budget Builder" : "Draft this document"}
                            </button>
                          )}
                        </div>
                        {item.requiredHeadings.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Required headings: {item.requiredHeadings.join(" · ")}</p>}
                      </div>
                    );
                  })}
                </div>
                {parsedBOM && <p className="text-[11px] text-amber-700">AI-extracted text is not an authoritative compliance determination. Confirm every requirement, eligibility rule, and deadline in the current official notice.</p>}
              </section>
            </div>
          ) : view === "submit" ? (
            <section className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-background p-5 space-y-3">
                <h4 className="font-bold text-sm">Submission handoff</h4>
                <p className="text-xs text-muted-foreground">
                  AutoGrant prepares the application, but you complete the funder portal and click Submit. This keeps your legal identity, account, signatures, fees, and final attestations under your control.
                </p>
              </div>
              <ol className="space-y-3">
                {[
                  ["Review the official notice", "Verify the deadline, eligibility, required forms, page limits, file formats, and cost-share terms."],
                  ["Finish every draft", "Generate and edit the required documents, complete the Budget Builder, and resolve critical Audit findings."],
                  ["Export or copy the package", "Use the Proposal documents tab to download PDFs or the complete application ZIP, then recheck file names."],
                  ["Open the official portal", grant.officialUrl ? "Create or sign in to the funder account, upload the package, complete portal fields, and review the final screen." : "Open the official funder site or Grants.gov opportunity, locate the application workspace, and follow the current instructions."],
                  ["Submit and save proof", "Only you should click Submit. Save the confirmation number and receipt, then mark the application submitted in the tracker."],
                ].map(([title, detail], index) => (
                  <li key={title} className="flex gap-3 rounded-xl border border-border bg-background p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
                    <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
                  </li>
                ))}
              </ol>
              {grant.officialUrl ? (
                <a
                  href={grant.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full rounded-lg bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
                >
                  Open Official Grant / Application Portal
                </a>
              ) : (
                <p className="text-xs text-amber-700">No official application URL was supplied for this draft. Confirm the source on the grant listing before proceeding.</p>
              )}
              <p className="text-[11px] text-muted-foreground">AutoGrant does not transmit applications, accept attestations, or confirm a portal submission. “Submit” remains the applicant’s action.</p>
            </section>
          ) : view === "winners" ? (
            <section className="space-y-4">
              <div>
                <h4 className="font-bold text-sm">Public winner research</h4>
                <p className="text-xs text-muted-foreground mt-1">These public stories show what the funder chose to publish, not why a winner was selected. AutoGrant uses documented examples only as structural inspiration; it does not treat them as a success formula.</p>
                <a className="mt-2 inline-block text-xs text-primary underline" href={grant.publicWinnerHistoryUrl} target="_blank" rel="noreferrer">Open the funder’s winner archive</a>
              </div>
              {publicProgramGuidance.map((guidance) => (
                <article key={guidance.sourceUrl} className="p-4 rounded-xl border border-primary/30 bg-background space-y-2">
                  <h5 className="text-sm font-semibold">Published application guidance</h5>
                  {guidance.publishedGuidance.map((item) => <p key={item} className="text-xs">{item}</p>)}
                  <p className="text-xs text-amber-700">{guidance.interpretationLimit}</p>
                  <a className="text-xs text-primary underline" href={guidance.sourceUrl} target="_blank" rel="noreferrer">Read original guidance · {guidance.sourceName}</a>
                </article>
              ))}
              {winnerResearch.length ? winnerResearch.map((caseStudy) => (
                <article key={caseStudy.sourceUrl} className="p-4 rounded-xl border border-border bg-background space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h5 className="text-sm font-semibold">{caseStudy.winner}</h5>
                    <span className="text-xs text-muted-foreground">{caseStudy.awardDate} · {caseStudy.awardAmount}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{caseStudy.sourceName}</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {caseStudy.publishedFacts.map((fact) => <li key={fact} className="text-xs">{fact}</li>)}
                  </ul>
                  <p className="text-xs text-amber-700">{caseStudy.interpretationLimit}</p>
                  <a className="text-xs text-primary underline" href={caseStudy.sourceUrl} target="_blank" rel="noreferrer">Read original winner interview</a>
                </article>
              )) : <p className="text-xs text-muted-foreground">No case studies have been verified for this program yet. The archive is linked above; no winner insights will be invented.</p>}
            </section>
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
          ) : view === "documents" && busy ? (
            <div className="h-60 flex items-center justify-center gap-2 text-sm text-primary"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Writing your {documentSpecs[type].label} in your voice…</div>
          ) : view === "documents" && current ? (
            <>
              <p className="text-xs text-muted-foreground">Saved to Vault as <span className="text-foreground font-medium">{current.fileName}</span></p>
              {current.sections.map((s, i) => {
                const max = solicitationWordLimits?.[s.title] ?? documentSpecs[type].sections.find((section) => section.title === s.title)?.maxWords;
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
          ) : view === "documents" ? (
            <div className="h-60 flex flex-col items-center justify-center text-center gap-2 text-sm text-muted-foreground">
              <p>{documentSpecs[type].sections.length} sections: {documentSpecs[type].sections.map((s) => s.title).join(" · ")}</p>
              <p className="text-xs">Built from your intake and Vault documents.</p>
            </div>
          ) : null}
        </div>
        {view === "documents" && <div className="flex gap-3 border-t border-border p-5 flex-wrap">
          <button disabled={busy} onClick={run} className="flex-1 py-2.5 bg-primary text-primary-foreground font-bold rounded-lg text-sm disabled:opacity-40">{current ? "Regenerate" : "Generate"} {documentSpecs[type].label}</button>
          <button disabled={!current || busy} onClick={saveEdits} className="px-4 py-2.5 border border-primary/50 text-primary rounded-lg text-sm font-semibold disabled:opacity-40">{dirty ? "Save Edits" : "Save"}</button>
          <button disabled={!current || busy} onClick={copy} className="px-4 py-2.5 border border-border rounded-lg text-sm font-semibold disabled:opacity-40">Copy Clean Text</button>
          <button disabled={!current || busy} onClick={download} className="px-4 py-2.5 border border-border rounded-lg text-sm font-semibold disabled:opacity-40">Download</button>
          <button disabled={!current || busy} onClick={downloadPdf} className="px-4 py-2.5 border border-border rounded-lg text-sm font-semibold disabled:opacity-40">Download PDF</button>
          <label className="w-full flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeVaultEvidence} onChange={(event) => setIncludeVaultEvidence(event.target.checked)} />
            Include all Vault files in the ZIP (may include sensitive tax/financial records)
          </label>
          <button disabled={packageBusy || busy} onClick={exportPackage} className="w-full px-4 py-2.5 border border-primary/50 text-primary rounded-lg text-sm font-semibold disabled:opacity-40">
            {packageBusy ? "Preparing package…" : "Export Application Package (.zip)"}
          </button>
        </div>}
      </div>
    </div>
  );
}
