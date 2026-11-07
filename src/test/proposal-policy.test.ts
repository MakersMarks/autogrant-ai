import { describe, expect, it } from 'vitest';
import { buildProposalPrompt, summarySchema, validateProposalOutput } from '@/lib/ai/proposal-policy';
import { extractDocumentText } from '@/lib/ai/documents.server';
import { zipSync, strToU8 } from 'fflate';

describe('Institutional synthesis rules', () => {
  it('includes the Tippie baseline with an empty Vault', () => {
    const request = buildProposalPrompt({ industry: 'Food technology' }, [], {});
    expect(request.system).toContain('University of Iowa Tippie College of Business');
    expect(JSON.parse(request.prompt).evidenceStatus).toContain('No Vault documents uploaded');
  });
  it('preserves active industry, lifecycle, set-asides and funding goal', () => {
    const request = buildProposalPrompt({ industry: 'Software & AI', lifecycle_stage: 'Pre-Launch', demographics: ['WOSB'], funding_goal: '$250000' }, [], {});
    expect(JSON.parse(request.prompt).activeIntake).toEqual({ industry: 'Software & AI', lifecycle_stage: 'Pre-Launch', demographics: ['WOSB'], funding_goal: '$250000' });
  });
  it('incorporates actual Vault contents rather than only filenames', () => {
    const request = buildProposalPrompt({}, [{ name: 'plan.txt', text: 'Pilot will serve 17 rural clinics.' }], {});
    expect(JSON.parse(request.prompt).vaultEvidence[0].text).toBe('Pilot will serve 17 rural clinics.');
  });
  it('accepts precisely the four mandatory substantive sections', () => {
    const text = '## 1. Statement of Core Problem\nProblem\n## 2. Proposed Solution & Operational Architecture\nSolution\n## 3. Strategic Target Market Alignment\nMarket\n## 4. Capital Allocation & Funding Goal\nCapital';
    expect(validateProposalOutput(text)).toBe(text);
    expect(() => validateProposalOutput(text.replace('Strategic Target Market Alignment', 'Impact'))).toThrow();
    expect(() => validateProposalOutput(text.replace('\nMarket\n', '\n\n'))).toThrow();
  });
  it('enforces 300 words maximum in each executive summary input', () => {
    expect(summarySchema.safeParse({ problem: Array(300).fill('word').join(' '), solution: 'Solution' }).success).toBe(true);
    expect(summarySchema.safeParse({ problem: Array(301).fill('word').join(' '), solution: 'Solution' }).success).toBe(false);
    expect(summarySchema.safeParse({ problem: 'Problem', solution: Array(301).fill('word').join(' ') }).success).toBe(false);
  });
});

describe('Private document contents', () => {
  it('reads uploaded Word paragraphs without a filename heuristic', async () => {
    const bytes = zipSync({ 'word/document.xml': strToU8('<w:document><w:p><w:r><w:t>Clinic pilot &amp; funding plan</w:t></w:r></w:p></w:document>') });
    expect(await extractDocumentText(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toContain('Clinic pilot & funding plan');
  });
  it('reads all uploaded text content', async () => {
    expect(await extractDocumentText(strToU8('Verified pilot: 17 clinics'), 'text/plain')).toBe('Verified pilot: 17 clinics');
  });
});