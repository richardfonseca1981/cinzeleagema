import type { ProductImage } from "../types";

export interface ExistingEntry {
  kind: "existing";
  image: ProductImage;
}

export interface NewEntry {
  kind: "new";
  localId: string;
  file: File;
  previewUrl: string;
}

export type ImageEntry = ExistingEntry | NewEntry;

export function entriesFromImages(images: ProductImage[]): ImageEntry[] {
  return [...images]
    .sort((a, b) => a.position - b.position)
    .map((image): ExistingEntry => ({ kind: "existing", image }));
}

export function addNewEntry(entries: ImageEntry[], localId: string, file: File, previewUrl: string): ImageEntry[] {
  return [...entries, { kind: "new", localId, file, previewUrl }];
}

export function removeEntryAt(entries: ImageEntry[], index: number): ImageEntry[] {
  return entries.filter((_, i) => i !== index);
}

export function moveEntry(entries: ImageEntry[], index: number, direction: -1 | 1): ImageEntry[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= entries.length) return entries;
  const reordered = [...entries];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  return reordered;
}

export function updateExistingImage(entries: ImageEntry[], updated: ProductImage): ImageEntry[] {
  return entries.map((entry): ImageEntry =>
    entry.kind === "existing" && entry.image.id === updated.id ? { kind: "existing", image: updated } : entry
  );
}

// Compara a lista local (existentes + staged) contra o estado persistido para
// decidir se há algo a processar no commit — evita chamadas de rede (ex.:
// reorder) quando o usuário não mexeu nas fotos.
export function hasPendingChanges(entries: ImageEntry[], originalImages: ProductImage[], deletedIds: Set<string>): boolean {
  if (deletedIds.size > 0) return true;
  if (entries.some((entry) => entry.kind === "new")) return true;

  const originalOrder = [...originalImages].sort((a, b) => a.position - b.position).map((image) => image.id);
  const currentOrder = entries.map((entry) => (entry.kind === "existing" ? entry.image.id : null));

  if (currentOrder.length !== originalOrder.length) return true;
  return currentOrder.some((id, index) => id !== originalOrder[index]);
}

export interface CommitDeps {
  upload: (file: File) => Promise<ProductImage>;
  deleteImage: (imageId: string) => Promise<void>;
  reorder: (order: string[]) => Promise<ProductImage[]>;
}

// Executa, em sequência, as mudanças de foto pendentes de um "Salvar produto":
// envia cada foto nova staged, aplica as exclusões marcadas e persiste a
// ordem final. Nada aqui é chamado antes do usuário clicar em Salvar.
export async function commitImageChanges(
  entries: ImageEntry[],
  deletedIds: Set<string>,
  deps: CommitDeps
): Promise<ProductImage[]> {
  const uploadedIdByLocalId = new Map<string, string>();

  for (const entry of entries) {
    if (entry.kind === "new") {
      const uploaded = await deps.upload(entry.file);
      uploadedIdByLocalId.set(entry.localId, uploaded.id);
    }
  }

  for (const imageId of deletedIds) {
    await deps.deleteImage(imageId);
  }

  const order = entries.map((entry) => (entry.kind === "existing" ? entry.image.id : uploadedIdByLocalId.get(entry.localId)!));

  if (order.length === 0) return [];
  return deps.reorder(order);
}
