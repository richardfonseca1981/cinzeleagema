import type {
  ColorEnhanceLevel,
  PhotoTreatmentOperation,
  PhotoTreatmentPreviewResult,
  PhotoTreatmentRawPreviewResult,
  TreatmentPreviewRequest,
} from "../types";

// Lógica pura (sem React/fetch) que decide O QUE o painel de tratamento envia
// ao backend, para os dois caminhos:
//  - foto já salva: POST /api/products/:id/images/:imageId/treatment/preview,
//    corpo JSON { instruction } ou { operations };
//  - foto staged:   POST /api/images/treatment-preview-raw, multipart com o
//    arquivo + "instruction" OU "operations" (string JSON).
// Isolada aqui para ser testada sem renderizar o componente.

export type TreatmentShortcut = "enhance_color" | "sharpen" | "removeBackground" | "autoFit";

// Operations prontas dos atalhos do admin — nunca passam pela Claude.
export function shortcutRequest(
  shortcut: TreatmentShortcut,
  colorLevel: ColorEnhanceLevel = "medio"
): TreatmentPreviewRequest {
  switch (shortcut) {
    case "enhance_color":
      return { operations: [{ operation: "enhance_color", level: colorLevel }] };
    case "sharpen":
      return { operations: [{ operation: "sharpen", intensity: "médio" }] };
    case "removeBackground":
      return { operations: [{ operation: "removeBackground" }] };
    case "autoFit":
      return { operations: [{ operation: "autoFit" }] };
  }
}

export type PreviewCall =
  | { route: "saved"; json: TreatmentPreviewRequest }
  | { route: "raw"; fields: Array<[name: "instruction" | "operations", value: string]> };

// Campos de texto do multipart da rota raw. "operations" vai como string JSON
// (multer não tem JSON aninhado) e "instruction" como texto normal — nunca os dois.
export function rawFormFields(body: TreatmentPreviewRequest): Array<["instruction" | "operations", string]> {
  if ("operations" in body) return [["operations", JSON.stringify(body.operations)]];
  return [["instruction", body.instruction]];
}

export function planPreviewCall(targetKind: "existing" | "staged", body: TreatmentPreviewRequest): PreviewCall {
  if (targetKind === "existing") return { route: "saved", json: body };
  return { route: "raw", fields: rawFormFields(body) };
}

// Metadados de realce de cor a registrar ao confirmar um preview.
export function colorEnhanceMeta(operations: PhotoTreatmentOperation[]): {
  colorEnhanced: boolean;
  colorEnhanceLevel: ColorEnhanceLevel | null;
} {
  const op = operations.find((o) => o.operation === "enhance_color");
  return op ? { colorEnhanced: true, colorEnhanceLevel: op.level ?? null } : { colorEnhanced: false, colorEnhanceLevel: null };
}

// Nível forte exige clique duplo em "Confirmar".
export function requiresForteConfirmation(operations: PhotoTreatmentOperation[]): boolean {
  return operations.some((o) => o.operation === "enhance_color" && o.level === "forte");
}

// Como o painel deve reagir à resposta do preview (rota da foto salva ou rota
// stateless da staged — mesmo formato de decisão):
//  - unclear: o pedido em texto não foi entendido (mostra a sugestão);
//  - noChange: nada foi alterado (ex.: peça já enquadrada) — só um aviso, sem
//    preview nem botão Confirmar;
//  - ready: há preview para confirmar/descartar (notice opcional, ex.: "Peça
//    enquadrada: ocupava 6% ... agora ocupa 40%").
export type PreviewOutcome =
  | { kind: "unclear"; message: string }
  | { kind: "noChange"; message: string }
  | { kind: "ready"; notice: string | null };

export const DEFAULT_UNCLEAR_MESSAGE = "Tente descrever o tratamento de outra forma.";

export function classifyPreviewResult(result: PhotoTreatmentPreviewResult | PhotoTreatmentRawPreviewResult): PreviewOutcome {
  if (result.unclear) return { kind: "unclear", message: result.suggestion ?? DEFAULT_UNCLEAR_MESSAGE };
  if (result.noChange) return { kind: "noChange", message: result.notice };
  return { kind: "ready", notice: result.notice ?? null };
}
