import { describe, expect, it } from "vitest";
import { decideMarkSoldPauseAction } from "../src/lib/mercadoLivre/stockSync";

describe("decideMarkSoldPauseAction", () => {
  it("canal mercadolivre: nunca tenta pausar, mesmo com anúncio active", () => {
    expect(decideMarkSoldPauseAction("mercadolivre", "active")).toBe("not_applicable");
    expect(decideMarkSoldPauseAction("mercadolivre", "paused")).toBe("not_applicable");
    expect(decideMarkSoldPauseAction("mercadolivre", null)).toBe("not_applicable");
  });

  it("sem anúncio (listingStatus null): not_applicable para site/other", () => {
    expect(decideMarkSoldPauseAction("site", null)).toBe("not_applicable");
    expect(decideMarkSoldPauseAction("other", null)).toBe("not_applicable");
  });

  it("anúncio active: pause_needed para site/other", () => {
    expect(decideMarkSoldPauseAction("site", "active")).toBe("pause_needed");
    expect(decideMarkSoldPauseAction("other", "active")).toBe("pause_needed");
  });

  it("anúncio já paused: already_paused (idempotente, nunca chama a API de novo)", () => {
    expect(decideMarkSoldPauseAction("site", "paused")).toBe("already_paused");
    expect(decideMarkSoldPauseAction("other", "paused")).toBe("already_paused");
  });

  it.each(["publishing", "error", "closed"])(
    "anúncio em \"%s\": not_applicable — estado ambíguo/terminal demais pra mexer sozinho",
    (status) => {
      expect(decideMarkSoldPauseAction("site", status)).toBe("not_applicable");
    }
  );
});
