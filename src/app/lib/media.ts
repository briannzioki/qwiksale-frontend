// src/app/lib/media.ts
// Runtime: server only
import crypto from "node:crypto";

type Provider = "cloudinary" | "s3" | "none";

const providerFromEnv = (() => {
  const forced = (process.env["MEDIA_PROVIDER"] || "").toLowerCase();
  if (forced === "cloudinary" || forced === "s3" || forced === "none") return forced as Provider;

  const hasCloudinary =
    !!process.env["CLOUDINARY_URL"] ||
    (!!process.env["CLOUDINARY_CLOUD_NAME"] &&
      !!process.env["CLOUDINARY_API_KEY"] &&
      !!process.env["CLOUDINARY_API_SECRET"]);

  if (hasCloudinary) return "cloudinary";

  const hasS3 = !!process.env["AWS_S3_BUCKET"];
  if (hasS3) return "s3";

  return "none";
})();

const PROVIDER: Provider = providerFromEnv;
const DEFAULT_FOLDER = process.env["MEDIA_FOLDER"] || "qs-media";

export type UploadOpts = {
  folder?: string; // e.g. "qs-media/products"
  keyPrefix?: string; // e.g. "products/123"
  contentType?: string;
};

export type UploadResult = {
  /** Cloudinary public_id or S3 key */
  id: string;
  /** Public URL */
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
};

function slugify(s: string): string {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function rand(n = 8) {
  return crypto.randomBytes(n).toString("hex");
}

/** ------------------------------ Cloudinary ------------------------------ */
let cloudinary: any = null;
if (PROVIDER === "cloudinary") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cloudinary = require("cloudinary").v2;

    // If CLOUDINARY_URL is present, sdk reads it automatically; we just enforce 'secure'
    if (process.env["CLOUDINARY_URL"]) {
      cloudinary.config({ secure: true });
    } else {
      cloudinary.config({
        cloud_name: process.env["CLOUDINARY_CLOUD_NAME"],
        api_key: process.env["CLOUDINARY_API_KEY"],
        api_secret: process.env["CLOUDINARY_API_SECRET"],
        secure: true,
      });
    }
  } catch {
    // ignore, will throw on first use
  }
}

async function uploadCloudinary(file: File, opts: UploadOpts): Promise<UploadResult> {
  if (!cloudinary?.uploader?.upload_stream) {
    throw new Error("Cloudinary SDK not available. Install `cloudinary` and set env.");
  }
  const folder = opts.folder || DEFAULT_FOLDER;
  const publicIdBase = `${opts.keyPrefix ? `${opts.keyPrefix}/` : ""}${Date.now()}-${rand(
    4
  )}-${slugify((file as any).name || "upload")}`.slice(0, 200);

  const buf = Buffer.from(await file.arrayBuffer());

  const result: any = await new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicIdBase,
        resource_type: "image",
        overwrite: true,
      },
      (error: unknown, res: unknown) => {
        if (error) return reject(error);
        resolve(res);
      }
    );
    upload.end(buf);
  });

  return {
    id: result.public_id as string,
    url: (result.secure_url || result.url) as string,
    width: typeof result.width === "number" ? result.width : undefined,
    height: typeof result.height === "number" ? result.height : undefined,
    contentType: (file as any).type || "image/*",
  };
}

async function deleteCloudinary(id: string): Promise<void> {
  if (!cloudinary?.uploader?.destroy) {
    throw new Error("Cloudinary SDK not available. Install `cloudinary` and set env.");
  }
  const res: any = await cloudinary.uploader.destroy(id, { resource_type: "image" });
  const resultStr = String(res?.result ?? "");
  // Cloudinary typical: { result: "ok" } | { result: "not found" }
  if (resultStr !== "ok") {
    throw new Error(`Cloudinary delete failed (${resultStr || "unknown"})`);
  }
}

/** ------------------------------ S3 (kept for future) ------------------------------ */
let s3Client: any = null;
if (PROVIDER === "s3") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const aws = require("@aws-sdk/client-s3");
    s3Client = new aws.S3Client({
      region: process.env["AWS_S3_REGION"] || "us-east-1",
      endpoint: process.env["AWS_S3_ENDPOINT"] || undefined, // optional (minio/R2)
      forcePathStyle: !!process.env["AWS_S3_ENDPOINT"], // needed for some endpoints
      credentials: process.env["AWS_ACCESS_KEY_ID"]
        ? {
            accessKeyId: process.env["AWS_ACCESS_KEY_ID"] as string,
            secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] as string,
          }
        : undefined,
    });
  } catch {
    // ignore, will throw on first use
  }
}

function buildS3PublicUrl(key: string): string {
  const base = process.env["AWS_S3_PUBLIC_URL"];
  if (base) return `${base.replace(/\/+$/, "")}/${key}`;
  const bucket = process.env["AWS_S3_BUCKET"] as string;
  const region = process.env["AWS_S3_REGION"] || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;
}

async function uploadS3(file: File, opts: UploadOpts): Promise<UploadResult> {
  if (!s3Client) {
    throw new Error("S3 client not available. Install @aws-sdk/client-s3 and set env.");
  }
  const bucket = process.env["AWS_S3_BUCKET"];
  if (!bucket) throw new Error("Missing AWS_S3_BUCKET.");

  const folder = opts.folder || DEFAULT_FOLDER;
  const key = `${opts.keyPrefix ? `${opts.keyPrefix}/` : ""}${
    folder ? `${folder.replace(/\/+$/, "")}/` : ""
  }${Date.now()}-${rand(4)}-${slugify((file as any).name || "upload")}`.replace(/\/+/g, "/");

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = opts.contentType || (file as any).type || "application/octet-stream";

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ACL: process.env["AWS_S3_ACL"] || "public-read",
    })
  );

  return {
    id: key,
    url: buildS3PublicUrl(key),
    contentType,
  };
}

async function deleteS3(idOrKey: string): Promise<void> {
  if (!s3Client) {
    throw new Error("S3 client not available.");
  }
  const bucket = process.env["AWS_S3_BUCKET"] as string;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: idOrKey }));
}

/** ------------------------------ Public API ------------------------------ */

/**
 * Upload a File to the configured provider.
 * Returns an id (public_id for Cloudinary; key for S3) and a public URL.
 */
export async function uploadFile(file: File, opts: UploadOpts = {}): Promise<UploadResult> {
  if (!(file as any)?.arrayBuffer) {
    throw new Error("uploadFile expects a File (from Request.formData()).");
  }
  if (PROVIDER === "cloudinary") return uploadCloudinary(file, opts);
  if (PROVIDER === "s3") return uploadS3(file, opts);

  // Fallback (dev): inline *actual* bytes (NOT persistent!)
  const bytes = Buffer.from(await file.arrayBuffer());
  const b64 = bytes.toString("base64");
  const mime = (file as any).type || "application/octet-stream";
  const url = `data:${mime};base64,${b64}`;
  return { id: `local-${Date.now()}-${rand(4)}`, url, contentType: mime };
}

/** Delete by provider id (Cloudinary public_id or S3 key) */
export async function deleteById(id: string): Promise<void> {
  if (!id) throw new Error("Missing provider id");
  if (PROVIDER === "cloudinary") return deleteCloudinary(id);
  if (PROVIDER === "s3") return deleteS3(id);
  throw new Error("No media provider configured");
}

/** ------------------------------ Local reorder helpers ------------------------------ */

export type MediaItem = { id?: string; url: string; isCover?: boolean; sort?: number };

export function reorder<T extends MediaItem>(list: T[], idsInOrder: string[]): T[] {
  const byId = new Map<string, T>();
  for (const it of list) if (it.id) byId.set(it.id, it);

  const ordered: T[] = [];
  for (const id of idsInOrder) {
    const hit = byId.get(id);
    if (hit) ordered.push(hit);
  }
  // Keep any remaining trailing items (new files without ids, or ids not listed)
  const remaining = list.filter((x) => !ordered.includes(x));
  const next = [...ordered, ...remaining].map((x, i) => ({
    ...x,
    isCover: i === 0,
    sort: i,
  }));
  return next;
}

export function setCover<T extends MediaItem>(list: T[], id: string): T[] {
  const idx = list.findIndex((x) => x.id === id);
  if (idx <= 0) {
    return list.map((x, i) => ({ ...x, isCover: i === 0, sort: i }));
  }
  const next = [...list];
  const picked = next[idx]!;
  next.splice(idx, 1);
  next.unshift(picked);
  return next.map((x, i) => ({ ...x, isCover: i === 0, sort: i }));
}

/** ------------------------------ URL/id derivation (resilient deletion) ------------------------------ */

/** Try to turn a full URL into the underlying provider id (Cloudinary public_id or S3 key). */
export function deriveProviderIdFromUrlOrId(input: string): string {
  if (!input) return "";
  // If it doesn't look like a URL, assume it's already an id/key
  if (!/^https?:\/\//i.test(input)) return input;

  try {
    const u = new URL(input);

    // Cloudinary heuristics
    if (mediaProvider.isCloudinary || /(^|\.)res\.cloudinary\.com$/i.test(u.hostname)) {
      // Path examples:
      // /<cloud>/image/upload/v1712345/folder/name.jpg
      // /<cloud>/image/upload/f_auto,q_auto/v1712345/folder/name.jpg
      // /<cloud>/image/upload/f_auto,q_auto/folder/name.jpg
      let p = u.pathname; // leading slash included
      const ix = p.indexOf("/upload/");
      if (ix >= 0) p = p.slice(ix + "/upload/".length);
      else p = p.replace(/^\/+/, ""); // fallback

      // If there's a /v12345/ version segment, take the part after the LAST one
      const versionMatch = p.match(/\/v\d+\//g);
      if (versionMatch && versionMatch.length) {
        const last = versionMatch[versionMatch.length - 1]!;
        const pos = p.lastIndexOf(last);
        p = p.slice(pos + last.length);
      } else {
        // Strip a leading transformation segment (commas are a safe signal)
        const firstSlash = p.indexOf("/");
        const firstSeg = firstSlash === -1 ? p : p.slice(0, firstSlash);
        if (firstSeg.includes(",") || /^[a-z]+_/.test(firstSeg)) {
          p = firstSlash === -1 ? "" : p.slice(firstSlash + 1);
        }
      }

      // Remove extension (keep folder + basename without .ext)
      p = p.replace(/\.[a-z0-9]+$/i, "");
      p = p.replace(/^\/+/, "");
      p = decodeURIComponent(p);
      return p;
    }

    // S3 / generic public bucket or CDN heuristics
    let key = u.pathname.replace(/^\/+/, "");
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

    // If path-style endpoint like https://s3.region.amazonaws.com/bucket/key...
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

/** Convenience: accept either a raw id/key or a full URL, then delete. */
export async function deleteByUrlOrId(idOrUrl: string): Promise<void> {
  const provId = deriveProviderIdFromUrlOrId(idOrUrl);
  if (!provId) throw new Error("Missing provider id");
  await deleteById(provId);
}

/** Helpful runtime flags */
export const mediaProvider = {
  name: PROVIDER,
  isCloudinary: PROVIDER === "cloudinary",
  isS3: PROVIDER === "s3",
} as const;
