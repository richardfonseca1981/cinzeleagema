import { HttpError } from "../middleware/errorHandler";
import { interpretPhotoInstruction, isAnthropicConfigured } from "./claude";
import { operationsSchema, type Operation } from "./imageOperations";

export type TreatmentRequest = { instruction: string } | { operations: unknown };

export type ResolvedTreatment = { unclear: true; suggestion?: string } | { unclear: false; operations: Operation[] };

// Usado pelas duas rotas de preview (com estado e stateless/raw): quando o
// pedido já vem com "operations" prontas (atalhos do admin — "Realçar
// cores", "Mais nitidez", "Remover fundo"), pula a Claude API inteiramente e
// só valida de novo contra a lista fechada. Quando vem "instruction" (texto
// livre), segue o fluxo de sempre via Claude.
export async function resolveTreatmentOperations(request: TreatmentRequest): Promise<ResolvedTreatment> {
  if ("operations" in request) {
    return { unclear: false, operations: operationsSchema.parse(request.operations) };
  }

  if (!isAnthropicConfigured()) {
    throw new HttpError(503, "Tratamento de foto por IA não configurado (ANTHROPIC_API_KEY ausente)");
  }

  const interpretation = await interpretPhotoInstruction(request.instruction);
  if (interpretation.unclear) {
    return { unclear: true, suggestion: interpretation.suggestion };
  }

  // Nunca confia no que a IA retornou sem validar de novo contra a lista
  // fechada de operações e seus ranges.
  return { unclear: false, operations: operationsSchema.parse(interpretation.operations) };
}
