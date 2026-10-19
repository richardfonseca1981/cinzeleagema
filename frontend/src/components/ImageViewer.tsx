import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { GalleryItem } from "../lib/gallery";
import { computeDisplaySize } from "../lib/imageDisplay";
import {
  clampOffset,
  clampScale,
  isHorizontalSwipe,
  MAX_SCALE,
  maxScaleForImage,
  MIN_SCALE,
  pinchDistance,
  pinchMidpoint,
  toggleDoubleTapScale,
  wheelZoomDelta,
  zoomAtPoint,
  type Point,
  type Size,
} from "../lib/zoom";
import { CloseIcon, RefreshIcon } from "./landing/icons";

interface ImageViewerProps {
  items: GalleryItem[];
  initialIndex: number;
  name: string;
  onClose: () => void;
}

// Janela de tempo e distância para reconhecer duplo toque/clique (mesmo
// mecanismo de Pointer Events serve mouse e touch).
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
const SWIPE_MIN_DISTANCE_PX = 50;
const MOVE_THRESHOLD_PX = 4;
const ZOOM_BUTTON_STEP = 1.4;
const DOUBLE_TAP_SCALE_CAP = 2.5;

type GestureMode = "pan" | "pinch" | "swipe";

interface GestureState {
  mode: GestureMode;
  startOffset: Point;
  startScale: number;
  startDistance: number;
  startMidpoint: Point;
  startPoint: Point;
  swipeDx: number;
  swipeDy: number;
}

export function ImageViewer({ items, initialIndex, name, onClose }: ImageViewerProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 });

  const dialogRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<GestureState | null>(null);
  const lastTapRef = useRef<{ time: number; point: Point } | null>(null);
  const movedRef = useRef(false);

  const total = items.length;
  const item = items[index];
  const zoomed = scale > MIN_SCALE + 0.01;

  const prefersReducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Tamanho em que a foto aparece sem zoom extra (object-contain, sem limite
  // de ampliação — aqui queremos preencher a tela o quanto couber, diferente
  // da moldura 9:16 do card/detalhe).
  const baseSize = useMemo(() => {
    if (!naturalSize || viewportSize.width <= 0 || viewportSize.height <= 0) return null;
    return computeDisplaySize(naturalSize, viewportSize, Infinity);
  }, [naturalSize, viewportSize]);

  // Teto de zoom "com qualidade aceitável": nunca passar da resolução nativa
  // da foto, mesmo que o limite técnico (4x) permita mais.
  const maxScale = naturalSize && baseSize ? maxScaleForImage(naturalSize.width, baseSize.width, MAX_SCALE) : MAX_SCALE;
  const doubleTapScale = Math.min(DOUBLE_TAP_SCALE_CAP, maxScale);

  // Bloqueia o scroll do body enquanto o visualizador está aberto e devolve
  // o foco a quem o abriu ao fechar.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // O botão Voltar do navegador/celular fecha o visualizador em vez de saber
  // da página: empilha um estado de histórico ao abrir; qualquer forma de
  // fechar (×, Esc, fundo) passa por requestClose(), que só pede history.back()
  // — o fechamento de fato só acontece aqui, na resposta ao popstate.
  useEffect(() => {
    window.history.pushState({ imageViewer: true }, "");
    const handlePopState = () => onClose();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

  function requestClose() {
    window.history.back();
  }

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A foto pode já estar em cache (onLoad não dispara depois do render).
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true);
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  }, [item?.id]);

  function resetZoom() {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }

  function goTo(next: number) {
    if (total <= 0) return;
    const target = Math.min(total - 1, Math.max(0, next));
    if (target === index) return;
    setIndex(target);
    setLoaded(false);
    setErrored(false);
    setNaturalSize(null);
    resetZoom();
  }

  function centerPoint(clientX: number, clientY: number): Point {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  function applyZoom(nextScale: number, point: Point, fromScale: number, fromOffset: Point) {
    const clampedScale = clampScale(nextScale, MIN_SCALE, maxScale);
    const nextOffset = clampOffset(zoomAtPoint(point, fromOffset, fromScale, clampedScale), clampedScale, viewportSize);
    setScale(clampedScale);
    setOffset(nextOffset);
  }

  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const point = centerPoint(e.clientX, e.clientY);
    const next = wheelZoomDelta(e.deltaY, scale, maxScale);
    applyZoom(next, point, scale, offset);
  }

  function handleZoomOut() {
    applyZoom(scale / ZOOM_BUTTON_STEP, { x: 0, y: 0 }, scale, offset);
  }

  function handleZoomIn() {
    applyZoom(scale * ZOOM_BUTTON_STEP, { x: 0, y: 0 }, scale, offset);
  }

  function registerTapAndMaybeToggleZoom(point: Point): boolean {
    const now = Date.now();
    const last = lastTapRef.current;
    lastTapRef.current = { time: now, point };
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(point.x - last.point.x, point.y - last.point.y) < DOUBLE_TAP_SLOP_PX) {
      lastTapRef.current = null;
      const centered = centerPoint(point.x, point.y);
      const nextScale = toggleDoubleTapScale(scale, doubleTapScale);
      applyZoom(nextScale, centered, scale, offset);
      return true;
    }
    return false;
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ambiente sem suporte a pointer capture (ex.: jsdom) — gestos ainda
      // funcionam, só não "seguram" o pointer se ele sair do elemento.
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      gestureRef.current = {
        mode: "pinch",
        startOffset: offset,
        startScale: scale,
        startDistance: pinchDistance(a, b),
        startMidpoint: pinchMidpoint(a, b),
        startPoint: { x: 0, y: 0 },
        swipeDx: 0,
        swipeDy: 0,
      };
      return;
    }

    if (pointersRef.current.size === 1) {
      movedRef.current = false;
      setDragging(true);
      gestureRef.current = {
        mode: zoomed ? "pan" : "swipe",
        startOffset: offset,
        startScale: scale,
        startDistance: 0,
        startMidpoint: { x: 0, y: 0 },
        startPoint: { x: e.clientX, y: e.clientY },
        swipeDx: 0,
        swipeDy: 0,
      };

      if (registerTapAndMaybeToggleZoom({ x: e.clientX, y: e.clientY })) {
        gestureRef.current = null;
        setDragging(false);
      }
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pinch" && pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      if (gesture.startDistance <= 0) return;
      const distance = pinchDistance(a, b);
      const nextScale = clampScale((gesture.startScale * distance) / gesture.startDistance, MIN_SCALE, maxScale);
      const point = centerPoint(gesture.startMidpoint.x, gesture.startMidpoint.y);
      const nextOffset = clampOffset(zoomAtPoint(point, gesture.startOffset, gesture.startScale, nextScale), nextScale, viewportSize);
      setScale(nextScale);
      setOffset(nextOffset);
      return;
    }

    if (gesture.mode === "pan") {
      const dx = e.clientX - gesture.startPoint.x;
      const dy = e.clientY - gesture.startPoint.y;
      if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) movedRef.current = true;
      setOffset(clampOffset({ x: gesture.startOffset.x + dx, y: gesture.startOffset.y + dy }, scale, viewportSize));
      return;
    }

    if (gesture.mode === "swipe" && e.pointerType === "touch") {
      gesture.swipeDx = e.clientX - gesture.startPoint.x;
      gesture.swipeDy = e.clientY - gesture.startPoint.y;
      if (Math.abs(gesture.swipeDx) > MOVE_THRESHOLD_PX || Math.abs(gesture.swipeDy) > MOVE_THRESHOLD_PX) movedRef.current = true;
    }
  }

  function endGesture(e: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    const gesture = gestureRef.current;
    setDragging(false);

    if (gesture?.mode === "swipe" && isHorizontalSwipe(gesture.swipeDx, gesture.swipeDy, SWIPE_MIN_DISTANCE_PX)) {
      goTo(gesture.swipeDx > 0 ? index - 1 : index + 1);
    }

    if (pointersRef.current.size === 0) gestureRef.current = null;
  }

  function handleContainerClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    if (e.target !== e.currentTarget) return;
    if (zoomed) return;
    const img = imgRef.current;
    if (img) {
      const rect = img.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inside) return;
    }
    requestClose();
  }

  function focusableElements(): HTMLElement[] {
    const root = dialogRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute("disabled")
    );
  }

  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    const elements = focusableElements();
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
      return;
    }
    if (e.key === "Tab") trapFocus(e);
  }

  if (!item) return null;

  const transitionClass = prefersReducedMotion || dragging ? "" : "transition-transform duration-150";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("imageViewer.dialogLabel", { name })}
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-black/95"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span
          aria-live="polite"
          aria-label={t("imageViewer.counterLabel", { n: index + 1, total })}
          className="rounded-full bg-black/40 px-3 py-1 text-sm font-medium"
        >
          {t("gallery.counter", { n: index + 1, total })}
        </span>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={requestClose}
          aria-label={t("imageViewer.close")}
          className="rounded-full p-2 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <CloseIcon className="h-7 w-7" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: zoomed ? "grab" : "zoom-in" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClick={handleContainerClick}
      >
        {item.type === "image" && (
          <img
            key={item.id}
            ref={imgRef}
            src={item.url}
            alt={t("gallery.photoAlt", { name, n: index + 1, total })}
            onLoad={(e) => {
              setLoaded(true);
              setNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
            }}
            onError={() => setErrored(true)}
            draggable={false}
            className={`absolute inset-0 m-auto max-h-full max-w-full ${transitionClass} ${loaded && !errored ? "opacity-100" : "opacity-0"}`}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          />
        )}

        {!loaded && !errored && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {errored && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">
            {t("productCard.noPhoto")}
          </div>
        )}

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label={t("gallery.previous")}
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-white disabled:opacity-30 sm:block"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index === total - 1}
              aria-label={t("gallery.next")}
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-white disabled:opacity-30 sm:block"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 px-4 py-3 text-white">
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label={t("imageViewer.zoomOutButton")}
          className="rounded-full bg-white/10 px-3 py-2 text-lg hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetZoom}
          aria-label={t("imageViewer.zoomReset")}
          className="rounded-full bg-white/10 p-2 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <RefreshIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label={t("imageViewer.zoomInButton")}
          className="rounded-full bg-white/10 px-3 py-2 text-lg hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          +
        </button>
      </div>
    </div>
  );
}
