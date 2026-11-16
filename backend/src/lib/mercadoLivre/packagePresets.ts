// Fase 1B etapa 4 — presets de caixa de embalagem para o anúncio do Mercado
// Livre. SUPOSIÇÃO FORTE, não verificada: nem as caixas que o cliente tem à
// mão, nem o formato real de `shipping.dimensions` da API (mesmo bloqueio
// 403 documentado em categoryFixture.ts) foram confirmados. Serve só de
// ponto de partida conservador até existir override manual por peça (última
// etapa do plano, ver CONTEXT.md "Mercado Livre — Fase 1B").
//
// Deliberadamente SEPARADO da caixa fixa única do checkout do site
// (lib/shipping/shipment.ts, 40x30x25cm/Melhor Envio) — são caixas e
// contextos de envio diferentes; esta etapa não mexe naquele fluxo.

export type PackagePresetSize = "P" | "M" | "G" | "GG";

export interface PackageBox {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface PackagePresetsConfig {
  // Peso extra de material de embalagem, somado UMA vez ao weightGrams da
  // peça — mesma simplificação conservadora de shipment.ts (peso fixo,
  // independente do tamanho do preset: o preset GG tem mais vazio pra
  // preencher, mas sem dado real sobre o material usado, um valor único é
  // mais simples de configurar/entender que uma tabela por preset).
  weightMarginG: number;
  // Acima de QUALQUER um destes dois (tamanho OU peso), a peça não cabe nem
  // no maior preset (GG) — ver estimatePackageBox: nunca "chuta" uma caixa
  // maior que GG, por maior que a peça seja.
  maxSizeCm: number;
  maxWeightG: number;
  boxes: Record<PackagePresetSize, PackageBox>;
}

export function getPackagePresetsConfig(source: {
  ML_PACKAGE_WEIGHT_MARGIN_G: number;
  ML_PACKAGE_MAX_SIZE_CM: number;
  ML_PACKAGE_MAX_WEIGHT_G: number;
  ML_PACKAGE_BOX_P_LENGTH_CM: number;
  ML_PACKAGE_BOX_P_WIDTH_CM: number;
  ML_PACKAGE_BOX_P_HEIGHT_CM: number;
  ML_PACKAGE_BOX_M_LENGTH_CM: number;
  ML_PACKAGE_BOX_M_WIDTH_CM: number;
  ML_PACKAGE_BOX_M_HEIGHT_CM: number;
  ML_PACKAGE_BOX_G_LENGTH_CM: number;
  ML_PACKAGE_BOX_G_WIDTH_CM: number;
  ML_PACKAGE_BOX_G_HEIGHT_CM: number;
  ML_PACKAGE_BOX_GG_LENGTH_CM: number;
  ML_PACKAGE_BOX_GG_WIDTH_CM: number;
  ML_PACKAGE_BOX_GG_HEIGHT_CM: number;
}): PackagePresetsConfig {
  return {
    weightMarginG: source.ML_PACKAGE_WEIGHT_MARGIN_G,
    maxSizeCm: source.ML_PACKAGE_MAX_SIZE_CM,
    maxWeightG: source.ML_PACKAGE_MAX_WEIGHT_G,
    boxes: {
      P: { lengthCm: source.ML_PACKAGE_BOX_P_LENGTH_CM, widthCm: source.ML_PACKAGE_BOX_P_WIDTH_CM, heightCm: source.ML_PACKAGE_BOX_P_HEIGHT_CM },
      M: { lengthCm: source.ML_PACKAGE_BOX_M_LENGTH_CM, widthCm: source.ML_PACKAGE_BOX_M_WIDTH_CM, heightCm: source.ML_PACKAGE_BOX_M_HEIGHT_CM },
      G: { lengthCm: source.ML_PACKAGE_BOX_G_LENGTH_CM, widthCm: source.ML_PACKAGE_BOX_G_WIDTH_CM, heightCm: source.ML_PACKAGE_BOX_G_HEIGHT_CM },
      GG: { lengthCm: source.ML_PACKAGE_BOX_GG_LENGTH_CM, widthCm: source.ML_PACKAGE_BOX_GG_WIDTH_CM, heightCm: source.ML_PACKAGE_BOX_GG_HEIGHT_CM },
    },
  };
}

// Faixas de tamanho/peso por preset (P/M/G) — FIXAS no código, não por env
// (diferente das dimensões da caixa e dos limites máximos acima): decidem
// qual caixa configurada usar, não qual material físico existe, então não
// faz sentido reconfigurar por ambiente. Pensadas para a faixa real do
// catálogo hoje (sizeCm ~1,6 a 62cm, weightGrams ~6g a ~19kg — ver
// scripts/auditMercadoLivre.ts):
//  - P (até 15cm / 1kg): pedras roladas, pontas pequenas, esferas de até ~5cm
//    de diâmetro — a maioria das peças "Pedras Polidas"/"Big" pequenas.
//  - M (até 30cm / 5kg): pontas e capelas médias, a maior parte do catálogo
//    "Big"/"Pedras Brutas".
//  - G (até 45cm / 12kg): capelas grandes, geodos médios.
//  - GG (até o limite configurável, padrão 60cm / 15kg): geodos/esferas
//    grandes e capelas pesadas — ainda a maioria das peças excepcionais do
//    catálogo, mas já no topo da faixa esperada.
// Acima do teto do GG (configurável via ML_PACKAGE_MAX_SIZE_CM/
// ML_PACKAGE_MAX_WEIGHT_G): peças excepcionais de verdade (ex.: um obelisco
// de 62cm, uma capela de 16,8kg) — deliberadamente DEIXADAS DE FORA de
// qualquer preset automático, pois uma caixa "chutada" nesse extremo tem
// risco real de dano/devolução. Bloqueadas até um override manual (última
// etapa do plano).
const SIZE_TIER_MAX_CM: Record<"P" | "M" | "G", number> = { P: 15, M: 30, G: 45 };
const WEIGHT_TIER_MAX_G: Record<"P" | "M" | "G", number> = { P: 1000, M: 5000, G: 12000 };

const PRESET_ORDER: PackagePresetSize[] = ["P", "M", "G", "GG"];

export type PackageBoxEstimateReason = "size_exceeds_limit" | "weight_exceeds_limit" | "both_exceed_limit";

export type PackageBoxEstimate =
  | { ok: true; preset: PackagePresetSize; box: PackageBox; packageWeightGrams: number }
  | { ok: false; reason: PackageBoxEstimateReason };

interface Classification {
  preset: PackagePresetSize;
  exceeds: boolean;
}

function classify(value: number, tierMax: Record<"P" | "M" | "G", number>, hardLimit: number): Classification {
  if (value <= tierMax.P) return { preset: "P", exceeds: false };
  if (value <= tierMax.M) return { preset: "M", exceeds: false };
  if (value <= tierMax.G) return { preset: "G", exceeds: false };
  if (value <= hardLimit) return { preset: "GG", exceeds: false };
  return { preset: "GG", exceeds: true };
}

// Função pura: peso + tamanho da peça -> preset de caixa (ou bloqueio). O
// preset final é o MAIOR exigido entre tamanho e peso avaliados
// separadamente (ex.: peça leve mas grande ainda precisa da caixa grande) —
// nunca a média nem só um dos dois. Bloqueia (ok: false) sempre que
// QUALQUER um dos dois ultrapassar o teto do maior preset (GG): nunca
// devolve uma caixa "chutada" para uma peça fora da faixa coberta.
export function estimatePackageBox(weightGrams: number, sizeCm: number, config: PackagePresetsConfig): PackageBoxEstimate {
  const bySize = classify(sizeCm, SIZE_TIER_MAX_CM, config.maxSizeCm);
  const byWeight = classify(weightGrams, WEIGHT_TIER_MAX_G, config.maxWeightG);

  if (bySize.exceeds && byWeight.exceeds) return { ok: false, reason: "both_exceed_limit" };
  if (bySize.exceeds) return { ok: false, reason: "size_exceeds_limit" };
  if (byWeight.exceeds) return { ok: false, reason: "weight_exceeds_limit" };

  const preset = PRESET_ORDER[Math.max(PRESET_ORDER.indexOf(bySize.preset), PRESET_ORDER.indexOf(byWeight.preset))];

  return {
    ok: true,
    preset,
    box: config.boxes[preset],
    packageWeightGrams: weightGrams + config.weightMarginG,
  };
}
