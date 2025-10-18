/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  plugins: [
    react({ jsxRuntime: "automatic" }),
    // Make the editor + Vitest both honor tsconfig paths in root and tests/
    tsconfigPaths({ projects: [r("tsconfig.json"), r("tests/tsconfig.json")] }),
  ],

  resolve: {
    alias: {
      "@": r("src"),
      "server-only": r("tests/shims/server-only.ts"),
      "client-only": r("tests/shims/client-only.ts")
    }
  },

  esbuild: { target: "es2022", jsx: "automatic" },

  test: {
    globals: true,
    environment: "happy-dom",
    environmentOptions: { url: "http://localhost/" },

    setupFiles: ["./tests/e2e/.setup/vitest.setup.tsx"],
    css: true,

    include: [
      "tests/unit-smoke/**/*.{test,spec}.ts",
      "tests/unit-smoke/**/*.{test,spec}.tsx",
      "tests/unit/**/*.{test,spec}.ts",
      "tests/unit/**/*.{test,spec}.tsx",
      "tests/integration/**/*.{test,spec}.ts",
      "tests/integration/**/*.{test,spec}.tsx",
      "src/**/__tests__/**/*.{test,spec}.ts",
      "src/**/__tests__/**/*.{test,spec}.tsx"
    ],
    exclude: ["node_modules/**", "dist/**", ".next/**", "coverage/**", "tests/e2e/**"],

    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    passWithNoTests: true,

    coverage: { provider: "v8", reportsDirectory: "./coverage", reporter: ["text", "lcov"] },

    hookTimeout: 30_000,

    // Vitest 3 deprecates deps.inline – use server.deps.inline
    server: { deps: { inline: [/^next\/image$/, /^next\/navigation$/] } }
  }
});
