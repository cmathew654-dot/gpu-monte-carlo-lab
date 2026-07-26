export const MOUNTAIN_FIT_MARGIN = 1.12;

export function mountainFitRadius(
  baseRadius: number,
  terrainHalfWidth: number,
  verticalFovDegrees: number,
  aspect: number,
  margin = MOUNTAIN_FIT_MARGIN,
): number {
  if (
    !Number.isFinite(baseRadius)
    || !Number.isFinite(terrainHalfWidth)
    || !Number.isFinite(verticalFovDegrees)
    || !Number.isFinite(aspect)
    || !Number.isFinite(margin)
    || baseRadius <= 0
    || terrainHalfWidth <= 0
    || verticalFovDegrees <= 0
    || verticalFovDegrees >= 180
    || aspect <= 0
    || margin <= 0
  ) {
    return baseRadius;
  }

  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const horizontalTangent = Math.tan(halfVerticalFov) * aspect;
  if (!Number.isFinite(horizontalTangent) || horizontalTangent <= 0) {
    return baseRadius;
  }

  const minimumRadius = (terrainHalfWidth * margin) / horizontalTangent;
  return Number.isFinite(minimumRadius)
    ? Math.max(baseRadius, minimumRadius)
    : baseRadius;
}
