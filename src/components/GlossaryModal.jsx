// src/components/GlossaryModal.jsx
import React from "react";
import { X, Copy, Star, SpeakerWave } from "lucide-react";
import { BlockMath, InlineMath } from "react-katex";

/**
 * Props:
 * - term: object
 * - onClose, onSpeak, onCopy, onToggleFavorite, isFavorite, onAiExplain
 */
export default function GlossaryModal({ term, onClose, onSpeak, onCopy, onToggleFavorite, isFavorite, onAiExplain }) {
  if (!term) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative z-70 max-w-3xl w-full bg-[#060608] border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#ffd24a]">{term.term}</h2>
                <div className="mt-1 text-xs text-zinc-400">{term.category}</div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={onSpeak} className="p-2 rounded-md border border-zinc-800"><SpeakerWave className="w-4 h-4" /></button>
                <button onClick={onCopy} className="p-2 rounded-md border border-zinc-800"><Copy className="w-4 h-4" /></button>
                <button onClick={onToggleFavorite} className="p-2 rounded-md border border-zinc-800">{isFavorite ? <Star className="text-[#ffd24a] w-4 h-4" /> : <Star className="w-4 h-4" />}</button>
                <button onClick={onClose} className="p-2 rounded-md border border-zinc-800"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="mt-4 text-sm text-zinc-200 leading-relaxed">
              {term.full}
            </div>

            {term.formulas && term.formulas.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-zinc-300">Formulas</h3>
                <div className="mt-2 space-y-2">
                  {term.formulas.map((f, i) => (
                    <div key={i} className="p-3 bg-black/40 border border-zinc-800 rounded">
                      {/* Use BlockMath for full formula */}
                      <BlockMath math={f} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button onClick={onAiExplain} className="px-3 py-2 rounded bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">AI Explain</button>
              <a href="#" target="_blank" rel="noreferrer" className="px-3 py-2 rounded border border-zinc-800">Open Diagram</a>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-enter { transform: translateY(6px); opacity: 0; }
      `}</style>
    </div>
  );
}
