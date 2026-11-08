import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, seal } from "./files";

const key = randomBytes(32).toString("hex");
const photo = randomBytes(5000);

describe("file encryption (AES-256-GCM)", () => {
  it("round-trips a file", () => {
    expect(open(seal(photo, key, "athlete:u1:id"), key, "athlete:u1:id").equals(photo)).toBe(true);
  });
  it("never produces the same ciphertext twice", () => {
    expect(seal(photo, key, "x").data.equals(seal(photo, key, "x").data)).toBe(false);
  });
  it("detects a single changed byte", () => {
    const s = seal(photo, key, "athlete:u1:id");
    s.data[10] ^= 1;
    expect(() => open(s, key, "athlete:u1:id")).toThrow();
  });
  it("refuses a photo moved onto another athlete's record", () => {
    const s = seal(photo, key, "athlete:u1:id");
    expect(() => open(s, key, "athlete:u2:id")).toThrow();
  });
  it("refuses the wrong key", () => {
    expect(() => open(seal(photo, key, "x"), randomBytes(32).toString("hex"), "x")).toThrow();
  });
});
