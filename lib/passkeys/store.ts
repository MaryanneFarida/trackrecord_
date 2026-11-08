/** Where passkeys are kept. The app uses Firestore; tests use the in-memory version. */
export interface StoredPasskey {
  id: string; // credential ID (base64url)
  publicKey: Uint8Array<ArrayBuffer>; // the phone keeps the private half; we only ever see this
  counter: number;
  transports: string[];
  label: string;
  deviceType: string; // "singleDevice" | "multiDevice"
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface PasskeyStore {
  list(uid: string): Promise<StoredPasskey[]>;
  add(uid: string, passkey: StoredPasskey): Promise<void>;
  touch(uid: string, id: string, counter: number, at: string): Promise<void>;
}

export function memoryStore(): PasskeyStore {
  const data = new Map<string, StoredPasskey[]>();
  return {
    async list(uid) {
      return [...(data.get(uid) ?? [])];
    },
    async add(uid, pk) {
      data.set(uid, [...(data.get(uid) ?? []), pk]);
    },
    async touch(uid, id, counter, at) {
      const pk = (data.get(uid) ?? []).find((p) => p.id === id);
      if (pk) Object.assign(pk, { counter, lastUsedAt: at });
    },
  };
}
