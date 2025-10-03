/** @type {import('tailwindcss').Config} */
module.exports = {
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
        md: "2rem",
        lg: "2rem",
        xl: "2.5rem",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        brandGreen: "#478559",
        brandNavy: "#161748",
        brandPink:  "#f95d9b",
        brandBlue:  "#39a0ca",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,0.06)",
        // you referenced `shadow-soft` in components:
        soft: "0 12px 32px rgba(0,0,0,0.12)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },

      /* ---------- Extra z-index steps + semantic aliases ---------- */
      zIndex: {
        60: "60",
        70: "70",
        80: "80",
        header: "40",   // use: z-header
        backdrop: "45", // use: z-backdrop
        popover: "50",  // use: z-popover
        drawer: "60",   // use: z-drawer
        toast: "70",    // use: z-toast
        modal: "80",    // use: z-modal
      },
    },
  },

  plugins: [
    require("@tailwindcss/forms")({ strategy: "class" }),
    require("@tailwindcss/typography"),
    require("@tailwindcss/aspect-ratio"),
    require("tailwindcss-animate"),
    require("@tailwindcss/container-queries"),

    // Gradient buttons + semantic surfaces/tokens
    function ({ addComponents, theme }) {
      const baseBtn = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        borderRadius: theme("borderRadius.2xl"),
        padding: "0.5rem 1rem",
        fontWeight: "700",
        color: "white",
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        transition: "opacity 120ms ease, filter 120ms ease",
        cursor: "pointer",
        userSelect: "none",
        outline: "none",
      };

      addComponents({
        /* --------- Buttons (kept from your config, slightly tidied) --------- */
        ".btn-gradient-primary": {
          ...baseBtn,
          backgroundImage: `linear-gradient(90deg, ${theme("colors.brandNavy")} 0%, ${theme("colors.brandGreen")} 50%, ${theme("colors.brandBlue")} 100%)`,
          "&:hover": { opacity: ".9" },
          "&:active": { filter: "brightness(0.98)" },
        },
        ".btn-gradient-accent": {
          ...baseBtn,
          backgroundImage: `linear-gradient(90deg, ${theme("colors.brandGreen")} 0%, ${theme("colors.brandBlue")} 100%)`,
          "&:hover": { opacity: ".9" },
          "&:active": { filter: "brightness(0.98)" },
        },
        ".btn-gradient-hero": {
          ...baseBtn,
          padding: "0.75rem 1.25rem",
          backgroundImage: `linear-gradient(90deg, ${theme("colors.brandNavy")} 0%, ${theme("colors.brandBlue")} 100%)`,
          "&:hover": { opacity: ".92" },
          "&:active": { filter: "brightness(0.98)" },
        },

        /* ------------------------- Semantic surfaces ------------------------- */
        // Page container token used across pages
        ".container-page": {
          width: "100%",
          maxWidth: theme("maxWidth.6xl"),
          marginLeft: "auto",
          marginRight: "auto",
          paddingLeft: theme("spacing.4"),
          paddingRight: theme("spacing.4"),
        },

        // Hero surface: brand gradient + white text; used in /contact & /onboarding
        ".hero-surface": {
          borderRadius: theme("borderRadius.2xl"),
          color: "#fff",
          backgroundImage: `linear-gradient(90deg, ${theme("colors.brandNavy")} 0%, ${theme("colors.brandBlue")} 100%)`,
          boxShadow: theme("boxShadow.soft"),
        },

        // Card surface: light/dark aware card container
        ".card-surface": {
          borderRadius: theme("borderRadius.2xl"),
          backgroundColor: "#fff",
          border: `1px solid ${theme("colors.gray.200")}`,
          boxShadow: theme("boxShadow.card"),
        },

        // Helper class you referenced: `shadow-soft`
        ".shadow-soft": {
          boxShadow: theme("boxShadow.soft"),
        },
      });
    },
  ],

  // (Optional) safelist if you ever build class strings dynamically elsewhere:
  // safelist: ["shadow-soft", "hero-surface", "card-surface", "btn-gradient-primary", "btn-gradient-accent", "btn-gradient-hero", "z-header", "z-backdrop", "z-popover", "z-drawer", "z-toast", "z-modal"],
};
