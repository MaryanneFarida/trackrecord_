import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { sameOrigin } from "@/lib/auth/api";
import { audit } from "@/lib/audit";
import { JUDGE_ROLES, judgeEmail } from "@/lib/auth/judges";

const body = z.object({ code: z.string().min(1).max(200), role: z.enum(JUDGE_ROLES) }).strict();
const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * The judges' door. With the right access code it returns a one-time Firebase
 * sign-in token for ONE demo account. Only demo accounts can be opened this way,
 * never a real person's. Closed unless JUDGE_ACCESS_CODE is set. Every attempt is audited.
 * The judge still has to add a passkey on their own device before any role page opens.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "bad_origin" }, { status: 403 });
  const expected = serverEnv().JUDGE_ACCESS_CODE;
  if (!expected) return Response.json({ error: "closed" }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  await new Promise((r) => setTimeout(r, 400)); // slows down guessing
  if (!timingSafeEqual(digest(parsed.data.code.trim()), digest(expected))) {
    audit("judges.bad_code", "anonymous", { role: parsed.data.role });
    return Response.json({ error: "wrong_code" }, { status: 401 });
  }
  const user = await adminAuth().getUserByEmail(judgeEmail(parsed.data.role)).catch(() => null);
  if (!user) return Response.json({ error: "not_set_up" }, { status: 404 });
  const token = await adminAuth().createCustomToken(user.uid);
  audit("judges.signed_in", user.uid, { role: parsed.data.role });
  return Response.json({ token });
}
