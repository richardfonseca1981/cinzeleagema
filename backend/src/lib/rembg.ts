import { HttpError } from "../middleware/errorHandler";
import { env } from "./env";

export function isRembgConfigured(): boolean {
  return Boolean(env.REMBG_SERVICE_URL);
}

export async function removeBackground(buffer: Buffer): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(`${env.REMBG_SERVICE_URL.replace(/\/$/, "")}/remove-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(env.REMBG_SERVICE_SECRET ? { "X-Internal-Secret": env.REMBG_SERVICE_SECRET } : {}),
      },
      body: buffer,
    });
  } catch {
    throw new HttpError(502, "Serviço de remoção de fundo indisponível");
  }

  if (!response.ok) {
    throw new HttpError(502, "Serviço de remoção de fundo indisponível");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
