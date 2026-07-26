/**
 * PlayheadHud.tsx — bottom-center year-cursor control (viz2 deliverable
 * 1): a mono HUD line (current year + cumulative failure % at year t from
 * the snapshotStats readback) and the drag-scrub slider for the in-scene
 * year plane.
 *
 * Scrub contract (src/scene/playhead.ts): pointer-down pauses the auto
 * sweep, dragging sets the cursor directly, release resumes the sweep
 * from the dragged position. The HUD updates from its own rAF loop
 * writing textNodes/slider.value directly — no 60 fps React re-renders.
 *
 * GPU mode only: the CPU fallback (?cpu=1) has no snap readback (frozen §6
 * worker protocol) and its cone is inert — the slider would scrub nothing.
 */
import { useEffect, useRef } from 'react';
import { playhead } from '../scene/playhead';
import { useSimStore } from '../store/simStore';
import { fmtPct } from './format';

export function PlayheadHud() {
  const mode = useSimStore((s) => s.mode);
  const sliderRef = useRef<HTMLInputElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (mode !== 'gpu') return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const state = useSimStore.getState();
      const horizon = state.params.horizonYears;
      const year = playhead.xNorm * horizon;

      let text = `YEAR ${String(Math.round(year)).padStart(2, '0')} / ${horizon}`;
      const snap = state.snapshotStats;
      if (snap && snap.horizonMonths > 0) {
        const si = Math.min(
          snap.snapCount - 1,
          Math.max(
            0,
            Math.round(
              (playhead.xNorm * snap.horizonMonths) / snap.snapStrideMonths,
            ),
          ),
        );
        text += ` · ${fmtPct(snap.cumFailure[si])} ran out`;
      }
      if (readoutRef.current && readoutRef.current.textContent !== text) {
        readoutRef.current.textContent = text;
      }
      if (sliderRef.current && !playhead.scrubbing) {
        sliderRef.current.value = String(Math.round(playhead.xNorm * 1000));
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  if (mode !== 'gpu') return null;

  return (
    <div className="playhead-hud">
      <span ref={readoutRef} className="playhead-hud__readout data-label">
        YEAR 00
      </span>
      <input
        ref={sliderRef}
        type="range"
        min={0}
        max={1000}
        defaultValue={1000}
        className="playhead-hud__slider"
        aria-label="Year cursor — drag to scrub the simulation timeline"
        onPointerDown={() => {
          playhead.scrubbing = true;
        }}
        onPointerUp={() => {
          playhead.scrubbing = false;
          playhead.playing = true; // resume the sweep from here
        }}
        onChange={(e) => {
          playhead.xNorm = Number(e.target.value) / 1000;
        }}
      />
    </div>
  );
}
