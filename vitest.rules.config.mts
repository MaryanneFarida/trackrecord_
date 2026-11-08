import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests that need the Firestore emulator (Security Rules + ledger). Run with:  npm run test:rules
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts", "tests/emulator/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
});
