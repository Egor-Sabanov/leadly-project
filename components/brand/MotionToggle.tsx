"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";

const event = "leadly-motion-preference";
const key = "leadly.motion.paused";
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener("storage", listener);
  };
}
let fallback = false;
let storageUnavailable = false;
function snapshot() {
  if (storageUnavailable) return fallback;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    storageUnavailable = true;
    return fallback;
  }
}

export function MotionToggle() {
  const paused = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "paused" : "full";
  }, [paused]);
  const label = paused ? "Включить анимации" : "Приостановить анимации";
  return (
    <button
      type="button"
      className="icon-btn motion-toggle"
      aria-label={label}
      title={label}
      aria-pressed={paused}
      onClick={() => {
        fallback = !paused;
        try {
          localStorage.setItem(key, String(!paused));
        } catch {
          storageUnavailable = true;
        }
        document.documentElement.dataset.motion = paused ? "full" : "paused";
        window.dispatchEvent(new Event(event));
      }}
    >
      {paused ? (
        <Play size={16} aria-hidden="true" />
      ) : (
        <Pause size={16} aria-hidden="true" />
      )}
    </button>
  );
}
