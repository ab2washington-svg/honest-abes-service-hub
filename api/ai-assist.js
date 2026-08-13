// Server-side only. This is the ONE place the OpenAI key is ever read.
// Set OPENAI_API_KEY as an environment variable in your hosting provider's
// project settings (Vercel/Netlify/Cloudflare) — never commit it, never
// put it in src/. See README.md for exact steps per host.
//
// GET  /api/ai-assist  -> { configured: boolean }   (used by Admin Settings)
// POST /api/ai-assist  -> { task, context } -> { result }

const PROMPTS = {
  diagnostic: (context) =>
    `You are a diagnostic assistant for Honest Abes Appliance and Property ` +
    `Services, a Spokane, WA home-services company. Given the job details ` +
    `below, suggest 2-4 likely causes and a short, practical troubleshooting ` +
    `checklist for the technician. Be concise, no fluff, no disclaimers.\n\n${context}`,
  summary: (context) =>
    `Write a short, friendly completion summary for a homeowner, based on ` +
    `internal technician notes for a job that Honest Abes Appliance and ` +
    `Property Services just completed. Plain language, no jargon, under 80 words.\n\n${context}`,
};

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ configured: !!process.env.OPENAI_API_KEY });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "OPENAI_API_KEY is not set on the server yet." });
  }

  const { task, context } = req.body || {};
  const buildPrompt = PROMPTS[task];
  if (!buildPrompt || !context) {
    return res.status(400).json({ error: "Missing or unknown task/context." });
  }

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: buildPrompt(context) }],
        max_tokens: 300,
        temperature: 0.4,
      }),
    });

    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json({ error: data.error?.message || "OpenAI request failed." });
    }

    const result = data.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error calling OpenAI." });
  }
}
