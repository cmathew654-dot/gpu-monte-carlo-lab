/**
 * CapabilityBadge.tsx — capability indicator (spec §4.1 task 5, R4).
 *
 * Agent 1 provides the clean, minimal component; Agent 6 owns `src/ui/` and
 * may restyle/extend it (e.g. live path-count display) but must keep the
 * `mode` prop contract — CanvasRoot and App render against it.
 *
 * Default detail is live: "GPU · {N} paths" follows the store's pathCount;
 * CPU mode carries the R4 upsell line. Pass `detail` to override.
 */
import { useSimStore, type SimMode } from '../store/simStore';
import { fmtPathCount } from './format';

export interface CapabilityBadgeProps {
  mode: SimMode;
  /** Overrides the default per-mode status line. */
  detail?: string;
}

export function CapabilityBadge({ mode, detail }: CapabilityBadgeProps) {
  const pathCount = useSimStore((s) => s.params.pathCount);
  // viz2: true while the scene shows a live-drag 10k preview sim.
  const previewMode = useSimStore((s) => s.previewMode);
  const text =
    detail ??
    (mode === 'gpu'
      ? previewMode
        ? 'LIVE · 10k preview'
        : `GPU · ${fmtPathCount(pathCount)} paths`
      : 'CPU · 10k paths — open in a WebGPU browser for 100× more scenarios');

  return (
    <div className={`capability-badge capability-badge--${mode}`} role="status">
      <span className="capability-badge__dot" aria-hidden="true" />
      <span className="capability-badge__label">
        {mode === 'gpu' ? 'WebGPU' : 'CPU mode'}
      </span>
      <span className="capability-badge__detail">{text}</span>
    </div>
  );
}
