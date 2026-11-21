import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildBudgetJustification,
  calculateBudget,
  type BudgetInput,
  type BudgetCalculation,
  type EquipmentBudgetItem,
  type InstitutionalBudgetItem,
} from "@/lib/budget";

type EquipmentDraft = { vendor: string; quantity: string; unitCost: string; freight: string; tax: string };
type InstitutionalDraft = { category: string; basis: string; amount: string };

type BudgetBuilderProps = {
  awardCeiling?: number | null;
  costSharingPercentage?: number | null;
  onChange?: (input: BudgetInput, calculation: BudgetCalculation | null) => void;
};

const newEquipment = (): EquipmentDraft => ({ vendor: "", quantity: "1", unitCost: "0", freight: "0", tax: "0" });
const newInstitutional = (): InstitutionalDraft => ({ category: "", basis: "", amount: "0" });
const numberValue = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
const validNumber = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
const formatMoney = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BudgetBuilder({ awardCeiling, costSharingPercentage, onChange }: BudgetBuilderProps) {
  const [equipment, setEquipment] = useState<EquipmentDraft[]>([newEquipment()]);
  const [institutional, setInstitutional] = useState<InstitutionalDraft[]>([newInstitutional()]);
  const [ceiling, setCeiling] = useState(awardCeiling == null ? "" : String(awardCeiling));
  const [noCeiling, setNoCeiling] = useState(awardCeiling === null);
  const [matchPercentage, setMatchPercentage] = useState(costSharingPercentage == null ? "" : String(costSharingPercentage));
  const [noMatch, setNoMatch] = useState(costSharingPercentage === null);

  const termsComplete = (noCeiling || validNumber(ceiling)) && (noMatch || validNumber(matchPercentage));
  const input = useMemo(() => ({
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
  }), [equipment, institutional, noCeiling, ceiling, noMatch, matchPercentage]);
  const calculation = useMemo(() => termsComplete ? calculateBudget(input) : null, [input, termsComplete]);
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
    <div className="space-y-5">
      <div>
        <h4 className="text-base font-bold">Budget Builder</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Enter costs and the terms stated by the funder. Match is calculated as a percentage of total project costs.
        </p>
      </div>

      <section className="bg-background border border-border rounded-xl p-4 space-y-4">
        <h5 className="font-semibold text-sm">Grant terms</h5>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="block font-medium">Award ceiling ($)</span>
            <input aria-label="Award ceiling" type="number" min="0" step="0.01" value={noCeiling ? "" : ceiling}
              disabled={noCeiling} onChange={(e) => setCeiling(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50" />
            <span className="flex items-center gap-2 text-muted-foreground">
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
            <span className="flex items-center gap-2 text-muted-foreground">
              <input aria-label="No cost-sharing percentage stated" type="checkbox" checked={noMatch}
                onChange={(e) => setNoMatch(e.target.checked)} />
              No cost-sharing percentage stated in the terms
            </span>
          </label>
        </div>
        {!termsComplete && <p className="text-xs text-amber-600">Enter each term or confirm it is not stated before calculating.</p>}
      </section>

      <section className="bg-background border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h5 className="font-semibold text-sm">Equipment</h5><p className="text-xs text-muted-foreground">Vendor, quantity, unit cost, freight, and tax.</p></div>
          <button type="button" onClick={() => setEquipment((items) => [...items, newEquipment()])}
            className="px-3 py-2 border border-border rounded-lg text-xs font-semibold">Add equipment</button>
        </div>
        {equipment.map((item, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-6 items-end border-t border-border pt-3">
            <TextField label="Vendor" value={item.vendor} onChange={(vendor) => updateEquipment(index, { vendor })} />
            <NumberField label="Quantity" value={item.quantity} onChange={(quantity) => updateEquipment(index, { quantity })} />
            <NumberField label="Unit cost ($)" value={item.unitCost} onChange={(unitCost) => updateEquipment(index, { unitCost })} />
            <NumberField label="Freight ($)" value={item.freight} onChange={(freight) => updateEquipment(index, { freight })} />
            <NumberField label="Tax ($)" value={item.tax} onChange={(tax) => updateEquipment(index, { tax })} />
            <button type="button" disabled={equipment.length === 1} onClick={() => setEquipment((items) => items.filter((_, row) => row !== index))}
              className="py-2 text-xs text-muted-foreground disabled:opacity-30">Remove</button>
          </div>
        ))}
      </section>

      <section className="bg-background border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h5 className="font-semibold text-sm">Institutional costs</h5><p className="text-xs text-muted-foreground">Category, basis, and amount.</p></div>
          <button type="button" onClick={() => setInstitutional((items) => [...items, newInstitutional()])}
            className="px-3 py-2 border border-border rounded-lg text-xs font-semibold">Add institutional cost</button>
        </div>
        {institutional.map((item, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-4 items-end border-t border-border pt-3">
            <TextField label="Category" value={item.category} onChange={(category) => updateInstitutional(index, { category })} />
            <TextField label="Basis" value={item.basis} onChange={(basis) => updateInstitutional(index, { basis })} />
            <NumberField label="Amount ($)" value={item.amount} onChange={(amount) => updateInstitutional(index, { amount })} />
            <button type="button" disabled={institutional.length === 1} onClick={() => setInstitutional((items) => items.filter((_, row) => row !== index))}
              className="py-2 text-xs text-muted-foreground disabled:opacity-30">Remove</button>
          </div>
        ))}
      </section>

      {!termsComplete ? null : calculation && !calculation.valid ? (
        <section role="alert" className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-1">
          <h5 className="font-semibold text-sm">Review the budget</h5>
          {calculation.errors.map((error) => <p key={error} className="text-xs text-destructive">{error}</p>)}
        </section>
      ) : calculation && (
        <section className="bg-primary/5 border border-primary/30 rounded-xl p-4 space-y-3">
          <h5 className="font-semibold text-sm">Budget totals</h5>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <p>Equipment: <strong>{formatMoney(calculation.equipmentTotal)}</strong></p>
            <p>Institutional: <strong>{formatMoney(calculation.institutionalTotal)}</strong></p>
            <p>Total project cost: <strong>{formatMoney(calculation.totalProjectCost)}</strong></p>
            <p>Grant request: <strong>{formatMoney(calculation.grantRequest)}</strong></p>
            <p>Required match: <strong>{formatMoney(calculation.requiredMatch)}</strong></p>
          </div>
          <label className="block text-xs font-semibold" htmlFor="budget-justification">Plain-English budget justification</label>
          <textarea id="budget-justification" readOnly value={justification}
            className="w-full min-h-28 rounded-lg border border-border bg-card p-3 text-sm leading-relaxed" />
          <button type="button" onClick={copyJustification} className="px-3 py-2 border border-border rounded-lg text-xs font-semibold">
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
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs">
      <span className="block font-medium">{label}</span>
      <input type="number" min="0" step="0.01" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
    </label>
  );
}
