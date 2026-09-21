import { defineConfig } from "vitest/config";

// Config separada dos testes padrão (vitest.config.ts): roda só
// tests/**/*.integration.test.ts, que fazem chamadas reais à Claude API e ao
// microserviço rembg. Nunca incluído no `npm run test` padrão — só via
// `npm run test:integration`.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.integration.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
