import { LEGAL_COMPLIANCE_WARNING } from "@/lib/shift-templates";

export function LegalWarningBanner() {
  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"
    >
      <p className="font-semibold text-red-700">{LEGAL_COMPLIANCE_WARNING}</p>
    </div>
  );
}
