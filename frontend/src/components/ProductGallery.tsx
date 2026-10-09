import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { clampIndex, indexFromScroll, showsControls, type GalleryItem } from "../lib/gallery";
import { PHOTO_ASPECT_CSS } from "../lib/photoFormat";
import { ProductImage } from "./ProductImage";

interface ProductGalleryProps {
  items: GalleryItem[];
  name: string;
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C78F50] focus-visible:ring-offset-2";

// Galeria da peça. Celular: carrossel com deslize horizontal (scroll-snap),
// pontos e contador "2/5". Desktop: foto principal (até 85vh), miniaturas e
// setas do teclado. Com 1 foto só aparece a foto. A primeira foto carrega com
// prioridade; as demais, lazy.
export function ProductGallery({ items, name }: ProductGalleryProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const count = items.length;
  const multiple = showsControls(count);

  // Se a lista mudar (outra peça), volta para a capa.
  useEffect(() => setIndex(0), [items]);

  const alt = (i: number) => t("gallery.photoAlt", { name, n: i + 1, total: count });

  const goTo = useCallback(
    (next: number) => {
      const target = clampIndex(next, count);
      setIndex(target);
      const scroller = scrollerRef.current;
      if (scroller && scroller.clientWidth > 0) scroller.scrollTo({ left: target * scroller.clientWidth, behavior: "smooth" });
    },
    [count]
  );

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (scroller) setIndex(indexFromScroll(scroller.scrollLeft, scroller.clientWidth, count));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    }
  }

  function renderItem(item: GalleryItem, i: number) {
    switch (item.type) {
      case "image":
        return (
          <ProductImage
            src={item.url}
            alt={alt(i)}
            priority={i === 0}
            className="rounded-xl border border-[#E2E8F0]"
          />
        );
      default:
        return null;
    }
  }

  if (count === 0) {
    return <ProductImage src={null} alt={name} className="rounded-xl border border-[#E2E8F0]" />;
  }

  if (!multiple) {
    return <div className="mx-auto w-full sm:max-w-[calc(85vh*9/16)]">{renderItem(items[0], 0)}</div>;
  }

  return (
    <div role="group" aria-roledescription="carousel" aria-label={t("gallery.region", { name })} onKeyDown={handleKeyDown}>
      {/* Celular: carrossel com scroll-snap */}
      <div className="relative sm:hidden">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => (
            <div key={item.id} className="w-full shrink-0 snap-center">
              {renderItem(item, i)}
            </div>
          ))}
        </div>
        <span
          className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white"
          aria-live="polite"
        >
          {t("gallery.counter", { n: index + 1, total: count })}
        </span>
        <div className="mt-3 flex justify-center gap-2">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t("gallery.goTo", { n: i + 1, total: count })}
              aria-current={i === index}
              className={`h-2.5 w-2.5 rounded-full ${focusRing} ${i === index ? "bg-[#C78F50]" : "bg-[#CBD5E1]"}`}
            />
          ))}
        </div>
      </div>

      {/* Desktop: foto principal + miniaturas + setas do teclado */}
      <div className="hidden sm:flex sm:gap-3">
        <div className="flex w-14 shrink-0 flex-col gap-2" role="group">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t("gallery.thumbnail", { n: i + 1, total: count })}
              aria-current={i === index}
              className={`overflow-hidden rounded-md border-2 ${focusRing} ${i === index ? "border-[#C78F50]" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {item.type === "image" && <ProductImage src={item.url} alt="" variant="thumb" className="w-full" />}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-[calc(85vh*9/16)]" style={{ aspectRatio: PHOTO_ASPECT_CSS }}>
          {/* tabIndex=0: a moldura recebe foco e responde às setas ← → */}
          <div tabIndex={0} className={`h-full w-full rounded-xl ${focusRing}`} aria-label={alt(index)}>
            {renderItem(items[index], index)}
          </div>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label={t("gallery.previous")}
            className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-white disabled:opacity-30 ${focusRing}`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === count - 1}
            aria-label={t("gallery.next")}
            className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-white disabled:opacity-30 ${focusRing}`}
          >
            ›
          </button>
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white">
            {t("gallery.counter", { n: index + 1, total: count })}
          </span>
        </div>
      </div>
    </div>
  );
}
