"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOutEverywhere } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await signOutEverywhere();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
