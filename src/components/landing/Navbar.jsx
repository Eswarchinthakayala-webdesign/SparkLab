
import React from "react";
import { motion } from "framer-motion";
import {
  Menu,
  Zap,
  Home,
  Star,
  DollarSign,
  Info,
  LogIn,
  Rocket,
  User2,
  CircleUserRound,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Navbar() {
  const navLinks = [
    { name: "Home", href: "/", icon: Home },
    { name: "Features", href: "/features", icon: Star },
    { name: "About", href: "/about", icon: Info },
  ];
  const navigate=useNavigate()
  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full backdrop-blur-xl bg-black/80 border-b border-orange-500/20 shadow-lg"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        {/* Logo / Title */}
        <motion.a
          href="/"
          className="flex items-center gap-2 text-2xl font-bold group relative"
          whileHover={{
            scale: 1.1,
            textShadow: "0px 0px 15px rgba(255,140,0,0.9)",
          }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Zap className="w-7 h-7 text-orange-500 animate-pulse" />
          <motion.span
            animate={{
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "linear",
            }}
            className="bg-gradient-to-r from-orange-400 via-yellow-500 to-orange-600 bg-[length:200%_200%] bg-clip-text text-transparent"
          >
            SparkLab
          </motion.span>
          {/* Hover glow effect */}
          <span className="absolute -inset-2 rounded-lg bg-orange-500/20 blur-md opacity-0 group-hover:opacity-100 transition duration-500" />
        </motion.a>

        {/* Desktop Menu */}
        <nav className="hidden md:flex gap-8 text-sm font-medium">
          {navLinks.map((link, i) => (
            <motion.a
              key={i}
              href={link.href}
              className="group relative flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:text-orange-400 transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <link.icon className="w-4 h-4" />
              {link.name}
              {/* underline animation */}
              <span className="absolute left-0 -bottom-1 h-[2px] w-0 bg-gradient-to-r from-orange-400 via-yellow-500 to-orange-600 rounded-full transition-all duration-300 group-hover:w-full" />
            </motion.a>
          ))}
        </nav>

        {/* Desktop Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Button
            variant="ghost"
            className="text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 cursor-pointer hover:text-orange-400 border border-orange-500/50 rounded-xl px-4 transition-all"
            onClick={()=>navigate("/contact")}
          >
            <CircleUserRound className="w-4 h-4 mr-1" />
            Contact Us
          </Button>
          <Button className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-black font-semibold rounded-xl shadow-lg shadow-orange-500/30 px-5 transition-all"
          onClick={()=>navigate("/topics")}
          >
            <Rocket className="w-4 h-4 mr-1" />
            Get Started
          </Button>
        </div>

        {/* Mobile Menu */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-zinc-300 hover:text-orange-400"
              >
                <Menu className="w-7 h-7" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="bg-black/95 backdrop-blur-2xl border-r border-orange-500/30 shadow-xl p-6"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-xl font-bold bg-gradient-to-r from-orange-400 via-yellow-500 to-orange-600 bg-clip-text text-transparent">
                  <Zap className="w-6 h-6 text-orange-500" />
                  SparkLab
                </SheetTitle>
              </SheetHeader>

              {/* Mobile Nav Links */}
              <nav className="mt-10 flex flex-col gap-6">
                {navLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.href}
                    className="group relative flex items-center gap-3 text-zinc-300 hover:text-orange-400 text-lg px-3 py-2 rounded-lg transition-colors"
                  >
                    {/* Left glowing line */}
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] scale-y-0 group-hover:scale-y-100 origin-top bg-gradient-to-b from-orange-400 via-yellow-500 to-orange-600 rounded-r transition-transform duration-300" />
                    <link.icon className="w-5 h-5 text-orange-400 relative z-10" />
                    <span className="relative z-10">{link.name}</span>
                  </a>
                ))}
              </nav>

              {/* Mobile Buttons */}
              <div className="mt-10 flex flex-col gap-3">
                <Button
                  variant="ghost"
                  className="text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 cursor-pointer hover:text-orange-400 border border-orange-500/50 rounded-xl px-4 transition-all"
                  onClick={()=>navigate("/contact")}
                >
                  <CircleUserRound className="w-4 h-4 mr-1" />
                  Contact Us
                </Button>
                <Button className="cursor-pointer bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-black font-semibold rounded-xl shadow-lg shadow-orange-500/30 transition-all"
                onClick={()=>navigate("/topics")}>
                  <Rocket className="w-4 h-4 mr-1" />
                  Get Started
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  );
}
