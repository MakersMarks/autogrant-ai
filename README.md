# AutoGrant AI

AutoGrant helps applicants find funding opportunities, review grant requirements, draft proposal materials, organize Vault evidence, and track applications. AI requests use authenticated server functions and Lovable's AI Gateway; deployed environments need the server-side `LOVABLE_API_KEY` configured in Lovable Secrets.

## Current coverage and limitations

- **Readiness boundary:** This repository's implementation and CI results do not prove that a published deployment is healthy or fully configured. Live production health, deployed database/RLS state, and Lovable/GitHub secrets must be independently checked before describing the service as production-ready. AutoGrant is an application-preparation assistant, not a grant-award guarantee.
- Federal opportunities are searched through Grants.gov. An SBIR/STTR topic search uses the public SBIR.gov API; SBIR.gov currently reports API maintenance, so use its official Topics page if the live request is unavailable.
- State routing links to economic-development agencies in all 50 states. Other state, local, corporate, and foundation listings are partial directory/curated coverage, not an exhaustive live catalog. There is no verified 25–40-opportunity active seed catalog or universal automated dead-link/closed-status checker; verify each opportunity at its official source before applying.
- Grant cards show a 0–50 fit score and a low-competition score with its component math and data source labels. Hard eligibility failures are excluded from actionable matches. Historical win rates are shown only when award and applicant counts are reported; profile-alignment and scarcity heuristics are labeled as estimates, not predictions.
- Autopilot requires a project name, a Vault item tagged as `photo_id`, and at least one Vault document. This checks for an uploaded ID document; it does not verify the document owner's identity. The Auto setting is a saved preference and does not submit applications.
- The signed-in AutoGrant Agent can chat and review Vault uploads before intake is complete, and can read the user's profile, tracker, and Vault, draft/edit text assets, update intake/settings, search grant discovery, and delete Vault items. Proposal drafting still requires a saved intake profile. It proposes changes first; data-changing actions require user confirmation. Chat responses are request/response, not token-streamed.
- Vault deletion removes the user's storage object and database record with rollback on metadata failure. Stored text files can be edited in the viewer. Settings save a notification email to the profile and a display name/opt-in flag to the authenticated user's metadata; email notifications are not currently sent.
- Vault supports PDF, DOCX, TXT, CSV, JPG, and PNG uploads. CSV is extracted as text; XLSX and other spreadsheet formats are not supported. The current intake profile does not capture dedicated EIN, NAICS, revenue/tenure, or ZIP/county fields, so eligibility checks cannot rely on those values. Profile fields and Vault evidence are not independent third-party verification.
- Amber Grant application advice and two winner interviews are source-linked for the AI and visible in Proposal Studio. Other programs have no connected winner case studies yet; public stories do not establish why a funder selected a winner.
- Proposal narratives export as PDF, DOCX, and TXT. Budget exports include PDF, CSV, and a text justification; Vault attachments can be included in the ZIP.
- Grant discovery is driven by the live Grants.gov API and official-source program directories. Directory-only portal rows are shown separately, are not scored as active grants, and are excluded from Smart Match counts. The former locally generated sample opportunities are removed; an API failure is shown as an error rather than replaced with fake records.
- Smart Match persists quiz tags to the applicant profile and filters current non-federal listings by demographic, state, business stage, and entity eligibility. Its count excludes directory-only and closed records; live Grants.gov results are searched separately in the main feed.
- AI-generated narratives and verified budget justifications are saved to the user's application record and private Vault. Budget lines require a source/basis, applicant-entered amount, purpose, and milestone before they can be included.
- The tracker keeps `draft`, `submission_ready`, externally `submitted`, `under_review`, `awarded`, and `not_selected` states separate. A person must attest to fact accuracy, funder AI-use rules, solicitation requirements, the self-check, and a fresh-eyes review before marking a draft ready; only the applicant can confirm portal submission. Awarded applications include a downloadable post-award follow-through checklist.
- The deterministic red-team audit checks extracted prompt/section word and character limits, required Vault slots, budget/narrative consistency, and match amounts when those requirements and data are available. The Tracker gate requires saved content, resolved evidence markers, and human attestations, but does not persist or bind a successful audit result to the status transition; it therefore cannot guarantee every solicitation-specific check passed. It also does not validate every allowable-cost rule or complete logic-model alignment. Proposal statements are not yet traceable to exact source-document chunks; review generated text and requirements against the current official solicitation.
- The drafting engine offers an AI-use disclosure draft. Binding certifications, legal filings/contracts, certified financial statements, official licenses/permits, signatures, and final portal submissions remain human-only.
- Exported materials are drafts, not official SF-424/SF-424A forms. The app does not submit applications to grant portals.
- Proposal Studio includes a guided submission handoff: official-source link, requirement checklist, export/package, final review, and tracker confirmation. AutoGrant never clicks the portal's final Submit button or attests on the applicant's behalf.
- Application award outcomes are self-reported in the tracker and are not independently verified. The workspace funding total reflects manually recorded deposits; it does not treat an award status, submitted request, or award ceiling as received funding.
- Pre-Launch / Established selection is retained in local browser storage and, for signed-in users, Supabase auth metadata. It controls grant-readiness emphasis and workspace guidance.
- Automated SAM.gov status checks require the server-side `SAM_GOV_API_KEY` Lovable secret. UEI/CAGE values entered for a check are not saved.
- The GitHub grant-sync workflow writes crawler data to the same Lovable Cloud database used by the app. Its `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` names refer to backend settings; Lovable does not automatically expose those values to GitHub Actions, so configure them as repository Actions secrets. Never commit their values. The workflow now reports a skipped or failed sync as a failed run after saving any updated crawler snapshot.
- The app emits privacy-minimized signup, quiz, Vault, Copilot, proposal, export, and grant interaction events through Lovable's runtime event hook when available; it does not send message text or quiz answers. Verify event collection in the published Lovable runtime. Email deadline reminders are not active; settings currently record only an opt-in preference.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/65981ac9-67f4-400b-a924-1578cf0db252).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
