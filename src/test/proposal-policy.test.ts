import { describe, expect, it } from 'vitest';
import { buildProposalPrompt, summarySchema, validateProposalOutput, buildDocumentPrompt, parseDocument, documentSpecs, voiceDirective, documentFileName, toCleanText, bannedPhrases, calibrateFounderVoiceSample, isRestrictedDocumentRequest } from '@/lib/ai/proposal-policy';
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
  it('enforces a 300-word cap on each generated section', () => {
    const body = (words: number) => Array(words).fill('evidence').join(' ');
    const atLimit = `## 1. Statement of Core Problem\n${body(300)}\n## 2. Proposed Solution & Operational Architecture\nSolution\n## 3. Strategic Target Market Alignment\nMarket\n## 4. Capital Allocation & Funding Goal\nCapital`;
    const overLimit = atLimit.replace(body(300), body(301));

    expect(validateProposalOutput(atLimit)).toBe(atLimit);
    expect(() => validateProposalOutput(overLimit)).toThrow('300-word limit');
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
describe('Day 2 document engine', () => {
  const doc = (t: keyof typeof documentSpecs, body = 'Body text') => documentSpecs[t].sections.map((s, i) => `## ${i + 1}. ${s.title}\n${body}`).join('\n');
  it('institutional proposal requires all 8 Kiritz sections', () => {
    expect(documentSpecs.institutional.sections).toHaveLength(8);
    expect(parseDocument('institutional', doc('institutional'))).toHaveLength(8);
    expect(() => parseDocument('institutional', doc('executive_summary'))).toThrow();
  });
  it('uses explicit solicitation headings and word limits for generated documents', () => {
    const requiredSections = [{ title: 'Technical Approach', maxWords: 3 }];
    const request = buildDocumentPrompt('institutional', {}, [], {}, 'VOICE', requiredSections);
    expect(request.system).toContain('## 1. Technical Approach');
    expect(parseDocument('institutional', '## 1. Technical Approach\none two three four', requiredSections)[0]?.body)
      .toBe('one two three…');
  });
  it('grounds grant-specific drafting in the supplied summary, prerequisites, and parsed requirements', () => {
    const request = buildDocumentPrompt('institutional', {}, [], {
      summaryText: 'Funds prototype validation for Iowa technology startups.',
      prerequisites: ['Iowa registration', 'Functional prototype'],
      requirements: { formatting: { pageLimit: 5 } },
    }, 'VOICE');
    const grant = JSON.parse(request.prompt).grant;

    expect(request.system).toContain('Use only the supplied grant summary, prerequisites');
    expect(grant.summaryText).toContain('prototype validation');
    expect(grant.prerequisites).toEqual(['Iowa registration', 'Functional prototype']);
    expect(grant.requirements.formatting.pageLimit).toBe(5);
  });
  it('uses sourced winner stories only as non-causal structural examples', () => {
    const request = buildDocumentPrompt('executive_summary', {}, [], {}, 'VOICE', undefined, [{
      winner: 'Example Co.',
      awardDate: 'June 2023',
      awardAmount: '$10,000',
      sourceUrl: 'https://funder.gov/winner',
      sourceName: 'Official winner interview',
      publishedFacts: ['The founder described a specific use of funds.'],
      interpretationLimit: 'The funder did not publish its selection rationale.',
    }], [{
      sourceUrl: 'https://funder.gov/advice',
      sourceName: 'Official application guidance',
      publishedGuidance: ['Tell a clear founder story.'],
      interpretationLimit: 'This is not a guarantee of selection.',
    }]);
    expect(request.system).toContain('not evidence of why a funder selected a winner');
    expect(JSON.parse(request.prompt).publicWinnerResearch[0].publishedFacts[0]).toContain('specific use of funds');
    expect(JSON.parse(request.prompt).publicFunderGuidance[0].publishedGuidance[0]).toContain('founder story');
  });
  it('executive summary has 5 sections', () => { expect(parseDocument('executive_summary', doc('executive_summary'))).toHaveLength(5); });
  it('can draft a funder-specific Letter of Inquiry', () => {
    expect(parseDocument('letter_of_inquiry', doc('letter_of_inquiry'))).toHaveLength(4);
    expect(documentSpecs.letter_of_inquiry.guidance).toContain('tailored to the funder');
  });
  it('can draft an AI-use disclosure without inventing funder policy', () => {
    expect(documentSpecs.ai_use_disclosure.guidance).toContain('Do not claim a funder requires or permits');
    expect(parseDocument('ai_use_disclosure', doc('ai_use_disclosure'))).toHaveLength(3);
  });
  it('clamps portal elevator pitch to 100 words', () => {
    const out = parseDocument('portal_answers', doc('portal_answers', Array(300).fill('word').join(' ')));
    expect(out[0]!.body.split(/\s+/).length).toBe(100);
    expect(out[3]!.body.split(/\s+/).length).toBe(300);
  });

  describe('restricted document gate', () => {
    it('blocks drafting certifications and official financial or legal documents', () => {
      expect(isRestrictedDocumentRequest('Please complete the SF-424 certifications.')).toBe(true);
      expect(isRestrictedDocumentRequest('Draft an MOU with our partner.')).toBe(true);
      expect(isRestrictedDocumentRequest('Prepare an audited financial statement.')).toBe(true);
    });
    it('allows ordinary proposal and budget drafts and informational questions', () => {
      expect(isRestrictedDocumentRequest('Draft a project narrative and budget justification.')).toBe(false);
      expect(isRestrictedDocumentRequest('What is an SF-424?')).toBe(false);
    });
  });
  it('injects the calibrated voice and banned words', () => {
    const v = voiceDirective('Short punchy sentences.', 'x');
    expect(v).toContain('Short punchy sentences.');
    expect(v).toContain('delve');
    expect(v).toContain('9th-grade reader');
    expect(v).toContain('active voice');
    expect(v).toContain('do not add subheadings, bold or italic emphasis, tables');
    expect(bannedPhrases).toContain('cutting-edge');
    expect(buildDocumentPrompt('executive_summary', {}, [], {}, v).system).toContain('Short punchy sentences.');
  });
  it('applies plain-language and concrete-writing rules to proposals', () => {
    const request = buildProposalPrompt({}, [], {});
    expect(request.system).toContain('9th-grade reader');
    expect(request.system).toContain('active voice, concrete nouns and verbs');
  });
  it('calibrates reproducible, explicitly approximate signals from a 2–3 sentence sample', () => {
    const metrics = calibrateFounderVoiceSample('We build tools for local families. Our platform uses data to help rural communities.');
    expect(metrics).toEqual({
      sentenceCount: 2,
      averageSentenceLengthWords: 7,
      passiveCueSentences: 0,
      voiceSignal: 'no passive cues detected',
      dictionCueCounts: { plainLanguage: 2, technical: 2, community: 3 },
    });

    const withPassive = calibrateFounderVoiceSample('The program was funded by local partners. We serve families.');
    expect(withPassive.passiveCueSentences).toBe(1);
    expect(withPassive.voiceSignal).toBe('some passive cues detected');
    expect(voiceDirective('Founder profile.', '', 'The program was funded by local partners. We serve families.'))
      .toContain('not a precise style or grammar assessment');
  });
  it('requires two or three sentences for a voice sample', () => {
    expect(() => calibrateFounderVoiceSample('We serve families.')).toThrow('2 or 3 sentences');
    expect(() => calibrateFounderVoiceSample('One. Two. Three. Four.')).toThrow('2 or 3 sentences');
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
