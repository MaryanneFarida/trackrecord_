import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Brand } from "@/components/brand";

/**
 * Shared frame for every role area, and the role guard.
 * Every page under app/(athlete), app/(coach), ... passes through here.
 * IMPORTANT: each page must ALSO call requireRole() itself (see any role page),
 * because Next.js prerenders a page's static parts separately from this layout.
 * Privacy: the email address is never shown on screen.
 */
export function RoleShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status" className="p-8">Checking your access...</p>}>
      <Guard role={role}>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ role, children }: { role: Role; children: ReactNode }) {
  await requireRole(role);
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
          <Brand />
          <div className="flex flex-wrap items-center justify-end gap-1">
            <span className="hidden rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-primary sm:inline">{ROLE_LABELS[role]}</span>
            <Link href="/selection" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-muted">
              Final lists
            </Link>
            <Link href="/account/passkeys" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-muted">
              Passkeys
            </Link>
            <SignOutButton />
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:py-8">{children}</main>
      <footer className="tr-ticker mt-8 overflow-hidden whitespace-nowrap py-3 text-sm font-medium tracking-[0.2em]" aria-hidden="true">
        SEALED START LISTS &middot; SIGNED RESULTS &middot; PUBLIC PROOF &middot; NOTHING CHANGES SILENTLY &middot; SEALED START LISTS &middot; SIGNED RESULTS &middot; PUBLIC PROOF
      </footer>
    </>
  );
}
