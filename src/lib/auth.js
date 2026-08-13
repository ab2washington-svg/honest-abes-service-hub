// Thin client for the server-side /api/auth route. Passwords are sent over
// HTTPS to the server for checking and are never stored anywhere in the
// browser — only the resulting session token is kept (in localStorage via
// storage.js), and that token can't be used to recover the password.

export async function loginWithPassword(userId, password) {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.error) {
      return { ok: false, error: `Login failed (${res.status}).` };
    }
    return data;
  } catch (e) {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export async function verifySession(token) {
  if (!token) return false;
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", token }),
    });
    const data = await res.json().catch(() => ({}));
    return !!data.ok;
  } catch (e) {
    return false;
  }
}
