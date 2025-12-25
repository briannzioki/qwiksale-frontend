"use client";

import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

function isExternalUrl(href: string) {
  try {
    const u = new URL(href, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export default function CapacitorBridge() {
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Status bar: avoid overlay (fixes “too close to top” feeling)
    (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        // Optional: set a background so it looks clean
        // await StatusBar.setBackgroundColor({ color: "#0b1020" });
      } catch {}
    })();

    // External links -> system browser
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const a = (t?.closest?.("a") as HTMLAnchorElement | null) ?? null;
      if (!a) return;

      const href = a.getAttribute("href") || "";
      if (!href) return;
      if (href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const absolute = new URL(href, window.location.href).toString();
      if (!isExternalUrl(absolute)) return;

      e.preventDefault();
      e.stopPropagation();
      Browser.open({ url: absolute }).catch(() => {});
    };

    document.addEventListener("click", onClick, true);

    // IMPORTANT: addListener returns a Promise in your typings -> keep the Promise
    const backSubPromise = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });

    return () => {
      document.removeEventListener("click", onClick, true);
      void backSubPromise.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  return null;
}
