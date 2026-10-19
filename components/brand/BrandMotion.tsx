"use client";

import { useEffect, useRef } from "react";

/** A small CSS-only signature. No canvas, frame loop or animation dependency. */
export function BrandMotion({
  variant = "story",
}: {
  variant?: "story" | "welcome" | "compact";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = true;
    const update = () =>
      element.classList.toggle("motion-paused", !visible || document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={`brand-motion brand-motion--${variant}`}
      aria-hidden="true"
    >
      <div className="brand-orbit brand-orbit--outer" />
      <div className="brand-orbit brand-orbit--inner" />
      <span className="brand-axis brand-axis--one" />
      <span className="brand-axis brand-axis--two" />
      <svg className="brand-motion-mark" viewBox="0 0 100 100" fill="none">
        <path
          d="M17 77 44 23h15L32 77Zm36-39 24 39H56L44 56Z"
          fill="currentColor"
        />
      </svg>
      <span className="brand-orbit-point" />
    </div>
  );
}
