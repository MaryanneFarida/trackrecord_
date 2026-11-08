import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { systemSigner } from "@/lib/ledger/server";
import { dueForSealing, registrationOpen, type EventRules } from "./rules";
import { EVENTS_COLLECTION, currentListHash, sealStartList, startListPath } from "./seal";

export interface EventView {
  id: string;
  name: string;
  venue: string;
  raceStart: string;
  lockTime: string;
  entryWindowEnd: string;
  events: string[];
  classes: string[];
  sealedAt: string | null;
  sealedSeq: number | null;
  listHash: string | null;
  count: number | null;
  ledgerSeq: number | null;
  /** Worked out when loaded, so pages don't read the clock while rendering. */
  registrationOpen: boolean;
  raceStarted: boolean;
}

export interface StartListRow {
  athleteId: string;
  fullName: string;
  sportClass: string;
  events: string[];
  guideRunner: boolean;
  registeredAt: string;
  signedHash: string;
}

function toView(id: string, d: FirebaseFirestore.DocumentData): EventView {
  const now = Date.now();
  return {
    id,
    name: d.name,
    venue: d.venue,
    raceStart: d.raceStart,
    lockTime: d.lockTime,
    entryWindowEnd: d.entryWindowEnd,
    events: d.events ?? [],
    classes: d.classes ?? [],
    sealedAt: d.sealedAt ?? null,
    sealedSeq: d.sealedSeq ?? null,
    listHash: d.listHash ?? null,
    count: d.count ?? null,
    ledgerSeq: d.ledgerSeq ?? null,
    registrationOpen: registrationOpen({ lockTime: d.lockTime, sealedAt: d.sealedAt } as EventRules, now),
    raceStarted: now >= Date.parse(d.raceStart),
  };
}

/**
 * Upcoming and recent events (race in the last 7 days or later).
 * Any list that is due is sealed on the way, so the seal never depends on a
 * cron job. (Phase 8 adds a daily job as a second trigger.)
 */
export async function listEvents(): Promise<EventView[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const snap = await adminDb().collection(EVENTS_COLLECTION).where("raceStart", ">=", since).orderBy("raceStart").limit(30).get();
  const events = snap.docs.map((d) => toView(d.id, d.data()));
  return Promise.all(events.map(sealIfDue));
}

export async function getEvent(id: string): Promise<EventView | null> {
  const doc = await adminDb().collection(EVENTS_COLLECTION).doc(id).get();
  return doc.exists ? sealIfDue(toView(doc.id, doc.data()!)) : null;
}

async function sealIfDue(ev: EventView): Promise<EventView> {
  if (!dueForSealing(ev, Date.now())) return ev;
  try {
    const r = await sealStartList(adminDb(), systemSigner(), ev.id);
    const doc = await adminDb().collection(EVENTS_COLLECTION).doc(ev.id).get();
    if (r.sealed) console.info(`start list sealed: ${ev.id} as ledger record ${r.sealedSeq}`);
    return toView(doc.id, doc.data()!);
  } catch (err) {
    console.error("sealing failed, will retry on next view", ev.id, err);
    return ev;
  }
}

export async function startList(eventId: string): Promise<StartListRow[]> {
  const snap = await adminDb().collection(startListPath(eventId)).get();
  return snap.docs
    .map((d) => d.data() as StartListRow)
    .sort((a, b) => a.sportClass.localeCompare(b.sportClass) || a.fullName.localeCompare(b.fullName));
}

/** Does the stored list still match the sealed fingerprint? (It should, always.) */
export async function listIntact(ev: EventView): Promise<boolean | null> {
  if (!ev.listHash) return null;
  return (await currentListHash(adminDb(), ev.id)) === ev.listHash;
}
