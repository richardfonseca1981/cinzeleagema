import { prisma } from "./prisma";
import { deleteObject, isR2Configured } from "./r2";

interface PhotoRef {
  id: string;
  key: string;
  previousKey: string | null;
}

// Única lógica de remoção de arquivos de fotos do R2 (usada SÓ pelas exclusões
// manuais do admin: uma foto, ou uma peça inteira).
//
// 1) filesSafeToRemove: dos arquivos das fotos que serão apagadas (imagem
//    exibida e "antes" do tratamento), devolve só os que NENHUMA outra foto
//    (deste ou de outro produto) usa como imagem atual ou como "antes".
//    Chamar ANTES de apagar os registros.
// 2) removeFiles: apaga do R2 depois que os registros já sumiram. Falha no R2
//    nunca propaga: sobra um arquivo órfão inofensivo; devolve quantos
//    arquivos não puderam ser removidos para o admin mostrar um aviso.
export async function filesSafeToRemove(photos: PhotoRef[]): Promise<string[]> {
  const candidates = [...new Set(photos.flatMap((p) => [p.key, p.previousKey]).filter((k): k is string => Boolean(k)))];
  if (candidates.length === 0) return [];
  const removedIds = photos.map((p) => p.id);
  const usedElsewhere = await prisma.productImage.findMany({
    where: { id: { notIn: removedIds }, OR: [{ key: { in: candidates } }, { previousKey: { in: candidates } }] },
    select: { key: true, previousKey: true },
  });
  const inUse = new Set(usedElsewhere.flatMap((i) => [i.key, i.previousKey]));
  return candidates.filter((k) => !inUse.has(k));
}

export async function removeFiles(keys: string[]): Promise<number> {
  if (!isR2Configured()) return 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await deleteObject(key);
    } catch (err) {
      failed++;
      console.error(`Não foi possível remover do R2 o arquivo ${key}:`, err);
    }
  }
  return failed;
}
