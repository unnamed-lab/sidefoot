import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests (live devnet) are opt-in; unit tests never hit network.
    environment: "node",
  },
});
