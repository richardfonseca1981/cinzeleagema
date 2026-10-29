import sharp from "sharp";
import { prisma } from "./prisma";
import { HttpError } from "../middleware/errorHandler";
import { getObject, isR2Configured } from "./r2";
import { generateProductIdentification, isAnthropicConfigured, type IdentificationImageMediaType } from "./claude";
import { identificationProposalSchema, identificationSaveSchema } from "../schemas/product.schema";
import { z } from "zod";

// Até 4 fotos, as primeiras por posição — suficiente para a IA avaliar a
// peça sem custo/latência de enviar a galeria inteira.
const MAX_IDENTIFICATION_PHOTOS = 4;

const MEDIA_TYPE_BY_FORMAT: Record<string, IdentificationImageMediaType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export type IdentificationProposal = z.infer<typeof identificationProposalSchema>;
export type IdentificationSaveInput = z.infer<typeof identificationSaveSchema>;

export interface SavedIdentification {
  identificationPt: string | null;
  identificationEn: string | null;
  confidence: string | null;
  treatment: string | null;
  note: string | null;
}

async function loadProductForIdentification(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: { orderBy: { position: "asc" }, take: MAX_IDENTIFICATION_PHOTOS },
      category: true,
      subcategory: true,
    },
  });
  if (!product) throw new HttpError(404, "Produto não encontrado");
  return product;
}

// Passo 1 (POST /identification/generate): carrega as fotos da peça, chama a
// Claude API com visão e devolve a proposta validada — NÃO grava nada.
export async function proposeIdentification(productId: string): Promise<IdentificationProposal> {
  const product = await loadProductForIdentification(productId);

  if (product.images.length === 0) {
    throw new HttpError(400, "Esta peça não tem fotos. Adicione ao menos uma foto antes de gerar a identificação.");
  }
  if (!isAnthropicConfigured()) {
    throw new HttpError(503, "Identificação por IA não configurada (ANTHROPIC_API_KEY ausente)");
  }
  if (!isR2Configured()) {
    throw new HttpError(503, "Leitura de fotos não configurada (variáveis R2 ausentes)");
  }

  const images = await Promise.all(
    product.images.map(async (image) => {
      const buffer = await getObject(image.key);
      const { format } = await sharp(buffer).metadata();
      const mediaType = (format && MEDIA_TYPE_BY_FORMAT[format]) || "image/jpeg";
      return { data: buffer, mediaType };
    })
  );

  const raw = await generateProductIdentification(images, {
    name: product.name,
    description: product.description,
    category: product.category?.name ?? null,
    subcategory: product.subcategory?.name ?? null,
  });

  const parsed = identificationProposalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(503, "A IA retornou uma resposta inesperada. Tente novamente.");
  }
  return parsed.data;
}

// Passo 2 (PUT /identification): grava os campos revisados pelo admin —
// aceita limpar qualquer campo (ver identificationSaveSchema).
export async function saveIdentification(productId: string, data: IdentificationSaveInput): Promise<SavedIdentification> {
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) throw new HttpError(404, "Produto não encontrado");

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      identificationPt: data.identificationPt,
      identificationEn: data.identificationEn,
      identificationConfidence: data.confidence,
      identificationTreatment: data.treatment,
      identificationNote: data.note,
    },
  });

  return toSavedIdentification(product);
}

export async function getSavedIdentification(productId: string): Promise<SavedIdentification> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new HttpError(404, "Produto não encontrado");
  return toSavedIdentification(product);
}

function toSavedIdentification(product: {
  identificationPt: string | null;
  identificationEn: string | null;
  identificationConfidence: string | null;
  identificationTreatment: string | null;
  identificationNote: string | null;
}): SavedIdentification {
  return {
    identificationPt: product.identificationPt,
    identificationEn: product.identificationEn,
    confidence: product.identificationConfidence,
    treatment: product.identificationTreatment,
    note: product.identificationNote,
  };
}
