export type EquipmentBudgetItem = {
  vendor: string;
  quantity: number;
  unitCost: number;
  freight: number;
  tax: number;
};

export type InstitutionalBudgetItem = {
  category: string;
  basis: string;
  amount: number;
};

export type BudgetInput = {
  equipment: EquipmentBudgetItem[];
  institutional: InstitutionalBudgetItem[];
  awardCeiling: number | null;
  costSharingPercentage: number | null;
};

export type BudgetCalculation = {
  valid: boolean;
  errors: string[];
  equipmentTotal: number;
  institutionalTotal: number;
  totalProjectCost: number;
  grantRequest: number;
  requiredMatch: number;
};

const isNonnegativeFinite = (value: number) => Number.isFinite(value) && value >= 0;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateBudget(input: BudgetInput): BudgetCalculation {
  const errors: string[] = [];
  let equipmentTotal = 0;
  let institutionalTotal = 0;

  input.equipment.forEach((item, index) => {
    const row = index + 1;
    if (!isNonnegativeFinite(item.quantity)) errors.push(`Equipment item ${row}: quantity must be a nonnegative finite number.`);
    if (!isNonnegativeFinite(item.unitCost)) errors.push(`Equipment item ${row}: unit cost must be a nonnegative finite number.`);
    if (!isNonnegativeFinite(item.freight)) errors.push(`Equipment item ${row}: freight must be a nonnegative finite number.`);
    if (!isNonnegativeFinite(item.tax)) errors.push(`Equipment item ${row}: tax must be a nonnegative finite number.`);

    if (![item.quantity, item.unitCost, item.freight, item.tax].every(isNonnegativeFinite)) return;
    const lineTotal = item.quantity * item.unitCost + item.freight + item.tax;
    if (!Number.isFinite(lineTotal)) {
      errors.push(`Equipment item ${row}: line total is too large.`);
      return;
    }
    if (lineTotal > 0 && !item.vendor.trim()) errors.push(`Equipment item ${row}: vendor is required for a nonzero cost.`);
    equipmentTotal += money(lineTotal);
  });

  input.institutional.forEach((item, index) => {
    const row = index + 1;
    if (!isNonnegativeFinite(item.amount)) {
      errors.push(`Institutional item ${row}: amount must be a nonnegative finite number.`);
      return;
    }
    if (item.amount > 0 && !item.category.trim()) errors.push(`Institutional item ${row}: category is required for a nonzero cost.`);
    if (item.amount > 0 && !item.basis.trim()) errors.push(`Institutional item ${row}: basis is required for a nonzero cost.`);
    institutionalTotal += money(item.amount);
  });

  if (!Number.isFinite(equipmentTotal) || !Number.isFinite(institutionalTotal)) {
    errors.push("Budget totals must be finite numbers.");
  }
  if (input.awardCeiling !== null && !isNonnegativeFinite(input.awardCeiling)) {
    errors.push("Award ceiling must be a nonnegative finite number.");
  }
  if (input.costSharingPercentage !== null &&
      (!Number.isFinite(input.costSharingPercentage) || input.costSharingPercentage < 0 || input.costSharingPercentage > 100)) {
    errors.push("Cost-sharing percentage must be between 0 and 100.");
  }

  const totalProjectCost = money(equipmentTotal + institutionalTotal);
  const percentage = input.costSharingPercentage ?? 0;
  const requiredMatch = money(totalProjectCost * percentage / 100);
  const grantRequest = money(totalProjectCost - requiredMatch);

  if (!Number.isFinite(totalProjectCost) || !Number.isFinite(requiredMatch) || !Number.isFinite(grantRequest)) {
    errors.push("Calculated budget amounts must be finite numbers.");
  }
  if (input.awardCeiling !== null && isNonnegativeFinite(input.awardCeiling) && grantRequest > input.awardCeiling) {
    errors.push("Grant request exceeds the entered award ceiling.");
  }

  return {
    valid: errors.length === 0,
    errors,
    equipmentTotal: money(equipmentTotal),
    institutionalTotal: money(institutionalTotal),
    totalProjectCost,
    grantRequest,
    requiredMatch,
  };
}

export function buildBudgetJustification(input: BudgetInput, calculation: BudgetCalculation): string {
  const formatMoney = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const equipment = input.equipment
    .map((item) => ({ ...item, total: money(item.quantity * item.unitCost + item.freight + item.tax) }))
    .filter((item) => item.total > 0)
    .map((item) => `${item.vendor}: ${item.quantity} unit(s) at ${formatMoney(item.unitCost)} each, plus ${formatMoney(item.freight)} freight and ${formatMoney(item.tax)} tax`)
    .join("; ");
  const institutional = input.institutional
    .filter((item) => item.amount > 0)
    .map((item) => `${item.category} (${item.basis}): ${formatMoney(item.amount)}`)
    .join("; ");

  const lines = [
    `The total project budget is ${formatMoney(calculation.totalProjectCost)}.`,
    equipment ? `Equipment costs total ${formatMoney(calculation.equipmentTotal)} and cover ${equipment}.` : "",
    institutional ? `Institutional costs total ${formatMoney(calculation.institutionalTotal)} and cover ${institutional}.` : "",
    `The grant request is ${formatMoney(calculation.grantRequest)}.`,
    input.costSharingPercentage === null
      ? "No cost-sharing percentage was entered because none was stated in the terms provided; no match is included in this estimate."
      : `The required match is ${formatMoney(calculation.requiredMatch)}, calculated at ${input.costSharingPercentage}% of total project costs.`,
    input.awardCeiling === null
      ? "No award ceiling was entered because none was stated in the terms provided; verify the request against the official opportunity."
      : `The request is within the entered award ceiling of ${formatMoney(input.awardCeiling)}.`,
  ];
  return lines.filter(Boolean).join(" ");
}
