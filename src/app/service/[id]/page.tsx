"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import FavoriteButton from "@/app/components/FavoriteButton";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import { buildProductSeo } from "@/app/lib/seo";
import Gallery from "@/app/components/Gallery";
import ContactModalService from "../../components/ContactModalService";

type ServiceFetched = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  image?: string | null;
  gallery?: string[];
  price?: number | null; // per hour/day/fixed
  rateType?: "hour" | "day" | "fixed" | null;
  serviceArea?: string | null;
  availability?: string | null;
  location?: string | null;
  featured?: boolean;
  sellerId?: string | null;
  sellerName?: string | null;
  sellerPhone?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
  seller?: { id?: string; username?: string | null; name?: string | null; image?: string | null } | null;
};

const PLACEHOLDER = "/placeholder/default.jpg";

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}
function suffix(rt?: "hour" | "day" | "fixed" | null) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}

/* ---------- helper to start internal message thread ---------- */
async function startThread(
  sellerUserId: string,
  listingType: "product" | "service",
  listingId: string,
  firstMessage?: string
) {
  try {
    const r = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ toUserId: sellerUserId, listingType, listingId, firstMessage }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.threadId) throw new Error(j?.error || "Failed to start chat");
    window.location.href = "/messages";
  } catch (e: any) {
    toast.error(e?.message || "Could not start chat");
  }
}

export default function ServicePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? String(params.id) : "";

  const router = useRouter();
  const { data: session } = useSession();
  const viewerId = (session?.user as any)?.id as string | undefined;

  const [data, setData] = useState<ServiceFetched | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/services/${encodeURIComponent(id)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);
        if (!cancelled) setData(j as ServiceFetched);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load service");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const images = useMemo(() => {
    const set = new Set<string>();
    if (data?.image) set.add(data.image);
    (data?.gallery || []).forEach((u) => {
      const s = (u || "").trim();
      if (s) set.add(s);
    });
    if (set.size === 0) set.add(PLACEHOLDER);
    return Array.from(set);
  }, [data]);

  const seller = useMemo(() => {
    const nested: any = (data as any)?.seller || {};
    return {
      id: nested?.id ?? data?.sellerId ?? null,
      username: (nested?.username || "").trim() || null,
      name: nested?.name ?? data?.sellerName ?? "Service Provider",
      image: nested?.image ?? null,
      phone: nested?.phone ?? data?.sellerPhone ?? null,
      location: nested?.location ?? data?.sellerLocation ?? null,
    };
  }, [data]);

  const isOwner = Boolean(viewerId && seller.id && viewerId === seller.id);

  const seo = useMemo(() => {
    if (!data) return null;
    const imgs = [data.image, ...(data.gallery ?? [])].filter(Boolean) as string[];

    const args: Parameters<typeof buildProductSeo>[0] = {
      id: data.id,
      name: data.name,
      ...(data.description != null ? { description: data.description } : {}),
      ...(typeof data.price === "number" ? { price: data.price as number | null } : {}),
      ...(imgs.length ? { image: imgs } : {}),
      brand: null,
      ...(data.category ? { category: data.category } : {}),
      condition: null,
      status: "ACTIVE",
      urlPath: `/service/${data.id}`,
    };

    return buildProductSeo(args);
  }, [data]);

  const copyLink = useCallback(async () => {
    if (!origin || !data?.id) return;
    try {
      await navigator.clipboard.writeText(`${origin}/service/${data.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }, [origin, data?.id]);

  if (loading) {
    return <div className="text-gray-600 dark:text-slate-300">Loading…</div>;
  }
  if (err || !data) {
    return <div className="text-gray-600 dark:text-slate-300">{err || "Service not found."}</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* JSON-LD */}
      {seo?.jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd) }}
        />
      )}

      {/* Media */}
      <div className="lg:col-span-3">
        <div className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {data.featured && (
            <span className="absolute left-3 top-3 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
              Featured
            </span>
          )}

          {/* Accessible gallery (keyboard + lightbox) */}
          <Gallery images={images} lightbox />

          <div className="absolute right-3 top-3 z-10 flex gap-2">
            <button onClick={copyLink} className="btn-outline px-2 py-1 text-xs" title="Copy link">
              Copy link
            </button>
            <FavoriteButton productId={data.id} />
            {isOwner && (
              <>
                <Link
                  href={`/sell/service?id=${data.id}`}
                  className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white"
                  title="Edit service"
                >
                  Edit
                </Link>
                <DeleteListingButton
                  id={data.id}
                  className="rounded bg-red-600/90 px-2 py-1 text-xs text-white hover:bg-red-600"
                  label="Delete"
                  confirmText="Delete this service? This cannot be undone."
                  afterDeleteAction={() => {
                    toast.success("Service deleted");
                    router.push("/dashboard");
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {data.category}
                {data.subcategory ? ` • ${data.subcategory}` : ""}
              </span>
              {data.featured && (
                <span className="whitespace-nowrap rounded-full bg-[#161748] px-3 py-1 text-xs font-medium text-white">
                  Verified Provider
                </span>
              )}
            </div>
          </div>
          <FavoriteButton productId={data.id} />
        </div>

        <div className="space-y-1 rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">
            {fmtKES(data.price)} {suffix(data.rateType)}
          </p>
          {data.serviceArea && <p className="text-sm text-gray-500">Service Area: {data.serviceArea}</p>}
          {data.availability && <p className="text-sm text-gray-500">Availability: {data.availability}</p>}
          {data.location && <p className="text-sm text-gray-500">Base Location: {data.location}</p>}
        </div>

        <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 font-semibold">Description</h2>
          <p className="whitespace-pre-line text-gray-700 dark:text-slate-200">
            {data.description || "No description provided."}
          </p>
        </div>

        {/* Provider box */}
        <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 font-semibold">Provider</h3>

          <div className="space-y-1 text-gray-700 dark:text-slate-200">
            <p className="flex items-center gap-2">
              <span className="font-medium">Name:</span>
              <span>{(data.sellerName || seller.name) ?? "Provider"}</span>
              {seller.username && (
                <Link
                  href={`/store/${seller.username}`}
                  className="text-sm text-[#39a0ca] hover:underline"
                  title={`Visit @${seller.username}'s store`}
                >
                  @{seller.username}
                </Link>
              )}
            </p>
            {seller.location && (
              <p>
                <span className="font-medium">Location:</span> {seller.location}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* Standardized contact modal for services */}
            <ContactModalService
              className="rounded-lg"
              serviceId={data.id}
              serviceName={data.name}
              fallbackName={seller.name}
              fallbackLocation={seller.location}
              buttonLabel="Show Contact"
            />

            {/* Internal messaging */}
            {seller.id && (
              <button
                onClick={() =>
                  startThread(
                    seller.id!,
                    "service",
                    data.id,
                    `Hi ${seller.name || "there"}, I'm interested in "${data.name}".`
                  )
                }
                className="rounded-lg border px-5 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
                title="Message Provider"
              >
                Message Provider
              </button>
            )}

            {data.featured && (
              <div className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#161748] px-3 py-1 text-xs text-white">
                <span>Priority support</span>
                <span className="opacity-70">•</span>
                <span>Top placement</span>
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-gray-500 dark:text-slate-400">
            Safety: meet in public places, verify credentials, and never share sensitive information.
          </div>
        </div>
      </div>
    </div>
  );
}
