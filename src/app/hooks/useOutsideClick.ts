"use client";
// src/app/hooks/useOutsideClick.ts

import { useEffect } from "react";

type MaybeRef<T extends HTMLElement = HTMLElement> = React.RefObject<T | null>;

type Ignorable =
  | HTMLElement
  | null
  | undefined
  | React.RefObject<HTMLElement | null>
  | Array<HTMLElement | React.RefObject<HTMLElement | null> | null | undefined>;

type EventKind = "pointerdown" | "mousedown" | "touchstart" | "click";

export type UseOutsideClickOptions = {
  /** Enable/disable the listener. Default: true */
  enabled?: boolean;
  /** Also call this when the click is *inside* any target ref. Default: none */
  onInside?: () => void;
  /** Elements/refs to ignore (treated as inside). Default: none */
  ignore?: Ignorable;
  /** Events to listen on. Default: ["pointerdown"] (fallback to "mousedown" if unsupported) */
  eventTypes?: EventKind[];
  /** Call onOutside when Escape is pressed. Default: true */
  closeOnEscape?: boolean;
};

/**
 * Calls `onOutside` when an event happens outside the given element(s).
 * - Supports one or multiple refs
 * - Shadow DOM–safe via composedPath()
 * - Optional ignore list
 * - Optional Escape-to-close
 */
export default function useOutsideClick<T extends HTMLElement>(
  refs: MaybeRef<T> | ReadonlyArray<MaybeRef<T>>,
  onOutside: () => void,
  opts?: UseOutsideClickOptions
) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const {
      enabled = true,
      onInside,
      ignore,
      eventTypes,
      closeOnEscape = true,
    } = opts ?? {};

    if (!enabled) return;

    // Normalize refs to array
    const refArray: ReadonlyArray<MaybeRef<T>> = Array.isArray(refs) ? refs : [refs];

    // Resolve current elements -> T[]
    const targets: T[] = refArray
      .map((r) => (r && "current" in r ? r.current : null))
      .filter((el): el is T => el !== null);

    if (targets.length === 0) return;

    // Normalize ignore list to concrete elements -> HTMLElement[]
    const ignoreEls: HTMLElement[] = [];
    const collectIgnorable = (x: Ignorable): void => {
      if (!x) return;
      if (Array.isArray(x)) {
        x.forEach(collectIgnorable);
      } else if (typeof (x as any)?.current !== "undefined") {
        const el = (x as React.RefObject<HTMLElement | null>).current;
        if (el) ignoreEls.push(el);
      } else if (x instanceof HTMLElement) {
        ignoreEls.push(x);
      }
    };
    collectIgnorable(ignore);

    const isInsideAny = (target: EventTarget | null): boolean => {
      if (!target) return false;

      // Shadow DOM–safe path
      const path = (target as any)?.composedPath?.() as EventTarget[] | undefined;
      const nodes: Node[] =
        path && Array.isArray(path) && path.length ? (path.filter(Boolean) as Node[]) : [target as Node];

      // Check main targets and ignores
      for (const node of nodes) {
        if (!(node instanceof Node)) continue;
        if (targets.some((el) => el.contains(node))) return true;
        if (ignoreEls.some((el) => el.contains(node))) return true;
      }
      return false;
    };

    const handlePointer = (e: Event) => {
      const t = e.target as EventTarget | null;
      if (isInsideAny(t)) {
        onInside?.();
        return;
      }
      onOutside();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (!closeOnEscape) return;
      if (e.key === "Escape" || e.key === "Esc") onOutside();
    };

    // Choose events: prefer pointerdown; fallback to mousedown if unsupported
    const chosenEvents: EventKind[] =
      eventTypes && eventTypes.length
        ? eventTypes
        : ("onpointerdown" in window ? ["pointerdown"] : ["mousedown"]);

    // Use capture so we’re early in the event phase
    const captureOpts: AddEventListenerOptions = { capture: true, passive: true };

    for (const ev of chosenEvents) {
      document.addEventListener(ev, handlePointer, captureOpts);
    }
    if (closeOnEscape) document.addEventListener("keydown", handleKey, true);

    return () => {
      for (const ev of chosenEvents) {
        document.removeEventListener(ev, handlePointer, captureOpts);
      }
      if (closeOnEscape) document.removeEventListener("keydown", handleKey, true);
    };
  }, [refs, onOutside, opts]);
}
