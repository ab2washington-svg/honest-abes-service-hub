// Server-side only. Real password auth for the Admin + Technician accounts.
// Each protected account's password is hashed and stored as one Vercel
// environment variable (same pattern as OPENAI_API_KEY) -- nothing is ever
// in the repo or the browser. To change or revoke someone's access, the
// owner edits that variable in Vercel and redeploys; that's the entire
// "admin control" surface, and only the owner has Vercel access.
//
// Customers are NOT covered by this -- they keep the simple click-to-enter
// demo flow on the login screen.
//
// POST /api/auth  { userId, password }        -> { ok, token, expiresAt }
// POST /api/auth  { action: "verify", token }  -> { ok, userId }

import crypto from "crypto";

// Maps each protected user's id (from buildDemoUsers in App.jsx) to the
// Vercel environment variable that holds their password hash. To revoke an
// account, set its variable's value to REVOKED (or delete it) and redeploy.
const ENV_KEY_BY_USER = {
  u_admin: "AUTH_HASH_ADMIN",
  u_tech1: "AUTH_HASH_TECH1",
  u_tech2: "AUTH_HASH_TECH2",
};

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function verifyPassword(password, stored) {
  // stored format: "saltHex:hashHex"
  if (!stored || stored === "REVOKED" || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
}

function signToken(userId, expiresAt) {
  const payload = `${userId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, sig] = parts;
  const expected = crypto.createHmac("sha256", getSessionSecret())
    .update(`${userId}.${expiresAtStr}`).digest("hex");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || Date.now() > expiresAt) return null;
  return { userId, expiresAt };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const body = req.body || {};

  // --- Verify an existing session token (used on app load / page refresh) ---
  // Re-checks the live env var every time, so if the owner revokes an
  // account (blanks its variable and redeploys), any device already signed
  // in gets logged out on its next check too.
  if (body.action === "verify") {
    const result = verifyToken(body.token);
    if (!result) return res.status(200).json({ ok: false });
    const envKey = ENV_KEY_BY_USER[result.userId];
    const stored = envKey ? process.env[envKey] : null;
    if (!stored || stored === "REVOKED") return res.status(200).json({ ok: false });
    return res.status(200).json({ ok: true, userId: result.userId });
  }

  // --- Log in with userId + password ---
  const { userId, password } = body;
  if (!userId || !password) {
    return res.status(400).json({ ok: false, error: "Missing userId or password." });
  }

  const envKey = ENV_KEY_BY_USER[userId];
  const stored = envKey ? process.env[envKey] : null;

  if (!stored) {
    return res.status(200).json({
      ok: false,
      error: "No password has been set up for this account yet. Ask the owner to add it in Vercel.",
    });
  }
  if (stored === "REVOKED") {
    return res.status(200).json({ ok: false, error: "This account's access has been revoked." });
  }

  if (!verifyPassword(password, stored)) {
    return res.status(200).json({ ok: false, error: "Incorrect password." });
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = signToken(userId, expiresAt);
  return res.status(200).json({ ok: true, token, expiresAt });
}
