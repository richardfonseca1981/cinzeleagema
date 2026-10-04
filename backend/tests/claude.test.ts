import { afterEach, describe, expect, it, vi } from "vitest";
import "./setup";

vi.mock("../src/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test-key" },
}));

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { SYSTEM_PROMPT, interpretPhotoInstruction, translateProductText } from "../src/lib/claude";

function toolUseResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", name: "translate_product", input }],
  };
}

function photoToolUseResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", name: "apply_photo_treatment", input }],
  };
}

afterEach(() => {
  mockCreate.mockReset();
});

describe("translateProductText", () => {
  it("returns null when the AI returns a placeholder/error marker as nameEn (bug that caused \"<UNKNOWN>\" to appear on the public site)", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "<UNKNOWN>", descriptionEn: "Some description" }));

    const result = await translateProductText("Diamante", "Pedra rara.");

    expect(result).toBeNull();
  });

  it("rejects other common placeholder variants (case-insensitive, with/without brackets)", async () => {
    for (const placeholder of ["unknown", "N/A", "[N/A]", "null", "NONE", "<error>"]) {
      mockCreate.mockResolvedValue(toolUseResponse({ nameEn: placeholder, descriptionEn: "Real translation" }));
      const result = await translateProductText("Diamante", "Pedra rara.");
      expect(result, `expected null for nameEn="${placeholder}"`).toBeNull();
    }
  });

  it("keeps a valid nameEn but nulls descriptionEn when only the description is a placeholder", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "Diamond", descriptionEn: "<UNKNOWN>" }));

    const result = await translateProductText("Diamante", "Pedra rara.");

    expect(result).toEqual({ nameEn: "Diamond", descriptionEn: null });
  });

  it("accepts a real translation normally", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "Diamond", descriptionEn: "Rare, brilliant-cut stone." }));

    const result = await translateProductText("Diamante", "Pedra rara, lapidação brilhante.");

    expect(result).toEqual({ nameEn: "Diamond", descriptionEn: "Rare, brilliant-cut stone." });
  });

  it("returns descriptionEn null (not an error) when there was no original PT description to translate", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ nameEn: "Diamond" }));

    const result = await translateProductText("Diamante", null);

    expect(result).toEqual({ nameEn: "Diamond", descriptionEn: null });
  });
});

// A interpretação de texto em si acontece dentro da Claude API (fora do
// nosso controle) — não dá para testar, sem gastar créditos reais, que
// "melhorar a foto" de fato mapeia para enhance_color (isso é coberto pelo
// teste de integração real em imageTreatment.integration.test.ts). O que
// estes testes garantem, com a API mockada: (1) nosso código processa
// corretamente uma resposta da IA que já contenha enhance_color, em
// qualquer nível e combinado com outras operações na ordem esperada; (2) as
// frases-gatilho e a regra de ordem continuam escritas no system prompt
// (regressão caso alguém edite o prompt e esqueça dessas instruções).
describe("interpretPhotoInstruction — enhance_color", () => {
  it.each(["leve", "medio", "forte"] as const)("repassa operations com enhance_color nível '%s' sem alterar", async (level) => {
    mockCreate.mockResolvedValue(photoToolUseResponse({ unclear: false, operations: [{ operation: "enhance_color", level }] }));

    const result = await interpretPhotoInstruction("deixa a pedra mais colorida");

    expect(result).toEqual({ unclear: false, operations: [{ operation: "enhance_color", level }] });
  });

  it("repassa uma combinação removeBackground -> brightness -> enhance_color na ordem recebida", async () => {
    const operations = [
      { operation: "removeBackground" },
      { operation: "brightness", value: 10 },
      { operation: "enhance_color", level: "medio" },
    ];
    mockCreate.mockResolvedValue(photoToolUseResponse({ unclear: false, operations }));

    const result = await interpretPhotoInstruction("remove o fundo, ajusta o brilho e deixa mais colorida");

    expect(result).toEqual({ unclear: false, operations });
  });

  it("system prompt descreve a operação enhance_color com os 3 níveis", () => {
    expect(SYSTEM_PROMPT).toContain("enhance_color");
    expect(SYSTEM_PROMPT).toMatch(/"leve"/);
    expect(SYSTEM_PROMPT).toMatch(/"medio"/);
    expect(SYSTEM_PROMPT).toMatch(/"forte"/);
  });

  it("system prompt mapeia os pedidos genéricos/de realce de cor para enhance_color", () => {
    for (const phrase of ["melhorar a foto", "realçar", "mais viva", "mais cor", "mais saturada", "mais colorida"]) {
      expect(SYSTEM_PROMPT.toLowerCase()).toContain(phrase);
    }
  });

  it("system prompt distingue nitidez/foco de realce de cor (não deve mapear para enhance_color)", () => {
    expect(SYSTEM_PROMPT).toMatch(/nítida.*nunca.*enhance_color|nunca.*enhance_color.*nítida/i);
  });

  it("system prompt documenta a ordem: removeBackground -> brightness/contrast -> enhance_color", () => {
    const idxRemove = SYSTEM_PROMPT.indexOf("removeBackground primeiro");
    const idxColor = SYSTEM_PROMPT.indexOf("enhance_color por último");
    expect(idxRemove).toBeGreaterThan(-1);
    expect(idxColor).toBeGreaterThan(idxRemove);
  });
});
