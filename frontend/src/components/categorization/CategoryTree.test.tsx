import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CategoryTree, sameBrowseFilter, type BrowseFilter } from "./CategoryTree";
import type { CategoryTree as CategoryTreeData } from "../../types";

afterEach(() => cleanup());

const tree: CategoryTreeData = {
  categories: [
    {
      id: "cat-1",
      name: "Pedras Brutas",
      slug: "pedras-brutas",
      position: 0,
      productCount: 5,
      subcategories: [{ id: "sub-1", name: "Capelas", slug: "capelas", position: 0, productCount: 2 }],
    },
  ],
  uncategorized: { productCount: 3 },
};

describe("sameBrowseFilter", () => {
  it("compara pelo tipo e pelos ids relevantes", () => {
    expect(sameBrowseFilter({ kind: "uncategorized" }, { kind: "uncategorized" })).toBe(true);
    expect(sameBrowseFilter({ kind: "category", categoryId: "a" }, { kind: "category", categoryId: "a" })).toBe(true);
    expect(sameBrowseFilter({ kind: "category", categoryId: "a" }, { kind: "category", categoryId: "b" })).toBe(false);
    expect(sameBrowseFilter({ kind: "all" }, { kind: "uncategorized" })).toBe(false);
  });
});

describe("CategoryTree", () => {
  it("mostra 'Sem categoria' com a contagem e as categorias com suas subcategorias", () => {
    render(<CategoryTree tree={tree} activeFilter={{ kind: "uncategorized" }} onSelectFilter={() => {}} />);

    expect(screen.getByText("Sem categoria")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Pedras Brutas")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Capelas")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("clicar num nó chama onSelectFilter com o filtro certo", () => {
    const onSelectFilter = vi.fn();
    render(<CategoryTree tree={tree} activeFilter={{ kind: "uncategorized" }} onSelectFilter={onSelectFilter} />);

    fireEvent.click(screen.getByText("Pedras Brutas"));
    expect(onSelectFilter).toHaveBeenCalledWith({ kind: "category", categoryId: "cat-1" });

    fireEvent.click(screen.getByText("Capelas"));
    expect(onSelectFilter).toHaveBeenCalledWith({ kind: "subcategory", categoryId: "cat-1", subcategoryId: "sub-1" });

    fireEvent.click(screen.getByText("Todas as peças"));
    expect(onSelectFilter).toHaveBeenCalledWith({ kind: "all" });
  });

  it("marca o nó ativo de forma diferente (ex.: Sem categoria quando é o filtro atual)", () => {
    const filter: BrowseFilter = { kind: "category", categoryId: "cat-1" };
    render(<CategoryTree tree={tree} activeFilter={filter} onSelectFilter={() => {}} />);
    expect(screen.getByText("Pedras Brutas").closest("button")).toHaveClass("font-semibold");
  });
});
