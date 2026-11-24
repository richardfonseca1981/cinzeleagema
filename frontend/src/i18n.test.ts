import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import i18n, { setLanguage } from "./i18n";
import { trackEvent } from "./lib/analytics";

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("setLanguage", () => {
  it("troca o idioma do i18next e dispara language_change", () => {
    setLanguage("en");
    expect(i18n.language).toBe("en");
    expect(trackEvent).toHaveBeenCalledWith("language_change", { language: "en" });
  });

  it("persiste a escolha em localStorage", () => {
    setLanguage("pt-BR");
    expect(localStorage.getItem("cinzeleagema_locale")).toBe("pt-BR");
  });
});
