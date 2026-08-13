// Thin client for the server-side AI route. The OpenAI key never appears
// in this file, in App.jsx, or anywhere else that ships to the browser —
// it lives only in the server's environment variables (see api/ai-assist.js
// and README.md). If /api/ai-assist isn't deployed, these calls fail
// gracefully with a message the admin/technician can act on.

export async function callAI(task, context) {
  let res;
  try {
    res = await fetch("/api/ai-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, context }),
    });
  } catch (e) {
    throw new Error("Couldn't reach the AI endpoint. Is /api/ai-assist deployed?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `AI request failed (${res.status}).`);
  }
  return data.result || "";
}

export async function checkAIConfigured() {
  const res = await fetch("/api/ai-assist", { method: "GET" });
  if (!res.ok) throw new Error("unreachable");
  const data = await res.json();
  return !!data.configured;
}
