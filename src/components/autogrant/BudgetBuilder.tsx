import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { VaultDocument } from "@/lib/vault";
import {
  buildBudgetJustification,
  calculateBudget,
  type BudgetInput,
  type BudgetCalculation,
  federalBudgetCategoryNames,
  type FederalBudgetCosts,
  type EquipmentBudgetItem,
  type InstitutionalBudgetItem,
} from "@/lib/budget";

type EquipmentDraft = { vendor: string; quantity: string; unitCost: string; freight: string; tax: string; purpose: string; milestone: string };
type InstitutionalDraft = { category: string; basis: string; amount: string; purpose: string; milestone: string };

type BudgetBuilderProps = {
  awardCeiling?: number | null;
  costSharingPercentage?: number | null;
  savedBudgetDocs?: VaultDocument[];
  onOpenVaultDoc?: (doc: VaultDocument) => void;
  onChange?: (input: BudgetInput, calculation: BudgetCalculation | null) => void;
  onAskMissingDetails?: ((context?: string) => void) | undefined;
};

const newEquipment = (): EquipmentDraft => ({ vendor: "", quantity: "", unitCost: "", freight: "", tax: "", purpose: "", milestone: "" });
const newInstitutional = (): InstitutionalDraft => ({ category: "", basis: "", amount: "", purpose: "", milestone: "" });
const numberValue = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
const validNumber = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
const formatMoney = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BudgetBuilder({
  awardCeiling,
  costSharingPercentage,
  savedBudgetDocs = [],
  onOpenVaultDoc,
  onChange,
  onAskMissingDetails,
}: BudgetBuilderProps) {
  const [track, setTrack] = useState<"small_business" | "federal">("small_business");
  const [federalCosts, setFederalCosts] = useState<FederalBudgetCosts>(() =>
    Object.fromEntries(federalBudgetCategoryNames.map((name) => [name, Number.NaN])) as FederalBudgetCosts,
  );
  const [equipment, setEquipment] = useState<EquipmentDraft[]>([newEquipment()]);
  const [institutional, setInstitutional] = useState<InstitutionalDraft[]>([newInstitutional()]);
  const [ceiling, setCeiling] = useState(awardCeiling == null ? "" : String(awardCeiling));
  const [noCeiling, setNoCeiling] = useState(awardCeiling === null);
  const [matchPercentage, setMatchPercentage] = useState(costSharingPercentage == null ? "" : String(costSharingPercentage));
  const [noMatch, setNoMatch] = useState(costSharingPercentage === null);

  const termsComplete = (noCeiling || validNumber(ceiling)) && (noMatch || validNumber(matchPercentage));
  const input = useMemo(() => ({
    track,
    federalCosts,
    equipment: equipment.map((item): EquipmentBudgetItem => ({
      vendor: item.vendor,
      quantity: numberValue(item.quantity),
      unitCost: numberValue(item.unitCost),
      freight: numberValue(item.freight),
      tax: numberValue(item.tax),
    })),
    institutional: institutional.map((item): InstitutionalBudgetItem => ({
      category: item.category,
      basis: item.basis,
      amount: numberValue(item.amount),
    })),
    awardCeiling: noCeiling ? null : numberValue(ceiling),
    costSharingPercentage: noMatch ? null : numberValue(matchPercentage),
  }), [track, federalCosts, equipment, institutional, noCeiling, ceiling, noMatch, matchPercentage]);
  const costsComplete = track === "federal"
    ? Object.values(federalCosts).every(Number.isFinite)
    : equipment.every((item) => [item.quantity, item.unitCost, item.freight, item.tax].every((value) => value.trim() !== ""))
      && institutional.every((item) => item.amount.trim() !== "");
  const calculation = useMemo(() => termsComplete && costsComplete ? calculateBudget(input) : null, [input, termsComplete, costsComplete]);
  const justification = calculation?.valid ? buildBudgetJustification(input, calculation) : "";
  useEffect(() => { onChange?.(input, calculation); }, [input, calculation, onChange]);

  const updateEquipment = (index: number, patch: Partial<EquipmentDraft>) => {
    setEquipment((items) => items.map((item, row) => row === index ? { ...item, ...patch } : item));
  };
  const updateInstitutional = (index: number, patch: Partial<InstitutionalDraft>) => {
    setInstitutional((items) => items.map((item, row) => row === index ? { ...item, ...patch } : item));
  };
  const copyJustification = async () => {
    try {
      await navigator.clipboard.writeText(justification);
      toast.success("Budget justification copied");
    } catch {
      toast.error("Could not copy the justification");
    }
  };

  return (
    <div className="space-y-5 text-slate-100">
      <div>
        <h4 className="text-base font-bold">Budget Builder</h4>
        <p className="text-sm text-slate-300 mt-1">
          Enter costs from quotes or documented estimates and terms from the official grant notice. This worksheet calculates the project total, grant request, and required match; it will not guess missing amounts.
        </p>
      </div>

      {savedBudgetDocs.length > 0 && (
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h5 className="font-semibold text-sm">Saved budget records in Vault</h5>
            <span className="text-[11px] font-mono text-emerald-300">{savedBudgetDocs.length} saved</span>
          </div>
          <p className="text-xs text-slate-300">
            Budget line items added in chat and saved budget justifications are stored in your Vault so they persist across sessions.
          </p>
          <div className="space-y-1.5">
            {savedBudgetDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs">
                <span className="truncate text-slate-200">{doc.name}</span>
                {onOpenVaultDoc && (
                  <button
                    type="button"
                    onClick={() => onOpenVaultDoc(doc)}
                    className="shrink-0 text-emerald-300 hover:underline font-medium"
                  >
                    View
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
        <h5 className="font-semibold text-sm">Budget track</h5>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={track === "small_business"} onClick={() => setTrack("small_business")}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold ${track === "small_business" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            Small Business — Itemized Quotes
          </button>
          <button type="button" aria-pressed={track === "federal"} onClick={() => setTrack("federal")}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold ${track === "federal" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            Federal — SF-424A Planning Worksheet
          </button>
        </div>
        {track === "federal" && (
          <p className="text-sm text-amber-200">Planning aid only. This does not create or submit the official SF-424A. Verify categories and amounts against the agency solicitation and current federal form.</p>
        )}
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
        <h5 className="font-semibold text-sm">Grant terms</h5>
        <p className="text-sm text-slate-300">Copy the award limit and cost-share rate from the grant notice. If the notice does not state one, check the box to say so.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="block font-medium">Award ceiling ($)</span>
            <input aria-label="Award ceiling" type="number" min="0" step="0.01" value={noCeiling ? "" : ceiling}
              disabled={noCeiling} onChange={(e) => setCeiling(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50" />
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <input aria-label="No award ceiling stated" type="checkbox" checked={noCeiling}
                onChange={(e) => setNoCeiling(e.target.checked)} />
              No award ceiling stated in the terms
            </span>
          </label>
          <label className="space-y-1 text-xs">
            <span className="block font-medium">Cost-sharing percentage of total project costs</span>
            <input aria-label="Cost-sharing percentage" type="number" min="0" max="100" step="0.01"
              value={noMatch ? "" : matchPercentage} disabled={noMatch} onChange={(e) => setMatchPercentage(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50" />
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <input aria-label="No cost-sharing percentage stated" type="checkbox" checked={noMatch}
                onChange={(e) => setNoMatch(e.target.checked)} />
              No cost-sharing percentage stated in the terms
            </span>
          </label>
        </div>
        {!termsComplete && <p className="text-sm font-medium text-amber-200">Enter each term or confirm it is not stated before calculating.</p>}
      </section>

      {track === "small_business" ? <>
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h5 className="font-semibold text-sm">Equipment</h5><p className="text-sm text-slate-300">Use a vendor quote for quantity, unit price, freight, and tax. Explain why the item is needed and what project milestone it supports.</p></div>
          <button type="button" onClick={() => { setEquipment((items) => [...items, newEquipment()]); onAskMissingDetails?.("equipment"); }}
            className="px-3 py-2 border border-border rounded-lg text-xs font-semibold">Add equipment cost</button>
        </div>
        {equipment.map((item, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-4 items-end border-t border-slate-600 pt-3">
            <TextField label="Vendor" value={item.vendor} onChange={(vendor) => updateEquipment(index, { vendor })} />
            <NumberField label="Quantity" value={item.quantity} onChange={(quantity) => updateEquipment(index, { quantity })} />
            <NumberField label="Unit cost ($)" value={item.unitCost} onChange={(unitCost) => updateEquipment(index, { unitCost })} />
            <NumberField label="Freight ($)" value={item.freight} onChange={(freight) => updateEquipment(index, { freight })} />
            <NumberField label="Tax ($)" value={item.tax} onChange={(tax) => updateEquipment(index, { tax })} />
            <TextField label="What will this cost support?" value={item.purpose} onChange={(purpose) => updateEquipment(index, { purpose })} />
            <TextField label="Goal or milestone" value={item.milestone} onChange={(milestone) => updateEquipment(index, { milestone })} />
            <button type="button" onClick={() => onAskMissingDetails?.(`equipment item ${index + 1}`)}
              className="py-2 text-xs text-primary underline">Ask Copilot about this line</button>
            <button type="button" disabled={equipment.length === 1} onClick={() => setEquipment((items) => items.filter((_, row) => row !== index))}
              className="py-2 text-xs text-muted-foreground disabled:opacity-30">Remove</button>
          </div>
        ))}
      </section>
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h5 className="font-semibold text-sm">Other project costs</h5><p className="text-sm text-slate-300">For non-equipment costs, name the category, show the quote or calculation behind the amount, and explain its purpose and milestone.</p></div>
          <button type="button" onClick={() => { setInstitutional((items) => [...items, newInstitutional()]); onAskMissingDetails?.("other project cost"); }}
            className="px-3 py-2 border border-border rounded-lg text-xs font-semibold">Add institutional cost</button>
        </div>
        {institutional.map((item, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-3 items-end border-t border-slate-600 pt-3">
            <TextField label="Category" value={item.category} onChange={(category) => updateInstitutional(index, { category })} />
            <TextField label="Quote or estimate basis" value={item.basis} onChange={(basis) => updateInstitutional(index, { basis })} />
            <NumberField label="Amount ($)" value={item.amount} onChange={(amount) => updateInstitutional(index, { amount })} />
            <TextField label="What will this cost support?" value={item.purpose} onChange={(purpose) => updateInstitutional(index, { purpose })} />
            <TextField label="Goal or milestone" value={item.milestone} onChange={(milestone) => updateInstitutional(index, { milestone })} />
            <button type="button" onClick={() => onAskMissingDetails?.(`other project cost ${index + 1}`)}
              className="py-2 text-xs text-primary underline">Ask Copilot about this line</button>
            <button type="button" disabled={institutional.length === 1} onClick={() => setInstitutional((items) => items.filter((_, row) => row !== index))}
              className="py-2 text-xs text-muted-foreground disabled:opacity-30">Remove</button>
          </div>
        ))}
      </section>
      </> : (
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <h5 className="font-semibold text-sm">Federal cost categories</h5>
          <p className="text-sm text-slate-300">Enter the amount requested in each category from the federal notice. Use 0 for categories with no costs and confirm each cost is allowed by the notice.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {federalBudgetCategoryNames.map((category) => (
              <NumberField
                key={category}
                label={`${category} ($)`}
                value={Number.isFinite(federalCosts[category]) ? String(federalCosts[category]) : ""}
                onChange={(value) => setFederalCosts((costs) => ({ ...costs, [category]: numberValue(value) }))}
              />
            ))}
          </div>
        </section>
      )}

      {termsComplete && !costsComplete && <p className="text-sm font-medium text-amber-200">Enter each amount, or 0 when there is no cost, before calculating. Use a quote or documented estimate as your source.</p>}
      {!termsComplete || !costsComplete ? null : calculation && !calculation.valid ? (
        <section role="alert" className="bg-red-950 border border-red-700 rounded-xl p-4 space-y-1 text-red-100">
          <h5 className="font-semibold text-sm">Review the budget</h5>
          {calculation.errors.map((error) => <p key={error} className="text-xs text-destructive">{error}</p>)}
        </section>
      ) : calculation && (
        <section className="bg-slate-800 border border-slate-600 rounded-xl p-4 space-y-3">
          <h5 className="font-semibold text-sm">Budget totals</h5>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {track === "federal" ? (
              <p>Federal category total: <strong>{formatMoney(calculation.totalProjectCost)}</strong></p>
            ) : <>
              <p>Equipment: <strong>{formatMoney(calculation.equipmentTotal)}</strong></p>
              <p>Institutional: <strong>{formatMoney(calculation.institutionalTotal)}</strong></p>
            </>}
            <p>Total project cost: <strong>{formatMoney(calculation.totalProjectCost)}</strong></p>
            <p>Grant request: <strong>{formatMoney(calculation.grantRequest)}</strong></p>
            <p>Required match: <strong>{formatMoney(calculation.requiredMatch)}</strong></p>
          </div>
          <label className="block text-xs font-semibold" htmlFor="budget-justification">Plain-English budget justification</label>
          <textarea id="budget-justification" readOnly value={justification}
            className="w-full min-h-28 rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm leading-relaxed text-white" />
          <button type="button" onClick={copyJustification} className="px-3 py-2 border border-slate-500 rounded-lg text-sm font-semibold text-white hover:bg-slate-700">
            Copy justification
          </button>
        </section>
      )}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs">
      <span className="block font-medium">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-base text-white placeholder:text-slate-400" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs">
      <span className="block font-medium">{label}</span>
      <input type="number" min="0" step="0.01" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-base text-white placeholder:text-slate-400" />
    </label>
  );
}
