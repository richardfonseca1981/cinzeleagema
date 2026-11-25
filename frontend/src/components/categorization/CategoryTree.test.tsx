import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { CategoryTree, sameBrowseFilter, type BrowseFilter, type CategoryTreeActions } from "./CategoryTree";
import type { CategoryTree as CategoryTreeData } from "../../types";

afterEach(() => cleanup());

function makeActions(overrides: Partial<CategoryTreeActions> = {}): CategoryTreeActions {
  return {
    onCreateCategory: vi.fn().mockResolvedValue(undefined),
    onRenameCategory: vi.fn().mockResolvedValue(undefined),
    onDeleteCategory: vi.fn().mockResolvedValue(undefined),
    onCreateSubcategory: vi.fn().mockResolvedValue(undefined),
    onRenameSubcategory: vi.fn().mockResolvedValue(undefined),
    onDeleteSubcategory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Cada nó da árvore é uma zona de soltar (useDroppable, ver etapa de
// drag-and-drop) — exige um <DndContext> ancestral, mesmo sem simular
// arrastar nenhum teste aqui (cliques normais continuam funcionando sem
// nenhum drag de verdade acontecer).
function renderTree(props: Omit<Parameters<typeof CategoryTree>[0], "actions"> & { actions?: CategoryTreeActions }) {
  return render(
    <DndContext>
      <CategoryTree {...props} actions={props.actions ?? makeActions()} />
    </DndContext>
  );
}

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
    renderTree({ tree, activeFilter: { kind: "uncategorized" }, onSelectFilter: () => {} });

    expect(screen.getByText("Sem categoria")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Pedras Brutas")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Capelas")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("clicar num nó chama onSelectFilter com o filtro certo", () => {
    const onSelectFilter = vi.fn();
    renderTree({ tree, activeFilter: { kind: "uncategorized" }, onSelectFilter });

    fireEvent.click(screen.getByText("Pedras Brutas"));
    expect(onSelectFilter).toHaveBeenCalledWith({ kind: "category", categoryId: "cat-1" });

    fireEvent.click(screen.getByText("Capelas"));
    expect(onSelectFilter).toHaveBeenCalledWith({ kind: "subcategory", categoryId: "cat-1", subcategoryId: "sub-1" });

    fireEvent.click(screen.getByText("Todas as peças"));
    expect(onSelectFilter).toHaveBeenCalledWith({ kind: "all" });
  });

  it("marca o nó ativo de forma diferente (ex.: Sem categoria quando é o filtro atual)", () => {
    const filter: BrowseFilter = { kind: "category", categoryId: "cat-1" };
    renderTree({ tree, activeFilter: filter, onSelectFilter: () => {} });
    expect(screen.getByText("Pedras Brutas").closest("button")).toHaveClass("font-semibold");
  });
});

describe("CategoryTree — criar/renomear/apagar inline", () => {
  it("'+ Nova categoria' abre um campo; confirmar chama onCreateCategory com o nome digitado", async () => {
    const actions = makeActions();
    renderTree({ tree, activeFilter: { kind: "uncategorized" }, onSelectFilter: () => {}, actions });

    fireEvent.click(screen.getByText("+ Nova categoria"));
    fireEvent.change(screen.getByPlaceholderText("Nova categoria"), { target: { value: "Homedecor" } });
    fireEvent.click(screen.getByLabelText("Confirmar"));

    expect(actions.onCreateCategory).toHaveBeenCalledWith("Homedecor");
  });

  it("Esc cancela a criação sem chamar a ação", () => {
    const actions = makeActions();
    renderTree({ tree, activeFilter: { kind: "uncategorized" }, onSelectFilter: () => {}, actions });

    fireEvent.click(screen.getByText("+ Nova categoria"));
    fireEvent.keyDown(screen.getByPlaceholderText("Nova categoria"), { key: "Escape" });

    expect(screen.queryByPlaceholderText("Nova categoria")).not.toBeInTheDocument();
    expect(actions.onCreateCategory).not.toHaveBeenCalled();
  });

  it("renomear categoria: lápis abre campo com o nome atual; confirmar chama onRenameCategory", () => {
    const actions = makeActions();
    renderTree({ tree, activeFilter: { kind: "uncategorized" }, onSelectFilter: () => {}, actions });

    fireEvent.click(screen.getByLabelText("Renomear Pedras Brutas"));
    const input = screen.getByPlaceholderText("Nome da categoria") as HTMLInputElement;
    expect(input.value).toBe("Pedras Brutas");

    fireEvent.change(input, { target: { value: "Pedras Brutas Selecionadas" } });
    fireEvent.click(screen.getByLabelText("Confirmar"));

    expect(actions.onRenameCategory).toHaveBeenCalledWith("cat-1", "Pedras Brutas Selecionadas");
  });

  it("apagar categoria chama onDeleteCategory com o id", () => {
    const actions = makeActions();
    renderTree({ tree, activeFilter: { kind: "uncategorized" }, onSelectFilter: () => {}, actions });

    fireEvent.click(screen.getByLabelText("Apagar Pedras Brutas"));

    expect(actions.onDeleteCategory).toHaveBeenCalledWith("cat-1");
  });

  it("'+ Subcategoria' cria sob a categoria certa; renomear/apagar subcategoria chamam as ações certas", async () => {
    const actions = makeActions();
    renderTree({ tree, activeFilter: { kind: "uncategorized" }, onSelectFilter: () => {}, actions });

    fireEvent.click(screen.getByText("+ Subcategoria"));
    fireEvent.change(screen.getByPlaceholderText("Nova subcategoria"), { target: { value: "Capelas de Citrino" } });
    fireEvent.click(screen.getByLabelText("Confirmar"));
    expect(actions.onCreateSubcategory).toHaveBeenCalledWith("cat-1", "Capelas de Citrino");
    // Espera o formulário fechar (editing volta a "none" só depois do await
    // da ação resolver) antes de abrir o próximo — senão o próximo formulário
    // nasce com `pending` ainda true (estado compartilhado) e fica desabilitado.
    await waitFor(() => expect(screen.queryByPlaceholderText("Nova subcategoria")).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Renomear Capelas"));
    fireEvent.change(screen.getByPlaceholderText("Nome da subcategoria"), { target: { value: "Capelas Grandes" } });
    fireEvent.click(screen.getByLabelText("Confirmar"));
    await waitFor(() => expect(actions.onRenameSubcategory).toHaveBeenCalledWith("sub-1", "Capelas Grandes"));
    await waitFor(() => expect(screen.queryByPlaceholderText("Nome da subcategoria")).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Apagar Capelas"));
    await waitFor(() => expect(actions.onDeleteSubcategory).toHaveBeenCalledWith("sub-1"));
  });
});
