// src/components/GlossaryCard.jsx
import React from "react";
import { SpeakerIcon as SpeakerWave, Copy, Star, StarOff, Info } from "lucide-react";
import { InlineMath } from "react-katex";

/**
 * Props:
 * - term: { id, term, short, category, formulas }
 * - isFavorite: boolean
 * - onToggleFavorite, onSpeak, onCopy, onOpen, flashcardMode, aiExplain
 */

export default function GlossaryCard({
  term,
  isFavorite,
  onToggleFavorite,
  onSpeak,
  onCopy,
  onOpen,
  flashcardMode,
  aiExplain,
}) {
  // detect formula presence
  const hasFormula = Array.isArray(term.formulas) && term.formulas.length > 0;

  return (
    <article
      className="group relative rounded-xl p-4 bg-black/50 border border-[#222] shadow-sm hover:scale-[1.01] transition-transform duration-200"
      tabIndex={0}
      role="button"
      aria-label={`${term.term} card`}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black font-bold">
          {term.term.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white truncate">{term.term}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-black/60 border border-zinc-800 text-zinc-300">{term.category}</span>
            </div>
          </div>

          <p className={`mt-2 text-xs text-zinc-300 ${flashcardMode ? "opacity-0 h-0 overflow-hidden" : ""}`}>{term.short}</p>

          {flashcardMode && (
            <div className="mt-2 text-sm text-zinc-100 font-medium">Tap card to flip</div>
          )}

          {hasFormula && (
            <div className="mt-3 text-xs text-zinc-200">
              <InlineMath math={term.formulas[0]} />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onSpeak}
              aria-label={`Pronounce ${term.term}`}
              className="p-2 rounded-md bg-black/30 border border-zinc-800 text-zinc-200 text-sm hover:bg-zinc-900"
            >
              <SpeakerWave className="w-4 h-4" />
            </button>

            <button
              onClick={onCopy}
              aria-label="Copy definition"
              className="p-2 rounded-md bg-black/30 border border-zinc-800 text-zinc-200 text-sm hover:bg-zinc-900"
            >
              <Copy className="w-4 h-4" />
            </button>

            <button
              onClick={() => aiExplain && aiExplain()}
              aria-label="AI explain"
              title="AI Explain (2-line deeper explanation)"
              className="ml-auto px-2 py-1 rounded-md text-xs bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"
            >
              AI Explain
            </button>

            <button
              onClick={onToggleFavorite}
              aria-label="Toggle favorite"
              className="p-2 rounded-md border border-zinc-800 ml-2"
            >
              {isFavorite ? <Star className="w-4 h-4 text-[#ffd24a]" /> : <StarOff className="w-4 h-4 text-zinc-400" />}
            </button>

            <button
              onClick={onOpen}
              aria-label="Open details"
              className="p-2 rounded-md border border-zinc-800 ml-1"
            >
              <Info className="w-4 h-4 text-zinc-300" />
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        article:focus {
          outline: 3px solid rgba(255,122,45,0.18);
          outline-offset: 3px;
        }
      `}</style>
    </article>
  );
}
