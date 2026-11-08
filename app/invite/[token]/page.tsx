import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { ROLE_LABELS, isRole } from "@/lib/auth/roles";
import { checkInvite, hashInviteToken } from "@/lib/invites/tokens";
import { AcceptInvite } from "@/components/admin/accept-invite";

export const metadata = { title: "Your invitation" };

const PROBLEMS: Record<string, string> = {
  not_found: "This invite link isn't valid. Ask the federation admin for a new one.",
  used: "This invite has already been used. Each link works once.",
  expired: "This invite has expired. Ask the federation admin for a new one.",
  wrong_email: "This invite was made for a different email address. Sign in with the address the admin used.",
  has_role: "Your account already has a role, so it can't take another one.",
};

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-12">
      <Suspense fallback={<p role="status">Checking your invite...</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  const doc = await adminDb().collection("invites").doc(hashInviteToken(token)).get();
  const invite = doc.exists ? (doc.data() as { usedBy: string | null; expiresAt: string; email: string | null; role: string }) : null;
  const problem = checkInvite(invite, session, new Date());

  if (problem || !invite) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Invite can&apos;t be used</h1>
        <p role="alert">{PROBLEMS[problem ?? "not_found"]}</p>
      </>
    );
  }
  const label = isRole(invite.role) ? ROLE_LABELS[invite.role] : invite.role;
  return (
    <>
      <h1 className="text-2xl font-semibold">You&apos;re invited as: {label}</h1>
      <p>
        Signed in as <strong>{session.email}</strong>. Accepting gives this account the {label} role in TrackRecord.
        The invite then stops working.
      </p>
      <AcceptInvite token={token} />
    </>
  );
}
