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

// Exportado só para um teste de regressão (claude.test.ts) checar que as
// frases-gatilho/regra de ordem do enhance_color continuam no prompt.
export const SYSTEM_PROMPT = `Você interpreta pedidos em português sobre tratamento de fotos de produtos (peças de joalheria/pedras preciosas) e traduz o pedido em uma lista ordenada de operações de uma lista FECHADA. Nunca invente uma operação fora da lista.

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
- enhance_color: level ("leve", "medio" ou "forte") — realça a saturação/vivacidade das cores da pedra, sem mexer em nitidez de foco

Regras:
- Se o pedido combinar mais de uma ideia (ex: "remove o fundo e deixa mais nítida"), retorne várias operações em "operations", na ordem que fizer mais sentido aplicar.
- Pedidos genéricos sobre "melhorar a foto" (sem especificar o quê), ou que peçam para "realçar", deixar "mais viva", "mais cor", "mais saturada" ou "mais colorida" mapeiam para enhance_color nível "medio". Se o pedido reforçar que é algo sutil/leve, use nível "leve"; se pedir algo bem forte/bem colorido, use nível "forte". Pedidos sobre "nítida"/"foco"/"desfocada" continuam mapeando só para sharpen — nunca para enhance_color, mesmo que o termo pareça parecido.
- Quando o pedido combinar remoção de fundo, ajuste de brilho/contraste e realce de cor, retorne nessa ordem: removeBackground primeiro, depois brightness/contrast, depois enhance_color por último (enhance_color processa melhor depois do fundo já removido, porque ignora os pixels já transparentes).
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
        "enhance_color",
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
    level: { type: "string", enum: ["leve", "medio", "forte"] },
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
  level?: string;
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

// Tradução automática de nome/descrição de produto (PT -> EN) para o site
// público bilíngue. Mesmo modelo do tratamento de foto; chamada disparada
// pela rota de produtos (fire-and-forget após salvar) e pela rota manual de
// retradução.
const TRANSLATE_TOOL_NAME = "translate_product";

const TRANSLATE_SYSTEM_PROMPT = `Você traduz nome e descrição de peças de joalheria/pedras preciosas do português para o inglês, para o catálogo bilíngue de uma loja online chamada "Cinzel e a Gema". A tradução deve ser natural e fluente, nunca literal palavra por palavra, mantendo o tom institucional e confiável da marca. Nomes de espécies minerais e termos gemológicos devem usar o termo em inglês reconhecido no mercado de gemas quando existir (ex: "Topázio Imperial" -> "Imperial Topaz", "lapidação" -> "cut"/"faceting"). Nunca responda com texto livre — sempre use a ferramenta translate_product.`;

const TRANSLATE_TOOL: Anthropic.Tool = {
  name: TRANSLATE_TOOL_NAME,
  description: "Registra a tradução do nome e (quando houver) da descrição de um produto, do português para o inglês.",
  input_schema: {
    type: "object",
    properties: {
      nameEn: { type: "string", description: "Nome do produto traduzido para o inglês" },
      descriptionEn: {
        type: "string",
        description: "Descrição do produto traduzida para o inglês — omitir se não houver descrição em português",
      },
    },
    required: ["nameEn"],
  },
};

export interface ProductTranslation {
  nameEn: string;
  descriptionEn: string | null;
}

// A IA às vezes devolve um marcador de erro/placeholder (ex: "<UNKNOWN>",
// "N/A") em vez de recusar via `unclear` ou lançar — normalmente quando o
// texto de origem é curto/ambíguo demais para traduzir com confiança. Sem
// essa validação, esses marcadores eram salvos como se fossem tradução real
// e apareciam literalmente no site público. Aceita variações com/sem
// colchetes/ângulos e maiúsculas/minúsculas.
const INVALID_TRANSLATION_PATTERN = /^[<[{]?\s*(unknown|n\/?a|null|undefined|none|unavailable|error)\s*[>\]}]?$/i;

export function isValidTranslation(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !INVALID_TRANSLATION_PATTERN.test(trimmed);
}

// Retorna null (em vez de lançar) sempre que a tradução não puder ser obtida
// — chave ausente, erro de rede, resposta inesperada — para que quem chamar
// nunca deixe isso bloquear o cadastro/edição do produto.
export async function translateProductText(name: string, description: string | null): Promise<ProductTranslation | null> {
  if (!isAnthropicConfigured()) return null;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: TRANSLATE_SYSTEM_PROMPT,
      tools: [TRANSLATE_TOOL],
      tool_choice: { type: "tool", name: TRANSLATE_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Nome: ${name}\nDescrição: ${description && description.trim() ? description : "(sem descrição)"}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TRANSLATE_TOOL_NAME
    );
    if (!toolUse) return null;

    const input = toolUse.input as { nameEn?: string; descriptionEn?: string };
    if (!isValidTranslation(input.nameEn)) return null;

    const hasOriginalDescription = Boolean(description && description.trim());
    const descriptionEn = hasOriginalDescription && isValidTranslation(input.descriptionEn) ? input.descriptionEn : null;

    return { nameEn: input.nameEn, descriptionEn };
  } catch {
    return null;
  }
}
