"use client";
import { useEffect, useRef } from "react";

export default function InfiniteLoader({ onLoad, disabled }:{ onLoad:()=>void; disabled?:boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current || disabled) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) onLoad();
      });
    }, { rootMargin: "400px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onLoad, disabled]);

  return <div ref={ref} aria-hidden className="h-12" />;
}
