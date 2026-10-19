"use client";
import { MotionToggle } from "@/components/brand/MotionToggle";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BrandMotion } from "./BrandMotion";

export function BrandWelcome({
  name,
  destination,
}: {
  name: string;
  destination: "/" | "/onboarding";
}) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch(destination);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => router.replace(destination),
      reduce ? 150 : 1900,
    );
    return () => window.clearTimeout(timer);
  }, [router, destination]);
  return (
    <main className="brand-welcome">
      <div className="welcome-motion-toggle">
        <MotionToggle />
      </div>
      <div className="welcome-brand-word">LEADLY</div>
      <BrandMotion variant="welcome" />
      <div className="welcome-message" role="status">
        <h1>{name ? `Рады видеть, ${name}.` : "Добро пожаловать."}</h1>
        <p>
          {destination === "/onboarding"
            ? "Сначала настроим подборку под тебя."
            : "Твоё рабочее пространство готово."}
        </p>
      </div>
      <Link href={destination} replace className="welcome-continue">
        Продолжить <ArrowRight size={16} />
      </Link>
    </main>
  );
}
