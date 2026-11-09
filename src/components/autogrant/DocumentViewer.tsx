import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type ViewerDoc = { name: string; type: string; storagePath?: string | undefined };

/** Opens any Vault file inside the app: text, PDF, or photo. */
export function DocumentViewer({ doc, onClose }: { doc: ViewerDoc | null; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc?.storagePath) return;
    let objectUrl = "";
    setUrl(""); setText(""); setError(""); setLoading(true);
    void supabase.storage.from("vault").download(doc.storagePath).then(async ({ data, error: e }) => {
      setLoading(false);
      if (e || !data) { setError("This document could not be opened."); return; }
      if (doc.type.startsWith("text/")) { setText(await data.text()); return; }
      if (doc.type.includes("wordprocessingml")) {
        const { unzipSync, strFromU8 } = await import("fflate");
        const xml = unzipSync(new Uint8Array(await data.arrayBuffer()), { filter: (f) => f.name === "word/document.xml" })["word/document.xml"];
        setText(xml ? strFromU8(xml).replace(/<\/w:p>/g, "\n").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "No readable text found.");
        return;
      }
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc?.storagePath]);

  return (
    <Sheet open={!!doc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle className="break-words pr-6">{doc?.name}</SheetTitle></SheetHeader>
        <div className="mt-4">
          {loading && <p className="text-sm text-muted-foreground">Opening document…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {text && <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>}
          {url && doc?.type.startsWith("image/") && <img src={url} alt={doc.name} className="w-full rounded-lg border border-border" />}
          {url && doc?.type === "application/pdf" && <iframe src={url} title={doc.name} className="w-full h-[80vh] rounded-lg border border-border" />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
