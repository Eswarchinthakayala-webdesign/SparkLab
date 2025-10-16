// src/pages/GlossaryPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import GlossaryCard from "@/components/GlossaryCard";
import GlossaryModal from "@/components/GlossaryModal";
import { InlineMath, BlockMath } from "react-katex"; // npm i react-katex katex
import "katex/dist/katex.min.css";
import { Search } from "lucide-react"; // or any magnifier icon
// NOTE: adapt imports to your project path conventions.

const CATEGORIES = ["Electrical", "Electronics", "Machines", "Measurement", "Instruments"];

/**
 * Sample dataset
 * In production, fetch from API or CMS.
 */
const SAMPLE_TERMS = [
  {
    id: "v_ir",
    term: "Ohm's Law",
    short: "Relation between voltage, current and resistance.",
    full: "Ohm's law states V = I × R, i.e. voltage across a conductor is proportional to current.",
    category: "Electrical",
    formulas: ["V = I R"],
    diagram: null,
    pronunciation: "ohmz law",
  },
  {
    id: "cap",
    term: "Capacitance",
    short: "Ability of a system to store charge per unit voltage.",
    full:
      "The capacitance C of a capacitor is defined as C = Q / V. For a parallel plate capacitor C = εA/d where ε is permittivity.",
    category: "Electronics",
    formulas: ["C = Q/V", "C = \\frac{\\epsilon A}{d}"],
    diagram: null,
  },
  // add more terms...
];

export default function GlossaryPage() {
  const [terms, setTerms] = useState(SAMPLE_TERMS);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("glossary:favorites") || "[]");
    } catch { return []; }
  });
  const [selected, setSelected] = useState(null); // term clicked -> modal
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizItem, setQuizItem] = useState(null);
  const rightAlphabetRef = useRef(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem("glossary:favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    // keyboard accessibility: Esc to close modal / exit quiz
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        if (quizMode) stopQuiz();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, quizMode]);

  const filtered = useMemo(() => {
    let list = terms;
    if (activeCategory !== "All") {
      list = list.filter((t) => t.category === activeCategory);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.short.toLowerCase().includes(q) ||
          (t.full && t.full.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => a.term.localeCompare(b.term));
  }, [terms, activeCategory, query]);

  function toggleFavorite(id) {
    setFavorites((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function copyToClipboard(text) {
    navigator.clipboard?.writeText(text);
  }

  function jumpToLetter(letter) {
    // find first element starting with letter and scroll into view
    const el = document.querySelector(`[data-term-letter="${letter}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ----------------------------
     Flashcard / Quiz logic
     ---------------------------- */
  function toggleFlashcard() {
    setFlashcardMode((v) => !v);
    setQuizMode(false);
  }

  function startQuiz() {
    setFlashcardMode(false);
    setQuizMode(true);
    nextQuizItem();
  }

  function stopQuiz() {
    setQuizMode(false);
    setQuizItem(null);
  }

  function nextQuizItem() {
    const pool = filtered.length > 0 ? filtered : terms;
    const r = pool[Math.floor(Math.random() * pool.length)];
    setQuizItem({ ...r, shown: false });
  }

  async function explainWithGemini(termId) {
    // Calls Gemini-like endpoint. You must set NEXT_PUBLIC_GEMINI_API_KEY in env.
    // This is a placeholder that calls a fictional Gemini API. Replace with your provider SDK.
    const term = terms.find((t) => t.id === termId);
    if (!term) return;
    setAiLoading(true);
    try {
      const resp = await fetch("/api/generate-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Explain briefly (2 lines) ${term.term}: ${term.short}` }),
      });
      const json = await resp.json();
      // the API route should return { explanation: "..." }
      return json.explanation || "No explanation returned";
    } catch (err) {
      console.error(err);
      return "AI explanation failed.";
    } finally {
      setAiLoading(false);
    }
  }

  async function exportFavorites() {
    // POST favorites to /api/generate-pdf which returns a PDF blob
    const favItems = favorites.map((id) => terms.find((t) => t.id === id)).filter(Boolean);
    if (favItems.length === 0) {
      alert("No favorites selected.");
      return;
    }
    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: favItems }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `favorites-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Export failed: " + err.message);
    }
  }

  /* ----------------------------
     Formula detection helper (KaTeX)
     ---------------------------- */
  function renderFormulaOrText(str) {
    // detect latex-like patterns or basic math (V = IR or contains backslash)
    if (!str) return <span>{str}</span>;
    const hasLatex = /\\|=|\\frac|\\\(|\^|_/.test(str) && /[A-Za-z0-9]/.test(str);
    if (hasLatex) {
      try {
        return <InlineMath math={str} />;
      } catch {
        return <span>{str}</span>;
      }
    }
    return <span>{str}</span>;
  }

  /* ----------------------------
     Render
     ---------------------------- */

  return (
    <div className="min-h-screen bg-[#05060a] text-white">
      {/* Page header (sticky) */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md bg-black/60 border-b border-zinc-800 px-4 py-3 print:hidden"
        aria-label="Glossary header"
      >
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-[#ffd24a]">Glossary of BEEE Terms</h1>
            <p className="text-xs sm:text-sm text-zinc-400">Search electrical & electronics engineering terms</p>
          </div>

          <div className="w-full max-w-md">
            <label htmlFor="glossary-search" className="sr-only">Search terms</label>
            <div className="relative">
              <input
                id="glossary-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search terms, definitions, formulas..."
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-black/50 border border-zinc-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-3 flex items-center gap-3 overflow-x-auto py-2">
          <button
            onClick={() => setActiveCategory("All")}
            className={`px-3 py-1 rounded-full text-sm border ${activeCategory === "All" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black border-[#ffd24a]" : "bg-black/50 border-zinc-800 text-zinc-300"} focus:ring-2 focus:ring-orange-400`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`px-3 py-1 rounded-full text-sm border ${activeCategory === c ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black border-[#ffd24a]" : "bg-black/50 border-zinc-800 text-zinc-300"} focus:ring-2 focus:ring-orange-400`}
            >
              {c}
            </button>
          ))}

          <div className="ml-auto flex gap-2">
            <button onClick={toggleFlashcard} className="px-3 py-1 rounded-full bg-black/50 border border-zinc-800 text-zinc-300 text-sm">
              {flashcardMode ? "Exit Flashcards" : "Flashcard Mode"}
            </button>
            <button onClick={startQuiz} className="px-3 py-1 rounded-full bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-sm">
              Quiz Me
            </button>
            <button onClick={exportFavorites} className="px-3 py-1 rounded-full bg-black/50 border border-zinc-800 text-zinc-300 text-sm">
              Export Favorites (PDF)
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="relative">
          {/* Right alphabet quick nav */}
          <nav
            ref={rightAlphabetRef}
            aria-label="Alphabet quick navigation"
            className="hidden md:block fixed right-4 top-40 bg-black/40 border border-zinc-800 rounded-xl p-2 backdrop-blur-md"
          >
            <div className="flex flex-col gap-1">
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((L) => (
                <button
                  key={L}
                  onClick={() => jumpToLetter(L)}
                  className="w-6 h-6 text-xs flex items-center justify-center rounded hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  {L}
                </button>
              ))}
            </div>
          </nav>

          {/* Grid */}
          {quizMode ? (
            <section aria-live="polite" className="mx-auto">
              <div className="p-6 bg-black/60 border border-zinc-800 rounded-2xl text-center">
                <h2 className="text-xl font-semibold text-[#ffd24a]">Quiz — Recall the definition</h2>
                {quizItem ? (
                  <>
                    <div className="mt-4 text-white text-lg">{quizItem.term}</div>
                    <div className="mt-6">
                      {!quizItem.shown ? (
                        <button
                          onClick={() => setQuizItem((q) => ({ ...q, shown: true }))}
                          className="px-4 py-2 rounded bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"
                        >
                          Show Definition
                        </button>
                      ) : (
                        <div className="mt-2 text-zinc-300 max-w-prose mx-auto">{quizItem.full}</div>
                      )}
                    </div>
                    <div className="mt-6 flex gap-3 justify-center">
                      <button onClick={nextQuizItem} className="px-3 py-2 rounded bg-black/50 border border-zinc-800">Next</button>
                      <button onClick={stopQuiz} className="px-3 py-2 rounded bg-black/50 border border-zinc-800">End Quiz</button>
                    </div>
                  </>
                ) : (
                  <div>No items to quiz.</div>
                )}
              </div>
            </section>
          ) : (
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((t) => (
                  <div
                    key={t.id}
                    data-term-letter={t.term.charAt(0).toUpperCase()}
                  >
                    {/* <GlossaryCard
                      term={t}
                      isFavorite={favorites.includes(t.id)}
                      onToggleFavorite={() => toggleFavorite(t.id)}
                      onSpeak={() => speakText(t.full || t.short)}
                      onCopy={() => copyToClipboard(`${t.term} — ${t.short}`)}
                      onOpen={() => setSelected(t)}
                      flashcardMode={flashcardMode}
                      aiExplain={async () => {
                        const explanation = await explainWithGemini(t.id);
                        alert(`${t.term}\n\nAI: ${explanation}`);
                      }}
                    /> */}
                  </div>
                ))}
              </div>

              {/* Empty state */}
              {filtered.length === 0 && (
                <div className="mt-8 text-center text-zinc-400">
                  No terms match your query.
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Modal */}
      {selected && (
        <GlossaryModal
          term={selected}
          onClose={() => setSelected(null)}
          onSpeak={() => speakText(selected.full || selected.short)}
          onCopy={() => copyToClipboard(`${selected.term}\n\n${selected.full}`)}
          onToggleFavorite={() => toggleFavorite(selected.id)}
          isFavorite={favorites.includes(selected.id)}
          onAiExplain={async () => {
            const explain = await explainWithGemini(selected.id);
            // show explanation in modal (we'll just alert for demo)
            alert(explain);
          }}
        />
      )}

      {/* Print-friendly styles */}
      <style jsx>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          header, nav, button { display: none !important; }
          .print-card { border: 1px solid #ddd; background: white !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
