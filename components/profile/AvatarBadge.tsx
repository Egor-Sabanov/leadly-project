"use client";
import Image from "next/image";
import { useState } from "react";
export function AvatarBadge({
  url = "",
  name,
}: {
  url?: string;
  name: string;
}) {
  const [failedUrl, setFailedUrl] = useState("");
  if (!url || failedUrl === url)
    return (
      <span
        className="header-avatar header-avatar--fallback"
        aria-hidden="true"
      >
        {name.trim().slice(0, 1).toLocaleUpperCase("ru") || "Л"}
      </span>
    );
  return (
    <Image
      unoptimized
      src={url}
      className="header-avatar"
      width={38}
      height={38}
      alt="Твоя аватарка"
      onError={() => setFailedUrl(url)}
    />
  );
}
