/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",

  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{md,mdx}",
  ],

  // Helpful future defaults
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
      // Wire next/font CSS vars into Tailwind utilities
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        brandGreen: "#478559",
        brandNavy: "#161748",
        brandPink: "#f95d9b",
        brandBlue: "#39a0ca",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,0.06)",
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
    },
  },

  plugins: [
    require("@tailwindcss/forms")({ strategy: "class" }),
    require("@tailwindcss/typography"),
    require("@tailwindcss/aspect-ratio"),
    require("tailwindcss-animate"),
    require("@tailwindcss/container-queries"),

    // 🔌 Gradient button utilities (classnames: btn-gradient-primary / -accent / -hero)
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
      };

      addComponents({
        ".btn-gradient-primary": {
          ...baseBtn,
          backgroundImage: `linear-gradient(90deg, ${theme("colors.brandNavy")} 0%, ${theme("colors.brandGreen")} 50%, ${theme("colors.brandBlue")} 100%)`,
          "&:hover": { opacity: ".9" },
          "&:active": { filter: "brightness(0.98)" },
          outline: "none",
        },
        ".btn-gradient-accent": {
          ...baseBtn,
          backgroundImage: `linear-gradient(90deg, ${theme("colors.brandGreen")} 0%, ${theme("colors.brandBlue")} 100%)`,
          "&:hover": { opacity: ".9" },
          "&:active": { filter: "brightness(0.98)" },
          outline: "none",
        },
        ".btn-gradient-hero": {
          ...baseBtn,
          padding: "0.75rem 1.25rem",
          backgroundImage: `linear-gradient(90deg, ${theme("colors.brandNavy")} 0%, ${theme("colors.brandBlue")} 100%)`,
          "&:hover": { opacity: ".92" },
          "&:active": { filter: "brightness(0.98)" },
          outline: "none",
        },
      });
    },
  ],
};
