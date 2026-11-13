import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Landing } from "./Landing";
import "../i18n";

// Só a SEO da página importa aqui — os demais blocos da landing têm suas
// próprias dependências (API, env vars) e já são cobertos em seus próprios
// testes; aqui eles só precisam não quebrar a montagem.
vi.mock("../components/landing/About", () => ({ About: () => null }));
vi.mock("../components/landing/Blog", () => ({ Blog: () => null }));
vi.mock("../components/landing/Certification", () => ({ Certification: () => null }));
vi.mock("../components/landing/Faq", () => ({ Faq: () => null }));
vi.mock("../components/landing/FeaturedProducts", () => ({ FeaturedProducts: () => null }));
vi.mock("../components/landing/Footer", () => ({ Footer: () => null }));
vi.mock("../components/landing/Hero", () => ({ Hero: () => null }));
vi.mock("../components/landing/PublicHeader", () => ({ PublicHeader: () => null }));
vi.mock("../components/landing/QualityPolicyModal", () => ({ QualityPolicyModal: () => null }));
vi.mock("../components/landing/TrustBanner", () => ({ TrustBanner: () => null }));
vi.mock("../components/landing/WhatsAppFloatingButton", () => ({ WhatsAppFloatingButton: () => null }));

afterEach(() => cleanup());

describe("Landing — SEO", () => {
  it("define title, description e canonical próprios da home ('/'), sem afirmar nada sobre cor/tratamento", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Landing />
      </MemoryRouter>
    );

    expect(document.title).toBe("Cinzel e a Gema — Pedras Preciosas");

    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    expect(description).toContain("curadoria e comercialização de pedras preciosas");
    expect(description.toLowerCase()).not.toContain("cor");
    expect(description.toLowerCase()).not.toContain("tratamento");

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://www.cinzeleagema.com.br/"
    );
  });
});
