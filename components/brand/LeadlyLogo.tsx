import Link from "next/link";
import type { Route } from "next";

type LeadlyLogoProps = {
  compact?: boolean;
  href?: Route;
};

function Mark() {
  return (
    <svg className="leadly-logo-mark" viewBox="0 0 64 64" role="img" aria-label="LEADLY">
      <defs>
        <linearGradient id="leadly-mark-bg" x1="8" y1="6" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5EC5FF" />
          <stop offset="0.48" stopColor="#3E63FF" />
          <stop offset="1" stopColor="#7A4CFF" />
        </linearGradient>
        <linearGradient id="leadly-mark-a" x1="18" y1="50" x2="47" y2="13" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7BD7FF" />
          <stop offset="0.55" stopColor="#E7F5FF" />
          <stop offset="1" stopColor="#B37CFF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#leadly-mark-bg)" />
      <rect x="3" y="3" width="58" height="58" rx="17" fill="none" stroke="rgba(255,255,255,.28)" />
      <path d="M17 48 27.8 18.5c1.4-3.9 6.9-4.2 8.8-.5L49 48h-9.2l-2.8-8H27l-2.8 8H17Zm12.8-15h4.9l-2.4-7-2.5 7Z" fill="url(#leadly-mark-a)" />
    </svg>
  );
}

export function LeadlyLogo({ compact = false, href = "/" }: LeadlyLogoProps) {
  return (
    <Link className={`leadly-logo ${compact ? "leadly-logo--compact" : ""}`} href={href} aria-label="LEADLY — на главную">
      <Mark />
      {!compact && (
        <span className="leadly-logo-copy">
          <span className="leadly-logo-word">LEADL<span>Y</span></span>
          <span className="leadly-logo-tagline">AI-ассистент по заработку</span>
        </span>
      )}
    </Link>
  );
}
