// src/pages/aiUtils.js

/**
 * Generate text using Gemini / Vertex AI generateContent endpoint.
 * Tries multiple fallback models in sequence if one fails.
 *
 * @param {string} prompt - The text prompt to send.
 * @param {string} apiKey - Your Google API key for Gemini.
 * @param {object} options - Optional configuration.
 * @param {string[]} options.models - List of model IDs to try (in priority).
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxOutputTokens=512]
 * @returns {Promise<string>} - Generated text (or error indicator).
 */
export async function generateTextWithGemini(prompt, apiKey, options = {}) {
  const {
    models = [
      "gemini-2.0-flash",       // preferred
      "gemini-2.0-flash-lite",  // lighter fallback
      "gemini-2.0-flash-exp",   // if experimental still allowed
    ],
    temperature = 0.7,
    maxOutputTokens = 512,
  } = options;

  // Helper to call a specific model once
  const callModel = async (modelId) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      
    };

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`Gemini model ${modelId} error ${resp.status}:`, text);
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const candidate = data?.candidates?.[0];
      const result =
        candidate?.content?.parts?.[0]?.text ||
        candidate?.output ||
        null;

      if (result != null) {
        return result.trim();
      } else {
        throw new Error(`No candidate text in response for model ${modelId}`);
      }
    } catch (err) {
      console.warn(`Model ${modelId} failed:`, err.message);
      throw err;
    }
  };

  // Try each model in sequence
  for (const m of models) {
    try {
      const text = await callModel(m);
      return text;
    } catch (err) {
      // continue to next fallback
    }
  }

  // If all models failed
  const msg = `⚠️ All Gemini model attempts failed.`;
  console.error(msg);
  return msg;
}
