/**
 * mountainBuffers.ts — small TSL storage buffers + uniforms for the viz5
 * mountain client view. ADDITIVE ONLY: the frozen sim buffers
 * (src/sim/buffers.ts) are untouched; these are view-side data written by
 * the mountain components (routes/median) on load or param-change readback,
 * never per frame.
 *
 *   routePos    float × (ROUTE_COUNT×32×3)  world-space route points
 *   routeNrm    float × (ROUTE_COUNT×32×3)  per-point terrain normals
 *   routeDown   float × (ROUTE_COUNT×32×3)  per-point steepest-descent dirs
 *   medianLog   float × SNAP_MAX            log10(p50 survivor wealth) per
 *                                           snap (from snapshotStats — the
 *                                           existing param-change readback)
 */
import { instancedArray, uniform } from 'three/tsl';
import { SNAP_MAX } from '../../sim/model/history';
import { ROUTE_COUNT, ROUTE_POINTS } from './routes';

const ROUTE_FLOATS = ROUTE_COUNT * ROUTE_POINTS * 3;

/** World-space route points (on the terrain surface). */
export const routePos = instancedArray(ROUTE_FLOATS, 'float');
/** Per-point terrain normals (unit, world space). */
export const routeNrm = instancedArray(ROUTE_FLOATS, 'float');
/** Per-point steepest-descent unit vectors (world space, ember slide). */
export const routeDown = instancedArray(ROUTE_FLOATS, 'float');
/** log10 of the median SURVIVOR wealth per snapshot (p50 of snap quantiles). */
export const medianLog = instancedArray(SNAP_MAX, 'float');

/** Number of valid routes in the buffers (≤ ROUTE_COUNT). */
export const uRouteCount = uniform(ROUTE_COUNT, 'uint');
