import { Suspense } from "react";

/** Public verify page (no login). Phase 8 checks the record's hash, signature and chain link. */
export default function VerifyPage({ params }: PageProps<"/verify/[recordId]">) {
  return (
    <section className="mx-auto max-w-2xl space-y-3 px-4 py-8">
      <h1 className="text-2xl font-semibold">Verify a record</h1>
      <Suspense fallback={<p>Loading record...</p>}>
        <RecordStatus params={params} />
      </Suspense>
    </section>
  );
}

async function RecordStatus({ params }: { params: PageProps<"/verify/[recordId]">["params"] }) {
  const { recordId } = await params;
  return <p>Record #{recordId}: verification arrives in Phase 8.</p>;
}
