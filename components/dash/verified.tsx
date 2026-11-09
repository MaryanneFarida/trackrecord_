/** The TrackRecord verification seal: small, consistent, authoritative. */
export function VerifiedSeal({ label = "Verified", tone = "forest" }: { label?: string; tone?: "forest" | "light" }) {
  const c = tone === "forest" ? "bg-secondary text-primary" : "bg-[#f7f3ea]/15 text-[#f7f3ea]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4">
        <path d="M10 1.5l2.2 1.6 2.7-.1.9 2.6 2.2 1.6-.8 2.6.8 2.6-2.2 1.6-.9 2.6-2.7-.1L10 18.5l-2.2-1.6-2.7.1-.9-2.6-2.2-1.6.8-2.6-.8-2.6 2.2-1.6.9-2.6 2.7.1z" fill="currentColor" opacity="0.18" />
        <path d="M6.5 10.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}
