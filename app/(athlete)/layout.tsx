import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export default function Layout({ children }: { children: ReactNode }) {
  return <RoleShell role="athlete">{children}</RoleShell>;
}
