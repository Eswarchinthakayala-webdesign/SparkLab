// src/hooks/useGemini.js
import { useCallback, useEffect, useRef, useState } from "react";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; 
// Put your restricted key in .env, e.g. VITE_GEMINI_API_KEY=AIzaSy...

export default function useGemini({ model = "gemini-2.0-flash-exp" } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastController = useRef(null);

  const generateText = useCallback(async (prompt, opts = {}) => {
    if (!prompt) throw new Error("Prompt required");

    try {
      setLoading(true);
      setError(null);

      if (lastController.current) {
        try { lastController.current.abort(); } catch {}
      }
      const ac = new AbortController();
      lastController.current = ac;

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxTokens ?? 512,
        },
      };

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
        }
      );

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Gemini error: ${resp.status} ${txt}`);
      }

      const data = await resp.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No output from Gemini.";

      setLoading(false);
      lastController.current = null;
      return { text, raw: data };
    } catch (err) {
      if (err.name === "AbortError") {
        setError("aborted");
      } else {
        setError(err.message || String(err));
      }
      setLoading(false);
      lastController.current = null;
      throw err;
    }
  }, [model]);

  useEffect(() => {
    return () => {
      if (lastController.current) {
        try { lastController.current.abort(); } catch {}
      }
    };
  }, []);

  return { generateText, loading, error };
}
