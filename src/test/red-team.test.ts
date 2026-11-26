import { describe, expect, it } from "vitest";
import {
  evaluateProposalRedTeam,
  redTeamRubricWeights,
  type RedTeamInput,
} from "@/lib/ai/red-team";
import type { GrantRequirementBOM } from "@/lib/ai/rfp-parser";

const bom: GrantRequirementBOM = {
  grantId: "grant-1",
  grantTitle: "Community Innovation Grant",
  formatting: { submissionMedium: "portal_text_fields", wordCountLimit: 100 },
  aiDraftableDocuments: [
    {
      documentType: "project_narrative",
      requiredHeadings: ["Project Need", "Project Plan"],
      wordLimitsPerSection: { "Project Need": 20 },
    },
  ],
  userRequiredEvidence: [
    {
      evidenceId: "quote-1",
      name: "Vendor quote",
      category: "vendor_quote",
      isMandatory: true,
      reason: "Confirm project costs",
      autoMatchVaultTag: "quote",
    },
  ],
};

const completeProposal = [
  "## 1. Project Need",
  "Local clinics report long scheduling delays. The pilot will document baseline wait times.",
  "",
  "## 2. Project Plan",
  "We will build a scheduling tool and test it with three clinics. Staff will review results monthly.",
  "The grant request is $8,000 and includes a required match of $2,000, with $2,500 committed.",
].join("\n");

describe("deterministic proposal red-team rubric", () => {
  it("uses the five fixed module weights and awards a complete, compliant proposal 100", () => {
    const weights = Object.values(redTeamRubricWeights);
    expect(weights).toEqual([25, 25, 20, 15, 15]);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBe(100);

    const input: RedTeamInput = {
      proposalText: completeProposal,
      bom,
      availableEvidenceIds: ["quote-1"],
      budget: {
        requestedAmount: 8000,
        ceiling: 10000,
        matchRequired: true,
        requiredMatchAmount: 2000,
        committedMatchAmount: 2500,
      },
    };
    const result = evaluateProposalRedTeam(input);

    expect(result.score).toBe(100);
    expect(result.maxScore).toBe(100);
    expect(result.assessment).toContain("deterministic heuristic");
    expect(result.modules.map(({ weight }) => weight)).toEqual([25, 25, 20, 15, 15]);
  });

  it("reports missing headings, mandatory evidence, word-limit issues, and budget shortfalls", () => {
    const result = evaluateProposalRedTeam({
      proposalText: "## Project Need\n" + Array(25).fill("word").join(" "),
      bom,
      availableEvidenceIds: [],
      budget: {
        requestedAmount: 12000,
        ceiling: 10000,
        matchRequired: true,
        requiredMatchAmount: 2000,
        committedMatchAmount: 500,
      },
    });

    expect(result.score).toBeLessThan(100);
    expect(
      result.modules.find(({ id }) => id === "structure")?.findings.map(({ code }) => code),
    ).toContain("missing_headings");
    expect(
      result.modules.find(({ id }) => id === "structure")?.findings.map(({ code }) => code),
    ).toContain("section_word_limit_exceeded");
    expect(result.modules.find(({ id }) => id === "evidence")?.findings[0]?.code).toBe(
      "required_evidence_missing",
    );
    expect(result.modules.find(({ id }) => id === "budgetCeiling")?.findings[0]?.code).toBe(
      "ceiling_exceeded",
    );
    expect(result.modules.find(({ id }) => id === "matchConsistency")?.findings[0]?.code).toBe(
      "match_shortfall",
    );
  });

  it("matches required evidence against the Vault slot tag extracted from the solicitation", () => {
    const result = evaluateProposalRedTeam({
      proposalText: completeProposal,
      bom,
      availableEvidenceIds: ["quote"],
    });

    expect(result.modules.find(({ id }) => id === "evidence")?.findings[0]?.code).toBe(
      "required_evidence_available",
    );
  });

  it("handles empty text, unconfigured limits, and optional match information deterministically", () => {
    const result = evaluateProposalRedTeam({
      proposalText: "",
      bom: {
        ...bom,
        formatting: { submissionMedium: "portal_text_fields" },
        aiDraftableDocuments: [{ documentType: "project_narrative", requiredHeadings: [] }],
        userRequiredEvidence: [],
      },
    });

    expect(result.modules.find(({ id }) => id === "writing")?.score).toBe(0);
    expect(result.modules.find(({ id }) => id === "evidence")?.score).toBe(25);
    expect(result.modules.find(({ id }) => id === "budgetCeiling")?.score).toBe(15);
    expect(result.modules.find(({ id }) => id === "matchConsistency")?.score).toBe(15);
    expect(
      result.modules.find(({ id }) => id === "structure")?.findings.map(({ code }) => code),
    ).toContain("word_limits_unspecified");
  });

  it("penalizes configured banned phrases, repeated lengths, and bullet-heavy text", () => {
    const result = evaluateProposalRedTeam({
      proposalText: [
        "## Project Need",
        "- delve into the problem",
        "- This is a repeated sentence.",
        "- This is a repeated sentence.",
        "",
        "## Project Plan",
        "- Short plan.",
      ].join("\n"),
      bom: {
        ...bom,
        formatting: { submissionMedium: "portal_text_fields" },
        aiDraftableDocuments: [{ documentType: "project_narrative", requiredHeadings: [] }],
        userRequiredEvidence: [],
      },
    });

    const writing = result.modules.find(({ id }) => id === "writing");
    expect(writing?.score).toBeLessThan(20);
    expect(writing?.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["banned_terms_found", "varied_lengths", "bullet_heavy"]),
    );
  });

  it("flags uncovered verified funder prompts and criteria instead of treating the general rubric as complete", () => {
    const result = evaluateProposalRedTeam({
      proposalText: completeProposal,
      bom: {
        ...bom,
        extractedPrompts: [
          {
            question: "How will project activities improve measurable rural access?",
            evidenceQuote: "Describe measurable improvements to rural access.",
          },
        ],
        rubricCriteria: [
          {
            criterion: "Project outcomes and evaluation",
            evidenceQuote: "Projects will be evaluated on outcomes and evaluation methods.",
            weightPercent: 25,
          },
        ],
      },
    });
    const structure = result.modules.find(({ id }) => id === "structure");
    expect(structure?.findings.map(({ code }) => code)).toContain("funder_prompts_unverified");
    expect(structure?.findings.map(({ code }) => code)).toContain("funder_criteria_unverified");
    expect(structure?.findings.map(({ code }) => code)).toContain(
      "funder_prompt_or_criterion_coverage_approximate",
    );
  });

  it("reports a budget line item whose amount or narrative activity is missing", () => {
    const result = evaluateProposalRedTeam({
      proposalText: `${completeProposal}\nWe will purchase equipment for the project.`,
      bom,
      budget: {
        requestedAmount: 8000,
        lineItems: [
          {
            label: "Scheduling software",
            amount: 3500,
            purpose: "Build the scheduling platform",
            milestone: "Pilot launch",
          },
        ],
      },
    });
    const budget = result.modules.find(({ id }) => id === "budgetCeiling");
    expect(budget?.findings.map(({ code }) => code)).toContain("budget_item_narrative_mismatch");
  });

  it("checks extracted prompt-level word and character limits", () => {
    const result = evaluateProposalRedTeam({
      proposalText: "## Describe project impact\nThis answer has six exact words.",
      bom: {
        ...bom,
        extractedPrompts: [
          {
            question: "Describe project impact",
            evidenceQuote: "Describe project impact in the application.",
            maxWords: 5,
            maxCharacters: 20,
          },
        ],
      },
    });
    const findings = result.modules.find(({ id }) => id === "structure")?.findings;

    expect(findings?.map(({ code }) => code)).toContain("prompt_word_limit_exceeded");
    expect(findings?.map(({ code }) => code)).toContain("prompt_character_limit_exceeded");
  });
});
