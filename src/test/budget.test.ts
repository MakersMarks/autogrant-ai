import { describe, expect, it } from "vitest";
import { buildBudgetJustification, calculateBudget, type BudgetInput } from "@/lib/budget";

const budget = (overrides: Partial<BudgetInput> = {}): BudgetInput => ({
  equipment: [{ vendor: "Lab Supply Co.", quantity: 2, unitCost: 100, freight: 15, tax: 5 }],
  institutional: [{ category: "Personnel", basis: "20 hours at $50 per hour", amount: 1000 }],
  awardCeiling: 2000,
  costSharingPercentage: 20,
  ...overrides,
});

describe("budget calculations", () => {
  it("calculates equipment and institutional totals, grant request, and match", () => {
    const result = calculateBudget(budget());
    expect(result).toMatchObject({
      valid: true,
      equipmentTotal: 220,
      institutionalTotal: 1000,
      totalProjectCost: 1220,
      grantRequest: 976,
      requiredMatch: 244,
    });
  });

  it("rejects negative and non-finite line item values", () => {
    const result = calculateBudget(budget({
      equipment: [{ vendor: "Vendor", quantity: -1, unitCost: Number.POSITIVE_INFINITY, freight: 0, tax: 0 }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("quantity must be a nonnegative finite number");
    expect(result.errors.join(" ")).toContain("unit cost must be a nonnegative finite number");
  });

  it("enforces the award ceiling on the calculated grant request", () => {
    const result = calculateBudget(budget({ awardCeiling: 900, costSharingPercentage: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Grant request exceeds the entered award ceiling.");
  });

  it("requires a valid match percentage and allows explicitly absent terms", () => {
    expect(calculateBudget(budget({ costSharingPercentage: 101 })).valid).toBe(false);
    const withoutTerms = calculateBudget(budget({ awardCeiling: null, costSharingPercentage: null }));
    expect(withoutTerms).toMatchObject({ valid: true, grantRequest: 1220, requiredMatch: 0 });
    expect(buildBudgetJustification(budget({ awardCeiling: null, costSharingPercentage: null }), withoutTerms))
      .toContain("No cost-sharing percentage was entered");
  });

  it("requires descriptions for nonzero costs", () => {
    const result = calculateBudget(budget({
      equipment: [{ vendor: "", quantity: 1, unitCost: 1, freight: 0, tax: 0 }],
      institutional: [{ category: "", basis: "", amount: 1 }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Equipment item 1: vendor is required for a nonzero cost.");
    expect(result.errors).toContain("Institutional item 1: category is required for a nonzero cost.");
    expect(result.errors).toContain("Institutional item 1: basis is required for a nonzero cost.");
  });
});
