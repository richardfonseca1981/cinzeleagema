import sharp from "sharp";
import { getObject } from "./r2";

// Dimensões (px) de uma foto já gravada no R2, para o indicador "9:16" do
// admin. Nunca falha: devolve nulls quando não consegue ler (foto some do
// contador como "a trocar" em vez de quebrar o fluxo).
export async function readStoredPhotoSize(key: string): Promise<{ width: number | null; height: number | null }> {
  try {
    const meta = await sharp(await getObject(key)).metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    return width && height ? { width, height } : { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}
