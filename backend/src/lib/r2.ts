import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env } from "./env";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const PRESIGNED_URL_TTL_SECONDS = 60 * 5; // 5 minutos para completar o upload

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME && env.R2_ENDPOINT
  );
}

interface PresignedUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

export async function createPresignedUpload(productId: string, fileName: string, contentType: string): Promise<PresignedUpload> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `products/${productId}/${randomUUID()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
  const publicUrl = `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;

  return { uploadUrl, key, publicUrl };
}

export async function deleteObject(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
}

export async function getObject(key: string): Promise<Buffer> {
  const response = await r2Client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType })
  );
  return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}
