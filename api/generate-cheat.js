// pages/api/generate-cheat.js
// Simple server endpoint to generate cheat explanations using an AI provider.
// - Expects POST with JSON { cheatId }
// - If process.env.GENERATE_API_KEY is present, will attempt to call provider and return { text }
// - Otherwise returns a fallback text (from a small in-file fallback map).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  const { cheatId } = req.body || {};
  if (!cheatId) {
    res.status(400).json({ error: "Missing cheatId" });
    return;
  }

  // Small fallback map (keep in sync with client CHEATS)
  const FALLBACKS = {
    recall: "Quiz yourself on core facts for 10 mins; write answers, then check. Tip: Use spaced repetition flashcards.",
    formula: "Build a one-page formula sheet, then practice recalling formulas aloud.",
    // ... add keys for all cheat ids or return a generic fallback
  };

  const key = process.env.GENERATE_API_KEY;
  if (!key) {
    // No key configured — return fallback
    return res.status(200).json({ text: FALLBACKS[cheatId] || "Quick tip: practice actively and timebox." });
  }

  // TODO: replace example below with your AI provider's HTTP API.
  // Example pseudocode for a generic provider that accepts POST /v1/generate:
  try {
    const providerUrl = process.env.GENERATE_API_URL || "https://api.example.ai/v1/generate"; // change this
    const prompt = `Provide a short, actionable study note for cheat id="${cheatId}". Keep it to 2-4 sentences.`;
    const resp = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        prompt,
        max_tokens: 200,
        temperature: 0.6,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Provider error:", resp.status, txt);
      return res.status(200).json({ text: FALLBACKS[cheatId] || "Quick tip (fallback): keep it short." });
    }

    const data = await resp.json();
    // Note: providers differ; adjust path to content accordingly.
    // Try common fields: data.choices[0].text or data.output[0].content[0].text
    const text =
      (data?.choices?.[0]?.text) ||
      (data?.output?.[0]?.content?.[0]?.text) ||
      data?.text ||
      FALLBACKS[cheatId] ||
      "Quick tip (fallback).";

    return res.status(200).json({ text });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(200).json({ text: FALLBACKS[cheatId] || "Quick tip (fallback)." });
  }
}
