import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifySamRegistration } from "@/lib/grants-gov/grants.functions";
import { Button } from "@/components/ui/button";

export function SamRegistrationCheck() {
  const verify = useServerFn(verifySamRegistration);
  const [uei, setUei] = useState("");
  const [cageCode, setCageCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const check = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const result = await verify({ data: {
        ...(uei.trim() ? { uei: uei.trim() } : {}),
        ...(cageCode.trim() ? { cageCode: cageCode.trim() } : {}),
      } });
      if (result.status === "not_configured") {
        setMessage("Automated checking is unavailable until the server-side SAM_GOV_API_KEY is configured. Your UEI was not saved.");
      } else if (result.status === "active") {
        setMessage(`SAM.gov reports an active registration${result.expirationDate ? ` through ${result.expirationDate}` : ""}. Confirm the current notice's requirements before applying.`);
      } else if (result.status === "expired") {
        setMessage("SAM.gov reports that this registration is expired. Renew it before applying if the notice requires active registration.");
      } else if (result.status === "identifier_mismatch") {
        setMessage("SAM.gov found a record, but the submitted UEI and CAGE code did not match the same entity. Confirm both directly with SAM.gov.");
      } else if (result.status === "not_found") {
        setMessage("SAM.gov did not return a registration for this UEI. Confirm the number and registration status directly with SAM.gov.");
      } else {
        setMessage("SAM.gov returned a record, but its registration status could not be confirmed. Verify it directly with SAM.gov.");
      }
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not verify the SAM.gov registration.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2">
      <div>
        <h3 className="text-xs font-bold">SAM.gov registration status</h3>
        <p className="text-[11px] text-slate-400">Enter a UEI and/or CAGE code for a one-time check; they are not saved. An administrator must configure the SAM.gov API key as a server-side Lovable secret. Never paste an API key here.</p>
      </div>
      <form onSubmit={check} className="flex flex-wrap gap-2">
        <input aria-label="SAM.gov UEI" value={uei} onChange={(event) => setUei(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} placeholder="UEI (12 characters)" maxLength={12} className="min-w-[170px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
        <input aria-label="SAM.gov CAGE code" value={cageCode} onChange={(event) => setCageCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} placeholder="CAGE (5 characters)" maxLength={5} className="min-w-[150px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
        <Button type="submit" disabled={busy || (uei.length !== 12 && cageCode.length !== 5)} className="text-xs">
          {busy ? "Checking…" : "Check SAM.gov"}
        </Button>
      </form>
      {message && <p role={isError ? "alert" : "status"} className={`text-xs ${isError ? "text-red-400" : "text-slate-300"}`}>{message}</p>}
      <a href="https://sam.gov/entity-information" target="_blank" rel="noreferrer" className="text-[11px] underline text-blue-300">Open SAM.gov entity search</a>
    </section>
  );
}
