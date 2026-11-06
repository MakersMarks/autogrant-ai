import { useState } from "react";

export type AppRow = { id: string; name: string; funder: string; amount: string; status: string; narrative: string; created_at: string };

export function Tracker({ applications }: { applications: AppRow[] }) {
  const [sel, setSel] = useState<AppRow | null>(null);
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="bg-background text-muted-foreground text-xs uppercase border-b border-border">
            <th className="p-4">Grant Name</th><th className="p-4">Funder</th><th className="p-4">Amount</th><th className="p-4">Date</th><th className="p-4">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border text-sm">
            {applications.length ? applications.map((a) => (
              <tr key={a.id} onClick={() => setSel(a)} className="hover:bg-muted cursor-pointer">
                <td className="p-4 font-semibold">{a.name}</td><td className="p-4 text-muted-foreground">{a.funder}</td>
                <td className="p-4 text-success font-bold">{a.amount}</td><td className="p-4 text-muted-foreground">{a.created_at.slice(0, 10)}</td>
                <td className="p-4"><span className="text-xs px-2 py-1 rounded-full font-bold bg-warning/10 text-warning">{a.status}</span></td>
              </tr>
            )) : <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No active submissions. Use the Discovery deck to review and submit.</td></tr>}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div><h3 className="text-lg font-display font-bold">Submitted Proposal Details</h3><p className="text-xs text-muted-foreground">{sel.name} ({sel.amount})</p></div>
              <button aria-label="Close" onClick={() => setSel(null)} className="text-muted-foreground">✕</button>
            </div>
            <div className="p-4 bg-background rounded-xl border border-border max-h-80 overflow-y-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">{sel.narrative || "Proposal package compiled and queued for submission."}</pre>
            </div>
            <div className="flex justify-end"><button onClick={() => setSel(null)} className="px-5 py-2.5 bg-secondary rounded-lg text-xs font-semibold uppercase">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
