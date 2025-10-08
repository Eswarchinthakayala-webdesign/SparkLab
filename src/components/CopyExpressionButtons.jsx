import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyExpressionButtons({ sopResult, posResult }) {
  const [copied, setCopied] = useState({ sop: false, pos: false });

  const handleCopy = (type) => {
    const text =
      type === "sop"
        ? sopResult.expression || "0"
        : posResult.expression || "1";
    navigator.clipboard?.writeText(text);

    setCopied((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => {
      setCopied((prev) => ({ ...prev, [type]: false }));
    }, 1500);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* Copy SOP */}
      <Button
        className="relative cursor-pointer flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-orange-900 hover:brightness-110 transition-all overflow-hidden"
        onClick={() => handleCopy("sop")}
      >
        <AnimatePresence mode="wait">
          {copied.sop ? (
            <motion.div
              key="copied-sop"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-center w-full"
            >
              <Check className="w-4 h-4 mr-2" />
              Copied!
            </motion.div>
          ) : (
            <motion.div
              key="copy-sop"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-center w-full"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy SOP
            </motion.div>
          )}
        </AnimatePresence>
      </Button>

      {/* Copy POS */}
      <Button
        variant="outline"
        className="relative cursor-pointer flex-1 border border-zinc-700 bg-zinc-900/50 text-orange-100 hover:bg-zinc-800/70 hover:text-white transition-all overflow-hidden"
        onClick={() => handleCopy("pos")}
      >
        <AnimatePresence mode="wait">
          {copied.pos ? (
            <motion.div
              key="copied-pos"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-center w-full"
            >
              <Check className="w-4 h-4 mr-2 text-orange-300" />
              Copied!
            </motion.div>
          ) : (
            <motion.div
              key="copy-pos"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-center w-full"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy POS
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
    </div>
  );
}
