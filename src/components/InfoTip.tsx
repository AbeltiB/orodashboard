// src/components/InfoTip.tsx
"use client";

import { Info } from "lucide-react";

// Small "i" hint attached to stat cards to explain what a number means and
// how it's derived (formula/source) — especially useful for money figures
// that are sums or ratios of underlying fields, not raw stored values.
export default function InfoTip({ text, size = 13 }: { text: string; size?: number }) {
  return (
    <span className="info-tip" tabIndex={0} aria-label={text}>
      <Info size={size} aria-hidden="true" />
      <span className="info-tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}
