/**
 * ReadThisCaption.tsx — "how to read this" caption (viz2 deliverable 6):
 * one dismissable mono line, bottom-center, above the playhead HUD.
 */
import { useState } from 'react';

const CAPTION =
  'Each thread = one simulated life · blue = money survives · embers = ran out · sweep the year cursor →';

export function ReadThisCaption() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="read-caption" role="note">
      <span className="read-caption__text">{CAPTION}</span>
      <button
        type="button"
        className="read-caption__dismiss"
        aria-label="Dismiss caption"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  );
}
