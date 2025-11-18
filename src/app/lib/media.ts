// src/app/lib/media.ts
// Client-safe shared media helpers used across Product/Service pages.
// No Node-only imports; safe for both client and server bundles.

export type UrlObject = {
  url?: string;
  secureUrl?: string;
  secure_url?: string; // Cloudinary JSON
  signedUrl?: string; // GCS/Firebase
  downloadURL?: string; // Firebase
  src?: string;
  location?: string;
  path?: string;
  image?: string;
  imageUrl?: string;
  href?: string;
};

export type UrlLike = string | UrlObject;

export const MEDIA_ARRAY_KEYS = [
  "gallery",
  "images",
  "photos",
  "media",
  "imageUrls",
] as const;

type MediaArrayKey = (typeof MEDIA_ARRAY_KEYS)[number];

export type MediaResponse = {
  ok?: boolean;
  url?: string;
  publicId?: string;
  removed?: string;
  image: string | null;
  gallery: string[];
};

/* ------------------------------- Utilities ------------------------------ */

export function urlish(v: unknown): string {
  return (typeof v === "string" ? v : String(v ?? "")).trim();
}

/**
 * Permissive image URL check:
 * - Accepts absolute http(s)
 * - Accepts site-relative `/...`
 * - Accepts `data:image/*` + blob:
 * - Accepts common image-like filenames with an extension
 * Only rejects truly bad/empty strings.
 */
export function isRenderableImageUrl(raw: string): boolean {
  if (!raw) return false;
  const s = raw.trim();
  if (!s) return false;

  if (s.startsWith("/")) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^data:image\//i.test(s)) return true;
  if (/^blob:/i.test(s)) return true;

  if (/\.(jpe?g|png|gif|webp|avif|svg)(\?.*)?$/i.test(s)) return true;

  return false;
}

function getArray(obj: unknown, key: MediaArrayKey): unknown[] {
  if (!obj || typeof obj !== "object") return [];
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return Array.isArray(v) ? v : [];
}

function objectToUrl(it: unknown): string {
  const o = (it || {}) as UrlObject;
  return urlish(
    o.url ??
      o.secureUrl ??
      o.secure_url ??
      o.signedUrl ??
      o.downloadURL ??
      o.src ??
      o.location ??
      o.path ??
      o.imageUrl ??
      o.image ??
      o.href
  );
}

export function toUrlFromAny(it: UrlLike | null | undefined): string {
  return typeof it === "string" ? urlish(it) : objectToUrl(it);
}

/* --------------------------- Public media helpers ----------------------- */

export function hasRichMedia(obj: unknown, minCount = 2): boolean {
  if (!obj || typeof obj !== "object") return false;
  for (const key of MEDIA_ARRAY_KEYS) {
    const arr = getArray(obj, key);
    if (!arr.length) continue;
    let valid = 0;
    for (const it of arr) {
      const u = typeof it === "string" ? urlish(it) : objectToUrl(it);
      if (isRenderableImageUrl(u)) {
        valid++;
        if (valid >= minCount) return true;
      }
    }
  }
  return false;
}

/**
 * Extract a deterministic gallery:
 * - Include all gallery-like arrays: gallery/images/photos/media/imageUrls
 * - Only if those are empty, append primary image/cover fields
 * - Deduplicate while preserving order
 * - Filter only truly invalid URLs
 * - Always return at least one renderable URL (fallback or /og.png)
 */
export function extractGalleryUrls(
  obj: unknown,
  fallback?: string | null,
  limit = 50
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const u = urlish(raw);
    if (!isRenderableImageUrl(u)) return;
    if (seen.has(u)) return;
    seen.add(u);
    if (out.length < limit) out.push(u);
  };

  if (obj && typeof obj === "object") {
    const rec = obj as Record<string, unknown>;

    // 1. Prefer explicit gallery-style arrays from the API
    for (const key of MEDIA_ARRAY_KEYS) {
      const arr = getArray(rec, key);
      if (!arr.length) continue;

      for (const it of arr) {
        const u = typeof it === "string" ? urlish(it) : objectToUrl(it);
        if (u) push(u);
        if (out.length >= limit) break;
      }

      if (out.length >= limit) break;
    }

    // 2. If we didn't find any gallery images, fall back to primary image fields
    if (out.length === 0) {
      const primaryCandidates = [
        "image",
        "imageUrl",
        "coverImage",
        "coverImageUrl",
      ] as const;

      for (const key of primaryCandidates) {
        const v = rec[key];
        const u = urlish(v);
        if (isRenderableImageUrl(u)) {
          push(u);
        }
        if (out.length >= limit) break;
      }
    }
  }

  // 3. Guarantee at least one URL
  if (out.length === 0) {
    const fb =
      fallback && isRenderableImageUrl(fallback)
        ? urlish(fallback)
        : "/og.png";
    return [fb];
  }

  return out.slice(0, limit);
}

export function countValidUrls(obj: unknown, key: MediaArrayKey): number {
  const arr = getArray(obj, key);
  if (!arr.length) return 0;
  let n = 0;
  for (const it of arr) {
    const u = typeof it === "string" ? urlish(it) : objectToUrl(it);
    if (isRenderableImageUrl(u)) n++;
  }
  return n;
}

export function stripPlaceholderIfOthers(
  urls: string[],
  placeholder: string
): string[] {
  const real = urls.filter((u) => u && u !== placeholder);
  return real.length ? real : urls;
}

/* --------------------------- API calling helpers ------------------------ */

type Kind = "products" | "services";

export async function apiAddImage(
  kind: Kind,
  id: string,
  input: string | File | Blob,
  opts?: { cover?: boolean; signal?: AbortSignal | null }
): Promise<MediaResponse> {
  const base = `/api/${kind}/${encodeURIComponent(id)}/image`;
  const qs = opts?.cover ? "?cover=true" : "";
  const url = `${base}${qs}`;

  let res: Response;

  if (typeof input === "string") {
    const init: RequestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ url: input }),
      signal: opts?.signal ?? null,
      credentials: "include",
      cache: "no-store",
    };
    res = await fetch(url, init);
  } else {
    const fd = new FormData();
    fd.set("file", input);
    const init: RequestInit = {
      method: "POST",
      headers: { Accept: "application/json" },
      body: fd,
      signal: opts?.signal ?? null,
      credentials: "include",
      cache: "no-store",
    };
    res = await fetch(url, init);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Add image failed (${res.status})`);
  }

  const json = (await res.json()) as Partial<MediaResponse>;

  return {
    image: json.image ?? null,
    gallery: Array.isArray(json.gallery) ? (json.gallery as string[]) : [],
    ok: true,
    ...(typeof json.url === "string" ? { url: json.url } : {}),
    ...(typeof json.publicId === "string"
      ? { publicId: json.publicId }
      : {}),
  };
}

export async function apiDeleteImage(
  kind: Kind,
  id: string,
  urlOrPublicId: string,
  opts?: { signal?: AbortSignal | null }
): Promise<MediaResponse> {
  const base = `/api/${kind}/${encodeURIComponent(id)}/image`;
  const looksUrl = /^https?:\/\//i.test(urlOrPublicId);
  const reqUrl = looksUrl
    ? `${base}?url=${encodeURIComponent(urlOrPublicId)}`
    : base;

  const init: RequestInit = {
    method: "DELETE",
    signal: opts?.signal ?? null,
    credentials: "include",
    cache: "no-store",
    ...(looksUrl
      ? { headers: { Accept: "application/json" } }
      : {
          headers: {
            "content-type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            publicId: urlOrPublicId,
          }),
        }),
  };

  const res = await fetch(reqUrl, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Delete image failed (${res.status})`);
  }

  const json = (await res.json()) as Partial<MediaResponse>;

  return {
    image: json.image ?? null,
    gallery: Array.isArray(json.gallery)
      ? (json.gallery as string[])
      : [],
    ok: true,
    ...(typeof json.removed === "string"
      ? { removed: json.removed }
      : {}),
  };
}

/* --------------------- persist staged media helper ------------------ */

export type MediaDraft = {
  image?: UrlLike | null;
  gallery?: (UrlLike | null | undefined)[] | null;
};

export type PersistResult = {
  image: string | null;
  gallery: string[];
};

function normalizeList(
  list: (UrlLike | null | undefined)[] | null | undefined
): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of list) {
    const u = toUrlFromAny(it);
    if (!isRenderableImageUrl(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * Commit staged media for a record.
 * - PATCH `/api/{kind}/{id}/media` with normalized draft
 * - Optionally DELETE URLs that were removed
 * - Returns `{ image, gallery }`
 */
export async function persistStagedMedia(
  kind: Kind,
  id: string,
  draft: MediaDraft,
  initial?: {
    image?: UrlLike | null;
    gallery?: (UrlLike | null | undefined)[] | null;
  },
  opts?: {
    cleanup?: boolean;
    signal?: AbortSignal | null;
  }
): Promise<PersistResult> {
  const nextImage = toUrlFromAny(draft?.image ?? null);
  const nextGallery = normalizeList(draft?.gallery);

  const prevImage = toUrlFromAny(initial?.image ?? null);
  const prevGallery = normalizeList(initial?.gallery);

  const body: Record<string, unknown> = {};
  if (isRenderableImageUrl(nextImage)) body["image"] = nextImage;
  if (nextGallery.length > 0) body["gallery"] = nextGallery;

  let patched: PersistResult = {
    image: prevImage || null,
    gallery: prevGallery,
  };

  if (Object.keys(body).length > 0) {
    const res = await fetch(
      `/api/${kind}/${encodeURIComponent(id)}/media`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        credentials: "include",
        cache: "no-store",
        signal: opts?.signal ?? null,
      }
    );

    if (res.ok) {
      const j =
        ((await res
          .json()
          .catch(() => ({}))) as Partial<PersistResult>) ?? {};

      const srvImage =
        typeof (j as any).image === "string"
          ? String((j as any).image)
          : undefined;
      const srvGallery = Array.isArray((j as any).gallery)
        ? ((j as any).gallery as string[])
        : undefined;

      patched = {
        image:
          (srvImage ??
            (isRenderableImageUrl(nextImage)
              ? nextImage
              : null)) || null,
        gallery: srvGallery ?? nextGallery,
      };
    } else {
      const msg =
        (await res.text().catch(() => "")) || "";
      throw new Error(
        msg || `Media PATCH failed (${res.status})`
      );
    }
  }

  if (opts?.cleanup !== false) {
    const before = new Set(prevGallery);
    const after = new Set(patched.gallery);
    const toRemove = [...before].filter(
      (u) => !after.has(u)
    );

    if (toRemove.length) {
      await Promise.allSettled(
        toRemove.map((u) =>
          apiDeleteImage(kind, id, u, {
            signal: opts?.signal ?? null,
          })
        )
      );
    }

    if (
      prevImage &&
      prevImage !== patched.image &&
      !after.has(prevImage)
    ) {
      await Promise.allSettled([
        apiDeleteImage(kind, id, prevImage, {
          signal: opts?.signal ?? null,
        }),
      ]);
    }
  }

  return patched;
}
