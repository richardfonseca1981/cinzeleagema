import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNCLEAR_MESSAGE,
  classifyPreviewResult,
  colorEnhanceMeta,
  planPreviewCall,
  rawFormFields,
  requiresForteConfirmation,
  shortcutRequest,
} from "./treatmentRequest";

describe("shortcutRequest", () => {
  it("Realçar cores envia operations enhance_color com o nível escolhido (nunca instruction)", () => {
    expect(shortcutRequest("enhance_color", "medio")).toEqual({ operations: [{ operation: "enhance_color", level: "medio" }] });
    expect(shortcutRequest("enhance_color", "forte")).toEqual({ operations: [{ operation: "enhance_color", level: "forte" }] });
  });

  it("usa 'medio' quando nenhum nível é informado", () => {
    expect(shortcutRequest("enhance_color")).toEqual({ operations: [{ operation: "enhance_color", level: "medio" }] });
  });

  it("Mais nitidez e Remover fundo também enviam operations prontas", () => {
    expect(shortcutRequest("sharpen")).toEqual({ operations: [{ operation: "sharpen", intensity: "médio" }] });
    expect(shortcutRequest("removeBackground")).toEqual({ operations: [{ operation: "removeBackground" }] });
  });
});

describe("planPreviewCall — o que é enviado em cada caminho", () => {
  const realce = shortcutRequest("enhance_color", "medio");

  it("foto já salva: JSON com operations, na rota com estado", () => {
    expect(planPreviewCall("existing", realce)).toEqual({ route: "saved", json: realce });
  });

  it("foto staged: multipart com UM campo 'operations' (string JSON) e nenhum 'instruction'", () => {
    const call = planPreviewCall("staged", realce);
    expect(call).toEqual({
      route: "raw",
      fields: [["operations", JSON.stringify([{ operation: "enhance_color", level: "medio" }])]],
    });
    if (call.route === "raw") expect(call.fields.map(([name]) => name)).not.toContain("instruction");
  });

  it("texto livre: foto salva manda { instruction } e a staged manda o campo 'instruction'", () => {
    const livre = { instruction: "realça as cores" };
    expect(planPreviewCall("existing", livre)).toEqual({ route: "saved", json: livre });
    expect(planPreviewCall("staged", livre)).toEqual({ route: "raw", fields: [["instruction", "realça as cores"]] });
  });

  it("o campo 'operations' do multipart faz round-trip para o mesmo array", () => {
    const [[name, value]] = rawFormFields(realce);
    expect(name).toBe("operations");
    expect(JSON.parse(value)).toEqual([{ operation: "enhance_color", level: "medio" }]);
  });
});

describe("colorEnhanceMeta / requiresForteConfirmation", () => {
  it("registra colorEnhanced e o nível quando há enhance_color", () => {
    expect(colorEnhanceMeta([{ operation: "enhance_color", level: "leve" }])).toEqual({
      colorEnhanced: true,
      colorEnhanceLevel: "leve",
    });
  });

  it("não marca realce quando só há outras operações", () => {
    expect(colorEnhanceMeta([{ operation: "sharpen", intensity: "leve" }])).toEqual({
      colorEnhanced: false,
      colorEnhanceLevel: null,
    });
  });

  it("só o nível forte exige clique duplo", () => {
    expect(requiresForteConfirmation([{ operation: "enhance_color", level: "forte" }])).toBe(true);
    expect(requiresForteConfirmation([{ operation: "enhance_color", level: "medio" }])).toBe(false);
    expect(requiresForteConfirmation([{ operation: "enhance_color", level: "leve" }])).toBe(false);
    expect(requiresForteConfirmation([{ operation: "removeBackground" }])).toBe(false);
  });
});

describe("Enquadrar peça (autoFit)", () => {
  it("o atalho envia operations [autoFit] sem parâmetros (nunca instruction, nunca passa pela IA)", () => {
    expect(shortcutRequest("autoFit")).toEqual({ operations: [{ operation: "autoFit" }] });
  });

  it("o nível de realce escolhido não interfere no enquadramento", () => {
    expect(shortcutRequest("autoFit", "forte")).toEqual({ operations: [{ operation: "autoFit" }] });
  });

  it("foto já salva: JSON com operations na rota com estado", () => {
    expect(planPreviewCall("existing", shortcutRequest("autoFit"))).toEqual({
      route: "saved",
      json: { operations: [{ operation: "autoFit" }] },
    });
  });

  it("foto staged: multipart com UM campo 'operations' (string JSON) e nenhum 'instruction'", () => {
    const call = planPreviewCall("staged", shortcutRequest("autoFit"));
    expect(call).toEqual({ route: "raw", fields: [["operations", '[{"operation":"autoFit"}]']] });
  });

  it("não marca realce de cor nem exige clique duplo", () => {
    const ops = [{ operation: "autoFit" as const }];
    expect(colorEnhanceMeta(ops)).toEqual({ colorEnhanced: false, colorEnhanceLevel: null });
    expect(requiresForteConfirmation(ops)).toBe(false);
  });
});

describe("classifyPreviewResult", () => {
  const ops = [{ operation: "autoFit" as const }];

  it("noChange (peça já enquadrada): só o aviso em português, sem preview", () => {
    expect(
      classifyPreviewResult({ unclear: false, noChange: true, operations: ops, notice: "A peça já ocupa bem o quadro — não há o que enquadrar." })
    ).toEqual({ kind: "noChange", message: "A peça já ocupa bem o quadro — não há o que enquadrar." });
  });

  it("preview normal da foto salva, com o aviso do que foi feito", () => {
    expect(
      classifyPreviewResult({ unclear: false, operations: ops, previewUrl: "u", previewKey: "k", notice: "Peça enquadrada: ocupava 6% do quadro e agora ocupa 40%." })
    ).toEqual({ kind: "ready", notice: "Peça enquadrada: ocupava 6% do quadro e agora ocupa 40%." });
  });

  it("preview normal da foto staged sem aviso", () => {
    expect(classifyPreviewResult({ unclear: false, operations: ops, previewDataUrl: "data:image/png;base64,AA" })).toEqual({
      kind: "ready",
      notice: null,
    });
  });

  it("pedido pouco claro usa a sugestão (ou uma mensagem padrão)", () => {
    expect(classifyPreviewResult({ unclear: true, suggestion: "tente 'enquadra a peça'" })).toEqual({
      kind: "unclear",
      message: "tente 'enquadra a peça'",
    });
    expect(classifyPreviewResult({ unclear: true })).toEqual({ kind: "unclear", message: DEFAULT_UNCLEAR_MESSAGE });
  });
});
