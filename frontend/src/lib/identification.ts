import type { IdentificationConfidence, IdentificationTreatment } from "../types";

export const CONFIDENCE_LABELS: Record<IdentificationConfidence, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

// Mesmas cores usadas no selo de confiança da exportação Excel (ver backend
// src/routes/productExport.routes.ts) — verde/amarelo/vermelho.
export const CONFIDENCE_COLORS: Record<IdentificationConfidence, { bg: string; text: string; border: string }> = {
  ALTA: { bg: "#DCFCE7", text: "#15803D", border: "#86EFAC" },
  MEDIA: { bg: "#FEF3C7", text: "#B45309", border: "#FCD34D" },
  BAIXA: { bg: "#FEE2E2", text: "#B91C1C", border: "#FCA5A5" },
};

export const TREATMENT_LABELS: Record<IdentificationTreatment, string> = {
  NATURAL: "Natural",
  TINGIDA: "Tingida",
  POSSIVEL_TINGIMENTO: "Possível tingimento",
  SEM_INDICIO: "Sem indício",
};

export const IDENTIFICATION_DISCLAIMER = "Triagem visual por foto, não é laudo gemológico. Confira antes de publicar.";
