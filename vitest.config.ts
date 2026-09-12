import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/server/test/**/*.test.ts",
      "packages/contracts/test/**/*.test.ts",
    ],
    exclude: ["apps/web/**", "**/node_modules/**"],
  },
});
