import { describe, expect, it } from "vitest";
import { canConfirmDelete, deleteConfirmTarget } from "./productDelete";

describe("confirmação de exclusão da peça", () => {
  it("usa o SKU; sem SKU, usa o nome", () => {
    expect(deleteConfirmTarget({ sku: " ABC-1 ", name: "Quartzo" })).toEqual({ label: "SKU", value: "ABC-1" });
    expect(deleteConfirmTarget({ sku: null, name: "Quartzo" })).toEqual({ label: "nome", value: "Quartzo" });
    expect(deleteConfirmTarget({ sku: "  ", name: "Quartzo" })).toEqual({ label: "nome", value: "Quartzo" });
  });
  it("só habilita quando o texto digitado coincide exatamente", () => {
    const target = { value: "ABC-1" };
    expect(canConfirmDelete("", target)).toBe(false);
    expect(canConfirmDelete("abc-1", target)).toBe(false);
    expect(canConfirmDelete("ABC-", target)).toBe(false);
    expect(canConfirmDelete("ABC-1", target)).toBe(true);
    expect(canConfirmDelete(" ABC-1 ", target)).toBe(true);
    expect(canConfirmDelete("", { value: "" })).toBe(false);
  });
});
