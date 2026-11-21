# AutoGrant AI

AutoGrant helps applicants find funding opportunities, review grant requirements, draft proposal materials, organize Vault evidence, and track applications. AI requests use authenticated server functions and Lovable's AI Gateway.

## Current coverage and limitations

- Federal opportunities are searched through Grants.gov. An SBIR/STTR topic search uses the public SBIR.gov API; SBIR.gov currently reports API maintenance, so use its official Topics page if the live request is unavailable.
- State routing links to economic-development agencies in all 50 states. These links are not a live or exhaustive state-grant database.
- Amber Grant application advice and two winner interviews are source-linked for the AI and visible in Proposal Studio. Other programs have no connected winner case studies yet; public stories do not establish why a funder selected a winner.
- Proposal narratives export as PDF, DOCX, and TXT. Budget exports include PDF, CSV, and a text justification; Vault attachments can be included in the ZIP.
- Exported materials are drafts, not official SF-424/SF-424A forms. The app does not submit applications to grant portals.
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
