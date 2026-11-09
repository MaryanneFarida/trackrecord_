import { redirect } from "next/navigation";

/** /verify?n=12 -> /verify/12 (used by the "Check a record" box on the home page). */
export default async function VerifyIndex({ searchParams }: PageProps<"/verify">) {
  const n = String((await searchParams).n ?? "").trim();
  redirect(/^\d{1,10}$/.test(n) ? `/verify/${n}` : "/");
}
