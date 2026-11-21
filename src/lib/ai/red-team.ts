import type { GrantRequirementBOM } from './rfp-parser';

export const redTeamRubricWeights = {
  structure: 25,
  evidence: 25,
  writing: 20,
  budgetCeiling: 15,
  matchConsistency: 15,
} as const;

export type RedTeamModuleId = keyof typeof redTeamRubricWeights;

export interface RedTeamBudget {
  /** Amount requested from the grant, not the overall project budget. */
  requestedAmount?: number;
  /** Award ceiling for this grant. */
  ceiling?: number;
  matchRequired?: boolean;
  /** Fraction of the requested amount, between 0 and 1. */
  matchRate?: number;
  /** Explicit required match amount; takes precedence over matchRate. */
  requiredMatchAmount?: number;
  /** Match funds documented or committed in the proposal. */
  committedMatchAmount?: number;
}

export interface RedTeamInput {
  proposalText: string;
  bom: GrantRequirementBOM;
  /** Evidence IDs known to be available in the applicant's Vault. */
  availableEvidenceIds?: readonly string[];
  budget?: RedTeamBudget;
}

export interface RedTeamFinding {
  code: string;
  message: string;
}

export interface RedTeamModuleResult {
  id: RedTeamModuleId;
  weight: (typeof redTeamRubricWeights)[RedTeamModuleId];
  /** Weighted points earned, from 0 to `weight`. */
  score: number;
  findings: RedTeamFinding[];
}

export interface RedTeamResult {
  score: number;
  maxScore: 100;
  assessment: 'deterministic heuristic; semantic coverage is approximate';
  modules: RedTeamModuleResult[];
}

export const redTeamBannedTerms = [
  'delve',
  'testament',
  'tapestry',
  "in today's fast-paced",
  'ever-evolving landscape',
  'beacon of hope',
  'synergy',
  'synergistic',
  'game-changer',
  'unlock the potential',
  'navigate the complexities',
  'it is important to note',
  'in conclusion',
] as const;

type ParsedSection = { heading: string; body: string };

function normalizeHeading(value: string) {
  return value
    .replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/u, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function parseSections(text: string): ParsedSection[] {
  const matches = [...text.matchAll(/^(#{1,6})\s+(.+)\s*$/gmu)];
  return matches.map((match, index) => {
    const heading = match[2]?.trim() ?? '';
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return { heading, body: text.slice(start, end).trim() };
  });
}

function earnedPoints(weight: number, rate: number) {
  return Math.round(weight * Math.max(0, Math.min(1, rate)));
}

function makeModule(
  id: RedTeamModuleId,
  rate: number,
  findings: RedTeamFinding[],
): RedTeamModuleResult {
  const weight = redTeamRubricWeights[id];
  return { id, weight, score: earnedPoints(weight, rate), findings };
}

function evaluateStructure(text: string, bom: GrantRequirementBOM) {
  const sections = parseSections(text);
  const findings: RedTeamFinding[] = [];
  const requiredHeadings = [...new Set(
    bom.aiDraftableDocuments.flatMap((document) => document.requiredHeadings),
  )];
  const normalizedSections = sections.map((section) => ({
    ...section,
    normalizedHeading: normalizeHeading(section.heading),
  }));
  const headingMatches = requiredHeadings.map((heading) => {
    const normalized = normalizeHeading(heading);
    return normalizedSections.find((section) =>
      section.normalizedHeading === normalized
      || section.normalizedHeading.includes(normalized)
      || normalized.includes(section.normalizedHeading),
    );
  });

  const headingsRate = requiredHeadings.length
    ? headingMatches.filter(Boolean).length / requiredHeadings.length
    : 1;
  if (requiredHeadings.length) {
    const missingHeadings = requiredHeadings.filter((_, index) => !headingMatches[index]);
    if (missingHeadings.length) {
      findings.push({
        code: 'missing_headings',
        message: `Missing required heading${missingHeadings.length === 1 ? '' : 's'}: ${missingHeadings.join('; ')}.`,
      });
    } else {
      findings.push({ code: 'headings_present', message: 'All required headings were found.' });
    }
  } else {
    findings.push({ code: 'headings_unspecified', message: 'The BOM does not specify required headings.' });
  }

  let wordChecks = 0;
  let wordPasses = 0;
  const totalLimit = bom.formatting.wordCountLimit;
  if (typeof totalLimit === 'number' && totalLimit >= 0) {
    wordChecks += 1;
    const prose = text.replace(/^#{1,6}\s+.*$/gmu, '');
    if (countWords(prose) <= totalLimit) wordPasses += 1;
    else findings.push({
      code: 'total_word_limit_exceeded',
      message: `Proposal has ${countWords(prose)} words; the BOM limit is ${totalLimit}.`,
    });
  }

  for (const document of bom.aiDraftableDocuments) {
    for (const [heading, limit] of Object.entries(document.wordLimitsPerSection ?? {})) {
      if (!Number.isFinite(limit) || limit < 0) continue;
      wordChecks += 1;
      const normalized = normalizeHeading(heading);
      const section = normalizedSections.find((candidate) =>
        candidate.normalizedHeading === normalized
        || candidate.normalizedHeading.includes(normalized)
        || normalized.includes(candidate.normalizedHeading),
      );
      if (!section) {
        findings.push({
          code: 'section_word_limit_unverifiable',
          message: `Cannot verify the ${heading} word limit because its section is missing.`,
        });
      } else if (countWords(section.body) <= limit) {
        wordPasses += 1;
      } else {
        findings.push({
          code: 'section_word_limit_exceeded',
          message: `${heading} has ${countWords(section.body)} words; the BOM limit is ${limit}.`,
        });
      }
    }
  }

  const wordRate = wordChecks ? wordPasses / wordChecks : 1;
  if (!wordChecks) findings.push({ code: 'word_limits_unspecified', message: 'The BOM does not specify word limits.' });
  else if (wordPasses === wordChecks) findings.push({ code: 'word_limits_met', message: 'All configured word limits were met.' });
  return { rate: headingsRate * 0.6 + wordRate * 0.4, findings };
}

function evaluateEvidence(input: RedTeamInput) {
  const mandatory = input.bom.userRequiredEvidence.filter((evidence) => evidence.isMandatory);
  const available = new Set(input.availableEvidenceIds ?? []);
  const missing = mandatory.filter((evidence) =>
    !available.has(evidence.evidenceId) && !available.has(evidence.autoMatchVaultTag),
  );
  const findings: RedTeamFinding[] = mandatory.length
    ? missing.length
      ? [{
        code: 'required_evidence_missing',
        message: `Unavailable mandatory evidence: ${missing.map((item) => item.name).join('; ')}.`,
      }]
      : [{ code: 'required_evidence_available', message: 'All mandatory evidence is available.' }]
    : [{ code: 'no_mandatory_evidence', message: 'The BOM has no mandatory evidence requirements.' }];
  return { rate: mandatory.length ? (mandatory.length - missing.length) / mandatory.length : 1, findings };
}

function evaluateWriting(text: string) {
  const findings: RedTeamFinding[] = [];
  if (!text.trim()) {
    return {
      rate: 0,
      findings: [{ code: 'empty_proposal', message: 'Proposal text is empty.' }],
    };
  }

  const lower = text.toLowerCase();
  const bannedMatches = redTeamBannedTerms.filter((term) => lower.includes(term));
  const bannedRate = Math.max(0, 1 - bannedMatches.length / 3);
  findings.push(bannedMatches.length
    ? { code: 'banned_terms_found', message: `Banned terms found: ${bannedMatches.join('; ')}.` }
    : { code: 'no_banned_terms', message: 'No configured banned terms were found.' });

  const sentences = text.split(/[.!?]+(?:\s|$)/u).map((sentence) => sentence.trim().toLowerCase()).filter(Boolean);
  const uniqueSentences = new Set(sentences);
  const sentenceDuplicateRate = sentences.length ? (sentences.length - uniqueSentences.size) / sentences.length : 0;
  const paragraphs = text
    .split(/\n\s*\n/u)
    .map((paragraph) => countWords(paragraph.replace(/^#{1,6}\s+.*$/gmu, '')))
    .filter((count) => count > 0);
  const lengthDuplicateRate = paragraphs.length >= 3
    ? 1 - new Set(paragraphs).size / paragraphs.length
    : 0;
  const repetitionRate = Math.max(sentenceDuplicateRate, lengthDuplicateRate);
  const repetitionScore = 1 - repetitionRate;
  findings.push(repetitionRate > 0
    ? { code: 'repetitive_lengths_or_sentences', message: 'Repeated sentence text or identical paragraph lengths were detected.' }
    : { code: 'varied_lengths', message: 'No repeated sentence text or identical paragraph lengths were detected.' });

  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^(?:[-*+]|\d+[.)])\s+/u.test(line)).length;
  const bulletRate = lines.length ? bulletLines / lines.length : 0;
  const bulletScore = Math.max(0, Math.min(1, 1 - Math.max(0, bulletRate - 0.2) / 0.6));
  findings.push(bulletRate > 0.2
    ? { code: 'bullet_heavy', message: `${bulletLines} of ${lines.length} non-empty lines are bullets or numbered list items.` }
    : { code: 'bullets_within_threshold', message: 'Bullet use is within the heuristic 20% threshold.' });

  return {
    rate: (bannedRate + repetitionScore + bulletScore) / 3,
    findings,
  };
}

function evaluateBudget(budget: RedTeamBudget | undefined) {
  if (budget?.ceiling === undefined) {
    return {
      rate: 1,
      findings: [{ code: 'ceiling_unspecified', message: 'No grant award ceiling was supplied for comparison.' }],
    };
  }
  if (budget.requestedAmount === undefined) {
    return {
      rate: 0,
      findings: [{ code: 'requested_amount_missing', message: 'A grant ceiling is known, but the requested amount is missing.' }],
    };
  }
  if (budget.requestedAmount <= budget.ceiling) {
    return {
      rate: 1,
      findings: [{ code: 'within_ceiling', message: 'The requested grant amount does not exceed the ceiling.' }],
    };
  }
  return {
    rate: 0,
    findings: [{
      code: 'ceiling_exceeded',
      message: `Requested amount ${budget.requestedAmount} exceeds the grant ceiling ${budget.ceiling}.`,
    }],
  };
}

function evaluateMatch(budget: RedTeamBudget | undefined) {
  if (budget?.matchRequired !== true) {
    return {
      rate: 1,
      findings: [{
        code: budget?.matchRequired === false ? 'match_not_required' : 'match_requirement_unspecified',
        message: budget?.matchRequired === false
          ? 'No matching funds are required.'
          : 'No match requirement was supplied; consistency cannot be assessed.',
      }],
    };
  }

  const required = budget.requiredMatchAmount
    ?? (budget.requestedAmount !== undefined && budget.matchRate !== undefined
      ? budget.requestedAmount * budget.matchRate
      : undefined);
  if (required === undefined || budget.committedMatchAmount === undefined) {
    return {
      rate: 0,
      findings: [{
        code: 'match_details_missing',
        message: 'Matching funds are required, but the required amount or documented commitment is missing.',
      }],
    };
  }
  if (required <= 0) {
    return {
      rate: 1,
      findings: [{ code: 'match_amount_satisfied', message: 'No positive match amount is required.' }],
    };
  }

  const rate = Math.min(1, Math.max(0, budget.committedMatchAmount / required));
  return {
    rate,
    findings: [budget.committedMatchAmount >= required
      ? { code: 'match_amount_satisfied', message: 'Documented matching funds meet or exceed the requirement.' }
      : {
        code: 'match_shortfall',
        message: `Documented matching funds ${budget.committedMatchAmount} are below the required ${required}.`,
      }],
  };
}

/**
 * Audits proposal structure, evidence, writing patterns, and supplied budget facts.
 * This deterministic heuristic does not use embeddings; semantic coverage is approximate.
 */
export function evaluateProposalRedTeam(input: RedTeamInput): RedTeamResult {
  const modules = [
    makeModule('structure', ...(() => {
      const result = evaluateStructure(input.proposalText, input.bom);
      return [result.rate, result.findings] as const;
    })()),
    makeModule('evidence', ...(() => {
      const result = evaluateEvidence(input);
      return [result.rate, result.findings] as const;
    })()),
    makeModule('writing', ...(() => {
      const result = evaluateWriting(input.proposalText);
      return [result.rate, result.findings] as const;
    })()),
    makeModule('budgetCeiling', ...(() => {
      const result = evaluateBudget(input.budget);
      return [result.rate, result.findings] as const;
    })()),
    makeModule('matchConsistency', ...(() => {
      const result = evaluateMatch(input.budget);
      return [result.rate, result.findings] as const;
    })()),
  ];
  return {
    score: modules.reduce((total, module) => total + module.score, 0),
    maxScore: 100,
    assessment: 'deterministic heuristic; semantic coverage is approximate',
    modules,
  };
}
