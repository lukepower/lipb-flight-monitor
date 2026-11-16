import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      // Next uses the `react-server` export; Vitest needs an explicit alias.
      "server-only": path.resolve(root, "./node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
