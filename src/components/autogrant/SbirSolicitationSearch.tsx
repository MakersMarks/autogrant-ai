import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchSbirSolicitations } from "@/lib/grants-gov/grants.functions";
import type { SbirSolicitation } from "@/lib/grants-gov/sbir";
import { Button } from "@/components/ui/button";

const AGENCIES = ["DOW", "HHS", "NASA", "NSF", "DOE", "USDA", "EPA", "DOC", "ED", "DOT", "DHS"] as const;

export function SbirSolicitationSearch() {
  const search = useServerFn(searchSbirSolicitations);
  const [keyword, setKeyword] = useState("");
  const [agency, setAgency] = useState("");
  const [solicitations, setSolicitations] = useState<SbirSolicitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const selectedAgency = AGENCIES.find((code) => code === agency);
      const result = await search({ data: { keyword: keyword.trim(), ...(selectedAgency ? { agency: selectedAgency } : {}), openOnly: true } });
      setSolicitations(result.solicitations);
      setSearched(true);
    } catch (reason) {
      setSolicitations([]);
      setError(reason instanceof Error ? reason.message : "Could not load SBIR.gov solicitations.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-3">
      <div>
        <h3 className="text-xs font-bold">Live SBIR/STTR solicitations</h3>
        <p className="text-[11px] text-slate-400">Search the official SBIR.gov public API for open solicitations. Confirm details in the agency's official notice.</p>
      </div>
      <form onSubmit={run} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input aria-label="Search SBIR topics" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Keyword (e.g. food safety, rural health)" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
        <select aria-label="SBIR agency" value={agency} onChange={(event) => setAgency(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
          <option value="">All agencies</option>
          {AGENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <Button type="submit" disabled={loading} className="text-xs">{loading ? "Searching…" : "Search SBIR"}</Button>
      </form>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {searched && !error && !solicitations.length && <p className="text-xs text-slate-400">No open solicitations matched this search. Check the official topic list in case the live index is incomplete.</p>}
      {solicitations.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">{solicitations.length} open results (up to 25)</p>
          {solicitations.map((item, index) => (
            <article key={`${item.title}-${item.agency}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-1">
              <h4 className="text-xs font-semibold">{item.title}</h4>
              <p className="text-[11px] text-slate-400">{[item.agency, item.program, item.phase && `Phase ${item.phase}`, item.status, item.closeDate && `Closes ${item.closeDate}`].filter(Boolean).join(" · ") || "Check the official solicitation for details."}</p>
              {item.topics.length > 0 && <p className="text-[11px] text-slate-300">Topics: {item.topics.slice(0, 5).join("; ")}</p>}
              <a className="text-[11px] text-blue-300 underline" href={item.agencyUrl ?? "https://www.sbir.gov/topics"} target="_blank" rel="noreferrer">Open official opportunity details</a>
            </article>
          ))}
        </div>
      )}
      <a href="https://www.sbir.gov/topics" target="_blank" rel="noreferrer" className="text-[11px] underline text-blue-300">Open SBIR.gov Topics</a>
      <a href="https://www.sbir.gov/awards" target="_blank" rel="noreferrer" className="ml-3 text-[11px] underline text-blue-300">Browse public past SBIR awards</a>
    </section>
  );
}
