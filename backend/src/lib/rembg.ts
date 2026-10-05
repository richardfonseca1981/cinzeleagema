import { HttpError } from "../middleware/errorHandler";
import { env } from "./env";

export function isRembgConfigured(): boolean {
  return Boolean(env.REMBG_SERVICE_URL);
}

export interface RemoveBackgroundOptions {
  // Aborta a chamada se o serviço não responder a tempo (sem timeout, um
  // rembg travado seguraria a requisição/o script em lote indefinidamente).
  timeoutMs?: number;
}

export async function removeBackground(buffer: Buffer, options: RemoveBackgroundOptions = {}): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(`${env.REMBG_SERVICE_URL.replace(/\/$/, "")}/remove-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(env.REMBG_SERVICE_SECRET ? { "X-Internal-Secret": env.REMBG_SERVICE_SECRET } : {}),
      },
      body: buffer,
      ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
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
