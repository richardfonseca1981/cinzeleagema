import { describe, expect, it } from "vitest";
import "./setup";
import { env } from "../src/lib/env";
import { isAnthropicConfigured } from "../src/lib/claude";

// Garante o setup de tests/setupNoAnthropic.ts: mesmo com ANTHROPIC_API_KEY
// real no ambiente ou no backend/.env, os testes padrão rodam SEM chave — nada
// chama a API da Anthropic nem gasta crédito.
describe("testes padrão não têm chave da Anthropic", () => {
  it("ANTHROPIC_API_KEY chega vazia ao código, mesmo com chave no ambiente", () => {
    expect(env.ANTHROPIC_API_KEY).toBe("");
    expect(isAnthropicConfigured()).toBe(false);
  });
});
