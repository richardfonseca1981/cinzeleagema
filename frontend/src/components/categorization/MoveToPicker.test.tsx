import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MoveToPicker, flattenDestinations, filterDestinations } from "./MoveToPicker";
import type { CategoryTree } from "../../types";

afterEach(() => cleanup());

const tree: CategoryTree = {
  categories: [
    {
      id: "cat-1",
      name: "Pedras Brutas",
      slug: "pedras-brutas",
      position: 0,
      productCount: 5,
      subcategories: [{ id: "sub-1", name: "Capelas", slug: "capelas", position: 0, productCount: 2 }],
    },
    { id: "cat-2", name: "Homedecor", slug: "homedecor", position: 1, productCount: 0, subcategories: [] },
  ],
  uncategorized: { productCount: 3 },
};

describe("flattenDestinations", () => {
  it("inclui 'Sem categoria' + cada categoria + cada subcategoria com o rótulo 'Categoria > Subcategoria'", () => {
    const options = flattenDestinations(tree);
    expect(options).toEqual([
      { categoryId: null, subcategoryId: null, label: "Sem categoria" },
      { categoryId: "cat-1", subcategoryId: null, label: "Pedras Brutas" },
      { categoryId: "cat-1", subcategoryId: "sub-1", label: "Pedras Brutas > Capelas" },
      { categoryId: "cat-2", subcategoryId: null, label: "Homedecor" },
    ]);
  });
});

describe("filterDestinations", () => {
  it("sem busca, devolve todas; com busca, filtra por substring (sem diferenciar maiúsculas/minúsculas)", () => {
    const options = flattenDestinations(tree);
    expect(filterDestinations(options, "")).toHaveLength(4);
    expect(filterDestinations(options, "capelas").map((o) => o.label)).toEqual(["Pedras Brutas > Capelas"]);
    expect(filterDestinations(options, "HOME").map((o) => o.label)).toEqual(["Homedecor"]);
  });
});

describe("MoveToPicker", () => {
  it("busca filtra a lista; clicar numa opção chama onSelect com o destino certo", () => {
    const onSelect = vi.fn();
    render(<MoveToPicker tree={tree} onSelect={onSelect} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Buscar categoria ou subcategoria"), { target: { value: "capelas" } });
    expect(screen.queryByText("Homedecor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Pedras Brutas > Capelas"));
    expect(onSelect).toHaveBeenCalledWith({ categoryId: "cat-1", subcategoryId: "sub-1", label: "Pedras Brutas > Capelas" });
  });

  it("botão de fechar chama onClose", () => {
    const onClose = vi.fn();
    render(<MoveToPicker tree={tree} onSelect={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).toHaveBeenCalled();
  });
});
