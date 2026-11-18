import { describe, expect, it } from "vitest";
import { envSchema } from "../src/lib/env";

// Testa só o schema do campo (envSchema.shape), não envSchema.parse(process.env)
// inteiro — não precisa montar DATABASE_URL/JWT_SECRET etc. pra isolar o
// parsing de um único campo.
function parseMlPublishEnabled(value: string | undefined) {
  return envSchema.shape.ML_PUBLISH_ENABLED.parse(value);
}

describe("ML_PUBLISH_ENABLED (parsing do env)", () => {
  it("ausente (undefined): default false", () => {
    expect(parseMlPublishEnabled(undefined)).toBe(false);
  });

  it('"true" ativa', () => {
    expect(parseMlPublishEnabled("true")).toBe(true);
  });

  it('"1" também ativa — mesmo padrão de MELHOR_ENVIO_SANDBOX', () => {
    expect(parseMlPublishEnabled("1")).toBe(true);
  });

  it('"false" não ativa', () => {
    expect(parseMlPublishEnabled("false")).toBe(false);
  });

  it("string vazia não ativa", () => {
    expect(parseMlPublishEnabled("")).toBe(false);
  });

  it('valor inválido ("yes", "TRUE", "0") não ativa — só "true"/"1" ativam, nunca por engano', () => {
    expect(parseMlPublishEnabled("yes")).toBe(false);
    expect(parseMlPublishEnabled("TRUE")).toBe(false);
    expect(parseMlPublishEnabled("0")).toBe(false);
  });
});
