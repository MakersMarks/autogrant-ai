# AutoGrant AI

I have successfully pasted our modular single-file React prototype for AutoGrant.ai. It features clean functional sections for authentication, a 5-step onboarding wizard, a 50-card Grant Discovery feed with live Grants.gov search links and back-navigation, an encrypted Document Vault with strict PDF/DOCX MIME validation and file removal controls, and an Application Tracker with clickable proposal detail views. Please review the codebase and prepare it for connecting our Supabase backend and live AI endpoints.

yeah create the project and add the backendtings to it this is my api key byw from gemeni [REDACTED: user pasted an API key in chat; do not use or repeat it]. put that in your secretes as well to help build it

yes do it

Use Lovable Cloud for auth, database, and private document storage. Use Lovable AI's built-in Gemini capability for the live AI endpoints when possible. If an external Gemini API key is necessary, request a newly rotated key through the secure project secret form; do not use the pasted key.

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
