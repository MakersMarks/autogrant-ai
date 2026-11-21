import type { Grant } from "@/lib/grants";

export function Discovery({ grants, index, setIndex, sector, submittedIds, onOpenDraft, missingEvidence = [], evidenceReady = 0 }: {
  grants: Grant[]; index: number; setIndex: (n: number) => void; sector: string; submittedIds: Set<string>; onOpenDraft: (g: Grant) => void;
  missingEvidence?: string[]; evidenceReady?: number;
}) {
  const card = grants[index];
  const url = `https://www.grants.gov/search-grants?keywords=${encodeURIComponent(sector)}`;
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold">Targeted Grants</h1>
        <span className="text-xs text-muted-foreground font-semibold">Card {Math.min(index + 1, grants.length)} of {grants.length}</span>
      </div>
      {card ? (
        <div className="max-w-xl mx-auto bg-card border border-border rounded-3xl p-8 space-y-5 shadow-2xl">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold bg-accent/10 text-accent px-3 py-1 rounded-full">{card.fit}</span>
            <span className="text-xs font-bold text-muted-foreground">{card.tier}</span>
          </div>
          <h2 className="text-2xl font-display font-bold">{card.title}</h2>
          <p className="text-xs text-muted-foreground">{card.funder} • <strong className="text-success">{card.amount}</strong> • Due {card.deadline}</p>
          <div className="p-3 bg-background rounded-xl border border-border text-xs space-y-1">
            <span className="font-bold text-primary uppercase tracking-wider block text-[10px]">Why You Are Eligible:</span>
            <p>{card.eligibilityReason}</p>
          </div>
          {missingEvidence.length > 0 && (
            <div className="p-3 bg-background rounded-xl border border-border text-xs">
              <span className="font-bold text-primary uppercase tracking-wider block text-[10px]">
                {evidenceReady} of {evidenceReady + missingEvidence.length} Documents Ready
              </span>
              <ul className="mt-2 space-y-1">
                {missingEvidence.slice(0, 4).map((item) => (
                  <li key={item} className="text-destructive">○ {item} — missing</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => document.querySelector("#industry-compliance")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="mt-3 w-full py-2 rounded-lg border border-primary/40 text-primary text-xs font-bold"
              >
                Upload Missing Evidence
              </button>
            </div>
          )}
          <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs text-primary hover:underline font-semibold">View Official Funder Search on Grants.gov ↗</a>
          {submittedIds.has(card.id) && <p className="text-xs text-success font-semibold">✓ Already submitted</p>}
          <div className="flex gap-3 pt-2">
            {index > 0 && <button onClick={() => setIndex(index - 1)} className="px-4 py-3 bg-secondary text-secondary-foreground font-bold rounded-xl text-xs uppercase">⟵ Previous</button>}
            <button onClick={() => setIndex(index + 1)} className="flex-1 py-3 bg-destructive/10 border border-destructive/30 text-destructive font-bold rounded-xl text-xs uppercase">Pass ✕</button>
            <button disabled={submittedIds.has(card.id)} onClick={() => onOpenDraft(card)} className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-xs uppercase disabled:opacity-40">Draft with AI ✓</button>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-card rounded-3xl border border-border space-y-4">
          <p className="text-muted-foreground font-semibold">Reviewed all daily grant matches!</p>
          <button onClick={() => setIndex(0)} className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase rounded-xl">Reset Deck</button>
        </div>
      )}
    </div>
  );
}
