import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { autoFitSubject, describeAutoFit } from "../src/lib/autoFit";

// Foto 720×1280 em 9:16 com a peça pequena num canto: antes o autoFit recortava
// e aproximava. Agora a foto passa intacta e o rembg nem é chamado.
describe("autoFit em foto 9:16", () => {
  it("não recorta nem aproxima: devolve os mesmos bytes, sem chamar o rembg", async () => {
    const stone = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 20, b: 20 } } }).png().toBuffer();
    const photo = await sharp({ create: { width: 720, height: 1280, channels: 3, background: { r: 230, g: 230, b: 230 } } })
      .composite([{ input: stone, left: 500, top: 100 }])
      .jpeg()
      .toBuffer();
    const removeBackground = vi.fn();

    const result = await autoFitSubject(photo, { removeBackground });

    expect(result.action).toBe("unchanged");
    expect(result.reason).toBe("portrait_9x16");
    expect(result.buffer.equals(photo)).toBe(true);
    expect(removeBackground).not.toHaveBeenCalled();
    expect(describeAutoFit(result)).toMatch(/9:16/);
  });

  it("respeita a orientação EXIF ao decidir (gravada deitada, exibida em pé)", async () => {
    const photo = await sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 230, g: 230, b: 230 } } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await autoFitSubject(photo, { removeBackground: vi.fn() });
    expect(result.reason).toBe("portrait_9x16");
  });
});
