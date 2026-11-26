import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CategoryTree } from "../../types";
import { computeFloatingPosition, type FloatingPosition } from "../../lib/floatingPosition";

export interface MoveDestination {
  categoryId: string | null;
  subcategoryId: string | null;
  label: string;
}

interface FlatOption extends MoveDestination {
  searchText: string;
}

// Lista achatada de destinos possíveis: "Sem categoria" + cada categoria +
// cada subcategoria (com o nome da categoria-mãe no rótulo, pra não
// confundir subcategorias de nomes parecidos em categorias diferentes).
export function flattenDestinations(tree: CategoryTree): MoveDestination[] {
  const options: MoveDestination[] = [{ categoryId: null, subcategoryId: null, label: "Sem categoria" }];
  for (const category of tree.categories) {
    options.push({ categoryId: category.id, subcategoryId: null, label: category.name });
    for (const sub of category.subcategories) {
      options.push({ categoryId: category.id, subcategoryId: sub.id, label: `${category.name} > ${sub.name}` });
    }
  }
  return options;
}

// Id estável de destino — usado tanto pelo <DndContext> (droppable na árvore,
// ver CategoryTree.tsx) quanto pela página pra achar de volta o MoveDestination
// a partir do id onde a peça foi soltada (ver ProductCategorization.tsx).
export function destinationDropId(destination: Pick<MoveDestination, "categoryId" | "subcategoryId">): string {
  return `category-drop:${destination.categoryId ?? "none"}:${destination.subcategoryId ?? "none"}`;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

export function filterDestinations(options: MoveDestination[], query: string): MoveDestination[] {
  const q = normalize(query);
  if (!q) return options;
  return options.filter((o) => normalize(o.label).includes(q));
}

// Abaixo disto é tela de celular — vira folha (bottom sheet) de largura
// total em vez de painel flutuante ancorado ao botão (mesmo breakpoint `sm`
// usado no resto da tela de categorização).
const MOBILE_BREAKPOINT_PX = 640;
const PREFERRED_WIDTH_PX = 288;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT_PX);
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

// Painel com busca — ancorado ao botão que o abriu (`anchorRef`), sempre
// DENTRO da área visível da janela (abre pra cima quando não há espaço
// embaixo — ver lib/floatingPosition.ts) e portado para document.body (um
// z-index alto não basta se um ancestral tiver overflow/transform; o portal
// escapa disso de propósito). Sem biblioteca de combobox (nenhuma no
// projeto ainda, ver investigação original).
export function MoveToPicker({
  tree,
  anchorRef,
  onSelect,
  onClose,
}: {
  tree: CategoryTree;
  anchorRef: React.RefObject<HTMLElement>;
  onSelect: (destination: MoveDestination) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const options: FlatOption[] = useMemo(
    () => flattenDestinations(tree).map((o) => ({ ...o, searchText: normalize(o.label) })),
    [tree]
  );
  const filtered = useMemo(() => filterDestinations(options, query), [options, query]);

  // Recalcula a posição na abertura e sempre que a janela mudar de tamanho
  // ou rolar — um painel ancorado que não reage a isso é o jeito mais fácil
  // de voltar a ficar fora da tela.
  useEffect(() => {
    if (isMobile) return;
    function updatePosition() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      setPosition(computeFloatingPosition(anchor, PREFERRED_WIDTH_PX, { width: window.innerWidth, height: window.innerHeight }));
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, isMobile]);

  // Fecha ao clicar fora do painel e fora do botão que o abriu (o próprio
  // botão já tem seu próprio onClick pra alternar aberto/fechado — sem essa
  // checagem, clicar nele de novo fecharia e reabriria na mesma interação).
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [anchorRef, onClose]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  function selectIndex(index: number) {
    const option = filtered[index];
    if (!option) return;
    onSelect({ categoryId: option.categoryId, subcategoryId: option.subcategoryId, label: option.label });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectIndex(highlightedIndex);
    }
  }

  const panelClassName = isMobile
    ? "fixed inset-x-0 bottom-0 z-[999] max-h-[70vh] rounded-t-2xl border-t border-[#E2E8F0] bg-white p-3 shadow-xl"
    : "fixed z-[999] rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-xl";

  const style: React.CSSProperties = isMobile
    ? {}
    : position
      ? {
          width: Math.min(PREFERRED_WIDTH_PX, window.innerWidth - 16),
          top: position.top ?? undefined,
          bottom: position.bottom ?? undefined,
          left: position.left,
        }
      // Antes da 1ª medição: fora da tela, pra nunca "piscar" no canto
      // errado antes do useEffect calcular a posição real.
      : { top: -9999, left: -9999 };

  const content = (
    <div ref={panelRef} role="dialog" aria-label="Mover para" className={panelClassName} style={style}>
      <div className="flex items-center justify-between gap-2">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar categoria..."
          aria-label="Buscar categoria ou subcategoria"
          className="min-w-0 flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#C78F50]"
        />
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex-shrink-0 text-[#64748B] hover:text-[#1A1A1A]">
          ×
        </button>
      </div>
      <ul
        role="listbox"
        aria-label="Categorias e subcategorias"
        className="mt-2 overflow-y-auto"
        style={{ maxHeight: isMobile ? "calc(70vh - 60px)" : (position?.maxHeight ?? 256) }}
      >
        {filtered.length === 0 && <li className="px-2 py-2 text-sm text-[#64748B]">Nenhuma categoria encontrada.</li>}
        {filtered.map((option, index) => (
          <li key={`${option.categoryId ?? "none"}-${option.subcategoryId ?? "none"}`}>
            <button
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => selectIndex(index)}
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-sm ${
                index === highlightedIndex ? "bg-[#C78F50]/15 text-[#1A1A1A]" : "text-[#1A1A1A] hover:bg-[#F8FAFC]"
              }`}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return createPortal(content, document.body);
}
