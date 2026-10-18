import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next uses the `react-server` export; Vitest needs an explicit alias.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
