import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { computeDisplaySize, type Size } from "../lib/imageDisplay";
import { PHOTO_ASPECT_CSS } from "../lib/photoFormat";

// Único componente de foto de produto do site — a mesma regra vale no card
// (catálogo e destaques), no detalhe, no carrinho e no admin:
//  - "frame" (padrão): moldura 9:16 EM PÉ (reserva o espaço, sem salto de
//    layout); a foto fica INTEIRA dentro (contain), centralizada, sem cortar
//    nem esticar, e nunca é ampliada além de ~1,5x o tamanho original (ver
//    lib/imageDisplay.ts). Fotos novas já saem do servidor em 9:16 e preenchem
//    a moldura; fotos antigas em outra proporção ficam inteiras e o espaço que
//    sobra é preenchido pela própria foto desfocada e ampliada ao fundo.
//  - "thumb": miniatura 9:16 pequena (carrinho), também inteira (contain).
// Sem foto ou erro de carregamento mostram o mesmo placeholder.

const ASPECT_RATIO = PHOTO_ASPECT_CSS;

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  variant?: "frame" | "thumb";
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

function ProductImageInner({ src, alt, variant = "frame", priority = false, className = "" }: ProductImageProps) {
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
    const size = className || "w-12";
    if (!src || failed) {
      return <Placeholder label={noPhoto} className={`shrink-0 rounded-lg text-[10px] ${size}`} style={{ aspectRatio: ASPECT_RATIO }} />;
    }
    return (
      <div className={`shrink-0 overflow-hidden rounded-lg bg-[#E2E8F0] ${size}`} style={{ aspectRatio: ASPECT_RATIO }}>
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  const aspectRatio = ASPECT_RATIO;
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
