# Matthew's Space — Homework AI backend

This folder contains a Cloudflare Worker endpoint for AI-assisted homework extraction.

## What it does
- Accepts typed homework notes and up to five image/PDF attachments.
- Calls the OpenAI Responses API from the server (never from browser JavaScript).
- Requests strict structured output in Traditional Chinese.
- Returns subject, task title, due date (null if unclear), estimated minutes, priority and notes.
- Requires an app password and restricts browser CORS to the GitHub Pages origin.

## Deploy (adult/guardian should manage API billing and secrets)
1. Create a Cloudflare Worker and deploy `worker/index.js` as its entry point.
2. Add Worker secrets:
   - `OPENAI_API_KEY`: the API key (secret; never commit it).
   - `APP_PASSWORD`: a long, unique password used by the private dashboard.
3. Optional non-secret variable: `AI_MODEL` (defaults to `gpt-6.2-astra`).
4. In Cloudflare Worker settings, confirm the Worker is deployed and note its `workers.dev` URL.
5. In the dashboard's AI settings, enter that Worker URL and the app password. Do not share the password.
6. Test `GET /api/health`, then use the homework AI analyser.

## Security and limitations
- Never put API keys in HTML, JavaScript, GitHub, or a public repository.
- API usage may incur charges. An adult/guardian should own and manage the API account, payment and usage limits.
- The app password is a basic private gate, not a replacement for proper user accounts. Keep it private and rotate it if exposed.
- This Worker processes the uploaded files but does not permanently store them. Homework records remain in the browser's local storage in the current version.
- For reliable cross-device memory, add authenticated accounts and a D1 database in a later phase.
- The endpoint limits request size and attachment count. OCR/extraction results must be reviewed; due dates are never inferred when unclear.
