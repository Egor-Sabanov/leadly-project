import Link from "next/link";
import type { Route } from "next";
export function LeadlyLogo({
  compact = false,
  href = "/",
}: {
  compact?: boolean;
  href?: Route;
}) {
  return (
    <Link
      className={`leadly-logo ${compact ? "leadly-logo--compact" : ""}`}
      href={href}
      aria-label="LEADLY — на главную"
    >
      <svg className="leadly-logo-mark" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="currentColor" />
        <path
          d="M10 28 19 10h5L15 28Zm12-13 8 13h-7l-4-7Z"
          fill="var(--logo-cutout,#fff)"
        />
      </svg>
      {!compact && (
        <span className="leadly-logo-copy">
          <span className="leadly-logo-word">
            LEADLY<span className="logo-period"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 10 10 2M2 2h8v8"/></svg></span>
          </span>
          <span className="leadly-logo-tagline">
            Возможности становятся делом
          </span>
        </span>
      )}
    </Link>
  );
}
