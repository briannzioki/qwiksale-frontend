// src/app/components/dev/NavTrace.client.tsx
"use client";
import { useEffect } from "react";

export default function NavTrace() {
  useEffect(() => {
    const w = window as any;
    w.__nav ??= { pushes: 0, replaces: 0, reloads: 0, stacks: [] as string[] };

    const wrap = <T extends (...a: any[]) => any>(obj: any, key: string) => {
      const orig = obj?.[key] as T | undefined;
      if (typeof orig !== "function") return;

      const wrapped = function (this: any, ...args: any[]) {
        const err = new Error();
        const stack = String(err.stack || "")
          .split("\n")
          .filter((l) => l.includes("\\src\\") || l.includes("/src/"))
          .slice(0, 5)
          .join("\n");

        if (key === "replaceState") w.__nav.replaces++;
        if (key === "pushState") w.__nav.pushes++;
        if (key === "reload") w.__nav.reloads++;
        if (w.__nav.stacks.length < 5) w.__nav.stacks.push(`[${key}] ${stack}`);

        // Preserve original `this` binding for History/Location methods.
        return (orig as any).apply(this, args);
      } as unknown as T;

      obj[key] = wrapped;
    };

    wrap(history as any, "replaceState");
    wrap(history as any, "pushState");
    wrap(location as any, "reload");
  }, []);

  return null;
}
