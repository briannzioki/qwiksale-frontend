/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    exclude: ["tests/e2e/**"],
    passWithNoTests: true,            // ← allow success when no tests exist
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov"],
    },
    hookTimeout: 30000,
  },
  esbuild: { target: "es2022" },
});
