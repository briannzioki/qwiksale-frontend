"use client";

import * as React from "react";

type TriggerMap = Map<string, HTMLElement | null>;

type ExclusivePopoverApi = {
  openId: string | null;
  setOpenId: (id: string | null, opts?: { focus?: boolean }) => void;
  close: (opts?: { focus?: boolean }) => void;
  registerTrigger: (id: string, el: HTMLElement | null) => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
};

export default function ExclusivePopoverGroup({
  children,
}: {
  children: (api: ExclusivePopoverApi) => React.ReactNode;
}) {
  const [openId, setOpenIdState] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const triggersRef = React.useRef<TriggerMap>(new Map());
  const lastTriggerIdRef = React.useRef<string | null>(null);

  const registerTrigger = React.useCallback((id: string, el: HTMLElement | null) => {
    triggersRef.current.set(id, el);
  }, []);

  const focusTrigger = React.useCallback((id: string | null) => {
    if (!id) return;
    const el = triggersRef.current.get(id);
    if (el && typeof el.focus === "function") {
      try {
        el.focus();
      } catch {}
    }
  }, []);

  const close = React.useCallback(
    (opts?: { focus?: boolean }) => {
      const shouldFocus = opts?.focus !== false;
      const last = lastTriggerIdRef.current;
      setOpenIdState(null);
      if (shouldFocus) {
        queueMicrotask(() => focusTrigger(last));
      }
    },
    [focusTrigger],
  );

  const setOpenId = React.useCallback(
    (id: string | null, opts?: { focus?: boolean }) => {
      const shouldFocus = opts?.focus !== false;
      if (id) lastTriggerIdRef.current = id;
      setOpenIdState(id);
      if (id == null && shouldFocus) {
        queueMicrotask(() => focusTrigger(lastTriggerIdRef.current));
      }
    },
    [focusTrigger],
  );

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (!openId) return;
      e.preventDefault();
      close({ focus: true });
    }

    function onPointerDown(e: Event) {
      if (!openId) return;
      const t = e.target as Node | null;
      if (!t) return;

      const panel = panelRef.current;
      if (panel && panel.contains(t)) return;

      const trig = triggersRef.current.get(openId);
      if (trig && trig.contains(t)) return;

      close({ focus: false });
    }

    document.addEventListener("keydown", onKeyDown, { passive: false });
    document.addEventListener("pointerdown", onPointerDown, { capture: true });

    return () => {
      document.removeEventListener("keydown", onKeyDown as any);
      document.removeEventListener("pointerdown", onPointerDown as any, { capture: true } as any);
    };
  }, [openId, close]);

  return (
    <>
      {children({
        openId,
        setOpenId,
        close,
        registerTrigger,
        panelRef,
      })}
    </>
  );
}
