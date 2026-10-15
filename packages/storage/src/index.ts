import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

export type MediaKind = 'uploads' | 'outputs';
let singleton: S3Client | null | undefined;

function config() {
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.R2_ENDPOINT?.trim() || (process.env.CLOUDFLARE_ACCOUNT_ID ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return undefined;
  return { bucket, accessKeyId, secretAccessKey, endpoint };
}

export function hasPartialObjectStorageConfig() {
  const supplied = ['R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_ENDPOINT','CLOUDFLARE_ACCOUNT_ID'].some(name => Boolean(process.env[name]?.trim()));
  return supplied && !config();
}

function getClient(): { client: S3Client; bucket: string } | undefined {
  const cfg = config();
  if (!cfg) return undefined;
  if (!singleton) singleton = new S3Client({
    region: process.env.R2_REGION || 'auto', endpoint: cfg.endpoint, forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return { client: singleton, bucket: cfg.bucket };
}

export function isObjectStorageConfigured() { return Boolean(config()); }

function objectKey(kind: MediaKind, key: string) {
  if (!/^[-a-zA-Z0-9_.]{1,255}$/.test(key) || key === '.' || key === '..') throw new Error('Invalid storage object key');
  return `${kind}/${key}`;
}

export async function putMediaObject(kind: MediaKind, key: string, filePath: string, contentType: string): Promise<boolean> {
  const storage = getClient();
  if (!storage) return false;
  const info = await stat(filePath);
  await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket, Key: objectKey(kind, key), Body: createReadStream(filePath),
    ContentLength: info.size, ContentType: contentType,
  }));
  return true;
}

export async function restoreMediaObject(kind: MediaKind, key: string, targetPath: string): Promise<boolean> {
  const storage = getClient();
  if (!storage) return false;
  let response;
  try {
    response = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: objectKey(kind, key) }));
  } catch (error) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (candidate.name === 'NoSuchKey' || candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
  if (!response.Body) return false;
  await mkdir(dirname(targetPath), { recursive: true });
  try {
    await pipeline(response.Body as Readable, createWriteStream(targetPath, { flags: 'wx' }));
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return true; // Another request restored the same object first.
    await rm(targetPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
