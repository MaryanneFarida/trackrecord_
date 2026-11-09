import Link from "next/link";
import { Brand } from "@/components/brand";

/** Header for pages anyone can open without signing in (home, verify, final lists). */
export function PublicHeader() {
  return (
    <header className="border-b bg-background/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2">
        <Brand />
        <div className="flex items-center gap-1">
        <Link href="/selection" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-primary hover:bg-secondary">
          Final lists
        </Link>
        <Link href="/login" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/85">
          Sign in
        </Link>
        </div>
      </nav>
    </header>
  );
}
