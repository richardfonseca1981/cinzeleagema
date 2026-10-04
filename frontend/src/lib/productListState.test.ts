import { describe, expect, it } from "vitest";
import type { Category } from "../types";
import {
  DEFAULT_LIST_STATE,
  MAX_QUERY_LENGTH,
  applyChange,
  backToListPath,
  listStateToSearch,
  parseListState,
  sanitizeAgainstCategories,
  serializeListState,
  toApiParams,
} from "./productListState";

describe("parseListState — valores válidos", () => {
  it("URL vazia = estado padrão", () => {
    expect(parseListState("")).toEqual(DEFAULT_LIST_STATE);
  });

  it("lê todos os campos", () => {
    expect(parseListState("?page=3&pageSize=25&q=ametista&category=c1&subcategory=s1&status=inactive")).toEqual({
      page: 3,
      pageSize: 25,
      q: "ametista",
      category: "c1",
      subcategory: "s1",
      status: "inactive",
    });
  });

  it("aceita URLSearchParams", () => {
    expect(parseListState(new URLSearchParams({ page: "2" })).page).toBe(2);
  });
});

describe("parseListState — valores inválidos caem para um valor seguro, sem lançar", () => {
  it("page inválida → 1", () => {
    for (const bad of ["abc", "0", "-2", "1.5", "", " ", "1e3", "99999999999999999999", "NaN"]) {
      expect(parseListState(`?page=${encodeURIComponent(bad)}`).page).toBe(1);
    }
  });

  it("page=999 é aceita aqui (o ajuste ao total acontece depois da carga, com clampPage)", () => {
    expect(parseListState("?page=999").page).toBe(999);
  });

  it("pageSize fora das opções → 50", () => {
    for (const bad of ["abc", "0", "30", "500", "101", "-50", "50.5"]) {
      expect(parseListState(`?pageSize=${bad}`).pageSize).toBe(50);
    }
    for (const ok of ["25", "50", "100"]) expect(parseListState(`?pageSize=${ok}`).pageSize).toBe(Number(ok));
  });

  it("status desconhecido → all", () => {
    expect(parseListState("?status=banana").status).toBe("all");
    expect(parseListState("?status=ACTIVE").status).toBe("all");
  });

  it("q é aparada e limitada ao tamanho máximo", () => {
    expect(parseListState("?q=%20%20abc%20").q).toBe("abc");
    expect(parseListState(`?q=${"a".repeat(500)}`).q).toHaveLength(MAX_QUERY_LENGTH);
  });

  it("subcategoria sem categoria é descartada", () => {
    expect(parseListState("?subcategory=s1").subcategory).toBe("");
  });

  it("ids absurdamente longos são descartados", () => {
    expect(parseListState(`?category=${"x".repeat(500)}`).category).toBe("");
  });

  it("parâmetros desconhecidos e lixo são ignorados", () => {
    expect(parseListState("?foo=bar&page=2&%E0%A4%A")).toMatchObject({ page: 2 });
  });
});

describe("serializeListState / listStateToSearch", () => {
  it("estado padrão gera URL limpa", () => {
    expect(serializeListState(DEFAULT_LIST_STATE).toString()).toBe("");
    expect(listStateToSearch(DEFAULT_LIST_STATE)).toBe("");
  });

  it("só escreve o que difere do padrão", () => {
    expect(listStateToSearch({ ...DEFAULT_LIST_STATE, page: 2 })).toBe("?page=2");
    expect(listStateToSearch({ ...DEFAULT_LIST_STATE, pageSize: 100, status: "active" })).toBe("?pageSize=100&status=active");
  });

  it("ida e volta: parse(serialize(x)) === x", () => {
    const states = [
      DEFAULT_LIST_STATE,
      { ...DEFAULT_LIST_STATE, page: 7, pageSize: 25, q: "peça rara & cia", category: "c1", subcategory: "s1", status: "active" as const },
      { ...DEFAULT_LIST_STATE, q: "100%" },
    ];
    for (const s of states) expect(parseListState(serializeListState(s))).toEqual(s);
  });
});

describe("toApiParams", () => {
  it("padrão: só page e pageSize (sem filtros)", () => {
    expect(toApiParams(DEFAULT_LIST_STATE)).toEqual({ page: 1, pageSize: 50 });
  });

  it("traduz filtros para os parâmetros do backend", () => {
    expect(toApiParams({ page: 2, pageSize: 25, q: "ame", category: "c1", subcategory: "s1", status: "active" })).toEqual({
      page: 2,
      pageSize: 25,
      q: "ame",
      categoryId: "c1",
      subcategoryId: "s1",
      active: true,
    });
    expect(toApiParams({ ...DEFAULT_LIST_STATE, status: "inactive" }).active).toBe(false);
  });
});

describe("applyChange — mudar busca, filtro ou itens por página volta para a página 1", () => {
  const onPage3 = { ...DEFAULT_LIST_STATE, page: 3 };

  it("trocar só de página mantém o resto", () => {
    expect(applyChange({ ...onPage3, q: "x" }, { page: 4 })).toMatchObject({ page: 4, q: "x" });
  });

  it.each([
    ["busca", { q: "ame" }],
    ["categoria", { category: "c1" }],
    ["status", { status: "active" as const }],
    ["itens por página", { pageSize: 100 }],
  ])("mudar %s volta para a página 1", (_name, patch) => {
    expect(applyChange(onPage3, patch).page).toBe(1);
  });

  it("repetir o mesmo valor não mexe na página", () => {
    expect(applyChange(onPage3, { q: "" }).page).toBe(3);
  });

  it("trocar a categoria zera a subcategoria", () => {
    const s = { ...DEFAULT_LIST_STATE, category: "c1", subcategory: "s1" };
    expect(applyChange(s, { category: "c2" })).toMatchObject({ category: "c2", subcategory: "" });
  });
});

describe("sanitizeAgainstCategories", () => {
  const categories: Category[] = [
    { id: "c1", name: "Brutas", slug: "brutas", subcategories: [{ id: "s1", name: "Big", slug: "big", categoryId: "c1" }] },
    { id: "c2", name: "Polidas", slug: "polidas", subcategories: [] },
  ];

  it("mantém categoria e subcategoria válidas", () => {
    const s = { ...DEFAULT_LIST_STATE, category: "c1", subcategory: "s1", page: 2 };
    expect(sanitizeAgainstCategories(s, categories)).toEqual(s);
  });

  it("remove categoria inexistente (e a subcategoria junto) e volta à página 1", () => {
    expect(sanitizeAgainstCategories({ ...DEFAULT_LIST_STATE, category: "zzz", subcategory: "s1", page: 4 }, categories)).toMatchObject({
      category: "",
      subcategory: "",
      page: 1,
    });
  });

  it("remove subcategoria que não pertence à categoria", () => {
    expect(sanitizeAgainstCategories({ ...DEFAULT_LIST_STATE, category: "c2", subcategory: "s1" }, categories)).toMatchObject({
      category: "c2",
      subcategory: "",
    });
  });

  it("sem categoria selecionada, não faz nada", () => {
    expect(sanitizeAgainstCategories(DEFAULT_LIST_STATE, categories)).toBe(DEFAULT_LIST_STATE);
  });
});

describe("backToListPath — retorno da edição à mesma página e filtros", () => {
  it("usa a query string guardada no state do link", () => {
    expect(backToListPath({ from: "?page=2&q=ametista" })).toBe("/admin/produtos?page=2&q=ametista");
  });

  it("sem state (acesso direto, F5 sem histórico) volta à lista padrão", () => {
    expect(backToListPath(null)).toBe("/admin/produtos");
    expect(backToListPath(undefined)).toBe("/admin/produtos");
    expect(backToListPath({})).toBe("/admin/produtos");
  });

  it("recusa valores que não são uma query string (nada de redirecionar para outro lugar)", () => {
    expect(backToListPath({ from: "https://evil.com" })).toBe("/admin/produtos");
    expect(backToListPath({ from: "//evil.com" })).toBe("/admin/produtos");
    expect(backToListPath({ from: 42 })).toBe("/admin/produtos");
    expect(backToListPath({ from: "?" + "a".repeat(600) })).toBe("/admin/produtos");
  });
});
