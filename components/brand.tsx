import Link from "next/link";

/** The TrackRecord mark: a lane-lined seal with a check, the record that can be trusted. */
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`inline-flex min-h-11 items-center gap-2.5 ${light ? "text-[#f7f3ea]" : "text-foreground"}`} aria-label="TrackRecord home">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
        <circle cx="16" cy="16" r="15" fill="#1f4d3a" />
        <circle cx="16" cy="16" r="11" fill="none" stroke="#8fa384" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="7.5" fill="none" stroke="#c0582f" strokeWidth="1.5" />
        <path d="M11.5 16.2l3 3 6-6.4" fill="none" stroke="#f7f3ea" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-heading text-xl font-semibold tracking-tight">
        Track<span className={light ? "text-[#f4d9c4]" : "text-primary"}>Record</span>
      </span>
    </Link>
  );
}
