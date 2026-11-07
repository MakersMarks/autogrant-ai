import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { generateExecutiveSummary, saveIntake } from '@/lib/ai/ai.functions';
import { wordCount, type Intake } from '@/lib/ai/proposal-policy';

export function IntakeStudio({ initial, onSaved, onSummary, onError }: { initial: Intake; onSaved: (value: Intake) => void; onSummary: (text: string) => void; onError: (message: string) => void }) {
  const [intake, setIntake] = useState(initial);
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveIntake);
  const summarize = useServerFn(generateExecutiveSummary);
  useEffect(() => { setIntake(initial); }, [initial]);
  const persist = async () => { const value = await save({ data: intake }); onSaved(value); };
  const inputClass = 'w-full rounded-md border border-input bg-background p-2 text-sm text-foreground';
  const fields: { key: keyof Omit<Intake, 'demographics'>; label: string }[] = [
    { key: 'project_name', label: 'Project / venture name' }, { key: 'industry', label: 'Industry' },
    { key: 'location', label: 'Location' }, { key: 'funding_goal', label: 'Funding goal' }, { key: 'funding_purpose', label: 'Funding purpose' },
  ];
  return <section className="space-y-4 border-y border-border py-5 text-foreground">
    <h2 className="text-lg font-semibold">Active intake & executive summary</h2>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map(({ key, label }) => <label key={key} className="space-y-1 text-xs text-muted-foreground">{label}<input className={inputClass} aria-label={label} value={intake[key]} onChange={(e) => setIntake({ ...intake, [key]: e.target.value })} /></label>)}
      <label className="space-y-1 text-xs text-muted-foreground">Lifecycle stage<select aria-label="Lifecycle stage" className={inputClass} value={intake.lifecycle_stage} onChange={(e) => setIntake({ ...intake, lifecycle_stage: e.target.value })}><option value="">Not specified</option>{['Idea / Pre-Launch', 'Early-stage startup', 'Operating business', 'Growth / Expansion'].map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground">Demographic set-asides<input className={inputClass} aria-label="Demographic set-asides" value={intake.demographics.join(', ')} onChange={(e) => setIntake({ ...intake, demographics: e.target.value.split(',').map((s) => s.trim()) })} /></label>
    </div>
    <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await persist(); } catch (e) { onError(e instanceof Error ? e.message : 'Profile save failed.'); } finally { setBusy(false); } }}>Save intake</Button>
    <div className="grid gap-3 sm:grid-cols-2">
      {[{ label: 'Core Problem Statement', value: problem, set: setProblem }, { label: 'Proposed Solution & Operational Architecture', value: solution, set: setSolution }].map((field) => <label key={field.label} className="space-y-1 text-xs text-muted-foreground">{field.label}<textarea aria-label={field.label} className={`${inputClass} min-h-32`} value={field.value} onChange={(e) => field.set(e.target.value)} /><span className={wordCount(field.value) > 300 ? 'text-destructive' : ''}>{wordCount(field.value)} / 300 words</span></label>)}
    </div>
    <Button disabled={busy || !problem.trim() || !solution.trim() || wordCount(problem) > 300 || wordCount(solution) > 300} onClick={async () => {
      setBusy(true);
      try { await persist(); const result = await summarize({ data: { problem, solution } }); onSummary(result.narrative); }
      catch (e) { onError(e instanceof Error ? e.message : 'Summary generation failed.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Working…' : 'Generate executive summary'}</Button>
  </section>;
}