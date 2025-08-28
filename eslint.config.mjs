// eslint.config.mjs
import next from "eslint-config-next";
import js from "@eslint/js";
import globals from "globals";

export default [
  // Ignore build artifacts
  { ignores: [".next/**", "node_modules/**", "dist/**"] },

  // Next.js base rules (flat-config)
  ...next,

  // JS / Typescript files language options + any extra rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // flat-config uses `globals` instead of `env`
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // add project rules here if needed
    },
  },
];
