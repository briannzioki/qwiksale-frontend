// eslint.config.mjs
import next from "eslint-config-next";
import js from "@eslint/js";
import globals from "globals";

export default [
  // Ignore build artifacts
  { ignores: [".next/**", "node_modules/**", "dist/**"] },

  // Next.js base rules (flat-config ready)
  ...next,

  // Your project-wide language options + any extra rules
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // ✅ Use `globals`, not `env`
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // add any custom rules here or keep empty
    },
  },
];
