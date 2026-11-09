/** The five demo accounts the judges can open with the access code (made by scripts/judge-accounts.mjs). */
export const JUDGE_ROLES = ["athlete", "coach", "official", "tribunal", "admin"] as const;
export type JudgeRole = (typeof JUDGE_ROLES)[number];
export const judgeEmail = (role: JudgeRole) => `judge.${role}@demo.trackrecord.app`;
