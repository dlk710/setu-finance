import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const DEFAULT_LOCAL_CONTRACT_DIR = path.join(process.cwd(), "server", "storage", "contracts");
let cachedS3Client = null;

function sanitizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getUploadedDateParts(uploadedAt) {
  const date = uploadedAt instanceof Date ? uploadedAt : new Date(uploadedAt || Date.now());
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    day: String(date.getUTCDate()).padStart(2, "0"),
    timestamp: date.toISOString().replace(/[:.]/g, "-"),
  };
}

function getContractStorageConfig() {
  const bucket = process.env.CONTRACTS_S3_BUCKET?.trim() || "";
  return {
    bucket: bucket || null,
    localDir: process.env.CONTRACTS_LOCAL_DIR?.trim() || DEFAULT_LOCAL_CONTRACT_DIR,
    prefix: sanitizePathSegment(process.env.CONTRACTS_S3_PREFIX?.trim() || "contracts"),
    region: process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "us-east-2",
  };
}

export function getContractStorageStatus() {
  const config = getContractStorageConfig();
  return {
    provider: config.bucket ? "s3" : "local",
    bucket: config.bucket,
    localDir: config.localDir,
    prefix: config.prefix,
  };
}

function getS3Client() {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  const { region } = getContractStorageConfig();
  cachedS3Client = new S3Client({ region });
  return cachedS3Client;
}

function buildStorageKey({ customerCode, ownerCategory = "", ownerCode = "", uploadedAt, fileName }) {
  const safeOwnerCategory = sanitizePathSegment(ownerCategory);
  const safeOwnerCode = sanitizePathSegment(ownerCode || customerCode || "unassigned");
  const safeFileName = sanitizePathSegment(fileName || "contract");
  const dateParts = getUploadedDateParts(uploadedAt);
  const keyParts = [
    ...(safeOwnerCategory ? [safeOwnerCategory] : []),
    safeOwnerCode,
    dateParts.year,
    dateParts.month,
    dateParts.day,
    `${dateParts.timestamp}-${safeFileName}`,
  ];
  return path.posix.join(...keyParts);
}

async function storeLocalContract({ storageKey, buffer }) {
  const { localDir } = getContractStorageConfig();
  const absolutePath = path.join(localDir, storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return {
    storageProvider: "local",
    storageKey,
  };
}

async function storeS3Contract({ storageKey, buffer, fileName, mimeType, ownerCategory = "" }) {
  const { bucket, prefix } = getContractStorageConfig();
  if (!bucket) {
    throw new Error("Contracts S3 bucket is not configured.");
  }

  const objectKey = path.posix.join(prefix, storageKey);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: mimeType || "application/octet-stream",
      ContentDisposition: `inline; filename="${fileName}"`,
      ServerSideEncryption: "AES256",
      Metadata: {
        "owner-category": ownerCategory || "client",
        "owner-code": storageKey.split("/").at(ownerCategory ? 1 : 0) || "unknown",
      },
    }),
  );

  return {
    storageProvider: "s3",
    storageKey: objectKey,
  };
}

export async function storeContractBinary({
  customerCode,
  ownerCategory = "",
  ownerCode = "",
  fileName,
  mimeType,
  buffer,
  uploadedAt,
}) {
  const storageKey = buildStorageKey({ customerCode, ownerCategory, ownerCode, uploadedAt, fileName });
  const config = getContractStorageConfig();

  if (config.bucket) {
    return storeS3Contract({ storageKey, buffer, fileName, mimeType, ownerCategory });
  }

  return storeLocalContract({ storageKey, buffer });
}

async function readStreamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  if (stream?.transformToByteArray) {
    return Buffer.from(await stream.transformToByteArray());
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    Readable.from(stream)
      .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
}

export async function loadStoredContractBinary(contractRecord) {
  if (!contractRecord) {
    throw new Error("Contract record not found.");
  }

  if (contractRecord.storageProvider === "s3") {
    const { bucket } = getContractStorageConfig();
    if (!bucket) {
      throw new Error("Contracts S3 bucket is not configured.");
    }

    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: contractRecord.storageKey,
      }),
    );

    return {
      buffer: await readStreamToBuffer(result.Body),
      mimeType: contractRecord.mimeType || "application/octet-stream",
      fileName: contractRecord.fileName,
    };
  }

  const { localDir } = getContractStorageConfig();
  const absolutePath = path.join(localDir, contractRecord.storageKey);
  return {
    buffer: await fs.readFile(absolutePath),
    mimeType: contractRecord.mimeType || "application/octet-stream",
    fileName: contractRecord.fileName,
  };
}
