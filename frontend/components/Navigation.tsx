"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileCheck,
  Search,
  LineChart,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/submit", label: "Submit Review", icon: FileCheck },
  { href: "/decrypt", label: "View Results", icon: Search },
  { href: "/analytics", label: "Analytics", icon: LineChart },
];

export const Navigation = () => {
  const pathname = usePathname();

  return (
    <nav className="mb-8 rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-2">
      <div className="flex items-center gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href === "/" && pathname === "/");

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-300 ${
                  isActive
                    ? "text-white"
                    : "text-slate-600 hover:text-[#0f1d40] hover:bg-slate-50"
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isActive && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-[#0f1d40] to-[#1b58d9] rounded-xl"
                    layoutId="activeTab"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                    }}
                  />
                )}
                <Icon
                  className={`relative z-10 w-5 h-5 ${
                    isActive ? "text-white" : "text-slate-500"
                  }`}
                />
                <span className="relative z-10 text-sm">{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

