// tailwind.config.js
/* eslint-disable */
const plugin = require("tailwindcss/plugin");
const colors = require("tailwindcss/colors");

const forms = require("@tailwindcss/forms");
const typography = require("@tailwindcss/typography");
const aspectRatio = require("@tailwindcss/aspect-ratio");
const containerQueries = require("@tailwindcss/container-queries");
const tailwindAnimate = require("tailwindcss-animate");

/** @type {import('tailwindcss').Config} */
const config = {
  // Confirmed mechanism: class-based dark mode (matches next-themes attribute="class")
  darkMode: "class",

  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{md,mdx}",
  ],

  future: {
    hoverOnlyWhenSupported: true,
  },

  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1rem",
        md: "1.5rem",
        lg: "2rem",
        xl: "2.5rem",
        "2xl": "3rem",
      },
    },

    extend: {
      fontFamily: {
        // Keep aligned with your next/font vars
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },

      /* ------------------------- Color System ------------------------- */
      colors: {
        // Keep standard ramps available, but do not introduce brand* tokens here.
        slate: colors.slate,
        gray: colors.gray,
        stone: colors.stone,

        neutral: {
          DEFAULT: colors.slate[700],
          50: colors.slate[50],
          100: colors.slate[100],
          200: colors.slate[200],
          300: colors.slate[300],
          400: colors.slate[400],
          500: colors.slate[500],
          600: colors.slate[600],
          700: colors.slate[700],
          800: colors.slate[800],
          900: colors.slate[900],
        },

        // Keep accent as a semantic ramp (no hex literals).
        accent: {
          50: colors.yellow[50],
          100: colors.yellow[100],
          200: colors.yellow[200],
          300: colors.yellow[300],
          400: colors.yellow[400],
          500: colors.yellow[500],
          600: colors.yellow[600],
          700: colors.yellow[700],
          800: colors.yellow[800],
          900: colors.yellow[900],
          DEFAULT: colors.yellow[500],
        },
      },

      /* ------------------------- Radii ------------------------- */
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        pill: "9999px",
      },

      /* ------------------------- Shadows ------------------------- */
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,0.06)",
        soft: "0 12px 32px rgba(0,0,0,0.12)",
        elev1: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        elev2: "0 4px 10px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05)",
        elev3: "0 8px 24px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
        elev4: "0 12px 32px rgba(0,0,0,0.16), 0 6px 16px rgba(0,0,0,0.08)",
        // Keep as-is for compatibility. If you later define a CSS var for focus rings,
        // this can be swapped to var(--ring-focus) without changing call sites.
        glow: "0 0 0 6px rgba(0,0,0,0.06)",
        focus: "0 0 0 3px rgba(0,0,0,0.18)",
      },

      /* ------------------------- Animations ------------------------- */
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        blob: {
          "0%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(10px,-10px) scale(1.05)" },
          "66%": { transform: "translate(-10px,10px) scale(0.98)" },
          "100%": { transform: "translate(0,0) scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "ping-soft": {
          "75%,100%": { transform: "scale(1.2)", opacity: "0" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "accordion-down": "accordion-down .2s ease-out",
        "accordion-up": "accordion-up .2s ease-out",
        "fade-in": "fade-in .25s ease-out both",
        "slide-up": "slide-up .25s ease-out both",
        blob: "blob 8s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        "ping-soft": "ping-soft 1.5s cubic-bezier(0,0,0.2,1) infinite",
        // Keep in sync with globals.css Button spinner speed.
        "spin-slow": "spin-slow 1.2s linear infinite",
      },

      /* ------------------------- Z-index ------------------------- */
      zIndex: {
        60: "60",
        70: "70",
        80: "80",
        header: "40",
        backdrop: "45",
        popover: "50",
        drawer: "60",
        toast: "70",
        modal: "80",
      },
    },
  },

  plugins: [
    forms({ strategy: "class" }),
    typography,
    aspectRatio,
    tailwindAnimate,
    containerQueries,

    /* ---------------------- Custom tokens/utilities ---------------------- */
    plugin(function ({ addComponents, addUtilities, theme }) {
      /**
       * IMPORTANT ALIGNMENT NOTE
       * globals.css is the source of truth for semantic tokens:
       *   --bg, --bg-elevated, --bg-subtle, --border-*, --text-*
       * We do not redefine those here (prevents silent drift).
       */

      const btnBase = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        borderRadius: theme("borderRadius.2xl"),
        padding: "0.5rem 1rem",
        fontWeight: "700",
        cursor: "pointer",
        userSelect: "none",
        outline: "none",
        transition:
          "opacity 120ms ease, filter 120ms ease, transform 120ms ease",
        boxShadow: theme("boxShadow.elev2"),
      };

      addComponents({
        ".container-page": {
          width: "100%",
          maxWidth: theme("maxWidth.7xl"),
          marginLeft: "auto",
          marginRight: "auto",
          paddingLeft: theme("spacing.4"),
          paddingRight: theme("spacing.4"),
        },

        // Safe defaults - globals.css can (and will) refine them.
        ".hero-surface": {
          borderRadius: theme("borderRadius.3xl"),
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text)",
          boxShadow: theme("boxShadow.elev4"),
        },

        ".card-surface": {
          borderRadius: theme("borderRadius.2xl"),
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          boxShadow: theme("boxShadow.card"),
        },

        ".shadow-soft": { boxShadow: theme("boxShadow.soft") },

        // Keep class names for compatibility, but remove gradients (brand strip is handled in markup only).
        ".btn-gradient-primary": {
          ...btnBase,
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text)",
        },
        ".btn-gradient-accent": {
          ...btnBase,
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text)",
        },
        ".btn-gradient-hero": {
          ...btnBase,
          padding: "0.75rem 1.25rem",
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text)",
        },
      });

      // Utilities - token-driven primitives (these must exist and stay stable)
      addUtilities({
        ".ring-focus": { boxShadow: theme("boxShadow.focus") },
        ".glow": { boxShadow: theme("boxShadow.glow") },
        ".rounded-inherit": { borderRadius: "inherit" },

        // Core primitives (aligned to your CSS-var token system)
        ".bg-app": { backgroundColor: "var(--bg)" },
        ".bg-surface": { backgroundColor: "var(--bg-elevated)" },
        ".bg-subtle": { backgroundColor: "var(--bg-subtle)" },

        ".text-strong": { color: "var(--text)" },
        ".text-muted": { color: "var(--text-muted)" },

        ".border-subtle": { borderColor: "var(--border-subtle)" },
        ".border-strong": { borderColor: "var(--border)" },

        ".surface-card": {
          backgroundColor: "var(--bg-elevated)",
          borderRadius: theme("borderRadius.2xl"),
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: "var(--border-subtle)",
          boxShadow: theme("boxShadow.card"),
        },
      });
    }),
  ],
};

module.exports = config;
