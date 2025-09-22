// src/app/components/ThemeToggle.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

const LS_KEY = "theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function readStoredMode(): ThemeMode | null {
  try {
    const raw = (localStorage.getItem(LS_KEY) || "").toLowerCase();
    return raw === "light" || raw === "dark" || raw === "system" ? (raw as ThemeMode) : null;
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
  const modeRef = useRef<ThemeMode>(defaultMode); // <- keep the authoritative current mode

  const nextMode = useMemo<ThemeMode>(() => {
    if (mode === "light") return "dark";
    if (mode === "dark") return "system";
    return "light";
  }, [mode]);

  const label = useMemo(
    () => (mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"),
    [mode]
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
        ? (mql.addEventListener("change", onSystemChange), () =>
            mql.removeEventListener("change", onSystemChange))
        : mql && "addListener" in mql
        ? // @ts-expect-error legacy API on older browsers
          (mql.addListener(onSystemChange), () => mql.removeListener(onSystemChange))
        : () => {};

    // Cross-tab sync (when persisting)
    const onStorage = (e: StorageEvent) => {
      if (!persist || e.key !== LS_KEY || !e.newValue) return;
      const v = e.newValue as ThemeMode;
      if (v === "light" || v === "dark" || v === "system") {
        modeRef.current = v;
        setMode(v);
        applyTheme(v, mqlRef.current, persist);
        emitChange(v);
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
      modeRef.current = m; // <- keep in sync so OS changes don't override manual choice
      setMode(m);
      applyTheme(m, mqlRef.current, persist);
      emitChange(m);
      if (!persist) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {}
      }
    },
    [emitChange, persist]
  );

  const handleClick = useCallback(() => handleSetMode(nextMode), [handleSetMode, nextMode]);

  if (!mounted) {
    return (
      <button
        aria-hidden
        className={`rounded-xl p-2 transition hover:bg-white/20 ${className}`}
        title="Toggle theme"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-white/70" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-2 rounded-xl p-2 text-sm transition hover:bg-white/20 ${className}`}
      role="switch"
      aria-pressed={mode === "dark"}
      aria-label={`Theme: ${label}. Click to switch to ${nextMode}.`}
      title={`Theme: ${label} — click to switch to ${nextMode}`}
    >
      {mode === "dark" ? (
        // Sun icon (dark mode active)
        <svg width="20" height="20" viewBox="0 0 24 24" className="text-yellow-300" fill="none" aria-hidden>
          <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.64 5.64L4.22 4.22M19.78 19.78l-1.42-1.42M5.64 18.36l-1.42 1.42M19.78 4.22l-1.42 1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ) : mode === "light" ? (
        // Moon icon (light mode active)
        <svg width="20" height="20" viewBox="0 0 24 24" className="text-slate-700 dark:text-slate-200" fill="none" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" fill="currentColor"/>
        </svg>
      ) : (
        // Monitor icon (system mode)
        <svg width="20" height="20" viewBox="0 0 24 24" className="text-gray-900 dark:text-gray-100" fill="none" aria-hidden>
          <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M2 20h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )}
      {showLabel && <span className="select-none">{label}</span>}
    </button>
  );
}
