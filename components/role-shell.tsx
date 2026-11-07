import type { ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";

/**
 * Shared frame for every role area.
 * Phase 1 adds the guard here: read the session cookie on the server,
 * check the role claim, and redirect anyone without it.
 */
export function RoleShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <nav aria-label="Area" className="flex items-center justify-between border-b pb-3">
        <Link href="/" className="font-semibold">TrackRecord</Link>
        <span className="rounded-full bg-muted px-3 py-1 text-sm">{ROLE_LABELS[role]}</span>
      </nav>
      {children}
    </div>
  );
}
