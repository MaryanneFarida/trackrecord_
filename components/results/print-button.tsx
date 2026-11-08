"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button variant="outline" className="h-11 print:hidden" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
