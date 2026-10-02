import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** How long a pre-signed upload or download URL works (SECURITY T14: short-lived links). */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/** The object-storage operations the platform uses. An interface, so unit tests need no S3. */
export interface ObjectStore {
  /** A URL the client can PUT one object to, with the given content type, until it expires. */
  presignPut(key: string, contentType: string): Promise<{ url: string; expiresAt: Date }>;
  presignGet(key: string): Promise<{ url: string; expiresAt: Date }>;
  /** The size and SHA-256 of a stored object, read by the server itself; undefined when it does not exist. */
  inspect(key: string, maxBytes: number): Promise<{ size: number; sha256: string } | undefined>;
  /** Throws when the bucket cannot be reached (readiness). */
  ping(): Promise<void>;
}

/** Artifacts are stored per organisation and by content hash (ADR-0006): tenants never share a prefix. */
export function artifactKey(orgId: string, sha256: string): string {
  return `orgs/${orgId}/sha256/${sha256}`;
}

export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Any S3-compatible store (SeaweedFS locally; S3, R2 or MinIO elsewhere), through the AWS SDK. */
export function createS3Store(settings: S3Settings, now: () => Date = () => new Date()): ObjectStore {
  const config: S3ClientConfig = {
    endpoint: settings.endpoint,
    region: settings.region,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    forcePathStyle: true,
    // Newer SDKs add CRC checksums to every request by default; many S3-compatible stores reject them in
    // pre-signed URLs. The server verifies the SHA-256 itself (see `inspect`).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  const client = new S3Client(config);
  const expiry = (seconds: number) => new Date(now().getTime() + seconds * 1000);
  return {
    async presignPut(key, contentType) {
      const command = new PutObjectCommand({ Bucket: settings.bucket, Key: key, ContentType: contentType });
      return {
        url: await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS }),
        expiresAt: expiry(UPLOAD_URL_TTL_SECONDS),
      };
    },
    async presignGet(key) {
      const command = new GetObjectCommand({ Bucket: settings.bucket, Key: key });
      return {
        url: await getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS }),
        expiresAt: expiry(DOWNLOAD_URL_TTL_SECONDS),
      };
    },
    async inspect(key, maxBytes) {
      let body: AsyncIterable<Uint8Array> | undefined;
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: key }));
        body = object.Body as AsyncIterable<Uint8Array> | undefined;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || (error as { name?: string }).name === "NoSuchKey") return undefined;
        throw error;
      }
      if (!body) return undefined;
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > maxBytes) return { size, sha256: "" }; // too large: no need to read the rest
        hash.update(chunk);
      }
      return { size, sha256: hash.digest("hex") };
    },
    async ping() {
      await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
    },
  };
}
