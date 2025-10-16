// src/app/lib/media-server.ts
import "server-only";
import { Buffer } from "node:buffer";

/**
 * Server-only media helpers:
 *  - Provider detection (Cloudinary / S3 / none)
 *  - Upload (File/Blob/Buffer/Uint8Array)
 *  - Delete by provider id
 *  - Delete by URL or id
 *  - Derive provider id from URL
 *  - S3 public URL builder
 *
 * NOTE:
 * - Do NOT import this file from client code.
 * - API routes and server actions may import from here.
 */

/* --------------------------------- Types -------------------------------- */

export type UploadOpts = {
  /** e.g. "qs-media/products" (Cloudinary folder; S3 prefix is handled via keyPrefix) */
  folder?: string;
  /** e.g. "products/123" (prepends to the provider key/public_id) */
  keyPrefix?: string;
  /** MIME type override (S3 primarily) */
  contentType?: string;
};

export type UploadResult = {
  /** Cloudinary public_id or S3 key */
  id: string;
  /** Public, fetchable URL */
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
};

type FileLike = Blob & { name?: string; type?: string };

/* ------------------------------- Utilities ------------------------------ */

function slugify(s: string): string {
  return String(s)
    .normalize?.("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function randHex(bytes = 8): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2, 2 + bytes * 2).padEnd(bytes * 2, "0");
}
function toBuffer(u8: Uint8Array): Buffer {
  return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
}
function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/* -------------------------- Provider detection -------------------------- */

type Provider = "cloudinary" | "s3" | "none";

function resolveProvider(): Provider {
  const forced = (process.env["MEDIA_PROVIDER"] || "").toLowerCase();
  if (forced === "cloudinary" || forced === "s3" || forced === "none") return forced as Provider;

  const hasCloudinary =
    !!process.env["CLOUDINARY_URL"] ||
    (!!process.env["CLOUDINARY_CLOUD_NAME"] &&
      !!process.env["CLOUDINARY_API_KEY"] &&
      !!process.env["CLOUDINARY_API_SECRET"]);

  if (hasCloudinary) return "cloudinary";

  const hasS3 =
    !!process.env["AWS_S3_BUCKET"] ||
    !!process.env["AWS_S3_PUBLIC_URL"] ||
    !!process.env["AWS_S3_ENDPOINT"];
  if (hasS3) return "s3";

  return "none";
}

const PROVIDER: Provider = resolveProvider();

export const mediaProvider = {
  name: PROVIDER,
  isCloudinary: PROVIDER === "cloudinary",
  isS3: PROVIDER === "s3",
  isNone: PROVIDER === "none",
} as const;

/* ------------------------------- Cloudinary ----------------------------- */

async function getCloudinary() {
  const mod: any = await import("cloudinary").catch(() => null);
  const cld = mod?.v2 || mod?.default?.v2 || mod?.default;
  if (!cld) throw new Error("Cloudinary SDK not available. Install `cloudinary`.");
  if (process.env["CLOUDINARY_URL"]) {
    cld.config({ secure: true });
  } else {
    cld.config({
      cloud_name: process.env["CLOUDINARY_CLOUD_NAME"],
      api_key: process.env["CLOUDINARY_API_KEY"],
      api_secret: process.env["CLOUDINARY_API_SECRET"],
      secure: true,
    });
  }
  return cld;
}

/* ---------------------------------- S3 ---------------------------------- */

type S3ClientType = { send: (command: any) => Promise<any> };

async function getS3Client(): Promise<S3ClientType> {
  const aws: any = await import("@aws-sdk/client-s3").catch(() => null);
  if (!aws?.S3Client) throw new Error("S3 client not available. Install @aws-sdk/client-s3.");

  const client = new aws.S3Client({
    region: process.env["AWS_S3_REGION"] || "us-east-1",
    endpoint: process.env["AWS_S3_ENDPOINT"] || undefined, // for R2/MinIO/etc
    forcePathStyle: !!process.env["AWS_S3_ENDPOINT"],
    credentials: process.env["AWS_ACCESS_KEY_ID"]
      ? {
          accessKeyId: process.env["AWS_ACCESS_KEY_ID"] as string,
          secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] as string,
        }
      : undefined,
  });
  return client;
}

async function s3PutObject(params: { key: string; body: Uint8Array | Buffer; contentType: string }) {
  const aws: any = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const bucket = process.env["AWS_S3_BUCKET"];
  if (!bucket) throw new Error("Missing AWS_S3_BUCKET");

  const acl = process.env["AWS_S3_ACL"] || "public-read";
  await client.send(
    new aws.PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ACL: acl,
    })
  );
}

async function s3DeleteObject(key: string) {
  const aws: any = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const bucket = process.env["AWS_S3_BUCKET"];
  if (!bucket) throw new Error("Missing AWS_S3_BUCKET");
  await client.send(new aws.DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Build a public S3 (or compatible) URL for a given key. */
export function buildS3PublicUrl(key: string): string {
  const base = process.env["AWS_S3_PUBLIC_URL"];
  if (base) return `${base.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;

  const bucket = process.env["AWS_S3_BUCKET"];
  const region = process.env["AWS_S3_REGION"] || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;
}

/* ------------------------------- Upload --------------------------------- */

/**
 * Upload a file/blob/buffer to the configured provider.
 * - Cloudinary → upload_stream
 * - S3        → PutObject, returns public URL
 * - none      → data URL (dev fallback; not persisted)
 */
export async function uploadFile(
  file: FileLike | Buffer | Uint8Array,
  opts: UploadOpts = {}
): Promise<UploadResult> {
  const folder = opts.folder || process.env["MEDIA_FOLDER"] || "qs-media";
  const baseName =
    (typeof (file as any)?.name === "string" && (file as any).name) || "upload";
  const contentType =
    (file as any)?.type || opts.contentType || "application/octet-stream";

  // Normalize to Buffer
  let bytes: Uint8Array;
  if (typeof (file as any)?.arrayBuffer === "function") {
    bytes = new Uint8Array(await (file as any).arrayBuffer());
  } else if (Buffer.isBuffer(file)) {
    bytes = new Uint8Array(file);
  } else if (file instanceof Uint8Array) {
    bytes = file;
  } else {
    throw new Error("Unsupported file input. Provide a File/Blob/Buffer/Uint8Array.");
  }

  const prefix = opts.keyPrefix ? `${opts.keyPrefix.replace(/\/+$/, "")}/` : "";
  const baseId = `${prefix}${Date.now()}-${randHex(4)}-${slugify(baseName)}`.slice(0, 200);

  if (mediaProvider.isCloudinary) {
    const cld = await getCloudinary();

    const result: any = await new Promise((resolve, reject) => {
      const stream = cld.uploader.upload_stream(
        { folder, public_id: baseId, resource_type: "image", overwrite: true },
        (err: unknown, res: unknown) => (err ? reject(err) : resolve(res))
      );
      stream.end(toBuffer(bytes));
    });

    return {
      id: String(result.public_id),
      url: String(result.secure_url || result.url),
      width: typeof result.width === "number" ? result.width : undefined,
      height: typeof result.height === "number" ? result.height : undefined,
      contentType,
    };
  }

  if (mediaProvider.isS3) {
    const key = `${prefix}${folder ? `${folder.replace(/\/+$/, "")}/` : ""}${Date.now()}-${randHex(
      4
    )}-${slugify(baseName)}`.replace(/\/+/g, "/");

    await s3PutObject({ key, body: bytes, contentType });
    return { id: key, url: buildS3PublicUrl(key), contentType };
  }

  // Dev fallback (not persisted)
  const b64 = Buffer.from(bytes).toString("base64");
  const url = `data:${contentType};base64,${b64}`;
  return { id: `local-${Date.now()}-${randHex(4)}`, url, contentType };
}

/* -------------------------------- Delete -------------------------------- */

export async function deleteById(id: string): Promise<void> {
  if (!id) throw new Error("Missing provider id");

  if (mediaProvider.isCloudinary) {
    const cld = await getCloudinary();
    const out: any = await cld.uploader.destroy(id, { resource_type: "image" });
    const res = String(out?.result || "");
    if (res !== "ok" && res !== "not found") {
      throw new Error(`Cloudinary delete failed (${res || "unknown"})`);
    }
    return;
  }

  if (mediaProvider.isS3) {
    await s3DeleteObject(id);
    return;
  }

  // none: nothing to delete
  throw new Error("No media provider configured");
}

/** Try to turn a full URL into provider id (Cloudinary public_id or S3 key). */
export function deriveProviderIdFromUrlOrId(input: string): string {
  if (!input) return "";
  if (!isHttpUrl(input)) return input;

  try {
    const u = new URL(input);

    // ---- Cloudinary ----
    if (/(^|\.)res\.cloudinary\.com$/i.test(u.hostname)) {
      // /image/upload/(transforms and/or signature/)?(v12345/)?folder/name.ext
      const up = u.pathname;
      const ix = up.indexOf("/upload/");
      let p = ix >= 0 ? up.slice(ix + "/upload/".length) : up.replace(/^\/+/, "");

      // Remove version segments like /v12345/ (use last if multiple)
      const versionMatch = p.match(/\/v\d+\//g);
      if (versionMatch && versionMatch.length) {
        const last = versionMatch[versionMatch.length - 1]!;
        const pos = p.lastIndexOf(last);
        p = p.slice(pos + last.length);
      } else {
        // Strip transformation-like segments
        const looksLikeTransform = (seg: string) =>
          seg.includes(",") || /^[a-z]+_/.test(seg) || /^s--[A-Za-z0-9-_]+--$/.test(seg);
        while (true) {
          const firstSlash = p.indexOf("/");
          const firstSeg = firstSlash === -1 ? p : p.slice(0, firstSlash);
          if (firstSeg && looksLikeTransform(firstSeg)) {
            p = firstSlash === -1 ? "" : p.slice(firstSlash + 1);
          } else {
            break;
          }
        }
      }

      // Remove extension; it's NOT part of public_id
      p = p.replace(/\.[a-z0-9]+$/i, "").replace(/^\/+/, "");
      return decodeURIComponent(p);
    }

    // ---- S3 / public bucket / CDN ----
    let key = u.pathname.replace(/^\/+/, "");

    // Respect explicit public base if set
    const publicBase = process.env["AWS_S3_PUBLIC_URL"];
    if (publicBase) {
      try {
        const base = new URL(publicBase);
        if (u.href.startsWith(base.href)) {
          key = u.href.slice(base.href.length).replace(/^\/+/, "");
        }
      } catch {
        /* ignore */
      }
    }

    // Path-style S3 endpoint: https://s3.region.amazonaws.com/bucket/key...
    if (/^s3[.-].*amazonaws\.com$/i.test(u.hostname)) {
      const segs = key.split("/");
      if (segs.length > 1) {
        const bucket = process.env["AWS_S3_BUCKET"];
        if (!bucket || bucket === segs[0]) {
          key = segs.slice(1).join("/");
        }
      }
    }

    return decodeURIComponent(key);
  } catch {
    return input;
  }
}

/** Convenience: accept a raw id/key OR a full URL, then delete accordingly. */
export async function deleteByUrlOrId(idOrUrl: string): Promise<void> {
  const id = deriveProviderIdFromUrlOrId(idOrUrl);
  if (!id) throw new Error("Missing provider id");
  await deleteById(id);
}
