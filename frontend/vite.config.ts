/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  test: {
    // jsdom só é necessário pelos testes de componente (ex.: ProductList) —
    // os testes puros de lib/ continuam rodando igual, sem DOM nenhum.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
