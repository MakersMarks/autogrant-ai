<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- AutoGrant UI lives in `src/components/autogrant/`; `/` renders it client-only (`ssr: false`) because the session is in localStorage.
- AI calls go through `src/lib/ai/ai.functions.ts` (auth-protected server fns) → `ai.server.ts` on the Lovable AI Gateway; never call external AI providers or ship keys to the browser.
- Vault files live in the private `vault` bucket under `<user_id>/...`; upload rules are in `validateVaultFile` (covered by tests).
- Both drafting entry points use the shared proposal policy and server-side profile/Vault reads; persisted application rows are the tracker source of truth to prevent template-only or session-only drafts.
- Parse Vault PDF/DOCX/TXT evidence on the server with edge-compatible libraries; JPG/PNG are transcribed via Gemini vision (generateWithGemini image arg); fail explicitly rather than silently omit unreadable evidence.
- Persist AI access pauses in the server-only gateway-state table; ordinary application data continues to use the authenticated RLS client.
- Live grants come from the public Grants.gov search2/fetchOpportunity API via auth-protected server fns in src/lib/grants-gov/; filter rules live in rules.ts (tested).
- Feed seeds category/eligibility from the intake profile and hides other-state-only grants via stateFromLocation/isOtherStateOnly in rules.ts.
