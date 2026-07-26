/**
 * CpuFallbackView.tsx — DOM view for the non-WebGPU branch (R4).
 * SINGLE OWNER: Agent 6.
 *
 * Mounts the CPU worker hook (useCpuSim) and portals a compact status view
 * into CanvasRoot's #cpu-fallback-root container. Controls and stat cards
 * are the same ControlPanel/StatCards used in GPU mode — this view only
 * fills the canvas area the 3D cone would occupy.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSimStore } from '../store/simStore';
import { DistributionStrip } from './StatCards';
import { useCpuSim } from './useCpuSim';

export function CpuFallbackView() {
  const mode = useSimStore((s) => s.mode);
  const stats = useSimStore((s) => s.stats);
  const presentation = useSimStore((s) => s.presentation);
  const status = useCpuSim();

  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (mode !== 'cpu') return;
    // CanvasRoot's non-WebGPU branch owns this node (read-only contract).
    // The lookup must wait for CanvasRoot's commit — the standard portal
    // host pattern, hence the setState in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(document.getElementById('cpu-fallback-root'));
  }, [mode]);

  // Hidden in presentation mode: the overlay takes the stage.
  if (mode !== 'cpu' || host === null || presentation) return null;

  return createPortal(
    <div className="cpu-fallback-view">
      <div className="cpu-fallback-view__heading data-label">
        CPU FALLBACK · 10,000 PATHS
      </div>
      {status.error ? (
        <p className="cpu-fallback-view__error" role="alert">
          {status.error}
        </p>
      ) : stats ? (
        <>
          <DistributionStrip percentiles={stats.percentiles} />
          <div className="cpu-fallback-view__meta data-label">
            COMPUTED IN {Math.round(status.elapsedMs ?? 0)} MS ON CPU · SAME
            MODEL, SAME SEED AS GPU MODE
          </div>
        </>
      ) : (
        <p className="cpu-fallback-view__meta data-label">
          RUNNING FIRST SIMULATION…
        </p>
      )}
    </div>,
    host,
  );
}
