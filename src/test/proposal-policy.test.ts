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
import { buildDocumentPrompt, parseDocument, documentSpecs, voiceDirective, documentFileName, toCleanText } from '@/lib/ai/proposal-policy';
describe('Day 2 document engine', () => {
  const doc = (t: keyof typeof documentSpecs, body = 'Body text') => documentSpecs[t].sections.map((s, i) => `## ${i + 1}. ${s.title}\n${body}`).join('\n');
  it('institutional proposal requires all 8 Kiritz sections', () => {
    expect(documentSpecs.institutional.sections).toHaveLength(8);
    expect(parseDocument('institutional', doc('institutional'))).toHaveLength(8);
    expect(() => parseDocument('institutional', doc('executive_summary'))).toThrow();
  });
  it('executive summary has 5 sections', () => { expect(parseDocument('executive_summary', doc('executive_summary'))).toHaveLength(5); });
  it('clamps portal elevator pitch to 100 words', () => {
    const out = parseDocument('portal_answers', doc('portal_answers', Array(300).fill('word').join(' ')));
    expect(out[0]!.body.split(/\s+/).length).toBe(100);
    expect(out[3]!.body.split(/\s+/).length).toBe(300);
  });
  it('injects the calibrated voice and banned words', () => {
    const v = voiceDirective('Short punchy sentences.', 'x');
    expect(v).toContain('Short punchy sentences.');
    expect(v).toContain('delve');
    expect(buildDocumentPrompt('executive_summary', {}, [], {}, v).system).toContain('Short punchy sentences.');
  });
  it('falls back to intake wording when no voice calibration exists', () => {
    expect(voiceDirective(null, 'we cook soul food')).toContain('we cook soul food');
  });
  it('names files by business, grant and document type', () => {
    expect(documentFileName('institutional', 'AutoGrant.ai', 'NSF SBIR Phase I')).toBe('AutoGrant.ai - NSF SBIR Phase I - Project Narrative.txt');
    expect(documentFileName('portal_answers', 'Soul & Savory', 'Amber Grant')).toBe('Soul & Savory - Amber Grant - Portal Responses.txt');
  });
  it('strips markdown for clean copy', () => { expect(toCleanText('**Bold** and `x`')).toBe('Bold and x'); });
});
