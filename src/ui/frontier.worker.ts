import {
  computeCpuFrontier,
  type CpuFrontierErrorMessage,
  type CpuFrontierProgressMessage,
  type CpuFrontierRequest,
  type CpuFrontierResultMessage,
} from '../sim/frontier/cpuFrontier';

type CpuFrontierResponse =
  | CpuFrontierErrorMessage
  | CpuFrontierProgressMessage
  | CpuFrontierResultMessage;

interface FrontierWorkerScope {
  onmessage: ((event: { data: CpuFrontierRequest | null }) => void) | null;
  postMessage(message: CpuFrontierResponse): void;
}

const scope = self as unknown as FrontierWorkerScope;

scope.onmessage = ({ data: request }) => {
  if (!request || request.type !== 'compute-frontier') return;

  let terminalSent = false;
  const postTerminal = (message: CpuFrontierErrorMessage | CpuFrontierResultMessage) => {
    if (terminalSent) return;
    terminalSent = true;
    scope.postMessage(message);
  };

  void computeCpuFrontier(request, Date.now, (progress) => {
    if (terminalSent) return;
    scope.postMessage({
      type: 'frontier-progress',
      token: request.token,
      progress,
    });
  }).then(
    (result) => {
      postTerminal({
        type: 'frontier-result',
        token: request.token,
        result,
      });
    },
    (error: unknown) => {
      postTerminal({
        type: 'frontier-error',
        token: request.token,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  );
};
