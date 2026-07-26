/**
 * simRuntime.ts — mutable handle SwrButton (DOM, outside the Canvas) uses
 * to reach the live GPU sim driver. Owned by the mounted SimDriver; null
 * when no GPU driver is active. Lives in its own module (not SimDriver.tsx)
 * so the driver component file exports only components.
 */
export const simRuntime: { requestSafeWithdrawal: (() => void) | null } = {
  requestSafeWithdrawal: null,
};
