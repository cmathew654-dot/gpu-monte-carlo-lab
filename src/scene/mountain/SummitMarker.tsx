/**
 * SummitMarker.tsx — a small glowing cairn of light at the summit. Steady
 * near-white; a subtle pulse rides in as the reveal sweep completes
 * (uReveal → 1). ONE sprite, trivially cheap. The TSL graph itself lives in
 * summitNodes.ts (shared with probe/viz5-probe.js).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending } from 'three/webgpu';
import { buildSummitNodes } from './summitNodes';
import type { TerrainData } from './terrain';

export function SummitMarker({ data }: { data: TerrainData }) {
  const time = useRef(0);

  const nodes = useMemo(() => buildSummitNodes(data.summit), [data]);

  useFrame((_, delta) => {
    time.current += delta;
    // three uniform nodes are designed for mutation (see ConeParticles).
    // eslint-disable-next-line react-hooks/immutability
    nodes.uTime.value = time.current;
  });

  return (
    <sprite frustumCulled={false}>
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
