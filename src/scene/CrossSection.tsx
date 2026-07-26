/**
 * CrossSection.tsx — cross-section wealth histogram at the year cursor
 * (viz2 deliverable 1): a vertical strip of bars ON the cursor plane
 * showing the distribution of pathHistory at the snapshot nearest year t.
 *
 * Mapping (shared ./layout.ts transform, so bars line up with the cone):
 *   Y = bin center wealth (log scale, same world-Y as sprites)
 *   Z = bar half-length ∝ √(count / totalPaths) — sqrt scale keeps the
 *       degenerate year-0 spike (all paths at initialWealth) readable
 *       while small bins stay visible; lengths are ABSOLUTE fractions, so
 *       the strip visibly thins as paths fail. That shrink is the story.
 *
 * Data: the snapshotStats readback (param-change-only — §1.4 compliant;
 * this component never triggers a readback). 96 instanced boxes, matrix
 * updates only when the cursor crosses a snapshot boundary — cheap
 * constant overhead, plain materials (no authored TSL).
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from 'three/webgpu';
import {
  SNAP_BINS,
  SNAP_LOG_SPAN,
  snapBinCenterDollars,
} from '../sim/stats/snapStats';
import { useSimStore, type SnapshotStats } from '../store/simStore';
import { Y_CLAMP, Y_SCALE, xFromNorm } from './layout';
import { playhead } from './playhead';

/** Full z length of a 100 %-of-paths bin (year-0 spike ≈ 9 world units). */
const Z_MAX = 9;
/** Bin world height = log-bin width × Y_SCALE. */
const BIN_H = (SNAP_LOG_SPAN / SNAP_BINS) * Y_SCALE;

export function CrossSection() {
  const group = useRef<Group>(null);
  // Created imperatively (like YearCursor's plane) so per-frame instance
  // matrix updates go through a ref, not a hook-memoized object.
  const meshRef = useRef<InstancedMesh | null>(null);
  // What the current instance matrices were built from — rebuilt only on
  // change (snapshot crossing, fresh readback, or $ pivot move).
  const built = useRef<{ s: number; snap: SnapshotStats | null; logCenter: number }>({
    s: -1,
    snap: null,
    logCenter: NaN,
  });

  useEffect(() => {
    const mesh = new InstancedMesh(
      new BoxGeometry(0.09, BIN_H, 1),
      new MeshBasicMaterial({
        color: 0x4d9fff,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      SNAP_BINS,
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    meshRef.current = mesh;
    const g = group.current;
    g?.add(mesh);
    return () => {
      g?.remove(mesh);
      meshRef.current = null;
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    };
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const state = useSimStore.getState();
    const snap = state.snapshotStats;
    if (group.current) {
      group.current.position.x = xFromNorm(playhead.xNorm);
    }
    if (!snap || snap.horizonMonths <= 0) {
      mesh.visible = false;
      built.current.s = -1;
      return;
    }
    const s = Math.min(
      snap.snapCount - 1,
      Math.max(
        0,
        Math.round((playhead.xNorm * snap.horizonMonths) / snap.snapStrideMonths),
      ),
    );
    const logCenter = Math.log10(Math.max(state.params.initialWealth, 1));
    if (
      s === built.current.s &&
      snap === built.current.snap &&
      logCenter === built.current.logCenter
    ) {
      mesh.visible = true;
      return;
    }
    built.current = { s, snap, logCenter };

    const mat4 = new Matrix4();
    const rowBase = s * SNAP_BINS;
    for (let b = 0; b < SNAP_BINS; b++) {
      const count = snap.hist[rowBase + b];
      // Unclamped world Y — bins outside the live clamp are dropped, not
      // piled onto the clamp edge.
      const y = (Math.log10(snapBinCenterDollars(b)) - logCenter) * Y_SCALE;
      const frac = count / snap.totalPaths;
      const len = Math.sqrt(frac) * Z_MAX;
      const off = Math.abs(y) > Y_CLAMP || len <= 0;
      mat4.makeScale(1, 1, off ? 0 : len);
      mat4.setPosition(new Vector3(0, y, 0));
      mesh.setMatrixAt(b, mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = true;
  });

  return <group ref={group} />;
}
