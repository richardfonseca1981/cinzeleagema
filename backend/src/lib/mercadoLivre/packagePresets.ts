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

// Fase 1B etapa 10 — `source` distingue se a caixa veio do override manual
// da peça ou de um preset automático. `preset` só existe (não-null) quando
// `source === "preset"` — override manual não tem conceito de preset.
export type PackageBoxSource = "manual" | "preset";

export type PackageBoxEstimate =
  | { ok: true; source: PackageBoxSource; preset: PackagePresetSize | null; box: PackageBox; packageWeightGrams: number }
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

// Fase 1B etapa 10 — os 4 campos do override manual (ver schema.prisma
// Product.mlPackageOverride*), ainda não convertidos/validados. `unknown`
// porque chegam como Decimal do Prisma, já convertido, ou ausente.
export interface ManualPackageOverrideInput {
  lengthCm: unknown;
  widthCm: unknown;
  heightCm: unknown;
  weightG: unknown;
}

export interface PackageOverrideCeilings {
  maxDimensionCm: number;
  maxWeightG: number;
}

export function getPackageOverrideCeilings(source: {
  ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM: number;
  ML_PACKAGE_OVERRIDE_MAX_WEIGHT_G: number;
}): PackageOverrideCeilings {
  return { maxDimensionCm: source.ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM, maxWeightG: source.ML_PACKAGE_OVERRIDE_MAX_WEIGHT_G };
}

// Função pura: decide se o override manual é válido e COMPLETO — "tudo ou
// nada" (ver ponto 2 do pedido). Preenchimento PARCIAL (1-3 dos 4 campos) é
// tratado como AUSENTE aqui, nunca um erro: o schema Zod
// (schemas/product.schema.ts) já deveria ter bloqueado isso na gravação,
// então chegar aqui parcial só pode ser um dado antigo/gravado por fora da
// API — defensivo, nunca lança. Mesma lógica pros valores fora do teto
// configurável ou não positivos: tratados como ausentes (cai pro preset
// automático), nunca bloqueiam a estimativa inteira.
export function resolveManualPackageOverride(
  input: ManualPackageOverrideInput,
  ceilings: PackageOverrideCeilings
): { box: PackageBox; packageWeightGrams: number } | null {
  const raw = [input.lengthCm, input.widthCm, input.heightCm, input.weightG];
  const presentCount = raw.filter((value) => value !== null && value !== undefined).length;
  if (presentCount !== 4) return null;

  const lengthCm = Number(input.lengthCm);
  const widthCm = Number(input.widthCm);
  const heightCm = Number(input.heightCm);
  const weightG = Number(input.weightG);
  const values = [lengthCm, widthCm, heightCm, weightG];

  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  if (lengthCm > ceilings.maxDimensionCm || widthCm > ceilings.maxDimensionCm || heightCm > ceilings.maxDimensionCm) return null;
  if (weightG > ceilings.maxWeightG) return null;

  return { box: { lengthCm, widthCm, heightCm }, packageWeightGrams: weightG };
}

// Função pura: peso + tamanho da peça -> preset de caixa (ou bloqueio) — OU
// a caixa do override manual, quando completo e válido (ver
// resolveManualPackageOverride), que tem PRECEDÊNCIA sobre o preset
// automático e nunca é bloqueado pelos tetos de preset (ML_PACKAGE_MAX_*):
// é exatamente pra isso que o override existe. `override`/`overrideCeilings`
// são OPCIONAIS — omitidos (como todo chamador existente antes desta etapa
// já fazia), o comportamento é IDÊNTICO ao de antes.
//
// Sem override (ou override incompleto/inválido): preset final é o MAIOR
// exigido entre tamanho e peso avaliados separadamente (ex.: peça leve mas
// grande ainda precisa da caixa grande) — nunca a média nem só um dos dois.
// Bloqueia (ok: false) sempre que QUALQUER um dos dois ultrapassar o teto do
// maior preset (GG): nunca devolve uma caixa "chutada" para uma peça fora
// da faixa coberta.
export function estimatePackageBox(
  weightGrams: number,
  sizeCm: number,
  config: PackagePresetsConfig,
  override?: ManualPackageOverrideInput,
  overrideCeilings?: PackageOverrideCeilings
): PackageBoxEstimate {
  if (override && overrideCeilings) {
    const manual = resolveManualPackageOverride(override, overrideCeilings);
    if (manual) {
      return { ok: true, source: "manual", preset: null, box: manual.box, packageWeightGrams: manual.packageWeightGrams };
    }
  }

  const bySize = classify(sizeCm, SIZE_TIER_MAX_CM, config.maxSizeCm);
  const byWeight = classify(weightGrams, WEIGHT_TIER_MAX_G, config.maxWeightG);

  if (bySize.exceeds && byWeight.exceeds) return { ok: false, reason: "both_exceed_limit" };
  if (bySize.exceeds) return { ok: false, reason: "size_exceeds_limit" };
  if (byWeight.exceeds) return { ok: false, reason: "weight_exceeds_limit" };

  const preset = PRESET_ORDER[Math.max(PRESET_ORDER.indexOf(bySize.preset), PRESET_ORDER.indexOf(byWeight.preset))];

  return {
    ok: true,
    source: "preset",
    preset,
    box: config.boxes[preset],
    packageWeightGrams: weightGrams + config.weightMarginG,
  };
}
