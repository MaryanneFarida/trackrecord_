import type { ReactNode } from "react";
import { Photo } from "./photo";

/**
 * Dashboard building blocks, shared by every role, so every page looks like the same product.
 * Hero: greeting on the left, a real photo on the right (public/images/<image>.jpg),
 * falling back to TrackRecord artwork until a photo is added.
 */
export function Hero(props: {
  image: string;
  art?: "track" | "finish" | "medal";
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  avatar?: string | null; // the athlete's own verified photo
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="tr-hero tr-rise grid overflow-hidden rounded-[1.75rem] border bg-card md:grid-cols-[1.15fr_0.85fr]" aria-labelledby="hero-title">
      <div className="tr-lanes flex flex-col justify-center gap-4 p-6 md:p-10">
        <p className="tr-eyebrow">{props.eyebrow}</p>
        <div className="flex items-center gap-4">
          {props.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.avatar} alt="" className="size-20 shrink-0 rounded-full border-4 border-card object-cover shadow-sm ring-2 ring-primary md:size-24" />
          ) : null}
          <h1 id="hero-title" className="text-3xl font-semibold leading-tight md:text-[2.6rem]">{props.title}</h1>
        </div>
        {props.badge ? <div className="self-start">{props.badge}</div> : null}
        {props.subtitle ? <div className="max-w-xl text-base text-muted-foreground md:text-lg">{props.subtitle}</div> : null}
        {props.children ? <div className="flex flex-wrap gap-2 pt-1">{props.children}</div> : null}
      </div>
      <Photo name={props.image} art={props.art ?? "track"} alt="" className="hidden min-h-64 rounded-none md:block" />
    </section>
  );
}

const TONES = {
  feature: "bg-primary text-primary-foreground border-primary",
  peach: "bg-peach-soft text-foreground",
  sage: "bg-sage-soft text-foreground",
  plain: "bg-card text-foreground",
} as const;

/** A big, glanceable number. Only the first tile uses the brand colour. */
export function Stat({ label, value, hint, tone = "plain" }: { label: string; value: ReactNode; hint?: string; tone?: keyof typeof TONES | "terracotta" | "mustard" | "espresso" | "cream" }) {
  const map: Record<string, keyof typeof TONES> = { terracotta: "feature", mustard: "peach", espresso: "plain", cream: "plain", sage: "sage" };
  const t = TONES[(map[tone] ?? tone) as keyof typeof TONES];
  return (
    <div className={`tr-rise flex min-h-32 flex-col justify-between gap-2 rounded-2xl border p-5 transition-transform duration-200 hover:-translate-y-0.5 ${t}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="tr-num text-4xl font-semibold leading-none">{value}</p>
      {hint ? <p className="text-sm opacity-75">{hint}</p> : null}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}

/** Section shortcuts: large, well-spaced targets. */
export function JumpLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a key={l.href} href={l.href} className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary">
          {l.label}
        </a>
      ))}
    </nav>
  );
}
