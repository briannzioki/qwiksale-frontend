/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",

  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{md,mdx}",
  ],

  // Opt in to helpful future defaults
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
      // Wire your next/font CSS vars into Tailwind utilities
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
    // Use forms with strategy: 'class' to avoid global element resets
    require("@tailwindcss/forms")({ strategy: "class" }),
    require("@tailwindcss/typography"),
    require("@tailwindcss/aspect-ratio"),
    require("tailwindcss-animate"),
    // If you installed it (you have it in devDependencies), this unlocks `@container`
    // and responsive container query variants.
    require("@tailwindcss/container-queries"),
    // ⛔ Do NOT add @tailwindcss/line-clamp (deprecated in recent Tailwind).
  ],
};
