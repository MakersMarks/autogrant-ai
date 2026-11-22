# AutoGrant AI

AutoGrant helps applicants find funding opportunities, review grant requirements, draft proposal materials, organize Vault evidence, and track applications. AI requests use authenticated server functions and Lovable's AI Gateway; deployed environments need the server-side `LOVABLE_API_KEY` configured in Lovable Secrets.

## Current coverage and limitations

- Federal opportunities are searched through Grants.gov. An SBIR/STTR topic search uses the public SBIR.gov API; SBIR.gov currently reports API maintenance, so use its official Topics page if the live request is unavailable.
- State routing links to economic-development agencies in all 50 states. These links are not a live or exhaustive state-grant database.
- Grant cards show a 0–100 eligibility score and a low-competition score with its component math and data source labels. Hard eligibility failures and scores below 70 are excluded. Historical win rates are shown only when award and applicant counts are reported; profile-alignment and scarcity heuristics are labeled as estimates, not predictions.
- Autopilot requires a project name, a Vault item tagged as `photo_id`, and at least one Vault document. This checks for an uploaded ID document; it does not verify the document owner's identity. The Auto setting is a saved preference and does not submit applications.
- The signed-in AutoGrant Agent can chat and review Vault uploads before intake is complete, and can read the user's profile, tracker, and Vault, draft/edit text assets, update intake/settings, search grant discovery, and delete Vault items. Proposal drafting still requires a saved intake profile. It proposes changes first; data-changing actions require user confirmation. Chat responses are request/response, not token-streamed.
- Vault deletion removes the user's storage object and database record with rollback on metadata failure. Stored text files can be edited in the viewer. Settings save a notification email to the profile and a display name/opt-in flag to the authenticated user's metadata; email notifications are not currently sent.
- Amber Grant application advice and two winner interviews are source-linked for the AI and visible in Proposal Studio. Other programs have no connected winner case studies yet; public stories do not establish why a funder selected a winner.
- Proposal narratives export as PDF, DOCX, and TXT. Budget exports include PDF, CSV, and a text justification; Vault attachments can be included in the ZIP.
- Grant discovery is driven by the live Grants.gov API and clearly labeled official-source program directories. The former locally generated sample opportunities are removed; an API failure is shown as an error rather than replaced with fake records.
- AI-generated narratives and verified budget justifications are saved to the user's application record and private Vault. Budget lines require a source/basis, applicant-entered amount, purpose, and milestone before they can be included.
- The tracker keeps `draft`, `submission_ready`, and externally `submitted` states separate. A person must attest to fact accuracy, funder AI-use rules, solicitation requirements, the self-check, and a fresh-eyes review before marking a draft ready; only the applicant can confirm portal submission.
- The drafting engine offers an AI-use disclosure draft. Binding certifications, legal filings/contracts, certified financial statements, official licenses/permits, signatures, and final portal submissions remain human-only.
- Exported materials are drafts, not official SF-424/SF-424A forms. The app does not submit applications to grant portals.
- Proposal Studio includes a guided submission handoff: official-source link, requirement checklist, export/package, final review, and tracker confirmation. AutoGrant never clicks the portal's final Submit button or attests on the applicant's behalf.
- Application records do not currently store verified grant award outcomes. The workspace reports $0 in recorded awards rather than treating submitted requests or award ceilings as received funding.
- Pre-Launch / Established selection is retained in local browser storage and, for signed-in users, Supabase auth metadata. It controls grant-readiness emphasis and workspace guidance.
- Automated SAM.gov status checks require the server-side `SAM_GOV_API_KEY` Lovable secret. UEI/CAGE values entered for a check are not saved.

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
