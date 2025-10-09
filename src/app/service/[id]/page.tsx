// src/app/service/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import { buildServiceSeo } from "@/app/lib/seo";
import Gallery from "@/app/components/Gallery";
import ContactModalService from "@/app/components/ContactModalService";
import { MessageProviderButton } from "@/app/components/MessageActions";

type ServiceFetched = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  image?: string | null;
  gallery?: string[];
  price?: number | null;
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
  seller?: {
    id?: string;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    phone?: string | null;
    location?: string | null;
  } | null;
};

const PLACEHOLDER = "/placeholder/default.jpg";

// Hint for next/image when using `fill` inside the Gallery.
const GALLERY_SIZES = "(max-width: 1024px) 100vw, 60vw";

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
  const id = params.id ?? ""; // ✅ no reassignment
  const router = useRouter();

  const { data: session } = useSession();
  const isAuthed = Boolean(session?.user);
  const viewerId = (session?.user as any)?.id as string | undefined;

  const [fetched, setFetched] = useState<ServiceFetched | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setLoading(false);
      setErr("Invalid service id.");
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetch(`/api/services/${encodeURIComponent(id)}`, {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg =
            j?.error ||
            (r.status === 404 ? "Service not found or unavailable." : `Failed to load (${r.status})`);
          throw new Error(msg);
        }
        if (!cancelled) setFetched(j as ServiceFetched);
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

  const display: ServiceFetched = useMemo(() => {
    const d = fetched;
    return {
      id: d?.id ?? (id || "unknown"),
      name: d?.name ?? "Service",
      description: d?.description ?? null,
      category: d?.category ?? "General",
      subcategory: d?.subcategory ?? null,
      image: d?.image ?? null,
      gallery: Array.isArray(d?.gallery) ? (d?.gallery as string[]) : [],
      price: typeof d?.price === "number" ? (d?.price as number) : null,
      rateType: d?.rateType ?? null,
      serviceArea: d?.serviceArea ?? null,
      availability: d?.availability ?? null,
      location: d?.location ?? null,
      featured: Boolean(d?.featured),
      sellerId: d?.sellerId ?? null,
      sellerName: d?.sellerName ?? null,
      sellerPhone: d?.sellerPhone ?? null,
      sellerLocation: d?.sellerLocation ?? null,
      sellerMemberSince: d?.sellerMemberSince ?? null,
      sellerRating: typeof d?.sellerRating === "number" ? (d?.sellerRating as number) : null,
      sellerSales: typeof d?.sellerSales === "number" ? (d?.sellerSales as number) : null,
      seller: d?.seller ?? null,
    };
  }, [fetched, id]);

  const images = useMemo(() => {
    const set = new Set<string>();
    if (display?.image) set.add(display.image);
    (display?.gallery || []).forEach((u) => {
      const s = (u || "").trim();
      if (s) set.add(s);
    });
    if (set.size === 0) set.add(PLACEHOLDER);
    return Array.from(set);
  }, [display?.image, display?.gallery]);

  const seller = useMemo(() => {
    const nested: any = (display as any)?.seller || {};
    return {
      id: nested?.id ?? display?.sellerId ?? null,
      username: (nested?.username || "").trim() || null,
      name: nested?.name ?? display?.sellerName ?? "Service Provider",
      image: nested?.image ?? null,
      phone: nested?.phone ?? display?.sellerPhone ?? null,
      location: nested?.location ?? display?.sellerLocation ?? null,
    };
  }, [display]);

  const isOwner = Boolean(viewerId && seller.id && viewerId === seller.id);

  const seo = useMemo(() => {
    const imgs = [display.image, ...(display.gallery ?? [])].filter(Boolean) as string[];
    return buildServiceSeo({
      id: display.id,
      name: display.name,
      ...(display.description != null ? { description: display.description } : {}),
      ...(typeof display.price === "number" ? { price: display.price } : {}),
      ...(imgs.length ? { image: imgs } : {}),
      ...(display.category ? { category: display.category } : {}),
      ...(display.subcategory ? { subcategory: display.subcategory } : {}),
      ...(display.rateType ? { rateType: display.rateType } : {}),
      ...(display.location ? { location: display.location } : {}),
      ...(display.serviceArea ? { serviceArea: display.serviceArea } : {}),
      ...(display.sellerName ? { sellerName: display.sellerName } : {}),
      urlPath: `/service/${display.id}`,
      status: "ACTIVE",
    });
  }, [display]);

  const copyLink = useCallback(async () => {
    if (!origin || !display?.id) return;
    try {
      await navigator.clipboard.writeText(`${origin}/service/${display.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }, [origin, display?.id]);

  const onStartMessageAction = useCallback(
    async (_serviceId: string) => {
      if (!seller.id) return;
      await startThread(
        seller.id,
        "service",
        display.id,
        `Hi ${seller.name || "there"}, I'm interested in "${display.name}".`
      );
    },
    [seller.id, seller.name, display.id, display.name]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {seo?.jsonLd && (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd) }}
        />
      )}

      {/* Media */}
      <div className="lg:col-span-3">
        <div
          className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          data-gallery-wrap
        >
          {display.featured && (
            <span className="absolute left-3 top-3 z-20 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
              Featured
            </span>
          )}

          {/* Canonical viewer; handles fullscreen internally */}
          <Gallery images={images} sizes={GALLERY_SIZES} lightbox />

          {/* Header controls */}
          <div className="absolute right-3 top-3 z-[80] flex gap-1">
            <button
              type="button"
              onClick={copyLink}
              className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white"
              title="Copy link"
              aria-label="Copy link"
            >
              🔗
            </button>

            <FavoriteButton serviceId={display.id} />

            {isOwner && (
              <>
                <Link
                  href={`/sell/service?id=${display.id}`}
                  className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white"
                  title="Edit service"
                  aria-label="Edit service"
                >
                  ✏️
                </Link>

                <DeleteListingButton
                  serviceId={display.id}
                  label="" // icon-only
                  className="px-2 py-1"
                  onDeletedAction={() => {
                    toast.success("Service deleted");
                    router.push("/dashboard");
                  }}
                />
              </>
            )}
          </div>

          {(loading || err) && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[75] bg-black/40 p-2 text-center text-xs text-white">
              {loading ? "Loading…" : err || "Showing limited info"}
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {display.name || "Service"}
          </h1>
        </div>

        <div className="space-y-1 rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">
            {fmtKES(display.price)} {suffix(display.rateType)}
          </p>
          {display.serviceArea && (
            <p className="text-sm text-gray-500">Service Area: {display.serviceArea}</p>
          )}
          {display.location && (
            <p className="text-sm text-gray-500">Base Location: {display.location}</p>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 font-semibold">Description</h2>
          <p className="whitespace-pre-line text-gray-700 dark:text-slate-200">
            {display.description || "No description provided."}
          </p>
        </div>

        {/* Provider */}
        <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 font-semibold">Provider</h3>

          <div className="space-y-1 text-gray-700 dark:text-slate-200">
            <p className="flex items-center gap-2">
              <span className="font-medium">Name:</span>
              <span>{seller.name ?? "Provider"}</span>
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
            <ContactModalService
              className="rounded-lg"
              serviceId={display.id}
              serviceName={display.name}
              fallbackName={seller.name}
              fallbackLocation={seller.location}
              buttonLabel="Show Contact"
            />

            <MessageProviderButton
              serviceId={display.id}
              isAuthed={isAuthed}
              onStartMessageAction={onStartMessageAction}
              className="px-5 py-3"
            />

            {seller.username && (
              <Link
                href={`/store/${seller.username}`}
                className="rounded-lg border px-5 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
                title={`Visit @${seller.username}'s store`}
                aria-label={`Visit ${seller.username}'s store`}
              >
                Visit Store
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
