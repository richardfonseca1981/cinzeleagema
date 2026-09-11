import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../middleware/errorHandler";
import { env } from "./env";

const MODEL = "claude-haiku-4-5";

export function isAnthropicConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

// Mesma lista fechada de 9 operações validada de novo em imageOperations.ts —
// a IA nunca executa nada diretamente, só decide qual(is) operação(ões) desta
// lista aplicar (ou marca o pedido como pouco claro).
const TOOL_NAME = "apply_photo_treatment";

const SYSTEM_PROMPT = `Você interpreta pedidos em português sobre tratamento de fotos de produtos (peças de joalheria/pedras preciosas) e traduz o pedido em uma lista ordenada de operações de uma lista FECHADA. Nunca invente uma operação fora da lista.

Operações permitidas:
- resize: width e/ou height (pixels)
- crop: aspectRatio ("1:1", "4:3" ou "16:9") OU width e height (pixels)
- brightness: value (-100 a 100)
- contrast: value (-100 a 100)
- sharpen: intensity ("leve", "médio" ou "forte")
- rotate: degrees (90, 180 ou 270)
- compress: quality (1 a 100)
- convertFormat: format ("webp", "jpeg" ou "png")
- removeBackground: sem parâmetros, apenas remove o fundo da imagem

Regras:
- Se o pedido combinar mais de uma ideia (ex: "remove o fundo e deixa mais nítida"), retorne várias operações em "operations", na ordem que fizer mais sentido aplicar.
- Se o pedido não mapear claramente para uma ou mais operações desta lista, retorne unclear=true e uma sugestão curta de como o admin poderia reformular o pedido usando termos que mapeiam para a lista (não retorne "operations" nesse caso).
- Nunca responda com texto livre — sempre use a ferramenta apply_photo_treatment.`;

const OPERATION_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    operation: {
      type: "string",
      enum: [
        "resize",
        "crop",
        "brightness",
        "contrast",
        "sharpen",
        "rotate",
        "compress",
        "convertFormat",
        "removeBackground",
      ],
    },
    width: { type: "integer" },
    height: { type: "integer" },
    aspectRatio: { type: "string", enum: ["1:1", "4:3", "16:9"] },
    value: { type: "integer" },
    intensity: { type: "string", enum: ["leve", "médio", "forte"] },
    degrees: { type: "integer", enum: [90, 180, 270] },
    quality: { type: "integer" },
    format: { type: "string", enum: ["webp", "jpeg", "png"] },
  },
  required: ["operation"],
};

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Registra a interpretação estruturada de um pedido de tratamento de foto: ou uma lista ordenada de operações da lista fechada, ou unclear=true com uma sugestão de reformulação.",
  input_schema: {
    type: "object",
    properties: {
      unclear: {
        type: "boolean",
        description: "true se o pedido não mapear claramente para as operações permitidas",
      },
      suggestion: {
        type: "string",
        description: "Sugestão de reformulação — presente apenas quando unclear=true",
      },
      operations: {
        type: "array",
        description: "Lista ordenada de operações a aplicar — presente apenas quando unclear=false",
        items: OPERATION_INPUT_SCHEMA,
      },
    },
    required: ["unclear"],
  },
};

// Formato bruto retornado pela IA — validado de novo com zod em
// imageOperations.ts antes de qualquer execução.
export interface RawOperation {
  operation: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  value?: number;
  intensity?: string;
  degrees?: number;
  quality?: number;
  format?: string;
}

export type ClaudeInterpretation =
  | { unclear: true; suggestion?: string }
  | { unclear: false; operations: RawOperation[] };

export async function interpretPhotoInstruction(instruction: string): Promise<ClaudeInterpretation> {
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: instruction }],
    });
  } catch {
    throw new HttpError(502, "Serviço de IA indisponível, tente novamente");
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME
  );

  if (!toolUse) {
    throw new HttpError(502, "Serviço de IA indisponível, tente novamente");
  }

  const input = toolUse.input as { unclear: boolean; suggestion?: string; operations?: RawOperation[] };

  if (input.unclear) {
    return { unclear: true, suggestion: input.suggestion };
  }

  return { unclear: false, operations: input.operations ?? [] };
}
