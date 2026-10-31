import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { HttpError } from "../../middleware/errorHandler";
import { generateCatalogPdf, type CatalogWarning, type SkippedProduct } from "./generateCatalogPdf";
import type { CatalogPhotoQuality } from "./photoLayer";
import type { CatalogLanguage } from "./content";
import type { ExchangeRateSource } from "../exchangeRate";

// Geração de catálogo em segundo plano (Etapa B): o catálogo completo leva
// ~1 min, mais do que o limite de requisição do Railway/Vercel — o POST
// retorna o id na hora (202) e o admin consulta o progresso por polling (ver
// routes/catalogJob.routes.ts). Estado em memória (Map): simples e
// suficiente para "só um admin gerando catálogo por vez" — não sobrevive a
// um restart do processo, o que é aceitável aqui (o admin tenta de novo).
const JOB_TTL_MS = 30 * 60 * 1000;

export type CatalogJobStatus = "queued" | "running" | "done" | "error";

export interface CatalogJobInput {
  productIds?: string[];
  language: CatalogLanguage;
  showPrice: boolean;
  showRef: boolean;
  includeCategoryDividers?: boolean;
  includeContactPage: boolean;
  quality: CatalogPhotoQuality;
}

interface CatalogJobRecord {
  id: string;
  status: CatalogJobStatus;
  progress: { done: number; total: number };
  pageCount: number | null;
  sizeBytes: number | null;
  skipped: SkippedProduct[];
  warnings: CatalogWarning[];
  rate: number | null;
  rateSource: ExchangeRateSource | null;
  rateUpdatedAt: string | null;
  error: string | null;
  filePath: string | null;
  language: CatalogLanguage;
  ttlTimer: ReturnType<typeof setTimeout> | null;
}

export interface CatalogJobStatusView {
  id: string;
  status: CatalogJobStatus;
  progress: { done: number; total: number };
  pageCount: number | null;
  sizeBytes: number | null;
  skipped: SkippedProduct[];
  warnings: CatalogWarning[];
  rate: number | null;
  rateSource: ExchangeRateSource | null;
  rateUpdatedAt: string | null;
  error: string | null;
}

const jobs = new Map<string, CatalogJobRecord>();

function hasActiveJob(): boolean {
  for (const job of jobs.values()) {
    if (job.status === "queued" || job.status === "running") return true;
  }
  return false;
}

async function cleanupJob(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  if (job.filePath) await fs.unlink(job.filePath).catch(() => {});
}

function scheduleCleanup(job: CatalogJobRecord): void {
  const timer = setTimeout(() => {
    void cleanupJob(job.id);
  }, JOB_TTL_MS);
  // Não mantém o processo vivo só por causa deste timer (relevante em testes
  // e em scripts de linha de comando que usam este módulo).
  timer.unref?.();
  job.ttlTimer = timer;
}

// Só leitura de peças/fotos — gerar o PDF nunca altera produto nem imagem
// (ver generateCatalogPdf.ts). Só uma geração por vez: evita o servidor
// tentando processar duas corridas de fotos concorrentes (R2 + sharp) e
// dois PDFs grandes em memória ao mesmo tempo.
export function startCatalogJob(input: CatalogJobInput): { id: string } {
  if (hasActiveJob()) {
    throw new HttpError(409, "Já existe uma geração de catálogo em andamento. Aguarde terminar antes de iniciar outra.");
  }

  const id = randomUUID();
  const record: CatalogJobRecord = {
    id,
    status: "queued",
    progress: { done: 0, total: 0 },
    pageCount: null,
    sizeBytes: null,
    skipped: [],
    warnings: [],
    rate: null,
    rateSource: null,
    rateUpdatedAt: null,
    error: null,
    filePath: null,
    language: input.language,
    ttlTimer: null,
  };
  jobs.set(id, record);

  void runCatalogJob(record, input);

  return { id };
}

async function runCatalogJob(record: CatalogJobRecord, input: CatalogJobInput): Promise<void> {
  record.status = "running";
  try {
    const result = await generateCatalogPdf({
      productIds: input.productIds,
      language: input.language,
      showPrice: input.showPrice,
      showRef: input.showRef,
      includeCategoryDividers: input.includeCategoryDividers,
      includeContactPage: input.includeContactPage,
      quality: input.quality,
      onProgress: (done, total) => {
        record.progress = { done, total };
      },
    });

    const filePath = path.join(os.tmpdir(), `catalogo-cinzel-job-${record.id}.pdf`);
    await fs.writeFile(filePath, result.buffer);

    record.pageCount = result.pageCount;
    record.sizeBytes = result.buffer.length;
    record.skipped = result.skipped;
    record.warnings = result.warnings;
    record.rate = result.rate;
    record.rateSource = result.rateSource;
    record.rateUpdatedAt = result.rateUpdatedAt ? result.rateUpdatedAt.toISOString() : null;
    record.filePath = filePath;
    record.status = "done";
  } catch (err) {
    record.status = "error";
    record.error = err instanceof Error ? err.message : "Falha desconhecida ao gerar o catálogo";
  } finally {
    scheduleCleanup(record);
  }
}

export function getCatalogJobStatus(id: string): CatalogJobStatusView | null {
  const job = jobs.get(id);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    pageCount: job.pageCount,
    sizeBytes: job.sizeBytes,
    skipped: job.skipped,
    warnings: job.warnings,
    rate: job.rate,
    rateSource: job.rateSource,
    rateUpdatedAt: job.rateUpdatedAt,
    error: job.error,
  };
}

// null quando o job não existe, ainda não terminou, ou terminou com erro —
// o chamador (rota de download) trata tudo isso como 404/409 (ver routes).
export function getCatalogJobFile(id: string): { filePath: string; language: CatalogLanguage } | null {
  const job = jobs.get(id);
  if (!job || job.status !== "done" || !job.filePath) return null;
  return { filePath: job.filePath, language: job.language };
}

// Exposto só para os testes: limpa o estado do módulo (singleton `jobs`)
// entre casos, cancelando timers de TTL pendentes (mesmo padrão de
// __resetExchangeRateCacheForTests em lib/exchangeRate.ts).
export function __resetCatalogJobsForTests(): void {
  for (const job of jobs.values()) {
    if (job.ttlTimer) clearTimeout(job.ttlTimer);
  }
  jobs.clear();
}

// Exposto só para os testes: dispara a mesma limpeza que o timer de TTL real
// chamaria 30 min depois — não dá pra esperar 30 min de verdade num teste.
export function __forceExpireCatalogJobForTests(id: string): Promise<void> {
  const job = jobs.get(id);
  if (job?.ttlTimer) clearTimeout(job.ttlTimer);
  return cleanupJob(id);
}
