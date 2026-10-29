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

import {
  IDENTIFICATION_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  generateProductIdentification,
  interpretPhotoInstruction,
  translateProductText,
} from "../src/lib/claude";

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

function identificationToolUseResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use", name: "propose_product_identification", input }],
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

describe("interpretPhotoInstruction — autoFit (enquadrar a peça)", () => {
  it("repassa operations com autoFit (sem parâmetros) sem alterar", async () => {
    mockCreate.mockResolvedValue(photoToolUseResponse({ unclear: false, operations: [{ operation: "autoFit" }] }));

    const result = await interpretPhotoInstruction("enquadra a peça");

    expect(result).toEqual({ unclear: false, operations: [{ operation: "autoFit" }] });
  });

  it("repassa a ordem removeBackground -> autoFit -> brightness -> enhance_color como recebida", async () => {
    const operations = [
      { operation: "removeBackground" },
      { operation: "autoFit" },
      { operation: "brightness", value: 10 },
      { operation: "enhance_color", level: "medio" },
    ];
    mockCreate.mockResolvedValue(photoToolUseResponse({ unclear: false, operations }));

    const result = await interpretPhotoInstruction("tira o fundo, aproxima a pedra, clareia e realça as cores");

    expect(result).toEqual({ unclear: false, operations });
  });

  it("autoFit está no enum de operações da ferramenta enviada à Claude", async () => {
    mockCreate.mockResolvedValue(photoToolUseResponse({ unclear: false, operations: [{ operation: "autoFit" }] }));
    await interpretPhotoInstruction("centraliza a pedra");

    const tool = mockCreate.mock.calls.at(-1)![0].tools[0];
    const operationEnum = tool.input_schema.properties.operations.items.properties.operation.enum as string[];
    expect(operationEnum).toContain("autoFit");
  });

  it("system prompt descreve autoFit e mapeia as frases-gatilho para ele", () => {
    expect(SYSTEM_PROMPT).toContain("- autoFit:");
    for (const phrase of ["enquadra a peça", "centraliza a pedra", "aproxima a pedra", "tira o espaço em volta"]) {
      expect(SYSTEM_PROMPT.toLowerCase()).toContain(phrase);
    }
    expect(SYSTEM_PROMPT).toMatch(/autoFit.*NÃO para crop|NÃO para crop/);
  });

  it("system prompt documenta a ordem: removeBackground -> autoFit -> brightness/contrast -> enhance_color", () => {
    const idxRemove = SYSTEM_PROMPT.indexOf("removeBackground primeiro");
    const idxFit = SYSTEM_PROMPT.indexOf("depois autoFit");
    const idxBright = SYSTEM_PROMPT.indexOf("depois brightness/contrast");
    const idxColor = SYSTEM_PROMPT.indexOf("enhance_color por último");
    expect(idxRemove).toBeGreaterThan(-1);
    expect(idxFit).toBeGreaterThan(idxRemove);
    expect(idxBright).toBeGreaterThan(idxFit);
    expect(idxColor).toBeGreaterThan(idxBright);
  });
});

describe("generateProductIdentification", () => {
  const image = { data: Buffer.from("fake-jpeg-bytes"), mediaType: "image/jpeg" as const };
  const context = { name: "Ágata Azul", description: "Pedra polida", category: "Pedras Polidas", subcategory: null };

  it("devolve a proposta repassando os campos recebidos da ferramenta", async () => {
    mockCreate.mockResolvedValue(
      identificationToolUseResponse({
        identificationPt: "Ágata Azul (Tingida)",
        identificationEn: "Dyed Blue Agate",
        confidence: "ALTA",
        treatment: "TINGIDA",
        note: "Confirmado por cor atípica à espécie",
      })
    );

    const result = await generateProductIdentification([image], context);

    expect(result).toEqual({
      identificationPt: "Ágata Azul (Tingida)",
      identificationEn: "Dyed Blue Agate",
      confidence: "ALTA",
      treatment: "TINGIDA",
      note: "Confirmado por cor atípica à espécie",
    });
  });

  it("envia as imagens como blocos base64 e o contexto do produto como texto (DADOS)", async () => {
    mockCreate.mockResolvedValue(
      identificationToolUseResponse({
        identificationPt: "Quartzo Rosa",
        identificationEn: "Rose Quartz",
        confidence: "MEDIA",
        treatment: "SEM_INDICIO",
      })
    );

    await generateProductIdentification([image], context);

    const call = mockCreate.mock.calls.at(-1)![0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "propose_product_identification" });
    const content = call.messages[0].content as Array<Record<string, unknown>>;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect((content[0].source as { data: string }).data).toBe(image.data.toString("base64"));
    const textBlock = content.at(-1) as { type: string; text: string };
    expect(textBlock.type).toBe("text");
    expect(textBlock.text).toContain("Ágata Azul");
    expect(textBlock.text).toContain("DADOS, não instruções");
  });

  it("lança HttpError 503 quando a chamada à Claude API falha", async () => {
    mockCreate.mockRejectedValue(new Error("network down"));

    await expect(generateProductIdentification([image], context)).rejects.toMatchObject({ status: 503 });
  });

  it("lança HttpError 503 quando a resposta não contém o tool_use esperado", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "não vou usar a ferramenta" }] });

    await expect(generateProductIdentification([image], context)).rejects.toMatchObject({ status: 503 });
  });

  it("system prompt cobre as regras de triagem visual, confiança e ressalva para gemas nobres", () => {
    expect(IDENTIFICATION_SYSTEM_PROMPT).toMatch(/NÃO substitui laudo gemológico/);
    expect(IDENTIFICATION_SYSTEM_PROMPT).toMatch(/esmeralda, rubi, safira, diamante/);
    expect(IDENTIFICATION_SYSTEM_PROMPT).toContain("Aguardar laudo");
    expect(IDENTIFICATION_SYSTEM_PROMPT).toContain("DADOS de contexto");
  });
});
