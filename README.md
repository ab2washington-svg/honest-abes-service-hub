# Honest Abes Service Hub

Zero-cost-first job management app for Honest Abes Appliance and Property
Services — customer, technician, and admin/owner roles, full job workflow,
and an optional AI assist layer that's off until you turn it on.

## Run it locally (no AI, no key needed)

```
npm install
npm run dev
```

Opens at `http://localhost:5173`. Demo data seeds automatically — log in as
any of the sample users (no password) to try all three roles. Everything
except the AI buttons works with zero configuration.

## Turning on AI (requires your OpenAI key)

Your key must never be pasted into the app or committed to git — it lives
only as a server environment variable. Pick your host below.

### Vercel (recommended — simplest for this project shape)

1. `npm i -g vercel` (one time), then from this folder: `vercel`
2. In the Vercel dashboard → your project → **Settings → Environment
   Variables**, add `OPENAI_API_KEY` with your real key. Save.
3. Redeploy: `vercel --prod`
4. In the app, go to **Admin → Integrations → AI features** and toggle it
   on. It should show "Server key detected — AI calls are live."

Local testing with the real function: `vercel dev` (reads `.env` — copy
`.env.example` to `.env` first, and make sure `.env` is never committed).

### Netlify

1. `npm i -g netlify-cli`, then `netlify init` from this folder.
2. Netlify's functions expect a `netlify/functions/` folder with a slightly
   different handler signature than `api/ai-assist.js` (which is written
   for Vercel/Node-style `req/res`). Either:
   - Deploy on Vercel instead (zero code changes), or
   - Ask to have `api/ai-assist.js` adapted to Netlify's
     `exports.handler = async (event) => {...}` format — a small rewrite,
     same logic.
3. In Netlify dashboard → **Site configuration → Environment variables**,
   add `OPENAI_API_KEY`.

### Cloudflare Pages / Workers

1. Cloudflare Pages Functions use a different handler signature too
   (`export function onRequest(context) {...}`, reading `context.env.OPENAI_API_KEY`
   instead of `process.env`). Same note as Netlify above — deploy on
   Vercel as-is, or ask for a Cloudflare-flavored rewrite of
   `api/ai-assist.js`.
2. In Cloudflare dashboard → your Pages project → **Settings →
   Environment variables**, add `OPENAI_API_KEY` (mark it as a secret).

## What's free vs. optional

See **Admin → Integrations** inside the running app — it's the live,
always-current source of truth for what's on, what's off, and what each
integration costs. Summary:

| Piece | Cost | Status by default |
|---|---|---|
| Database (localStorage → swap to Supabase free tier) | Free | On |
| Auth (demo login → swap to Supabase Auth/Clerk free tier) | Free | On |
| Photo storage (inline → swap to Supabase Storage free tier) | Free | On |
| Email/SMS notifications | Free tier / paid at scale | Off, simulated |
| Payments (Stripe) | Free to integrate, per-transaction fee to use | Off, manual payment works fine |
| AI (OpenAI) | Pay-per-use once enabled | Off until you add a server key |

## Project shape

```
api/ai-assist.js       # the ONLY file that touches OPENAI_API_KEY
src/App.jsx             # the whole app (all 3 roles)
src/lib/storage.js       # swap this for Supabase later — same get/set shape
src/lib/ai.js            # client helper that calls api/ai-assist.js
```
