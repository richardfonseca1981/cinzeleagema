import { describe, expect, it } from "vitest";
import {
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
