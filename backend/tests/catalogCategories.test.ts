import { describe, expect, it } from "vitest";
import { groupProductsByCategory, localizeCategoryName } from "../src/lib/catalog/categories";

interface Item {
  id: string;
  categoryName: string | null;
}

describe("groupProductsByCategory", () => {
  it("agrupa na ordem fixa (Pedras Brutas, Pedras Polidas, Big, Formas, Homedecor, Acessorios), não na ordem de aparição", () => {
    const items: Item[] = [
      { id: "1", categoryName: "Formas" },
      { id: "2", categoryName: "Pedras Brutas" },
      { id: "3", categoryName: "Acessorios" },
      { id: "4", categoryName: "Homedecor" },
    ];
    const groups = groupProductsByCategory(items);
    expect(groups.map((g) => g.categoryName)).toEqual(["Pedras Brutas", "Formas", "Homedecor", "Acessorios"]);
  });

  it("categorias sem nenhuma peça não aparecem (sem grupo vazio)", () => {
    const items: Item[] = [{ id: "1", categoryName: "Formas" }];
    const groups = groupProductsByCategory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryName).toBe("Formas");
  });

  it("mantém a ordem relativa (sortOrder) dentro de cada categoria", () => {
    const items: Item[] = [
      { id: "a", categoryName: "Formas" },
      { id: "b", categoryName: "Formas" },
      { id: "c", categoryName: "Formas" },
    ];
    const groups = groupProductsByCategory(items);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("casa por nome normalizado (sem acento/maiúscula) com a grafia real do banco", () => {
    const items: Item[] = [{ id: "1", categoryName: "Acessórios" }];
    const groups = groupProductsByCategory(items);
    expect(groups[0].categoryName).toBe("Acessórios");
  });

  it("categoria fora da lista fixa entra depois das conhecidas, sem ser descartada", () => {
    const items: Item[] = [
      { id: "1", categoryName: "Formas" },
      { id: "2", categoryName: "Categoria Nova" },
    ];
    const groups = groupProductsByCategory(items);
    expect(groups.map((g) => g.categoryName)).toEqual(["Formas", "Categoria Nova"]);
  });

  it("peças sem categoria formam um grupo (null) sempre por último", () => {
    const items: Item[] = [
      { id: "1", categoryName: null },
      { id: "2", categoryName: "Formas" },
    ];
    const groups = groupProductsByCategory(items);
    expect(groups.map((g) => g.categoryName)).toEqual(["Formas", null]);
  });

  it("sem nenhuma peça sem categoria, não cria o grupo null", () => {
    const items: Item[] = [{ id: "1", categoryName: "Formas" }];
    expect(groupProductsByCategory(items).some((g) => g.categoryName === null)).toBe(false);
  });
});

describe("localizeCategoryName", () => {
  it("PT devolve o nome como está", () => {
    expect(localizeCategoryName("Pedras Brutas", "pt")).toBe("Pedras Brutas");
  });

  it("EN traduz as categorias conhecidas (mesma tradução do site público)", () => {
    expect(localizeCategoryName("Pedras Brutas", "en")).toBe("Rough Stones");
    expect(localizeCategoryName("Homedecor", "en")).toBe("Home Decor");
    expect(localizeCategoryName("Formas", "en")).toBe("Shapes");
  });

  it("EN sem tradução conhecida cai para o nome original", () => {
    expect(localizeCategoryName("Categoria Nova", "en")).toBe("Categoria Nova");
  });
});
