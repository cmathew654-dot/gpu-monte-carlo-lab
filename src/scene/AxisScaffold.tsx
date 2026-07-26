/**
 * AxisScaffold.tsx — subtle floor grid + year ticks + log-$ ticks (viz2
 * deliverable 4). Pure CPU geometry + canvas-texture sprites for the tiny
 * mono labels; no authored TSL. Rebuilt only when horizonYears /
 * initialWealth change. Dark design language: everything additive dim
 * blue on pure black.
 *
 *   floor grid   y = GRID_Y (just below the ember floor) — the stage
 *   year ticks   every 5y along X, labels "5y/10y/…" at the front edge
 *   wealth ticks initialWealth × {0.1, 1, 10} decades along Y at the left
 *                edge (only those inside the ±2-decade live clamp),
 *                labels "$100K"-style
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Sprite,
  SpriteMaterial,
  Texture,
} from 'three/webgpu';
import { useSimStore } from '../store/simStore';
import { X_SPAN, Y_CLAMP, Y_FLOOR, Y_SCALE, xFromNorm } from './layout';

/** Grid sits just below the ember floor jitter (Y_FLOOR ± 0.5). */
const GRID_Y = Y_FLOOR - 0.55;
const Z_HALF = 4.6;
/** Year labels sit at the front edge of the floor. */
const LABEL_Z = Z_HALF + 1.0;
/** Wealth labels sit at the left edge. */
const LABEL_X = -X_SPAN / 2 - 1.2;

/** Tiny mono canvas-texture sprite (world-unit scale). */
function makeTextSprite(text: string, opacity = 0.7): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font =
      '600 30px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8fb8f5';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new Texture(canvas);
  texture.needsUpdate = true;
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      opacity, // v2.2: 0.75→0.45 — labels anchor, never compete
      depthWrite: false,
    }),
  );
  sprite.scale.set(2.8, 0.7, 1); // v5.2: 1.9→2.8 world units wide
  return sprite;
}

/** "$100K" / "$1M" / "$10M" from absolute dollars. */
function fmtTick(v: number): string {
  if (v >= 1_000_000) return `$${+(v / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(v / 1_000)}K`;
}

export function AxisScaffold() {
  const group = useRef<Group>(null);

  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color: 0x1c3f70,
        transparent: true,
        opacity: 0.16, // v2.2: 0.5→0.16 — grid whispers, data shouts
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    const g = group.current;
    if (!g) return;

    const rebuild = () => {
      // Dispose previous children (grid geometry + label textures).
      for (const child of [...g.children]) {
        g.remove(child);
        if (child instanceof LineSegments) {
          child.geometry.dispose();
        } else if (child instanceof Sprite) {
          child.material.map?.dispose();
          child.material.dispose();
        }
      }

      const state = useSimStore.getState();
      const { horizonYears, initialWealth } = state.params;
      // viz4 client mode: NO floor grid, year ticks every 10y max, labels
      // whisper-quiet — the river is the stage, not the axes.
      const client = state.viewMode === 'client';
      const yearStep = client ? 10 : 5;
      // v5.2: advisor labels were "super small and tucked back" — bigger
      // world scale + brighter opacity so the axes actually read in a meeting.
      const labelOpacity = client ? 0.3 : 0.75;
      // three materials are designed for mutation (see PercentileGuides).
      // eslint-disable-next-line react-hooks/immutability
      material.opacity = client ? 0.12 : 0.16;
      const verts: number[] = [];

      if (!client) {
        // Floor grid — lines along X (every 2 world units) and along Z.
        for (let x = -X_SPAN / 2; x <= X_SPAN / 2 + 1e-6; x += 2) {
          verts.push(x, GRID_Y, -Z_HALF, x, GRID_Y, Z_HALF);
        }
        for (let z = -Z_HALF; z <= Z_HALF + 1e-6; z += 1.15) {
          verts.push(-X_SPAN / 2, GRID_Y, z, X_SPAN / 2, GRID_Y, z);
        }
      }
      // Year ticks (short uprights at the front edge).
      for (let yr = 0; yr <= horizonYears; yr += yearStep) {
        const x = xFromNorm(horizonYears > 0 ? yr / horizonYears : 0);
        verts.push(x, GRID_Y, Z_HALF, x, GRID_Y, Z_HALF + 0.45);
      }
      // Wealth decade ticks at the left edge.
      const decades = [0.1, 1, 10].map((m) => initialWealth * m);
      for (const w of decades) {
        const y =
          (Math.log10(Math.max(w, 1)) - Math.log10(Math.max(initialWealth, 1))) *
          Y_SCALE;
        if (Math.abs(y) > Y_CLAMP) continue;
        verts.push(-X_SPAN / 2 - 0.45, y, 0, -X_SPAN / 2, y, 0);
      }

      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
      const grid = new LineSegments(geo, material);
      grid.frustumCulled = false;
      g.add(grid);

      // Labels.
      for (let yr = 0; yr <= horizonYears; yr += yearStep) {
        const sprite = makeTextSprite(
          yr === 0 ? 'today' : `${yr}y`,
          labelOpacity,
        );
        sprite.position.set(
          xFromNorm(horizonYears > 0 ? yr / horizonYears : 0),
          GRID_Y,
          LABEL_Z,
        );
        g.add(sprite);
      }
      for (const w of decades) {
        const y =
          (Math.log10(Math.max(w, 1)) - Math.log10(Math.max(initialWealth, 1))) *
          Y_SCALE;
        if (Math.abs(y) > Y_CLAMP) continue;
        const sprite = makeTextSprite(fmtTick(w), labelOpacity);
        sprite.position.set(LABEL_X, y, 0);
        g.add(sprite);
      }
    };

    rebuild();
    return useSimStore.subscribe((state, prev) => {
      if (
        state.params.horizonYears !== prev.params.horizonYears ||
        state.params.initialWealth !== prev.params.initialWealth ||
        state.viewMode !== prev.viewMode
      ) {
        rebuild();
      }
    });
  }, [material]);

  return <group ref={group} />;
}
