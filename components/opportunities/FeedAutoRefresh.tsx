"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
export function FeedAutoRefresh({ initialVersion }: { initialVersion: string | null }) {
  const router = useRouter(), last = useRef<string | null | undefined>(initialVersion);
  const [notice, setNotice] = useState(""), [, startTransition] = useTransition();
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function check() {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      try {
        const result = await fetch("/api/opportunities/updates", { cache: "no-store", signal: controller.signal });
        if (!result.ok) return;
        const data = await result.json();
        if (typeof data.version !== "string" && data.version !== null) return;
        if (last.current !== undefined && last.current !== data.version) { startTransition(() => router.refresh()); setNotice("В ленте появились новые задания."); }
        last.current = data.version;
      } catch { /* Keep the usable feed on a transient refresh failure. */ }
      finally { busy = false; }
    }
    void check(); const timer = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); controller.abort(); document.removeEventListener("visibilitychange", check); };
  }, [router]);
  return notice ? <p className="muted" role="status">{notice}</p> : null;
}
