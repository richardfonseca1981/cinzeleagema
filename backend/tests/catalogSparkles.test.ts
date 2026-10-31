import { describe, expect, it } from "vitest";
import { generateSparkles } from "../src/lib/catalog/sparkles";
import { SPARKLE_COUNT } from "../src/lib/catalog/layout";

describe("generateSparkles", () => {
  it("gera sempre o mesmo padrão para a mesma semente (determinístico entre gerações)", () => {
    expect(generateSparkles("peca-123")).toEqual(generateSparkles("peca-123"));
  });

  it("sementes diferentes geram padrões diferentes", () => {
    expect(generateSparkles("peca-123")).not.toEqual(generateSparkles("peca-456"));
  });

  it("gera a quantidade de brilhos configurada, todos dentro de [0,1] e com raio/opacidade positivos", () => {
    const sparkles = generateSparkles("peca-abc");
    expect(sparkles).toHaveLength(SPARKLE_COUNT);
    for (const s of sparkles) {
      expect(s.xFraction).toBeGreaterThanOrEqual(0);
      expect(s.xFraction).toBeLessThanOrEqual(1);
      expect(s.yFraction).toBeGreaterThanOrEqual(0);
      expect(s.yFraction).toBeLessThanOrEqual(1);
      expect(s.radius).toBeGreaterThan(0);
      expect(s.opacity).toBeGreaterThan(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
    }
  });
});
