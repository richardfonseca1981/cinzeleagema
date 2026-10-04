import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { computeDisplaySize, type Size } from "../lib/imageDisplay";

// Único componente de foto de produto do site público — a mesma regra vale
// no card (catálogo e destaques), no detalhe e no carrinho:
//  - "frame" (padrão): moldura de proporção fixa; a foto fica INTEIRA dentro
//    (contain), centralizada, sem cortar nem esticar, e nunca é ampliada além
//    de ~1,5x o tamanho original (ver lib/imageDisplay.ts). O espaço que
//    sobra é preenchido pela própria foto desfocada e ampliada ao fundo.
//  - "thumb": miniatura quadrada pequena (carrinho), com object-cover.
// Sem foto ou erro de carregamento mostram o mesmo placeholder.

export type ProductImageRatio = "4:3" | "1:1";

const ASPECT_RATIO: Record<ProductImageRatio, string> = { "4:3": "4 / 3", "1:1": "1 / 1" };

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  variant?: "frame" | "thumb";
  ratio?: ProductImageRatio;
  // Primeiras imagens visíveis da página: carregam sem lazy.
  priority?: boolean;
  className?: string;
}

function Placeholder({ label, className, style }: { label: string; className: string; style?: React.CSSProperties }) {
  return (
    <div className={`flex items-center justify-center bg-[#F1F5F9] text-center text-[#94A3B8] ${className}`} style={style}>
      {label}
    </div>
  );
}

export function ProductImage(props: ProductImageProps) {
  // key={src}: trocou a foto, o estado (medidas/erro) recomeça do zero.
  return <ProductImageInner key={props.src ?? "none"} {...props} />;
}

function ProductImageInner({ src, alt, variant = "frame", ratio = "4:3", priority = false, className = "" }: ProductImageProps) {
  const { t } = useTranslation();
  const noPhoto = t("productCard.noPhoto");
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<Size | null>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const loading = priority ? "eager" : "lazy";

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [src, failed]);

  // A foto pode já estar em cache (onLoad não dispara depois do render).
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
  }, [src, failed]);

  if (variant === "thumb") {
    const size = className || "h-16 w-16";
    if (!src || failed) return <Placeholder label={noPhoto} className={`rounded-lg text-xs ${size}`} />;
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={() => setFailed(true)}
        className={`rounded-lg object-cover ${size}`}
      />
    );
  }

  const aspectRatio = ASPECT_RATIO[ratio];
  if (!src || failed) {
    return <Placeholder label={noPhoto} className={`w-full text-sm ${className}`} style={{ aspectRatio }} />;
  }

  const display = natural && frame ? computeDisplaySize(natural, frame) : null;

  return (
    <div ref={frameRef} className={`relative w-full overflow-hidden bg-[#E2E8F0] ${className}`} style={{ aspectRatio }}>
      {/* Fundo: a mesma foto (mesma URL, baixada uma vez) desfocada e ampliada. */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading={loading}
        decoding="async"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.15] object-cover opacity-50 blur-2xl"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          onError={() => setFailed(true)}
          className={`relative object-contain transition-opacity duration-200 ${display ? "opacity-100" : "opacity-0"}`}
          style={display ? { width: display.width, height: display.height } : { width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
