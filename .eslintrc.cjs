// .eslintrc.cjs
// If this line causes "Failed to patch ESLint", comment it out.
require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2023, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "react-hooks", "import"],
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
  ],
  settings: {
    react: { version: "detect" },
    "import/resolver": {
      typescript: { alwaysTryTypes: true },
      node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
    },
  },
  ignorePatterns: [".next/**", "node_modules/**", "dist/**", "build/**", "coverage/**"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-empty": "warn",
    "no-console": ["warn", { allow: ["info", "warn", "error"] }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/ban-ts-comment": [
      "warn",
      { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 3 },
    ],
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        groups: [["builtin", "external"], ["internal", "parent", "sibling", "index", "object", "type"]],
      },
    ],
  },
  overrides: [
    {
      files: ["next-env.d.ts", "src/**/*.d.ts", "middleware.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/triple-slash-reference": "off",
      },
    },
    {
      files: [
        "**/*.{config,conf}.{js,cjs,ts,mjs}",
        "tailwind.config.js",
        "postcss.config.js",
        "scripts/**",
        "prisma/**",
      ],
      rules: {
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "no-empty": "off",
      },
    },
  ],
};
