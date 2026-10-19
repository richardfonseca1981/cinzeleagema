import "@testing-library/jest-dom/vitest";

// jsdom não implementa ResizeObserver. Até agora nenhum teste de componente
// renderizava uma foto de verdade (sempre images: []), então isso nunca
// apareceu; ProductImage e ImageViewer usam ResizeObserver para medir a
// moldura/viewport. Um stub basta — redimensionamento real não é testável em
// jsdom mesmo com um polyfill completo.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
