/** The six TrackRecord roles. Stored as Firebase custom claims (set only by the server). */
export const ROLES = ["athlete", "coach", "official", "doctor", "admin", "tribunal"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  athlete: "Athlete",
  coach: "Coach",
  official: "Venue official",
  doctor: "Doctor",
  admin: "Federation admin",
  tribunal: "Tribunal",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Where each role lands after signing in. No role yet -> waiting page. */
export function homeFor(role: Role | null): string {
  return role ? `/${role}` : "/pending";
}
