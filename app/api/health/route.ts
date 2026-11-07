// Simple check that the server is up.
export async function GET() {
  return Response.json({ ok: true, service: "trackrecord" });
}
