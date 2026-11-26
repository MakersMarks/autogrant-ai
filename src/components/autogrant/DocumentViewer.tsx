import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateVaultTextDocument } from "@/lib/vault";
import type { VaultDocument } from "@/lib/vault";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type ViewerDoc = VaultDocument;

/** Opens any Vault file inside the app: text, PDF, or photo. */
export function DocumentViewer({
  doc,
  onClose,
  onSaved,
}: {
  doc: ViewerDoc | null;
  onClose: () => void;
  onSaved?: (id: string, update: { size: number; storagePath: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWarning("");
  }, [doc?.id]);

  useEffect(() => {
    if (!doc?.storagePath) return;
    const storagePath = doc.storagePath;
    const docType = doc.type;
    let objectUrl = "";
    let active = true;
    setUrl("");
    setText("");
    setDraft("");
    setError("");
    setEditing(false);
    setLoading(true);
    void (async () => {
      try {
        const { data, error: downloadError } = await supabase.storage
          .from("vault")
          .download(storagePath);
        if (downloadError || !data)
          throw new Error(downloadError?.message ?? "No file was returned.");
        if (docType.startsWith("text/")) {
          const contents = await data.text();
          if (active) {
            setText(contents);
            setDraft(contents);
          }
          return;
        }
        if (docType.includes("wordprocessingml")) {
          const { unzipSync, strFromU8 } = await import("fflate");
          const xml = unzipSync(new Uint8Array(await data.arrayBuffer()), {
            filter: (f) => f.name === "word/document.xml",
          })["word/document.xml"];
          const contents = xml
            ? strFromU8(xml)
                .replace(/<\/w:p>/g, "\n")
                .replace(/<[^>]*>/g, "")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
            : "No readable text found.";
          if (active) {
            setText(contents);
            setDraft(contents);
          }
          return;
        }
        objectUrl = URL.createObjectURL(data);
        if (active) setUrl(objectUrl);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? `This document could not be opened: ${cause.message}`
              : "This document could not be opened.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.storagePath, doc?.type]);

  const saveText = async () => {
    if (!doc || saving) return;
    setSaving(true);
    setError("");
    try {
      const update = await updateVaultTextDocument(doc, draft);
      setText(draft);
      setEditing(false);
      setWarning(update.cleanupWarning ?? "");
      onSaved?.(doc.id, update);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The edited document could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={!!doc}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="break-words pr-6">{doc?.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {loading && <p className="text-sm text-muted-foreground">Opening document…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {warning && (
            <p role="status" className="text-sm text-amber-700">
              {warning}
            </p>
          )}
          {text && doc?.type.startsWith("text/") && (
            <div className="space-y-2">
              {editing ? (
                <textarea
                  aria-label="Edit Vault document"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-[55vh] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed"
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
              )}
              <div className="flex gap-2">
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(text);
                      setEditing(true);
                    }}
                    className="rounded border border-border px-3 py-1.5 text-xs"
                  >
                    Edit text
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(text);
                        setEditing(false);
                      }}
                      disabled={saving}
                      className="rounded border border-border px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveText()}
                      disabled={saving}
                      className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {url && doc?.type.startsWith("image/") && (
            <img src={url} alt={doc.name} className="w-full rounded-lg border border-border" />
          )}
          {url && doc?.type === "application/pdf" && (
            <iframe
              src={url}
              title={doc.name}
              className="w-full h-[80vh] rounded-lg border border-border"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
