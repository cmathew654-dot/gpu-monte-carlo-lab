/**
 * TerrainMesh.tsx — the REAL Mt. Rainier: indexed grid mesh from the baked
 * USGS heightmap, shaded as a night scene.
 *
 * Geometry: MESH_RES×MESH_RES grid sampled (bilinear) from the 512×512
 * heightmap — 384² ≈ 294k triangles, position/normal uploads ~3.6 MB total
 * (well under the adapter maxBufferSize trap from the v2.1 incident).
 *
 * Shading (MeshStandardNodeMaterial + a moon key light mounted by
 * ClientMountain): deep blue-grey rock lifted toward a lighter ridge grey
 * with elevation; SNOW via shader mix — elevation above the snowline AND
 * local slope below threshold (normalWorld.y) — plus a fine-noise sparkle
 * gated to the snow. Real shaded relief from the standard lighting
 * pipeline, not wireframe, not vertex-color fakery.
 *
 * The node graph is a pure function (buildTerrainColorNode) so the Tint
 * probe (probe/viz5-probe.js) compiles the REAL material.
 */
import { useEffect, useMemo } from 'react';
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardNodeMaterial,
  Uint32BufferAttribute,
} from 'three/webgpu';
import { MOUNTAIN_WORLD_SIZE, type TerrainData } from './terrain';
import { buildTerrainColorNode } from './terrainColor';

/** Mesh grid resolution (≈294k tris ≤ the 500k-tri terrain budget). */
const MESH_RES = 384;

function buildGeometry(data: TerrainData): BufferGeometry {
  const G = data.grid;
  const M = MESH_RES;
  const positions = new Float32Array(M * M * 3);
  const normals = new Float32Array(M * M * 3);
  const pxWorld = MOUNTAIN_WORLD_SIZE / (M - 1); // world units per mesh cell

  const elevAt = (i: number, j: number): number => {
    // bilinear sample of the full-res heightmap at mesh-grid coords
    const fi = (i / (M - 1)) * (G - 1);
    const fj = (j / (M - 1)) * (G - 1);
    const i0 = Math.min(G - 2, Math.floor(fi));
    const j0 = Math.min(G - 2, Math.floor(fj));
    const fx = fi - i0;
    const fy = fj - j0;
    const a = data.heights[j0 * G + i0];
    const b = data.heights[j0 * G + i0 + 1];
    const c = data.heights[(j0 + 1) * G + i0];
    const d = data.heights[(j0 + 1) * G + i0 + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const worldY = (e: number): number => (e - data.minElev) * data.yScale;

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      const o = (j * M + i) * 3;
      positions[o] = (i / (M - 1) - 0.5) * MOUNTAIN_WORLD_SIZE;
      positions[o + 1] = worldY(elevAt(i, j));
      positions[o + 2] = (j / (M - 1) - 0.5) * MOUNTAIN_WORLD_SIZE;
    }
  }
  // Central-difference normals in world space.
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      const iL = Math.max(0, i - 1);
      const iR = Math.min(M - 1, i + 1);
      const jT = Math.max(0, j - 1);
      const jB = Math.min(M - 1, j + 1);
      const sX =
        ((worldY(elevAt(iR, j)) - worldY(elevAt(iL, j))) /
          ((iR - iL) * pxWorld));
      const sZ =
        ((worldY(elevAt(i, jB)) - worldY(elevAt(i, jT))) /
          ((jB - jT) * pxWorld));
      const len = Math.hypot(sX, 1, sZ);
      const o = (j * M + i) * 3;
      normals[o] = -sX / len;
      normals[o + 1] = 1 / len;
      normals[o + 2] = -sZ / len;
    }
  }
  const index = new Uint32Array((M - 1) * (M - 1) * 6);
  let k = 0;
  for (let j = 0; j < M - 1; j++) {
    for (let i = 0; i < M - 1; i++) {
      const a = j * M + i;
      const b = a + 1;
      const c = a + M;
      const d = c + 1;
      index[k++] = a;
      index[k++] = c;
      index[k++] = b;
      index[k++] = b;
      index[k++] = c;
      index[k++] = d;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setIndex(new Uint32BufferAttribute(index, 1));
  return geo;
}

export function TerrainMesh({ data }: { data: TerrainData }) {
  const geometry = useMemo(() => buildGeometry(data), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.roughness = 0.95;
    m.metalness = 0.0;
    const graph = buildTerrainColorNode(data);
    m.colorNode = graph.colorNode;
    m.emissiveNode = graph.emissiveNode;
    return m;
  }, [data]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} />;
}
