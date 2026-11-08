import { describe, expect, it } from "vitest";
import { render } from "./templates";

describe("notification templates", () => {
  it("tells the athlete an objection does not remove them", () => {
    const m = render({ kind: "objection_received", eventName: "Nakuru Qualifier", category: "Identity", reason: "Looks like a different runner" }, "https://tr.example");
    expect(m.subject).toContain("Nakuru Qualifier");
    expect(m.text).toContain("STILL on the start list");
    expect(m.text).toContain("https://tr.example/athlete");
  });
  it("confirms a registration with the lock time", () => {
    const m = render({ kind: "registration_confirmed", eventName: "Nakuru", races: ["400m"], lockTime: "Mon 9 Nov 10:00 EAT" }, "https://tr.example");
    expect(m.text).toContain("Mon 9 Nov 10:00 EAT");
  });
});
