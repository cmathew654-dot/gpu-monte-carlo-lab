/**
 * W2-B six-line historical overlay. CPU replay results are uploaded only when
 * committed parameters change; the frame loop only advances shared uReveal.
 */
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three/webgpu';
import { getStorageAttribute } from '../../sim/buffers';
import { useGauntletStore } from '../../store/gauntletStore';
import {
  lineStrideForBudget,
  maxLineVerts,
  planSprites,
} from '../spritePlan';
import { buildGauntletTrailNodes } from './gauntletTrailNodes';
import {
  GAUNTLET_COHORT_COUNT,
  gauntletEndSlot,
  gauntletEndState,
  gauntletRouteIndex,
  gauntletWealth,
} from './mountainBuffers';
import { selectGauntletRoutes } from './gauntletRoutes';
import type { TerrainData } from './terrain';

function uploadFloatBuffer(
  node: Parameters<typeof getStorageAttribute>[0],
  values: Float32Array,
): void {
  const attribute = getStorageAttribute(node);
  (attribute.array as Float32Array).set(values);
  attribute.needsUpdate = true;
}

function uploadUintBuffer(
  node: Parameters<typeof getStorageAttribute>[0],
  values: Uint32Array,
): void {
  const attribute = getStorageAttribute(node);
  (attribute.array as Uint32Array).set(values);
  attribute.needsUpdate = true;
}

export function GauntletMountainTrails({ data }: { data: TerrainData }) {
  const [vertexCount, setVertexCount] = useState(0);
  const gl = useThree((state) => state.gl);
  const nodes = useMemo(() => buildGauntletTrailNodes(), []);

  const maxVerts = useMemo(() => {
    const device = (
      gl as unknown as {
        backend?: { device?: { limits?: { maxBufferSize?: number } } };
      }
    ).backend?.device;
    return maxLineVerts(device?.limits?.maxBufferSize);
  }, [gl]);

  // Fixed cohort routes: +Z central first, then golden-angle targets.
  useEffect(() => {
    uploadUintBuffer(
      gauntletRouteIndex,
      selectGauntletRoutes(data.routes, GAUNTLET_COHORT_COUNT),
    );
  }, [data]);

  // Store subscription is committed-parameter-driven. No frame-loop readback,
  // replay, or upload occurs here.
  useEffect(() => {
    const sync = (state: ReturnType<typeof useGauntletStore.getState>) => {
      const snapshot = state.snapshot;
      if (snapshot === null) {
        setVertexCount(0);
        return;
      }

      uploadFloatBuffer(gauntletWealth, snapshot.trails.wealth);
      uploadUintBuffer(gauntletEndSlot, snapshot.trails.endSlots);
      uploadUintBuffer(gauntletEndState, snapshot.trails.endStates);

      const plan = planSprites(
        snapshot.trails.cohortCount,
        snapshot.result.params.horizonYears,
      );
      const stride = lineStrideForBudget(plan, maxVerts);
      const renderedCohorts = Math.floor(plan.paths / stride);
      const points = Math.min(
        plan.perPath,
        snapshot.trails.spritesPerCohort,
      );
      // three uniform nodes are designed for mutation.
      // eslint-disable-next-line react-hooks/immutability
      nodes.uniforms.uSpritesPerCohort.value = points;
      setVertexCount(renderedCohorts * Math.max(0, points - 1) * 2);
    };
    sync(useGauntletStore.getState());
    return useGauntletStore.subscribe(sync);
  }, [maxVerts, nodes]);

  const geometry = useMemo(() => {
    if (vertexCount <= 0) return null;
    const next = new BufferGeometry();
    next.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(vertexCount * 3), 3),
    );
    return next;
  }, [vertexCount]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (geometry === null) return null;
  return (
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={4}>
      <lineBasicNodeMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        fog={false}
        positionNode={nodes.positionNode}
        colorNode={nodes.colorNode}
      />
    </lineSegments>
  );
}
