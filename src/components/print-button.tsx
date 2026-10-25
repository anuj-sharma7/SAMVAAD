"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

/** Opens the browser print dialog (which also offers "Save as PDF"). Label is passed in already translated. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer size={16} aria-hidden /> {label}
    </Button>
  );
}
