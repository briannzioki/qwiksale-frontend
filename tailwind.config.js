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
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },

      /* ------------------------- Color System ------------------------- */
      colors: {
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

        brandNavy: {
          50: "#f3f4fb",
          100: "#e6e7f6",
          200: "#c7c9ea",
          300: "#a4a6dd",
          400: "#6f73c7",
          500: "#3f45a9",
          600: "#161748",
          700: "#11123a",
          800: "#0c0d2c",
          900: "#080a22",
          DEFAULT: "#161748",
        },
        brandGreen: {
          50: "#edf7f0",
          100: "#d6efde",
          200: "#aedad0",
          300: "#83c2b0",
          400: "#61a88e",
          500: "#4e9474",
          600: "#478559",
          700: "#3a6b47",
          800: "#2d5236",
          900: "#213b28",
          DEFAULT: "#478559",
        },
        brandBlue: {
          50: "#ebf7fc",
          100: "#d1eef9",
          200: "#a5dff1",
          300: "#72cbe6",
          400: "#4db4d7",
          500: "#3aa1c8",
          600: "#39a0ca",
          700: "#2f83a6",
          800: "#276a86",
          900: "#1f5368",
          DEFAULT: "#39a0ca",
        },
        accent: {
          50: "#fff1f6",
          100: "#ffe4ee",
          200: "#ffc0d7",
          300: "#ff97bd",
          400: "#ff6aa4",
          500: "#ff488f",
          600: "#f95d9b",
          700: "#d2357d",
          800: "#aa2b65",
          900: "#87234f",
          DEFAULT: "#f95d9b",
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
        glow: "0 0 0 6px rgba(57,160,202,0.12)",
        focus: "0 0 0 3px rgba(57,160,202,0.35)",
      },

      /* ------------------------- Gradients ------------------------- */
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "brand-hero":
          "linear-gradient(90deg, var(--brand-start) 0%, var(--brand-mid) 50%, var(--brand-end) 100%)",
        "brand-accent":
          "linear-gradient(90deg, theme(colors.brandGreen.600) 0%, theme(colors.brandBlue.600) 100%)",
        "brand-navy":
          "linear-gradient(90deg, theme(colors.brandNavy.600) 0%, theme(colors.brandBlue.600) 100%)",
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
        "spin-slow": "spin-slow 6s linear infinite",
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
    plugin(function ({ addBase, addComponents, addUtilities, theme }) {
      // Semantic CSS vars for surfaces & brand ramps (keep in sync with globals.css)
      addBase({
        ":root": {
          // Surfaces
          "--bg-app": colors.slate[50],
          "--bg-elevated": "#ffffff",
          "--bg-muted": colors.slate[100],
          "--bg-subtle": colors.slate[50],

          // Borders
          "--border": colors.slate[200],
          "--border-subtle": colors.slate[200],
          "--border-strong": colors.slate[300],

          // Text
          "--text-strong": colors.slate[950],
          "--text": colors.slate[900],
          "--text-muted": colors.slate[600],
          "--text-soft": colors.slate[500],

          // Semantic palette
          "--primary": theme("colors.brandNavy.600"),
          "--primary-soft": theme("colors.brandNavy.50"),
          "--accent": theme("colors.accent.DEFAULT"),
          "--accent-soft": theme("colors.accent.50"),
          "--danger": colors.rose[600],
          "--danger-soft": colors.rose[50],

          "--brand-start": theme("colors.brandNavy.600"),
          "--brand-mid": theme("colors.brandGreen.600"),
          "--brand-end": theme("colors.brandBlue.600"),
        },
        ".dark": {
          "--bg-app": colors.slate[950],
          "--bg-elevated": "#0b1220",
          "--bg-muted": colors.slate[900],
          "--bg-subtle": "#020617",

          "--border": colors.slate[700],
          "--border-subtle": colors.slate[800],
          "--border-strong": colors.slate[600],

          "--text-strong": "#f9fafb",
          "--text": colors.slate[100],
          "--text-muted": colors.slate[400],
          "--text-soft": colors.slate[500],

          "--primary": theme("colors.brandNavy.300"),
          "--primary-soft": "rgba(15,23,42,0.7)",
          "--accent": theme("colors.accent.300"),
          "--accent-soft": "rgba(248,113,166,0.24)",
          "--danger": colors.rose[500],
          "--danger-soft": "rgba(248,113,113,0.27)",

          "--brand-start": theme("colors.brandNavy.500"),
          "--brand-mid": theme("colors.brandGreen.500"),
          "--brand-end": theme("colors.brandBlue.500"),
        },
      });

      const btnBase = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        borderRadius: theme("borderRadius.2xl"),
        padding: "0.5rem 1rem",
        fontWeight: "700",
        color: "#fff",
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
        ".hero-surface": {
          borderRadius: theme("borderRadius.3xl"),
          color: "#fff",
          backgroundImage: theme("backgroundImage.brand-navy"),
          boxShadow: theme("boxShadow.elev4"),
        },
        ".card-surface": {
          borderRadius: theme("borderRadius.2xl"),
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          boxShadow: theme("boxShadow.card"),
        },
        ".shadow-soft": { boxShadow: theme("boxShadow.soft") },

        ".btn-gradient-primary": {
          ...btnBase,
          backgroundImage: theme("backgroundImage.brand-hero"),
        },
        ".btn-gradient-accent": {
          ...btnBase,
          backgroundImage: theme("backgroundImage.brand-accent"),
        },
        ".btn-gradient-hero": {
          ...btnBase,
          padding: "0.75rem 1.25rem",
          backgroundImage: theme("backgroundImage.brand-navy"),
        },
      });

      // Utilities – including token-based helpers
      addUtilities({
        ".text-gradient": {
          backgroundImage: theme("backgroundImage.brand-hero"),
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        },
        ".ring-focus": { boxShadow: theme("boxShadow.focus") },
        ".glow": { boxShadow: theme("boxShadow.glow") },
        ".rounded-inherit": { borderRadius: "inherit" },
        ".animate-spin-slow": { animation: theme("animation.spin-slow") },

        // Token-powered helpers
        ".bg-app": { backgroundColor: "var(--bg-app)" },
        ".bg-surface": { backgroundColor: "var(--bg-elevated)" },
        ".bg-subtle": { backgroundColor: "var(--bg-muted)" },
        ".border-subtle": { borderColor: "var(--border-subtle)" },
        ".border-strong": { borderColor: "var(--border-strong)" },
        ".text-strong": { color: "var(--text)" },
        ".text-muted-token": { color: "var(--text-muted)" },
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
