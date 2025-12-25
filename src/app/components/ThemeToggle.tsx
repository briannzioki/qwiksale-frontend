"use client";
// src/app/components/ThemeToggle.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

const LS_KEY = "theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function readStoredMode(): ThemeMode | null {
  try {
    const raw = (localStorage.getItem(LS_KEY) || "").toLowerCase();
    return raw === "light" || raw === "dark" || raw === "system"
      ? (raw as ThemeMode)
      : null;
  } catch {
    return null;
  }
}

function isDarkFor(mode: ThemeMode, mql: MediaQueryList | null): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return !!mql?.matches;
}

/** Apply mode to <html>, and optionally persist */
function applyTheme(mode: ThemeMode, mql: MediaQueryList | null, shouldPersist: boolean) {
  const root = document.documentElement;
  const dark = isDarkFor(mode, mql);

  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.setAttribute("data-theme-mode", mode);

  if (shouldPersist) {
    try {
      localStorage.setItem(LS_KEY, mode);
    } catch {}
  }
}

export default function ThemeToggle({
  className = "",
  showLabel = false,
  defaultMode = "system",
  persist = true,
}: {
  className?: string;
  showLabel?: boolean;
  /** Initial mode if nothing in localStorage (default: "system") */
  defaultMode?: ThemeMode;
  /** Persist choice to localStorage (default: true) */
  persist?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(defaultMode);

  const mqlRef = useRef<MediaQueryList | null>(null);
  const modeRef = useRef<ThemeMode>(defaultMode); // authoritative current mode

  const nextMode = useMemo<ThemeMode>(() => {
    if (mode === "light") return "dark";
    if (mode === "dark") return "system";
    return "light";
  }, [mode]);

  const label = useMemo(
    () => (mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"),
    [mode],
  );

  const emitChange = useCallback((newMode: ThemeMode) => {
    try {
      window.dispatchEvent(new CustomEvent("theme:change", { detail: { mode: newMode } }));
      (globalThis as any).__onThemeModeChange?.(newMode);
    } catch {}
  }, []);

  useEffect(() => {
    setMounted(true);

    const mql =
      typeof window !== "undefined" && "matchMedia" in window
        ? window.matchMedia(MEDIA_QUERY)
        : null;
    mqlRef.current = mql;

    // Bootstrap from storage (if allowed) or prop default
    let initial = defaultMode;
    if (persist) {
      const stored = readStoredMode();
      if (stored) initial = stored;
    }

    modeRef.current = initial;
    setMode(initial);
    applyTheme(initial, mql, persist);

    // React to OS changes only while in "system"
    const onSystemChange = () => {
      if (modeRef.current === "system") {
        applyTheme("system", mqlRef.current, persist);
        emitChange("system");
      }
    };

    const offMql =
      mql && "addEventListener" in mql
        ? (mql.addEventListener("change", onSystemChange),
          () => mql.removeEventListener("change", onSystemChange))
        : mql && "addListener" in mql
          ? // @ts-expect-error legacy
            (mql.addListener(onSystemChange),
            // @ts-expect-error legacy
            () => mql.removeListener(onSystemChange))
          : () => {};

    // Cross-tab sync (when persisting)
    const onStorage = (e: StorageEvent) => {
      if (!persist || e.key !== LS_KEY) return;
      const v = (e.newValue || "").toLowerCase();
      if (v === "light" || v === "dark" || v === "system") {
        const nv = v as ThemeMode;
        modeRef.current = nv;
        setMode(nv);
        applyTheme(nv, mqlRef.current, persist);
        emitChange(nv);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      offMql();
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetMode = useCallback(
    (m: ThemeMode) => {
      modeRef.current = m; // keep in sync so OS changes don't override manual choice
      setMode(m);
      applyTheme(m, mqlRef.current, persist);
      emitChange(m);
      if (!persist) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {}
      }
    },
    [emitChange, persist],
  );

  const handleClick = useCallback(() => handleSetMode(nextMode), [handleSetMode, nextMode]);

  const baseBtn = [
    "inline-flex min-h-9 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium transition sm:gap-1.5 sm:text-sm",
    "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm",
    "hover:bg-[var(--bg-subtle)]",
    "active:scale-[.99]",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    className,
  ].join(" ");

  // Pre-mount placeholder (avoids layout shift)
  if (!mounted) {
    return (
      <button aria-hidden className={baseBtn} title="Toggle theme">
        <span
          className="inline-block h-2 w-2 rounded-full bg-[var(--text-muted)] sm:h-2.5 sm:w-2.5"
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={baseBtn}
      // `switch` is boolean; keep button semantics + rich label for 3-state
      role="button"
      aria-label={`Theme: ${label}. Click to switch to ${nextMode}.`}
      title={`Theme: ${label} - click to switch to ${nextMode}`}
    >
      {mode === "dark" ? (
        // Sun icon (dark mode active)
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px] text-[var(--text)] sm:h-5 sm:w-5"
          fill="none"
          aria-hidden
        >
          <path
            d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.64 5.64L4.22 4.22M19.78 19.78l-1.42-1.42M5.64 18.36l-1.42 1.42M19.78 4.22l-1.42 1.42"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      ) : mode === "light" ? (
        // Moon icon (light mode active)
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px] text-[var(--text)] sm:h-5 sm:w-5"
          fill="none"
          aria-hidden
        >
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            stroke="currentColor"
            strokeWidth="2"
            fill="currentColor"
          />
        </svg>
      ) : (
        // Monitor icon (system mode)
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px] text-[var(--text)] sm:h-5 sm:w-5"
          fill="none"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M2 20h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}

      {showLabel ? <span className="select-none">{label}</span> : null}

      {/* Subtle state pip */}
      <span
        className={[
          "ml-1 inline-block h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2",
          mode === "system" ? "bg-[var(--text-muted)]" : "bg-[var(--text)]",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
  );
}
