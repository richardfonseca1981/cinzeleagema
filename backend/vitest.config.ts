import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Testes *.integration.test.ts consomem créditos reais da Anthropic API e
    // dependem do microserviço rembg no ar — só rodam via `npm run test:integration`
    // (ver vitest.integration.config.ts), nunca no `npm run test` padrão.
    exclude: [...configDefaults.exclude, "tests/**/*.integration.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
