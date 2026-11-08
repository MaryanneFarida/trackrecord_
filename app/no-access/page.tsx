import Link from "next/link";

export const metadata = { title: "No access" };

export default function NoAccess() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-12">
      <h1 className="text-2xl font-semibold">This area isn&apos;t for your role</h1>
      <p>Each person can only open the area for their own role. This attempt was blocked.</p>
      <Link href="/" className="underline underline-offset-4">Go to the start page</Link>
    </main>
  );
}
