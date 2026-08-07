/**
 * MountainEmbers.tsx — failed futures slide downhill. ONE sprite pool, one
 * sprite per rendered trail path; survivors sit at scale 0 (see
 * mountainEmberNodes.ts for the ignite/slide/fade math). Same plan/budget
 * sync as MountainTrails so embers and trails always describe the same
 * rendered subset.
 */
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { AdditiveBlending } from 'three/webgpu';
import { PREVIEW_PATH_COUNT, useSimStore } from '../../store/simStore';
import {
  lineStrideForBudget,
  maxLineVerts,
  MOUNTAIN_LINE_DENSITY,
  planSprites,
} from '../spritePlan';
import { buildMountainEmberNodes } from './mountainEmberNodes';
import { routeDown } from './mountainBuffers';
import { getStorageAttribute } from '../../sim/buffers';
import type { TerrainData } from './terrain';

const EMBER_PATH_STRIDE = 8;

export function MountainEmbers({ data }: { data: TerrainData }) {
  const [pathCount, setPathCount] = useState(0);
  const gl = useThree((s) => s.gl);

  const nodes = useMemo(() => buildMountainEmberNodes(), []);

  // Upload the baked downhill vectors (once per terrain).
  useEffect(() => {
    const attr = getStorageAttribute(routeDown);
    (attr.array as Float32Array).set(data.routes.downhill);
    attr.needsUpdate = true;
  }, [data]);

  const maxVerts = useMemo(() => {
    const device = (
      gl as unknown as {
        backend?: { device?: { limits?: { maxBufferSize?: number } } };
      }
    ).backend?.device;
    return maxLineVerts(device?.limits?.maxBufferSize);
  }, [gl]);

  useEffect(() => {
    const sync = (state: ReturnType<typeof useSimStore.getState>) => {
      const p = state.params;
      const plan = planSprites(
        state.previewMode ? PREVIEW_PATH_COUNT : p.pathCount,
        p.horizonYears,
      );
      // Keep embers on a 4× sparser subset of the rendered trails.
      const lineStride =
        lineStrideForBudget(plan, maxVerts) * MOUNTAIN_LINE_DENSITY;
      const emberStride = lineStride * EMBER_PATH_STRIDE;
      const linePaths = Math.floor(plan.paths / emberStride);
      // eslint-disable-next-line react-hooks/immutability
      nodes.uniforms.uSpritesPerPath.value = plan.perPath;
      nodes.uniforms.uSnapDecimate.value = plan.decimate;
      nodes.uniforms.uPathSubset.value = plan.subset * emberStride;
      nodes.uniforms.uSnapsTotal.value = plan.snapsTotal;
      setPathCount(linePaths);
    };
    sync(useSimStore.getState());
    return useSimStore.subscribe(sync);
  }, [nodes, maxVerts]);

  if (pathCount <= 0) return null;
  return (
    <sprite count={pathCount} frustumCulled={false}>
      <spriteNodeMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        fog={false}
        positionNode={nodes.positionNode}
        scaleNode={nodes.scaleNode}
        colorNode={nodes.colorNode}
      />
    </sprite>
  );
}
