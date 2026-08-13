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

## Turning on real admin/technician passwords

Right now Adrian, Mike, and Sarah's accounts have no password until you add
one — the login screen will tell them so if they try. Each account's
password is a separate Vercel environment variable, set the exact same way
you set `OPENAI_API_KEY`:

1. In the Vercel dashboard → your project → **Settings → Environment
   Variables**, add these three (Production checked at least):

   | Key | Value |
   |---|---|
   | `AUTH_HASH_ADMIN` | `11cc62471ad4dbacd1c1bf48f8fa9488:c956e83ee6ca84f73f0598be2624179fea3a28928cbbe67526f851639de0f54af42e959c5e62a98b021adcbd928b668f185124eaad6e3ab0368981354ff8036e` |
   | `AUTH_HASH_TECH1` | `f4b2eab71c762a1638428e728edf011c:bb5b25aded186927a44316fbed051f974de4cb43bd1a4548509f7792404a8d8e6982d8cde6c8fc2793f94cdff4e10c1368aaf2ebb137097bee644cfcc5da629a` |
   | `AUTH_HASH_TECH2` | `e6792f3809013519c87ced5825e8a146:4a1bfbe6ed221f5d7481429f6c87f35754ecdd8feeaa8c6680bac1bb2debd18a17fb067d91e2f6df978d389426297657793db751eb79a256f7d73d528456c765` |
   | `SESSION_SECRET` | `b14707eadb92d7982e8929c930e69d80cd2f56fa82d5c0abea4c6e890d51b56a` |

   Those hash values correspond to these starting passwords — change them
   as soon as you're set up (see below):
   - **Adrian (admin):** `Ab2telah`
   - **Mike (tech1):** `Tech1`
   - **Sarah (tech2):** `Tech2`

2. Redeploy so the new variables take effect (same **Deployments → ⋯ →
   Redeploy** step you used for the AI key).
3. Customers still just click their name to log in — no password. Adrian
   and technicians now get a password field on the login screen.

**To change someone's password:** generate a new hash and paste it in as
the same variable's value, then redeploy. Run this from the project folder
(or ask Claude to run it for you and hand you the value):

```
node -e "const c=require('crypto');const s=c.randomBytes(16);const h=c.scryptSync(process.argv[1],s,64);console.log(s.toString('hex')+':'+h.toString('hex'))" "the-new-password"
```

**To revoke someone's access** (temporarily or permanently): set their
variable's value to the literal text `REVOKED` and redeploy. This logs
them out immediately — even a device that's already signed in gets kicked
on its next check. To restore access, paste their hash back in (or
generate a new one) and redeploy.

Only you have Vercel dashboard access, so this is the entire admin-control
surface — nobody else can issue, change, or revoke a password.

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
