import { afterEach, describe, expect, it, vi } from "vitest";
import { initAnalytics, isAdminPath, shouldLoadAnalytics, trackEvent, trackPageView } from "./analytics";

afterEach(() => {
  delete window.gtag;
  delete window.dataLayer;
  vi.restoreAllMocks();
});

describe("isAdminPath", () => {
  it("reconhece /admin e /login (e suas subrotas) como admin", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/produtos")).toBe(true);
    expect(isAdminPath("/admin/produtos/123")).toBe(true);
    expect(isAdminPath("/login")).toBe(true);
  });

  it("não confunde rota pública com prefixo parecido (ex.: /administracao)", () => {
    expect(isAdminPath("/administracao")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/catalogo")).toBe(false);
    expect(isAdminPath("/catalogo/alguma-peca-abc123")).toBe(false);
  });
});

describe("shouldLoadAnalytics", () => {
  it("só é true com produção E measurementId presentes", () => {
    expect(shouldLoadAnalytics({ prod: true, measurementId: "G-ABC123" })).toBe(true);
    expect(shouldLoadAnalytics({ prod: false, measurementId: "G-ABC123" })).toBe(false);
    expect(shouldLoadAnalytics({ prod: true, measurementId: undefined })).toBe(false);
    expect(shouldLoadAnalytics({ prod: true, measurementId: "" })).toBe(false);
    expect(shouldLoadAnalytics({ prod: false, measurementId: undefined })).toBe(false);
  });
});

describe("initAnalytics — ambiente real de teste (nunca deve carregar)", () => {
  it("não injeta o script nem define window.gtag quando import.meta.env.PROD é false", () => {
    // Vitest roda com PROD=false (igual a `vite dev`) — mesma regra real que
    // protege dev/test, sem precisar mockar import.meta.env.
    expect(import.meta.env.PROD).toBe(false);

    initAnalytics();

    expect(window.gtag).toBeUndefined();
    expect(document.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
  });
});

describe("trackPageView / trackEvent — nunca disparam para rota admin", () => {
  it("trackPageView ignora /admin mesmo com gtag carregado", () => {
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;

    trackPageView("/admin/produtos", "");
    expect(gtagSpy).not.toHaveBeenCalled();

    trackPageView("/catalogo", "");
    expect(gtagSpy).toHaveBeenCalledWith("event", "page_view", expect.objectContaining({ page_path: "/catalogo" }));
  });

  it("trackEvent ignora quando a rota ATUAL (window.location) é admin", () => {
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, pathname: "/admin/produtos" });

    trackEvent("whatsapp_click", { origin: "floating_button" });
    expect(gtagSpy).not.toHaveBeenCalled();
  });

  it("trackPageView/trackEvent não quebram quando gtag ainda não existe (script não carregado)", () => {
    expect(() => trackPageView("/catalogo", "")).not.toThrow();
    expect(() => trackEvent("search", { search_term: "ametista" })).not.toThrow();
  });
});
