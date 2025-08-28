// src/app/fonts.ts
import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * Primary UI font — variable Inter
 * - Exposes CSS var: --font-inter
 * - Preloads for above-the-fold text
 * - Uses robust OS fallbacks during swap
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
  fallback: [
    "system-ui",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "Noto Sans",
    "sans-serif",
  ],
});

/**
 * Optional monospace — great for ids, codes, and technical UI bits
 * - Exposes CSS var: --font-mono
 * - Not preloaded (smaller initial payload)
 */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  preload: false,
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    "Liberation Mono",
    "monospace",
  ],
});

/**
 * Convenience string: add to <body> or layout wrapper className
 * example:
 *   <body className={`${fontVars} ...`}>
 */
export const fontVars = `${inter.variable} ${mono.variable}`;
