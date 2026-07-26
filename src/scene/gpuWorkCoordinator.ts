/**
 * Effect-local ownership of the shared GPU simulation buffers.
 *
 * A superseding normal pipeline waits for every earlier normal and frontier
 * terminal before it can dispatch. A frontier likewise waits for every
 * unsettled normal and frontier terminal it invalidated. The terminal sets
 * make those handoffs acyclic and preserve cooperative-abort safety around
 * renderer work that cannot be interrupted.
 */

interface TrackedTerminal {
  terminal: Promise<void>;
}

interface WorkLease {
  signal: AbortSignal;
  waitForPriorOwners: Promise<void>;
  isCurrent: () => boolean;
  settle: () => void;
}

export interface NormalWorkLease extends WorkLease {
  supersededFrontier: boolean;
}

export interface FrontierWorkLease extends WorkLease {
  supersededNormal: boolean;
}

export interface GpuWorkCoordinator {
  beginNormal: () => NormalWorkLease;
  beginFrontier: () => FrontierWorkLease;
  dispose: () => void;
}

interface TerminalHandle {
  terminal: Promise<void>;
  settle: () => void;
}

function terminalHandle(owners: Set<TrackedTerminal>): TerminalHandle {
  let resolve!: () => void;
  const terminal = new Promise<void>((done) => {
    resolve = done;
  });
  const tracked = { terminal };
  let settled = false;
  owners.add(tracked);

  return {
    terminal,
    settle: () => {
      if (settled) return;
      settled = true;
      owners.delete(tracked);
      resolve();
    },
  };
}

function waitFor(terminals: ReadonlySet<TrackedTerminal>): Promise<void> {
  return Promise.all([...terminals].map(({ terminal }) => terminal)).then(
    () => undefined,
  );
}

export function createGpuWorkCoordinator(): GpuWorkCoordinator {
  let disposed = false;
  let normalToken = 0;
  let frontierToken = 0;
  let normalController: AbortController | null = null;
  let frontierController: AbortController | null = null;
  const normalTerminals = new Set<TrackedTerminal>();
  const frontierTerminals = new Set<TrackedTerminal>();

  const invalidateNormal = (): boolean => {
    const controller = normalController;
    if (controller) controller.abort();
    normalToken += 1;
    return controller !== null;
  };

  const invalidateFrontier = (): boolean => {
    const controller = frontierController;
    if (controller) controller.abort();
    frontierToken += 1;
    return controller !== null;
  };

  const beginNormal = (): NormalWorkLease => {
    if (disposed) throw new Error('GPU work coordinator is disposed');

    const supersededFrontier = frontierTerminals.size > 0;
    invalidateFrontier();
    const priorFrontiers = waitFor(frontierTerminals);
    invalidateNormal();
    const priorNormals = waitFor(normalTerminals);

    const controller = new AbortController();
    const token = ++normalToken;
    normalController = controller;
    const terminal = terminalHandle(normalTerminals);

    return {
      signal: controller.signal,
      supersededFrontier,
      waitForPriorOwners: Promise.all([priorFrontiers, priorNormals]).then(
        () => undefined,
      ),
      isCurrent: () => !disposed
        && normalToken === token
        && normalController === controller,
      settle: () => {
        if (normalController === controller) normalController = null;
        terminal.settle();
      },
    };
  };

  const beginFrontier = (): FrontierWorkLease => {
    if (disposed) throw new Error('GPU work coordinator is disposed');

    invalidateFrontier();
    const priorFrontiers = waitFor(frontierTerminals);
    const supersededNormal = normalTerminals.size > 0;
    invalidateNormal();
    const priorNormals = waitFor(normalTerminals);

    const controller = new AbortController();
    const token = ++frontierToken;
    frontierController = controller;
    const terminal = terminalHandle(frontierTerminals);

    return {
      signal: controller.signal,
      supersededNormal,
      waitForPriorOwners: Promise.all([priorNormals, priorFrontiers]).then(
        () => undefined,
      ),
      isCurrent: () => !disposed
        && frontierToken === token
        && frontierController === controller,
      settle: () => {
        if (frontierController === controller) frontierController = null;
        terminal.settle();
      },
    };
  };

  return {
    beginNormal,
    beginFrontier,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const currentNormal = normalController;
      if (currentNormal) {
        currentNormal.abort();
        if (normalController === currentNormal) normalController = null;
      }
      const currentFrontier = frontierController;
      if (currentFrontier) {
        currentFrontier.abort();
        if (frontierController === currentFrontier) frontierController = null;
      }
      normalToken += 1;
      frontierToken += 1;
    },
  };
}
