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
