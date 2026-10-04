import { describe, expect, it, vi } from "vitest";
import {
  addNewEntry,
  commitImageChanges,
  entriesFromImages,
  hasPendingChanges,
  moveEntry,
  removeEntryAt,
  withNewEntryTreatment,
  withNewEntryUndo,
  type CommitDeps,
  type NewEntry,
} from "./imageStaging";
import type { ProductImage } from "../types";

function makeImage(overrides: Partial<ProductImage> = {}): ProductImage {
  return {
    id: overrides.id ?? "img-1",
    url: overrides.url ?? "https://cdn.example.com/img-1.webp",
    key: overrides.key ?? "products/img-1.webp",
    position: overrides.position ?? 0,
    ...overrides,
  };
}

function makeFile(name = "foto.jpg") {
  return new File(["conteudo"], name, { type: "image/jpeg" });
}

function makeDeps(overrides: Partial<CommitDeps> = {}): CommitDeps {
  return {
    upload: vi.fn(),
    deleteImage: vi.fn(),
    reorder: vi.fn(),
    ...overrides,
  };
}

describe("selecionar foto nova e cancelar sem salvar", () => {
  it("não dispara nenhuma chamada de upload/delete/reorder", () => {
    const deps = makeDeps();
    let entries = entriesFromImages([]);

    entries = addNewEntry(entries, "local-1", makeFile(), "blob:preview-1");
    expect(entries).toHaveLength(1);

    // "Cancelar" = simplesmente não chamar commitImageChanges (o componente
    // desmonta e descarta o estado local). Nenhuma dependência de rede deve
    // ter sido chamada até aqui.
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.deleteImage).not.toHaveBeenCalled();
    expect(deps.reorder).not.toHaveBeenCalled();
  });

  it("remover a própria foto nova staged some da lista sem chamar o backend", () => {
    const deps = makeDeps();
    let entries = entriesFromImages([]);
    entries = addNewEntry(entries, "local-1", makeFile(), "blob:preview-1");
    entries = removeEntryAt(entries, 0);

    expect(entries).toHaveLength(0);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.deleteImage).not.toHaveBeenCalled();
  });
});

describe("selecionar foto nova e clicar em Salvar", () => {
  it("dispara o upload corretamente e a foto aparece salva na ordem final", async () => {
    const uploaded = makeImage({ id: "img-new-1", position: 0 });
    const deps = makeDeps({
      upload: vi.fn().mockResolvedValue(uploaded),
      reorder: vi.fn().mockResolvedValue([uploaded]),
    });

    let entries = entriesFromImages([]);
    entries = addNewEntry(entries, "local-1", makeFile(), "blob:preview-1");

    const result = await commitImageChanges(entries, new Set(), deps);

    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.deleteImage).not.toHaveBeenCalled();
    expect(deps.reorder).toHaveBeenCalledWith(["img-new-1"]);
    expect(result).toEqual([uploaded]);
  });

  it("envia várias fotos novas em sequência respeitando a ordem visual", async () => {
    const uploadedA = makeImage({ id: "img-a" });
    const uploadedB = makeImage({ id: "img-b" });
    const upload = vi.fn().mockResolvedValueOnce(uploadedA).mockResolvedValueOnce(uploadedB);
    const deps = makeDeps({ upload, reorder: vi.fn().mockResolvedValue([uploadedA, uploadedB]) });

    let entries = entriesFromImages([]);
    entries = addNewEntry(entries, "local-a", makeFile("a.jpg"), "blob:a");
    entries = addNewEntry(entries, "local-b", makeFile("b.jpg"), "blob:b");

    await commitImageChanges(entries, new Set(), deps);

    expect(upload).toHaveBeenNthCalledWith(1, expect.objectContaining({ file: expect.objectContaining({ name: "a.jpg" }) }));
    expect(upload).toHaveBeenNthCalledWith(2, expect.objectContaining({ file: expect.objectContaining({ name: "b.jpg" }) }));
    expect(deps.reorder).toHaveBeenCalledWith(["img-a", "img-b"]);
  });
});

describe("marcar foto existente para exclusão e cancelar", () => {
  it("a foto continua existindo — nenhuma chamada de exclusão é feita", () => {
    const original = makeImage({ id: "img-1" });
    const deps = makeDeps();
    let entries = entriesFromImages([original]);
    const deletedIds = new Set<string>();

    entries = removeEntryAt(entries, 0);
    deletedIds.add(original.id);

    expect(hasPendingChanges(entries, [original], deletedIds)).toBe(true);
    // Cancelar = não chamar commitImageChanges.
    expect(deps.deleteImage).not.toHaveBeenCalled();
  });
});

describe("marcar foto existente para exclusão e salvar", () => {
  it("é removida de verdade e a ordem final exclui o id apagado", async () => {
    const keep = makeImage({ id: "img-keep", position: 0 });
    const remove = makeImage({ id: "img-remove", position: 1 });
    const deps = makeDeps({
      deleteImage: vi.fn().mockResolvedValue(undefined),
      reorder: vi.fn().mockResolvedValue([keep]),
    });

    let entries = entriesFromImages([keep, remove]);
    const deletedIds = new Set<string>();

    // handleRemove no índice da imagem "remove" (posição 1 na lista visível)
    entries = removeEntryAt(entries, 1);
    deletedIds.add(remove.id);

    const result = await commitImageChanges(entries, deletedIds, deps);

    expect(deps.deleteImage).toHaveBeenCalledWith("img-remove");
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.reorder).toHaveBeenCalledWith(["img-keep"]);
    expect(result).toEqual([keep]);
  });
});

describe("reordenação é só visual até o commit", () => {
  it("moveEntry não chama nenhuma dependência de rede", () => {
    const a = makeImage({ id: "a", position: 0 });
    const b = makeImage({ id: "b", position: 1 });
    const deps = makeDeps();
    let entries = entriesFromImages([a, b]);

    entries = moveEntry(entries, 0, 1);

    expect(entries.map((e) => (e.kind === "existing" ? e.image.id : e.localId))).toEqual(["b", "a"]);
    expect(deps.reorder).not.toHaveBeenCalled();
  });

  it("commit aplica a ordem final já reorganizada localmente", async () => {
    const a = makeImage({ id: "a", position: 0 });
    const b = makeImage({ id: "b", position: 1 });
    const deps = makeDeps({ reorder: vi.fn().mockResolvedValue([b, a]) });
    let entries = entriesFromImages([a, b]);
    entries = moveEntry(entries, 0, 1);

    await commitImageChanges(entries, new Set(), deps);

    expect(deps.reorder).toHaveBeenCalledWith(["b", "a"]);
  });
});

describe("hasPendingChanges", () => {
  it("é false quando nada mudou em relação ao estado original", () => {
    const images = [makeImage({ id: "a", position: 0 }), makeImage({ id: "b", position: 1 })];
    const entries = entriesFromImages(images);
    expect(hasPendingChanges(entries, images, new Set())).toBe(false);
  });

  it("é true quando há foto nova staged, exclusão marcada ou reordenação", () => {
    const images = [makeImage({ id: "a", position: 0 })];
    const withNew = addNewEntry(entriesFromImages(images), "local-1", makeFile(), "blob:1");
    expect(hasPendingChanges(withNew, images, new Set())).toBe(true);
    expect(hasPendingChanges(entriesFromImages(images), images, new Set(["a"]))).toBe(true);
  });
});

describe("commit sem mudanças pendentes", () => {
  it("não chama upload, delete nem reorder quando não há nada staged/marcado", async () => {
    const images = [makeImage({ id: "a", position: 0 })];
    const entries = entriesFromImages(images);
    const deps = makeDeps({ reorder: vi.fn().mockResolvedValue(images) });

    // No componente real, o commit só roda a lógica de rede quando
    // hasPendingChanges é true; aqui simulamos esse guard explicitamente.
    if (hasPendingChanges(entries, images, new Set())) {
      await commitImageChanges(entries, new Set(), deps);
    }

    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.deleteImage).not.toHaveBeenCalled();
    expect(deps.reorder).not.toHaveBeenCalled();
  });
});

describe("tratamento por IA em foto staged (sem backend com estado)", () => {
  function makeNewEntry(overrides: Partial<NewEntry> = {}): NewEntry {
    return {
      kind: "new",
      localId: "local-1",
      file: makeFile("original.jpg"),
      previewUrl: "blob:original",
      previousFile: null,
      previousPreviewUrl: null,
      colorEnhanced: false,
      colorEnhanceLevel: null,
      previousColorEnhanced: false,
      previousColorEnhanceLevel: null,
      ...overrides,
    };
  }

  it("confirmar um tratamento guarda o File/preview anterior e troca para o tratado", () => {
    const entry = makeNewEntry();
    const treatedFile = makeFile("tratado.jpg");

    const next = withNewEntryTreatment(entry, { file: treatedFile, previewUrl: "blob:tratado" });

    expect(next.file).toBe(treatedFile);
    expect(next.previewUrl).toBe("blob:tratado");
    expect(next.previousFile).toBe(entry.file);
    expect(next.previousPreviewUrl).toBe("blob:original");
  });

  it("desfazer depois de confirmar volta ao File/preview anterior e não deixa mais nada para desfazer", () => {
    const original = makeNewEntry();
    const treated = withNewEntryTreatment(original, { file: makeFile("tratado.jpg"), previewUrl: "blob:tratado" });

    const undone = withNewEntryUndo(treated);

    expect(undone.file).toBe(original.file);
    expect(undone.previewUrl).toBe("blob:original");
    expect(undone.previousFile).toBeNull();
    expect(undone.previousPreviewUrl).toBeNull();
  });

  it("desfazer sem tratamento prévio é um no-op", () => {
    const entry = makeNewEntry();
    expect(withNewEntryUndo(entry)).toBe(entry);
  });

  it("confirmar um tratamento com enhance_color marca colorEnhanced e guarda o nível", () => {
    const entry = makeNewEntry();
    const next = withNewEntryTreatment(entry, {
      file: makeFile("colorido.jpg"),
      previewUrl: "blob:colorido",
      colorEnhanced: true,
      colorEnhanceLevel: "forte",
    });

    expect(next.colorEnhanced).toBe(true);
    expect(next.colorEnhanceLevel).toBe("forte");
    expect(next.previousColorEnhanced).toBe(false);
    expect(next.previousColorEnhanceLevel).toBeNull();
  });

  it("confirmar um tratamento sem enhance_color preserva um colorEnhanced já marcado antes", () => {
    const colored = withNewEntryTreatment(makeNewEntry(), {
      file: makeFile("colorido.jpg"),
      previewUrl: "blob:colorido",
      colorEnhanced: true,
      colorEnhanceLevel: "leve",
    });

    const sharpened = withNewEntryTreatment(colored, { file: makeFile("nitido.jpg"), previewUrl: "blob:nitido" });

    expect(sharpened.colorEnhanced).toBe(true);
    expect(sharpened.colorEnhanceLevel).toBe("leve");
  });

  it("desfazer restaura colorEnhanced/Level para o valor de antes do tratamento desfeito", () => {
    const colored = withNewEntryTreatment(makeNewEntry(), {
      file: makeFile("colorido.jpg"),
      previewUrl: "blob:colorido",
      colorEnhanced: true,
      colorEnhanceLevel: "medio",
    });
    const sharpened = withNewEntryTreatment(colored, { file: makeFile("nitido.jpg"), previewUrl: "blob:nitido" });

    const undone = withNewEntryUndo(sharpened);

    expect(undone.file.name).toBe("colorido.jpg");
    expect(undone.colorEnhanced).toBe(true);
    expect(undone.colorEnhanceLevel).toBe("medio");
  });

  it("descartar (não confirmar) não altera a entrada — simplesmente não se chama withNewEntryTreatment", () => {
    const entry = makeNewEntry();
    // "Descartar" no componente real não chama nenhuma função de staging —
    // o preview tratado só existe localmente até a confirmação. Este teste
    // documenta que a entrada staged permanece byte-a-byte a mesma.
    expect(entry.file.name).toBe("original.jpg");
    expect(entry.previewUrl).toBe("blob:original");
  });
});
