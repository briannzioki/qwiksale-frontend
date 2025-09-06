// src/app/providers.tsx
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

/* ----------------------- Types ----------------------- */

type Props = {
  children: React.ReactNode;
  session?: Session | null;

  /** NextAuth session refetch */
  refetchIntervalSec?: number;
  refetchOnWindowFocus?: boolean;
  /** Remount subtree when the signed-in user changes (helps reset client state) */
  remountOnUserChange?: boolean;

  /** Theme defaults */
  defaultTheme?: "system" | "light" | "dark";
  /** If true and defaultTheme === "system", follow OS changes live */
  enableSystemTheme?: boolean;
  /** Persist theme using localStorage key */
  themeStorageKey?: string;
};

// Minimal shape we rely on for deriving a stable key
type SessionLike = {
  user?: { email?: string | null; id?: string | null } | null;
} | null;

/* ----------------------- Analytics (Phase 7: console-only stub) ----------------------- */

type AnalyticsEvent =
  | "page_view"
  | "product_view"
  | "favorite_add"
  | "favorite_remove"
  | "contact_reveal"
  | "listing_create_attempt"
  | "listing_created"
  | "listing_failed"
  | "search_performed"
  | "filter_changed"
  | string;

type AnalyticsPayload = Record<string, unknown>;

type AnalyticsContextValue = { track: (event: AnalyticsEvent, payload?: AnalyticsPayload) => void };

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

function useAnalyticsInternal(): AnalyticsContextValue {
  const track = useCallback((event: AnalyticsEvent, payload: AnalyticsPayload = {}) => {
    // Console-only stub for now (Phase 7).
    // Later: swap with GA/Plausible/PostHog provider without changing call sites.
    // eslint-disable-next-line no-console
    console.log("[analytics.track]", event, payload);
  }, []);
  return useMemo(() => ({ track }), [track]);
}

export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext) ?? { track: () => {} };
}

/* ----------------------- Theme (self-contained, no deps) ----------------------- */

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme; // selected theme
  resolvedTheme: ResolvedTheme; // applied theme
  setTheme: (t: Theme) => void;
  toggleTheme: () => void; // toggles light<->dark (system resolves first)
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyHtmlClass(theme: ResolvedTheme) {
  const root = document.documentElement;
  // Prevent layout jank when toggling
  root.classList.add("[&_*]:!transition-none");
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  // Optionally expose a data attribute if you want CSS hooks
  root.setAttribute("data-theme", theme);
  // Allow the browser to paint, then re-enable transitions
  requestAnimationFrame(() => {
    root.classList.remove("[&_*]:!transition-none");
  });
}

function useThemeInternal({
  defaultTheme,
  enableSystemTheme,
  storageKey,
}: {
  defaultTheme: Theme;
  enableSystemTheme: boolean;
  storageKey: string;
}): ThemeContextValue {
  const initialResolved = useRef<ResolvedTheme>("light");

  const [theme, setThemeState] = useState<Theme>(() => {
    // First load: localStorage -> defaultTheme
    if (typeof window === "undefined") return defaultTheme;
    try {
      const saved = window.localStorage.getItem(storageKey) as Theme | null;
      return (saved ?? defaultTheme) as Theme;
    } catch {
      return defaultTheme;
    }
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === "system") return getSystemTheme();
    return theme;
  });

  // Apply and persist on theme change
  useEffect(() => {
    const nextResolved = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(nextResolved);
    // Persist selection (not resolved) so user intent is kept
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {}
    applyHtmlClass(nextResolved);
  }, [theme, storageKey]);

  // React to OS changes if using system theme
  useEffect(() => {
    if (!enableSystemTheme) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") {
        const sys = mql.matches ? "dark" : "light";
        setResolvedTheme(sys);
        applyHtmlClass(sys);
      }
    };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [enableSystemTheme, theme]);

  // Avoid unnecessary DOM writes on initial mount if values already match
  useEffect(() => {
    if (initialResolved.current !== resolvedTheme) {
      initialResolved.current = resolvedTheme;
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => {
    const current = theme === "system" ? getSystemTheme() : theme;
    setThemeState(current === "dark" ? "light" : "dark");
  }, [theme]);

  return useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );
}

function ThemeProviderInline({
  children,
  defaultTheme,
  enableSystemTheme,
  storageKey,
}: {
  children: React.ReactNode;
  defaultTheme: Theme;
  enableSystemTheme: boolean;
  storageKey: string;
}) {
  const value = useThemeInternal({ defaultTheme, enableSystemTheme, storageKey });
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return (
    useContext(ThemeContext) ?? {
      theme: "light",
      resolvedTheme: "light",
      setTheme: () => {},
      toggleTheme: () => {},
    }
  );
}

/* ----------------------- Root Providers ----------------------- */

export default function Providers({
  children,
  session = null,
  refetchIntervalSec = 120,
  refetchOnWindowFocus = true,
  remountOnUserChange = true,
  defaultTheme = "system",
  enableSystemTheme = true,
  themeStorageKey = "theme",
}: Props) {
  // Derive a key that remounts subtree when identity changes.
  // Prefer user.id if present; fall back to email; then "anon".
  const identityKey = remountOnUserChange
    ? (((
        (session as SessionLike)?.user?.id ??
        (session as SessionLike)?.user?.email
      ) as string | null | undefined) ?? "anon")
    : "stable";

  const analytics = useAnalyticsInternal();

  return (
    <SessionProvider
      key={identityKey}
      session={(session ?? null) as Session | null} // ✅ ensure null, never undefined
      refetchInterval={Math.max(0, refetchIntervalSec)}
      refetchOnWindowFocus={refetchOnWindowFocus}
    >
      <ThemeProviderInline
        defaultTheme={defaultTheme}
        enableSystemTheme={enableSystemTheme}
        storageKey={themeStorageKey}
      >
        <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>
      </ThemeProviderInline>
    </SessionProvider>
  );
}
