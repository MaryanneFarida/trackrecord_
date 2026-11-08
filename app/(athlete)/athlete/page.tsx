import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";

export const metadata = { title: "Athlete" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("athlete"); // every role page checks for itself, not just the layout
  return <h1 className="text-2xl font-semibold">Athlete area</h1>;
}
