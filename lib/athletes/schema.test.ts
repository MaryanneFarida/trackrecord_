import { describe, expect, it } from "vitest";
import { applicationSchema, decodeJpeg } from "./schema";

const fakeJpeg = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 7)]).toString("base64");
const valid = {
  fullName: "Farida Atieno",
  licenceNo: "KEN-PA-0042",
  sportClass: "T12",
  events: ["400m", "800m"],
  guideRunner: true,
  consent: true,
  idPhoto: fakeJpeg,
  selfie: fakeJpeg,
};

describe("athlete application", () => {
  it("accepts a complete application", () => {
    expect(applicationSchema.safeParse(valid).success).toBe(true);
  });
  it("requires consent and a real sport class", () => {
    expect(applicationSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...valid, sportClass: "T99" }).success).toBe(false);
  });
  it("rejects unexpected extra fields (no sneaking in role: admin)", () => {
    expect(applicationSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });
  it("only accepts real JPEG bytes", () => {
    expect(decodeJpeg(fakeJpeg)).not.toBeNull();
    const png = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(4000)]).toString("base64");
    expect(decodeJpeg(png)).toBeNull();
  });
});
