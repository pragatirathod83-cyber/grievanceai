# Sahāyika – Campus Grievance Intelligence Agent (prototype)

Educational prototype with fictional data. Not an emergency or counselling service. State is **in memory** (resets on restart).

## Run (two terminals)
Needs Node 18+ only (the server has **zero npm dependencies**, so `npm install` is not needed for it).

    # Terminal 1 - server (http://localhost:8000)
    cd server
    npm start

    # Terminal 2 - client (http://localhost:5173)
    cd client
    npm install
    npm run dev

Open http://localhost:5173. Tests: `cd server && npm test` (8 tests, passing when this was packaged).
Optional: copy `.env.example` to `.env` in each folder (the server reads real environment variables; set them in your shell or host).

Windows PowerShell "running scripts is disabled": run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use `npm.cmd`, or use Command Prompt.

## Accounts
Sign up in the app (name, email, password 8+ chars, optional photo; passwords are hashed with scrypt) or use the demo accounts below, all with password `demo1234`.
Optional: set `ALLOWED_EMAIL_DOMAIN=nitkkr.ac.in` in the server environment to restrict sign-up to college email.

## Demo accounts
asha@ / ravi@ (students), maint@ (department handler), admin@ – all `@campus.example`.
Script: Asha reports "Light not working in Block C corridor" → duplicate warning (seeded Ravi complaint) → submit. Report a harassment complaint → confidential, support info shown. Compare what admin and maint see; open Agent trace and Audit log.

## Assumptions
- The spec mentions both FastAPI and Node/Express/MongoDB. This build uses a **Node server on the built-in `http` module** (no Express/MongoDB) with in-memory data, so it runs anywhere with no installs. Swap in Express/MongoDB later; routes live in `server/src/index.js`.
- Brand: Sahāyika (Campus Voice / CampusSetu in the spec are treated as leftovers).

## Implemented
Text and browser-voice intake; formalization with review and approval; 6-step bounded agent over allowlisted deterministic tools (classify, urgency, sensitivity, duplicates, routing, escalation); duplicate linking that keeps each record; anonymous/confidential reporting; role-based visibility (student/handler/admin); audited reporter reveal; status flow Submitted→Acknowledged→In Progress→Resolved→Reopened; analytics; audit log.

## New in this version
Left sidebar with profile photo, sign in / sign up, My complaints with progress tracker, creative Report flow, public All complaints feed with Date/Type/Status filter, star-rating Feedback, Light/Dark switch, sea-green theme.

## Added in this version
- Logo: icon beside the name on the first page, favicon, and a faint blended watermark behind every page (`client/public/logo.png`, `logo-bg.png`).
- Camera/photo evidence (up to 2 photos): live camera on desktop, camera app on phones, or upload. Photos are shrunk in the browser; the server checks they are real JPG/PNG.
- Input check: rubbish, too-short, unreadable or off-topic text gets a polite request for details (`checkText` in `server/src/agent.js`). Blank/very dark photos are rejected in the browser with a friendly message.
- Student-only support chat (robot button, bottom right). Without an API key it uses rule-based empathetic replies (`server/src/support.js`); hook your LLM into `chat()` in `server/src/llm.js`. Chats are not stored. Crisis wording shows helplines (Tele-MANAS 14416, KIRAN 1800-599-0019, 112): re-verify numbers before real use.
- Limits: no vision AI, so a photo of something unrelated that is not blank cannot be detected; add `assessRelevance()` in `llm.js` for that. The chat is not a counsellor.

## Not implemented
- `server/src/llm.js` is the stub for your hand-coded Gemini module (contract in the file); demo mode uses rules.
- Image/video upload, notifications, feedback/ratings, suggestions and voting, real auth (JWT/SSO), persistence, rate limiting, encryption.
- The client has not been built or browser-tested in my sandbox (no network for `npm install`).
