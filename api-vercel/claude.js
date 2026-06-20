// Vercel Serverless Function — גרסת proxy ל-Claude API
// מקם את הקובץ הזה ב-api/claude.js בפרויקט Vercel.
// הגדר ANTHROPIC_API_KEY במשתני הסביבה של Vercel.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    return res.status(503).json({ error: { message: "Server not configured with API key" } });
  }
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await anthropicRes.json();
    res.status(anthropicRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: "Proxy error" } });
  }
}
