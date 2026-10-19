export function AnimatedIcon({
  kind = "search",
}: {
  kind?: "search" | "time" | "signal" | "dots";
}) {
  return (
    <span className={`animated-icon animated-icon--${kind}`} aria-hidden="true">
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        {kind === "search" ? (
          <>
            <circle cx="14" cy="14" r="8" />
            <path className="icon-search-beam" d="m20 20 7 7" />
            <circle className="icon-search-ping" cx="14" cy="14" r="4" />
          </>
        ) : kind === "time" ? (
          <>
            <circle cx="16" cy="16" r="11" />
            <path className="icon-clock-hand" d="M16 9v7l4 3" />
          </>
        ) : kind === "signal" ? (
          <>
            <path className="icon-signal-outer" d="M5 12a16 16 0 0 1 22 0" />
            <path className="icon-signal-inner" d="M9 17a10 10 0 0 1 14 0" />
            <circle cx="16" cy="23" r="1.3" fill="currentColor" />
          </>
        ) : (
          <>
            {[8, 16, 24].map((x, i) => (
              <circle
                key={x}
                className={`icon-dot icon-dot-${i}`}
                cx={x}
                cy="16"
                r="2.4"
                fill="currentColor"
                stroke="none"
              />
            ))}
          </>
        )}
      </svg>
    </span>
  );
}
