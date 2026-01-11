"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

type Coords = { lat: number; lng: number };

type Props = {
  user: { id: string; name: string | null; email: string | null };
};

type VehicleTypeOption = "BIKE" | "MOTORBIKE" | "CAR" | "VAN" | "TRUCK";

async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

async function tryUpload(file: File) {
  const fd = new FormData();
  fd.set("file", file);

  const r = await fetch("/api/upload", {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "cache-control": "no-store",
    },
    body: fd,
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false as const, status: r.status, json: j };

  const key =
    (typeof j?.key === "string" && j.key) ||
    (typeof j?.assetKey === "string" && j.assetKey) ||
    (typeof j?.fileKey === "string" && j.fileKey) ||
    null;

  return { ok: true as const, status: r.status, json: j, key };
}

function isValidPhone(raw: string) {
  const s = raw.trim();
  if (!s) return false;
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.length >= 10 && digits.length <= 16;
  return digits.length >= 9 && digits.length <= 14;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtLatLng(c: Coords | null) {
  if (!c) return "Not set";
  const lat = clamp(Number(c.lat), -90, 90);
  const lng = clamp(Number(c.lng), -180, 180);
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function normalizeKeyInput(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

const inputBase =
  "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 " +
  "text-sm text-[var(--text)] shadow-sm transition placeholder:text-[var(--text-muted)] " +
  "focus-visible:outline-none focus-visible:ring-2 ring-focus";

const buttonOutline =
  "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 " +
  "text-sm font-semibold text-[var(--text)] shadow-sm transition " +
  "hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

const heroBtn = [
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold sm:text-sm",
  "border-white/20 bg-white/15 text-white shadow-sm transition backdrop-blur-sm",
  "hover:bg-white/20 active:scale-[.99]",
  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
  "disabled:opacity-60 disabled:cursor-not-allowed",
].join(" ");

function SelectChevron() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CarrierOnboardingClient({ user }: Props) {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleTypeOption>("MOTORBIKE");
  const [plate, setPlate] = useState("");

  const [station, setStation] = useState<Coords | null>(null);

  const [vehiclePhotoKeys, setVehiclePhotoKeys] = useState<string[]>([]);
  const [docPhotoKey, setDocPhotoKey] = useState<string>("");

  const [manualVehicleKey, setManualVehicleKey] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  const vehicleFileRef = useRef<HTMLInputElement | null>(null);
  const docFileRef = useRef<HTMLInputElement | null>(null);

  const canSubmit = useMemo(() => {
    if (!isValidPhone(phone)) return false;
    if (!vehicleType) return false;
    if (!plate.trim()) return false;
    if (!station) return false;
    if (!vehiclePhotoKeys.length) return false;
    return true;
  }, [phone, vehicleType, plate, station, vehiclePhotoKeys]);

  const onPickStation = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.dismiss();
      toast.error("Geolocation is not available in this browser");
      return;
    }

    toast.dismiss();

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (typeof lat === "number" && typeof lng === "number") {
            setStation({ lat, lng });
            toast.success("Station location set");
          } else {
            toast.error("Couldn't read your location");
          }
          resolve();
        },
        (err) => {
          const msg =
            err?.code === 1
              ? "Location permission denied"
              : err?.code === 2
                ? "Location unavailable"
                : "Couldn't get your location";
          toast.error(msg);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 20000 },
      );
    });
  }, []);

  const addVehicleKeyManual = useCallback(() => {
    const v = normalizeKeyInput(manualVehicleKey);
    if (!v) return;

    setVehiclePhotoKeys((prev) => {
      const next = [v, ...prev.filter((x) => x !== v)].slice(0, 12);
      return next;
    });
    setManualVehicleKey("");
  }, [manualVehicleKey]);

  const removeVehicleKey = useCallback((key: string) => {
    setVehiclePhotoKeys((prev) => prev.filter((x) => x !== key));
  }, []);

  const uploadVehiclePhoto = useCallback(async (file: File) => {
    setUploadBusy(true);
    toast.dismiss();

    try {
      const res = await tryUpload(file);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Upload endpoint is not enabled. Paste an existing asset key instead.");
        } else if (res.status === 401) {
          toast.error("You must be signed in to upload.");
        } else {
          toast.error(res.json?.error || "Upload failed.");
        }
        return;
      }

      if (!res.key) {
        toast.error("Upload succeeded but no asset key was returned.");
        return;
      }

      setVehiclePhotoKeys((prev) => [res.key!, ...prev.filter((x) => x !== res.key)].slice(0, 12));
      toast.success("Photo added");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed.");
    } finally {
      setUploadBusy(false);
      if (vehicleFileRef.current) vehicleFileRef.current.value = "";
    }
  }, []);

  const uploadDocPhoto = useCallback(async (file: File) => {
    setUploadBusy(true);
    toast.dismiss();

    try {
      const res = await tryUpload(file);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Upload endpoint is not enabled. Paste an existing asset key instead.");
        } else if (res.status === 401) {
          toast.error("You must be signed in to upload.");
        } else {
          toast.error(res.json?.error || "Upload failed.");
        }
        return;
      }

      if (!res.key) {
        toast.error("Upload succeeded but no asset key was returned.");
        return;
      }

      setDocPhotoKey(res.key);
      toast.success("Document photo set");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed.");
    } finally {
      setUploadBusy(false);
      if (docFileRef.current) docFileRef.current.value = "";
    }
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;

    toast.dismiss();

    if (!canSubmit) {
      toast.error("Please complete all required fields.");
      return;
    }

    setBusy(true);

    try {
      const payload = {
        phone: phone.trim(),
        vehicleType,
        vehiclePlate: plate.trim(),
        vehiclePhotoKeys,
        docPhotoKey: docPhotoKey.trim() ? docPhotoKey.trim() : null,
        station: station
          ? {
              lat: station.lat,
              lng: station.lng,
              label: "Current location",
            }
          : null,
      };

      const { ok, status, json } = await postJson("/api/carrier/register", payload);

      if (!ok) {
        const msg =
          json?.error ||
          (status === 404
            ? "Carrier registration endpoint is not enabled yet."
            : status === 401
              ? "You must be signed in to register."
              : "Failed to register as a carrier.");
        toast.error(msg);
        return;
      }

      toast.success("Carrier profile created");
      router.push("/carrier");
    } catch (e: any) {
      toast.error(e?.message || "Failed to register.");
    } finally {
      setBusy(false);
    }
  }, [busy, canSubmit, phone, vehicleType, plate, vehiclePhotoKeys, docPhotoKey, station, router]);

  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-label="Carrier onboarding">
      <header
        className={[
          "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] shadow-soft",
          "bg-gradient-to-r from-[var(--brand-navy)] via-[var(--brand-green)] to-[var(--brand-blue)]",
          "p-4 text-white sm:p-6",
        ].join(" ")}
      >
        <div
          className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            Carrier onboarding
          </p>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-2xl">
            Register as a carrier
          </h1>
          <p className="mt-2 text-sm text-white/90">
            This profile is owned by your user account. After approval, you can go online and receive
            delivery requests.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/dashboard" prefetch={false} className={heroBtn}>
              Back to dashboard
            </Link>

            <span className="text-xs text-white/85">
              Signed in as{" "}
              <span className="font-semibold text-white">
                {user.name || user.email || "user"}
              </span>
            </span>
          </div>
        </div>
      </header>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-5"
        aria-label="Carrier registration form"
      >
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--text)]">Details</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Required fields are marked. Use real information so admin verification can succeed.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="carrier-phone" className="text-sm font-semibold text-[var(--text)]">
                  Phone <span className="text-[var(--text-muted)]">(required)</span>
                </label>
                <input
                  id="carrier-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+2547… or 07…"
                  className={inputBase}
                  inputMode="tel"
                  autoComplete="tel"
                />
                {!phone.trim() ? null : isValidPhone(phone) ? (
                  <p className="text-xs text-[var(--text-muted)]">Looks good.</p>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Enter a valid phone number.</p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="carrier-vehicle"
                  className="text-sm font-semibold text-[var(--text)]"
                >
                  Vehicle type <span className="text-[var(--text-muted)]">(required)</span>
                </label>

                <div className="relative">
                  <select
                    id="carrier-vehicle"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as VehicleTypeOption)}
                    className={[inputBase, "appearance-none pr-10"].join(" ")}
                    style={{ colorScheme: "light dark" }}
                  >
                    <option
                      value="BIKE"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text)" }}
                    >
                      Bike
                    </option>
                    <option
                      value="MOTORBIKE"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text)" }}
                    >
                      Motorbike
                    </option>
                    <option
                      value="CAR"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text)" }}
                    >
                      Car
                    </option>
                    <option
                      value="VAN"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text)" }}
                    >
                      Van
                    </option>
                    <option
                      value="TRUCK"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text)" }}
                    >
                      Truck
                    </option>
                  </select>

                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                    <SelectChevron />
                  </span>
                </div>

                <p className="text-xs text-[var(--text-muted)]">
                  Choose what you mainly use for deliveries.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="carrier-plate" className="text-sm font-semibold text-[var(--text)]">
                  Plate / registration <span className="text-[var(--text-muted)]">(required)</span>
                </label>
                <input
                  id="carrier-plate"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder="Example: KDA 123A"
                  className={inputBase}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    Station location <span className="text-[var(--text-muted)]">(required)</span>
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    This is your default area. You can update your live location when you go online.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn-gradient-primary"
                  onClick={() => void onPickStation()}
                  disabled={uploadBusy || busy}
                >
                  Use my current location
                </button>
              </div>

              <div className="mt-3 text-sm text-[var(--text)]">
                <span className="font-semibold">Current:</span>{" "}
                <span className="text-[var(--text-muted)]">{fmtLatLng(station)}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-gradient-primary"
                onClick={() => void submit()}
                disabled={busy || uploadBusy || !canSubmit}
                aria-disabled={busy || uploadBusy || !canSubmit}
              >
                {busy ? "Creating…" : "Create carrier profile"}
              </button>

              <Link
                href="/carrier"
                prefetch={false}
                className={[
                  "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-4 py-2.5",
                  "text-sm font-semibold text-[var(--text)] shadow-sm transition",
                  "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                ].join(" ")}
              >
                Cancel
              </Link>

              {!canSubmit ? (
                <span className="text-xs text-[var(--text-muted)]">
                  Complete required fields to enable submission.
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Note: registration can be rejected if verification fails. Keep your details accurate.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--text)]">Evidence</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Add at least one vehicle photo key. Uploading uses{" "}
              <span className="font-semibold text-[var(--text)]">/api/upload</span>{" "}
              when available.
            </p>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text)]">
                      Vehicle photos <span className="text-[var(--text-muted)]">(required)</span>
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Upload a photo or paste an existing asset key. Keys are stored, not the raw file.
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold",
                      vehiclePhotoKeys.length
                        ? "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]",
                    ].join(" ")}
                    aria-label="Vehicle photos count"
                    title="Vehicle photos count"
                  >
                    {vehiclePhotoKeys.length}/12
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label
                    className={[
                      "cursor-pointer",
                      buttonOutline,
                      "inline-flex items-center justify-center",
                      "sm:w-auto",
                    ].join(" ")}
                  >
                    <input
                      ref={vehicleFileRef}
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0];
                        if (f) void uploadVehiclePhoto(f);
                      }}
                      disabled={uploadBusy || busy}
                    />
                    {uploadBusy ? "Uploading…" : "Upload photo"}
                  </label>

                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={manualVehicleKey}
                      onChange={(e) => setManualVehicleKey(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addVehicleKeyManual();
                        }
                      }}
                      placeholder="Paste asset key"
                      className={inputBase}
                      aria-label="Vehicle photo asset key"
                    />

                    <button
                      type="button"
                      className={buttonOutline}
                      onClick={addVehicleKeyManual}
                      disabled={!manualVehicleKey.trim() || busy || uploadBusy}
                      aria-disabled={!manualVehicleKey.trim() || busy || uploadBusy}
                    >
                      Add key
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2" aria-label="Vehicle photo keys">
                  {vehiclePhotoKeys.length ? (
                    <ul className="space-y-2">
                      {vehiclePhotoKeys.map((k) => (
                        <li
                          key={k}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-xs font-semibold text-[var(--text)]">
                            {k}
                          </span>
                          <button
                            type="button"
                            className={[
                              "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1",
                              "text-xs font-semibold text-[var(--text)] shadow-sm transition",
                              "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                            ].join(" ")}
                            onClick={() => removeVehicleKey(k)}
                            aria-label="Remove vehicle photo key"
                            disabled={busy || uploadBusy}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
                      No vehicle photos yet. Add at least one to continue.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-[var(--text)]">Optional document photo</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  If you have a rider’s license or business permit, add a doc photo key. This can speed
                  up verification.
                </p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label
                    className={[
                      "cursor-pointer",
                      buttonOutline,
                      "inline-flex items-center justify-center",
                      "sm:w-auto",
                    ].join(" ")}
                  >
                    <input
                      ref={docFileRef}
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0];
                        if (f) void uploadDocPhoto(f);
                      }}
                      disabled={uploadBusy || busy}
                    />
                    {uploadBusy ? "Uploading…" : "Upload doc"}
                  </label>

                  <input
                    value={docPhotoKey}
                    onChange={(e) => setDocPhotoKey(e.target.value)}
                    placeholder="Paste doc asset key"
                    className={inputBase}
                    aria-label="Document photo asset key"
                  />
                </div>

                <div className="mt-3 text-xs text-[var(--text-muted)]">
                  Current doc key:{" "}
                  <span className="font-semibold text-[var(--text)]">
                    {docPhotoKey.trim() ? docPhotoKey.trim() : "None"}
                  </span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Stay safe: only upload what’s necessary, and avoid sharing sensitive documents publicly.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
