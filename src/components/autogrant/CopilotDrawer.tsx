import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { copilotChat, executeCopilotAction, type CopilotAction } from "@/lib/ai/ai.functions";
import type { Grant } from "@/lib/grants";
import { trackLovableEvent } from "@/lib/lovable-error-reporting";

type Message = {
  role: "user" | "assistant";
  content: string;
  action?: CopilotAction;
  actionStatus?: string;
};

const COPILOT_STORAGE_KEY = "autogrant.copilot.messages.v1";

function loadStoredMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COPILOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Message => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return (
        (record["role"] === "user" || record["role"] === "assistant") &&
        typeof record["content"] === "string"
      );
    });
  } catch {
    return [];
  }
}

export function CopilotDrawer({
  isAuthenticated,
  onSignIn,
  activePage = "Dashboard",
  onUploadFile,
  onActionComplete,
  onReplyComplete,
  initialQuestion,
  activeGrant,
}: {
  isAuthenticated: boolean;
  onSignIn: () => void;
  activePage?: string;
  onUploadFile: (file: File) => Promise<boolean>;
  onActionComplete: (action: Exclude<CopilotAction, { type: "none" }>) => void;
  onReplyComplete?: () => void;
  initialQuestion?: { id: number; text: string } | undefined;
  activeGrant?: Grant | undefined;
}) {
  const askCopilot = useServerFn(copilotChat);
  const runAction = useServerFn(executeCopilotAction);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => loadStoredMessages());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const actionLocks = useRef(new Set<number>());

  useEffect(() => {
    if (!initialQuestion) return;
    setOpen(true);
    setDraft(initialQuestion.text);
    window.requestAnimationFrame(() => messageInput.current?.focus());
  }, [initialQuestion]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMessages((current) => (current.length ? [] : current));
      setDraft("");
      setError("");
      actionLocks.current.clear();
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(COPILOT_STORAGE_KEY);
      }
      return;
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(COPILOT_STORAGE_KEY, JSON.stringify(messages));
      } catch {
        // Ignore storage quota or private-mode errors.
      }
    }
  }, [isAuthenticated, messages]);

  const send = async (message: string, fromUpload = false) => {
    const text = message.trim();
    if (!text || (busy && !fromUpload)) return;
    if (!isAuthenticated) {
      onSignIn();
      return;
    }
    setError("");
    setBusy(true);
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    try {
      const result = await askCopilot({
        data: {
          message: text,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          activePage,
          ...(activeGrant
            ? {
                activeGrant: {
                  id: activeGrant.id,
                  title: activeGrant.title,
                  funder: activeGrant.funder,
                  amount: activeGrant.amount,
                  deadline: activeGrant.deadline,
                  ...(activeGrant.summaryText ? { summaryText: activeGrant.summaryText } : {}),
                  ...(activeGrant.prerequisites ? { prerequisites: activeGrant.prerequisites } : {}),
                  ...(activeGrant.portalUrl ? { portalUrl: activeGrant.portalUrl } : {}),
                  ...(activeGrant.guidelinesUrl ? { guidelinesUrl: activeGrant.guidelinesUrl } : {}),
                  ...(activeGrant.officialUrl ? { officialUrl: activeGrant.officialUrl } : {}),
                },
              }
            : {}),
        },
      });
      setMessages([
        ...nextMessages,
        { role: "assistant", content: result.reply, action: result.action },
      ]);
      trackLovableEvent("copilot_reply_generated");
      onReplyComplete?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Grant could not respond.");
      setMessages(nextMessages);
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = async (action: Exclude<CopilotAction, { type: "none" }>, index: number) => {
    if (
      action.type === "delete_vault_file" &&
      !window.confirm("Permanently delete this Vault file and its stored binary?")
    )
      return;
    if (actionLocks.current.has(index) || messages[index]?.actionStatus?.startsWith("Completed:"))
      return;
    actionLocks.current.add(index);
    setError("");
    setMessages((current) =>
      current.map((message, itemIndex) =>
        itemIndex === index ? { ...message, actionStatus: "Running…" } : message,
      ),
    );
    try {
      const result = await runAction({ data: action });
      setMessages((current) =>
        current.map((message, itemIndex) =>
          itemIndex === index
            ? { ...message, actionStatus: `Completed: ${result.message}` }
            : message,
        ),
      );
      onActionComplete(action);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Action failed.";
      actionLocks.current.delete(index);
      setMessages((current) =>
        current.map((message, itemIndex) =>
          itemIndex === index ? { ...message, actionStatus: `Failed: ${reason}` } : message,
        ),
      );
    }
  };

  const uploadAndReview = async (file: File) => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const saved = await onUploadFile(file);
      if (!saved) {
        setError("Upload failed. Check the Vault status message and try again.");
        return;
      }
      const request = `Please review the Vault file I just uploaded, "${file.name}". Summarize only facts supported by its contents and identify any unreadable or uncertain information.`;
      setBusy(false);
      await send(request, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be uploaded.");
    } finally {
      setBusy(false);
    }
  };

  const acceptAction = (action: CopilotAction, index: number) => {
    if (action.type === "none") return null;
    const status = messages[index]?.actionStatus ?? "";
    const completed = status.startsWith("Completed:");
    const running = status === "Running…";
    let label = "Run requested action";
    if (action.type === "draft_summary") label = "Create executive summary in Vault";
    if (action.type === "update_intake") label = `Update ${action.field.replaceAll("_", " ")}`;
    if (action.type === "edit_vault_file") label = "Revise Vault document";
    if (action.type === "update_settings") label = `Update ${action.field.replaceAll("_", " ")}`;
    if (action.type === "delete_vault_file") label = "Delete Vault file";
    if (action.type === "search_grants") label = "Open grant discovery";
    return (
      <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-slate-800">
        <p className="font-semibold">Proposed action · confirmation required</p>
        {action.type === "update_intake" && (
          <p>
            {action.field}: {action.value}
          </p>
        )}
        {action.type === "edit_vault_file" && <p>Instruction: {action.instruction}</p>}
        {action.type === "update_settings" && (
          <p>
            {action.field}: {String(action.value)}
          </p>
        )}
        <button
          type="button"
          disabled={running || completed}
          onClick={() => void confirmAction(action, index)}
          className="mt-2 rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          {completed
            ? "Action confirmed"
            : status.startsWith("Failed:")
              ? `Retry · ${label}`
              : `Confirm & ${label}`}
        </button>
        {status && (
          <p className="mt-1" role="status">
            {status}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      {open && (
        <section
          className="fixed bottom-20 right-4 z-40 flex h-[min(72vh,720px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
          aria-label="Grant"
        >
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="text-sm font-bold">Grant</h2>
              <p className="text-[11px] text-slate-300">
                Private profile, tracker & Vault context
              </p>
            </div>
            <button
              type="button"
              aria-label="Close AI Copilot"
              onClick={() => setOpen(false)}
              className="rounded border border-slate-600 px-2 py-1 text-xs"
            >
              Close
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {messages.length === 0 && (
              <p className="text-xs text-slate-500">
                Ask about your intake, Vault evidence, application tracker, grant eligibility, or
                request a draft. Changes always require confirmation.
              </p>
            )}
            {messages.map((message, index) => (
              <article
                key={`${index}-${message.role}`}
                className={`max-w-[95%] rounded border p-2 text-xs ${message.role === "user" ? "ml-auto border-slate-200 bg-slate-50 text-slate-800" : "border-emerald-200 bg-white text-slate-800"}`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" &&
                  message.action &&
                  acceptAction(message.action, index)}
              </article>
            ))}
            {busy && <p className="text-xs text-slate-500">Grant is working…</p>}
            {error && (
              <p
                role="alert"
                className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <div
            className="space-y-2 border-t border-slate-200 p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!isAuthenticated) {
                onSignIn();
                return;
              }
              const file = event.dataTransfer.files[0];
              if (file) void uploadAndReview(file);
            }}
          >
            <p className="text-[10px] text-slate-500">
              {isAuthenticated
                ? "Drop a document here or attach one to save it to your private Vault."
                : "Sign in to chat with Grant or upload documents to your private Vault."}
            </p>
            {isAuthenticated ? (
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
              >
                <button
                  type="button"
                  aria-label="Attach file"
                  onClick={() => fileInput.current?.click()}
                  className="rounded border border-slate-300 px-2 py-2 text-xs"
                >
                  Attach
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  accept=".pdf,.docx,.txt,.csv,.jpg,.jpeg,.png,application/pdf,text/plain,text/csv,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAndReview(file);
                    event.target.value = "";
                  }}
                />
                <textarea
                  ref={messageInput}
                  aria-label="Message Grant"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  className="min-w-0 flex-1 resize-none rounded border border-slate-300 bg-white p-2 text-xs text-slate-900"
                  placeholder="Ask Grant…"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="w-full rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
              >
                Sign in to chat or upload
              </button>
            )}
          </div>
        </section>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-4 right-4 z-40 rounded bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-lg"
      >
        {open ? "Hide AI Copilot" : "AI Copilot"}
      </button>
    </>
  );
}
