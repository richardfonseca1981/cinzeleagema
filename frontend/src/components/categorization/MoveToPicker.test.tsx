import { useLayoutEffect, useRef, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MoveToPicker, flattenDestinations, filterDestinations, type MoveDestination } from "./MoveToPicker";
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

// Harness com um botão real (igual ao "Mover para..." de verdade) cujo
// getBoundingClientRect é controlado pelo teste — assim dá pra simular
// "botão perto do fundo da janela" sem precisar de navegador real.
function Harness({
  onSelect = () => {},
  onClose = () => {},
  anchorRect,
}: {
  onSelect?: (destination: MoveDestination) => void;
  onClose?: () => void;
  anchorRect?: Partial<DOMRect>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // useLayoutEffect roda ANTES do useEffect de MoveToPicker (layout effects
  // sempre rodam antes de effects, mesmo entre irmãos) — garante que o rect
  // mockado já está no lugar quando o painel calcula a posição.
  useLayoutEffect(() => {
    if (ref.current && anchorRect) {
      ref.current.getBoundingClientRect = () =>
        ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {}, ...anchorRect }) as DOMRect;
    }
  }, [anchorRect]);
  return (
    <>
      <button ref={ref}>Mover para...</button>
      <MoveToPicker tree={tree} anchorRef={ref as RefObject<HTMLElement>} onSelect={onSelect} onClose={onClose} />
    </>
  );
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

describe("MoveToPicker — conteúdo e seleção por clique", () => {
  it("busca filtra a lista; clicar numa opção chama onSelect com o destino certo", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText("Buscar categoria ou subcategoria"), { target: { value: "capelas" } });
    expect(screen.queryByText("Homedecor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Pedras Brutas > Capelas"));
    expect(onSelect).toHaveBeenCalledWith({ categoryId: "cat-1", subcategoryId: "sub-1", label: "Pedras Brutas > Capelas" });
  });

  it("'Sem categoria' é a primeira opção, sempre visível sem precisar buscar", () => {
    render(<Harness />);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Sem categoria");
  });

  it("botão de fechar chama onClose", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).toHaveBeenCalled();
  });

  it("é renderizado via portal em document.body (não fica preso num ancestral com overflow/transform)", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"][aria-label="Mover para"]')).not.toBeNull();
  });
});

describe("MoveToPicker — seleção por teclado", () => {
  it("ArrowDown move o destaque; Enter confirma o item destacado", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByLabelText("Buscar categoria ou subcategoria");

    // Começa em "Sem categoria" (índice 0); duas setas pra baixo -> "Pedras Brutas > Capelas" (índice 2).
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith({ categoryId: "cat-1", subcategoryId: "sub-1", label: "Pedras Brutas > Capelas" });
  });

  it("ArrowUp no primeiro item não passa de 0 (não dá a volta pro fim)", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByLabelText("Buscar categoria ou subcategoria");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith({ categoryId: null, subcategoryId: null, label: "Sem categoria" });
  });

  it("Esc chama onClose", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText("Buscar categoria ou subcategoria"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("digitar texto reseta o destaque pro primeiro resultado filtrado", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByLabelText("Buscar categoria ou subcategoria");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.change(input, { target: { value: "homedecor" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith({ categoryId: "cat-2", subcategoryId: null, label: "Homedecor" });
  });
});

describe("MoveToPicker — posicionamento (clicar fora fecha)", () => {
  it("clicar fora do painel e fora do botão chama onClose", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("clicar dentro do painel NÃO fecha", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.mouseDown(screen.getByLabelText("Buscar categoria ou subcategoria"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("MoveToPicker — integra computeFloatingPosition com o botão real", () => {
  it("botão perto do fundo da janela: o painel abre pra CIMA (style.bottom definido, sem style.top)", () => {
    setViewport(1280, 800);
    render(<Harness anchorRect={{ top: 740, bottom: 780, left: 1000, right: 1100 }} />);

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.style.bottom).not.toBe("");
    expect(dialog.style.top).toBe("");
  });

  it("botão no topo da janela com espaço embaixo: o painel abre pra BAIXO (style.top definido)", () => {
    setViewport(1280, 800);
    render(<Harness anchorRect={{ top: 100, bottom: 130, left: 1000, right: 1100 }} />);

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.style.top).not.toBe("");
    expect(dialog.style.bottom).toBe("");
  });
});
