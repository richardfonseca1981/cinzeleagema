import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ApiError, listProductOrder, saveProductOrder, type OrderItem } from "../lib/api";
import { useToast } from "../components/Toast";
import { moveItem, moveToBottom, moveToTop, sameOrder } from "../lib/productOrder";

const btn =
  "rounded border border-[#E2E8F0] px-2 py-1 text-xs hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40";

function Row({
  item,
  index,
  last,
  highlighted,
  onMove,
}: {
  item: OrderItem;
  index: number;
  last: boolean;
  highlighted: boolean;
  onMove: (kind: "top" | "up" | "down" | "bottom") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const cover = item.images[0]?.url;
  return (
    <li
      ref={setNodeRef}
      id={`order-${item.id}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border bg-white p-2 ${
        highlighted ? "border-[#C78F50] ring-2 ring-[#C78F50]/40" : "border-[#E2E8F0]"
      } ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      <button
        type="button"
        aria-label={`Arrastar ${item.name ?? "peça sem nome"}`}
        className="cursor-grab touch-none px-2 py-2 text-[#64748B]"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="w-8 shrink-0 text-right text-sm font-semibold text-[#64748B]">{index + 1}</span>
      {cover ? (
        <img src={cover} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-12 w-9 shrink-0 rounded bg-[#E2E8F0]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1A1A1A]">{item.name ?? "(sem nome)"}</p>
        <p className="truncate text-xs text-[#64748B]">
          {item.sku ?? "sem SKU"}
          {!item.active && " · inativa"}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        <button type="button" className={btn} onClick={() => onMove("top")} disabled={index === 0} aria-label="Mover para o topo">
          ⤒
        </button>
        <button type="button" className={btn} onClick={() => onMove("up")} disabled={index === 0} aria-label="Subir uma posição">
          ↑
        </button>
        <button type="button" className={btn} onClick={() => onMove("down")} disabled={last} aria-label="Descer uma posição">
          ↓
        </button>
        <button type="button" className={btn} onClick={() => onMove("bottom")} disabled={last} aria-label="Mover para o fim">
          ⤓
        </button>
      </div>
    </li>
  );
}

export function ProductOrder() {
  const { showToast } = useToast();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function load() {
    setLoading(true);
    setLoadError(false);
    listProductOrder()
      .then((res) => {
        setItems(res.items);
        setSaved(res.items.map((i) => i.id));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const dirty = !sameOrder(ids, saved);

  // Avisa ao fechar/recarregar a aba com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function move(index: number, kind: "top" | "up" | "down" | "bottom") {
    setItems((prev) =>
      kind === "top"
        ? moveToTop(prev, index)
        : kind === "bottom"
          ? moveToBottom(prev, index)
          : moveItem(prev, index, kind === "up" ? index - 1 : index + 1)
    );
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === active.id);
      const to = prev.findIndex((i) => i.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  }

  // A busca NÃO filtra nem altera a ordem: só rola até a peça e a destaca.
  function onSearch(value: string) {
    setSearch(value);
    const q = value.trim().toLowerCase();
    if (!q) {
      setHighlight(null);
      return;
    }
    const found = items.find((i) => (i.name ?? "").toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q));
    setHighlight(found?.id ?? null);
    if (found) {
      document.getElementById(`order-${found.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.clearTimeout(timer.current);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await saveProductOrder(ids);
      setItems(res.items);
      setSaved(res.items.map((i) => i.id));
      showToast("success", "Ordem salva. O site já reflete a nova ordem.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível salvar a ordem");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    const byId = new Map(items.map((i) => [i.id, i]));
    setItems(saved.map((id) => byId.get(id)).filter((i): i is OrderItem => Boolean(i)));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#1A1A1A]">Ordem das peças</h1>
          <p className="text-sm text-[#64748B]">
            A ordem daqui é a ordem do site (catálogo e destaques da página inicial) e do Excel. Peças novas entram no topo.
          </p>
        </div>
        <Link to="/admin/produtos" className="text-sm font-medium text-[#5F84BA] hover:underline">
          ← Voltar aos produtos
        </Link>
      </div>

      {loading && <p className="text-[#64748B]">Carregando...</p>}
      {loadError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          <span>Não foi possível carregar as peças.</span>
          <button type="button" onClick={load} className="rounded-lg border border-[#EF4444] px-3 py-1 font-medium hover:bg-white">
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 bg-[#F8FAFC] py-2">
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Localizar por nome ou SKU..."
              aria-label="Localizar peça"
              className="min-w-[200px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCancel}
              disabled={!dirty || saving}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm hover:bg-white disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] hover:bg-[#B37D3F] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar ordem"}
            </button>
          </div>
          {dirty && (
            <p role="status" className="mb-2 text-sm text-[#B45309]">
              Alterações não salvas.
            </p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <Row
                    key={item.id}
                    item={item}
                    index={index}
                    last={index === items.length - 1}
                    highlighted={item.id === highlight}
                    onMove={(kind) => move(index, kind)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
