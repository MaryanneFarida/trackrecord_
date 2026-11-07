export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <section className="mx-auto max-w-2xl space-y-3 px-4 py-8">
      <h1 className="text-2xl font-semibold">You are offline</h1>
      <p>This page hasn&apos;t been saved on this phone yet. Screens you opened before still work.</p>
      <p>Anything you have signed is stored safely and will upload when the connection returns.</p>
    </section>
  );
}
