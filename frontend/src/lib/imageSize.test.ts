import { describe, expect, it } from "vitest";
import { MIN_SIDE_WARNING_PX, RECOMMENDED_LONG_SIDE_PX, smallImageWarning } from "./imageSize";

describe("smallImageWarning", () => {
  it("avisa quando o menor lado está abaixo do limite, com as dimensões no texto", () => {
    expect(smallImageWarning(600, 450)).toBe(
      "Foto pequena (600×450 px). Recomendado: pelo menos 1200 px no lado maior. Ela pode ficar sem nitidez no site."
    );
  });

  it("avisa por causa do menor lado mesmo que o maior seja grande (panorâmica 3000×300)", () => {
    expect(smallImageWarning(3000, 300)).not.toBeNull();
  });

  it("não avisa quando o menor lado é exatamente o limite", () => {
    expect(smallImageWarning(MIN_SIDE_WARNING_PX, 1200)).toBeNull();
  });

  it("avisa com 1 px a menos que o limite", () => {
    expect(smallImageWarning(MIN_SIDE_WARNING_PX - 1, 1200)).not.toBeNull();
  });

  it("não avisa para fotos grandes", () => {
    expect(smallImageWarning(1600, 1200)).toBeNull();
    expect(smallImageWarning(RECOMMENDED_LONG_SIDE_PX, RECOMMENDED_LONG_SIDE_PX)).toBeNull();
  });

  it("não avisa para dimensões inválidas (ainda não medidas)", () => {
    expect(smallImageWarning(0, 0)).toBeNull();
    expect(smallImageWarning(NaN, 500)).toBeNull();
  });
});
