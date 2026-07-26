import type {
  CpuFrontierErrorMessage,
  CpuFrontierProgressMessage,
  CpuFrontierRequest,
  CpuFrontierResultMessage,
} from './cpuFrontier';
import type { FrontierProgress } from './computeFrontier';
import type { RobustnessFrontier } from './types';

export type CpuFrontierRunRequest = Omit<CpuFrontierRequest, 'token'>;
export type CpuFrontierResponse =
  | CpuFrontierErrorMessage
  | CpuFrontierProgressMessage
  | CpuFrontierResultMessage;
export type FrontierProgressCallback = (progress: FrontierProgress) => void;

export interface WorkerLike {
  onmessage: ((event: MessageEvent<CpuFrontierResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: CpuFrontierRequest, transfer: Transferable[]): void;
  terminate(): void;
}

interface ActiveRun {
  readonly token: number;
  readonly worker: WorkerLike;
  readonly resolve: (result: RobustnessFrontier) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: FrontierProgressCallback;
  terminated: boolean;
}

function abortError(): Error {
  const error = new Error('Frontier computation was aborted');
  error.name = 'AbortError';
  return error;
}

function asError(value: unknown, fallback: string): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string' && value.length > 0) return new Error(value);
  return new Error(fallback);
}

export class FrontierWorkerClient {
  private readonly workerFactory: () => WorkerLike;
  private active: ActiveRun | null = null;
  private nextToken = 0;
  private disposed = false;

  constructor(workerFactory: () => WorkerLike) {
    this.workerFactory = workerFactory;
  }

  run(
    request: CpuFrontierRunRequest,
    transfer: Transferable[],
    onProgress?: FrontierProgressCallback,
  ): Promise<RobustnessFrontier> {
    if (this.disposed) {
      return Promise.reject(new Error('Frontier worker client has been disposed'));
    }

    this.abortActive();
    const token = ++this.nextToken;

    return new Promise<RobustnessFrontier>((resolve, reject) => {
      let worker: WorkerLike;
      try {
        worker = this.workerFactory();
      } catch (error) {
        reject(asError(error, 'Failed to create frontier worker'));
        return;
      }

      const active: ActiveRun = {
        token,
        worker,
        resolve,
        reject,
        onProgress,
        terminated: false,
      };
      this.active = active;

      worker.onmessage = (event) => {
        const message = event.data;
        if (!this.isCurrent(active) || message.token !== token) return;

        if (message.type === 'frontier-progress') {
          try {
            active.onProgress?.(message.progress);
          } catch {
            // Progress observers do not own the worker lifecycle.
          }
          return;
        }

        if (message.type === 'frontier-result') {
          this.finish(active);
          active.resolve(message.result);
          return;
        }

        if (message.type === 'frontier-error') {
          this.finish(active);
          active.reject(new Error(message.message));
        }
      };

      worker.onerror = (event) => {
        if (!this.isCurrent(active)) return;
        this.finish(active);
        active.reject(new Error(event.message || 'Frontier worker failed'));
      };

      try {
        worker.postMessage({ ...request, token }, transfer);
      } catch (error) {
        if (this.isCurrent(active)) this.finish(active);
        active.reject(asError(error, 'Failed to post frontier request'));
      }
    });
  }

  cancel(): void {
    this.abortActive();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortActive();
  }

  private isCurrent(active: ActiveRun): boolean {
    return this.active === active && active.worker === this.active.worker;
  }

  private abortActive(): void {
    const active = this.active;
    if (!active) return;
    this.finish(active);
    active.reject(abortError());
  }

  private finish(active: ActiveRun): void {
    if (this.active === active) this.active = null;
    if (active.terminated) return;
    active.terminated = true;
    active.worker.onmessage = null;
    active.worker.onerror = null;
    active.worker.terminate();
  }
}
