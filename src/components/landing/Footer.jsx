// src/components/Footer.jsx
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Footer() {
  const [email, setEmail] = useState("");

  const handleSubscribe = (e) => {
    e.preventDefault();
    // placeholder for subscription logic
    alert(`Subscribed with ${email}`);
    setEmail("");
  };

  return (
    <footer className="bg-black/90 text-white pb-8">
    

      {/* Footer bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mt-16 border-t border-zinc-700 pt-6 text-center text-zinc-500 text-sm"
      >
        &copy; {new Date().getFullYear()} <span className="text-orange-300"> SparkLab.</span> All rights reserved.
      </motion.div>
    </footer>
  );
}
