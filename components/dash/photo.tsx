"use client";

import { useEffect, useRef, useState } from "react";

const ART = { track: "/images/art/track.svg", finish: "/images/art/finish.svg", medal: "/images/art/medal.svg" } as const;

/**
 * A photo slot. Shows /images/<name>.jpg when you add a real photo with that name;
 * until then it shows a designed TrackRecord artwork, never a broken image.
 */
export function Photo({ name, art, alt, className = "" }: { name: string; art: keyof typeof ART; alt: string; className?: string }) {
  const [src, setSrc] = useState(`/images/${name}.jpg`);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // The photo may have failed before this page became interactive: check once on mount.
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setSrc(ART[art]);
  }, [art]);
  const isArt = src.endsWith(".svg");
  return (
    <div className={`tr-photo ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={src} alt={isArt ? "" : alt} onError={() => setSrc(ART[art])} style={isArt ? { objectFit: "contain" } : undefined} />
    </div>
  );
}
