import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";
import { homeFor, isRole } from "./roles";

describe("safeNext (open redirect protection)", () => {
  it("allows paths on this site", () => {
    expect(safeNext("/athlete")).toBe("/athlete");
    expect(safeNext("/verify/42?x=1")).toBe("/verify/42?x=1");
  });
  it("blocks other sites and tricks", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/\u0000x"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
  it("handles empty values", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});

describe("roles", () => {
  it("recognises only the six roles", () => {
    expect(isRole("coach")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
  it("sends users without a role to the waiting page", () => {
    expect(homeFor("athlete")).toBe("/athlete");
    expect(homeFor(null)).toBe("/pending");
  });
});
