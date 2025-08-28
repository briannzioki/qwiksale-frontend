// postcss.config.js
const isProd = process.env.NODE_ENV === "production";

/** Keep this file CommonJS (module.exports) for best compatibility with Next 15 */
module.exports = {
  plugins: {
    // Optional: enables @import in CSS files
    "postcss-import": {},

    // Nesting support (Tailwind’s built-in nesting plugin for v3.x)
    "tailwindcss/nesting": {},

    // Tailwind + vendor prefixes
    tailwindcss: {},
    autoprefixer: {},

    // Optional: extra minification only in production
    ...(isProd ? { cssnano: { preset: "default" } } : {}),
  },
};
