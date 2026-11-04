import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    // Os testes de integração PostgreSQL compartilham o mesmo banco descartável,
    // então precisam rodar em série para não colidirem entre arquivos.
    fileParallelism: !process.env.CRM_TEST_POSTGRES_URL,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "electron/**/*.cjs", "scripts/**/*.cjs"],
      exclude: ["**/*.test.*", "**/*.d.ts", "src/types/**"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 80,
        branches: 82,
        functions: 72,
        lines: 81,
      },
    },
  },
});
