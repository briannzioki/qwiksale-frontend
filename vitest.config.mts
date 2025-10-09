/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/shims/server-only.ts"),
      "client-only": path.resolve(__dirname, "tests/shims/client-only.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov"],
    },
    hookTimeout: 30000,
  },
  esbuild: { target: "es2022" },
});
