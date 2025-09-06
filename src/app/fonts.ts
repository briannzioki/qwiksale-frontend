// src/app/fonts.ts
import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * Primary UI font — Inter (variable)
 * - CSS var: --font-inter
 * - Preloaded for above-the-fold text
 * - Metric-adjusted fallbacks to minimize CLS
 */
export const inter = Inter({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
  adjustFontFallback: true,
  // If you want to trim payload, uncomment the next line and list what you use:
  // weight: ["400", "600", "700"],
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
 * Monospace for code/ids — JetBrains Mono (variable)
 * - CSS var: --font-mono
 * - Not preloaded (smaller initial payload)
 */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-mono",
  preload: false,
  adjustFontFallback: true,
  // Optional trimming:
  // weight: ["400", "600", "700"],
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
 *   <body className={`${fontVars} ...`}>
 */
export const fontVars = `${inter.variable} ${mono.variable}`;
