import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { prisma } from "../lib/prisma";

// Prefixo único usado no R2 para fotos de produto e previews de tratamento:
// products/{productId}/...
const R2_PREFIX = "products/";

// Uso:
//   Simulação (não apaga nada):  node dist/scripts/wipeProductData.js
//   Apagar de verdade:           node dist/scripts/wipeProductData.js --confirm

function describeDatabase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    // Sem usuário e senha, só host, porta e nome do banco
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "(DATABASE_URL ausente ou inválida)";
  }
}

function buildR2Client(): { client: S3Client; bucket: string } | null {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } =
    process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return null;
  }
  const client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return { client, bucket: R2_BUCKET_NAME };
}

async function listAllKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: R2_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function deleteKeys(
  client: S3Client,
  bucket: string,
  keys: string[],
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    const failed = res.Errors?.length ?? 0;
    if (failed > 0) {
      console.error(`Aviso: ${failed} objeto(s) não puderam ser apagados neste lote.`);
    }
    deleted += batch.length - failed;
  }
  return deleted;
}

async function countAll() {
  const [products, images, admins, categories, subcategories] = await Promise.all([
    prisma.product.count(),
    prisma.productImage.count(),
    prisma.adminUser.count(),
    prisma.category.count(),
    prisma.subcategory.count(),
  ]);
  return { products, images, admins, categories, subcategories };
}

async function main() {
  const confirm = process.argv.includes("--confirm");

  console.log(`Banco: ${describeDatabase()}`);
  console.log(`Modo: ${confirm ? "APAGAR DE VERDADE (--confirm)" : "SIMULAÇÃO (nada será apagado)"}`);

  const before = await countAll();

  const r2 = buildR2Client();
  let keys: string[] = [];
  if (r2) {
    keys = await listAllKeys(r2.client, r2.bucket);
  } else {
    console.warn("Aviso: variáveis R2_* ausentes, não foi possível contar objetos no R2.");
    if (confirm) {
      throw new Error("Variáveis R2_* ausentes: abortando para não deixar arquivos órfãos sem querer.");
    }
  }

  console.log("\nSerá apagado:");
  console.log(`  Product:        ${before.products}`);
  console.log(`  ProductImage:   ${before.images}`);
  console.log(`  Objetos no R2 (prefixo "${R2_PREFIX}"): ${keys.length}`);
  console.log("\nSerá mantido:");
  console.log(`  AdminUser:      ${before.admins}`);
  console.log(`  Category:       ${before.categories}`);
  console.log(`  Subcategory:    ${before.subcategories}`);

  if (!confirm) {
    console.log("\nNada foi apagado. Rode com --confirm para apagar de verdade.");
    return;
  }

  // 1) Banco primeiro, em transação. Se falhar, o R2 não é tocado.
  await prisma.$transaction([
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
  ]);
  console.log("\nBanco: produtos e fotos apagados.");

  // 2) Só depois o R2
  if (r2) {
    const deleted = await deleteKeys(r2.client, r2.bucket, keys);
    console.log(`R2: ${deleted} de ${keys.length} objeto(s) apagados.`);
  }

  const after = await countAll();
  console.log("\nContagens finais:");
  console.log(`  Product:        ${after.products}`);
  console.log(`  ProductImage:   ${after.images}`);
  console.log(`  AdminUser:      ${after.admins} (antes: ${before.admins})`);
  console.log(`  Category:       ${after.categories} (antes: ${before.categories})`);
  console.log(`  Subcategory:    ${after.subcategories} (antes: ${before.subcategories})`);
}

main()
  .catch((err) => {
    console.error("Erro:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
