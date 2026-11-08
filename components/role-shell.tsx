import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Shared frame for every role area, and the role guard.
 * Every page under app/(athlete), app/(coach), ... passes through here.
 * IMPORTANT: each page must ALSO call requireRole() itself (see any role page),
 * because Next.js prerenders a page's static parts separately from this layout.
 */
export function RoleShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <Suspense fallback={<p role="status">Checking your access...</p>}>
        <Guard role={role}>{children}</Guard>
      </Suspense>
    </div>
  );
}

async function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const session = await requireRole(role);

  return (
    <>
      <nav aria-label="Area" className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <Link href="/" className="font-semibold">TrackRecord</Link>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-muted px-3 py-1 text-sm">{ROLE_LABELS[role]}</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">{session.email}</span>
          <SignOutButton />
        </div>
      </nav>
      {children}
    </>
  );
}
