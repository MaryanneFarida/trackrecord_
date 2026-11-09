import { PublicHeader } from "@/components/public-header";
import { JudgeLogin } from "@/components/auth/judge-login";

export const metadata = { title: "Judges" };

/** Entry for the judging panel: demo accounts, opened with an access code. */
export default function JudgesPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10">
        <header className="space-y-2">
          <p className="tr-eyebrow">Judging panel</p>
          <h1 className="text-4xl font-semibold">Try TrackRecord as any role</h1>
          <p className="text-lg text-muted-foreground">
            These are demo accounts with fictional people. After you enter, TrackRecord asks you to add a passkey on this
            device (fingerprint, face or screen lock). That is the real security model: every important action is signed with it.
          </p>
        </header>
        <div className="rounded-[1.5rem] border bg-card p-6">
          <JudgeLogin />
        </div>
        <p className="text-sm text-muted-foreground">To switch roles, use Sign out at the top of any page, then come back here.</p>
      </main>
    </>
  );
}
