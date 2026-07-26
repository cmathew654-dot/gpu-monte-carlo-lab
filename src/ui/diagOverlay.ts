/**
 * diagOverlay.ts — lightweight on-page diagnostics (?diag=1).
 *
 * RENDER-DEBUG INSURANCE: the 3D canvas historically failed BLACK with zero
 * console output (a Tint WGSL validation error killed the sprite pipeline
 * silently on some driver/browser combos). When the URL carries `?diag=1`,
 * this overlay captures, in a fixed DOM panel the user can screenshot:
 *
 *   - window.onerror / unhandledrejection
 *   - WebGPU uncapturederror (Tint/WGSL validation, bind-group errors, …)
 *   - device.lost reason
 *   - console.error forwarding
 *
 * It must be installed BEFORE the renderer requests its device, so
 * CanvasRoot calls it at module scope of the WebGPU branch. No-ops without
 * the query param or without WebGPU. Zero dependencies, zero store surface.
 */

interface GPUErrorLike {
  constructor: { name: string };
  message: string;
}

interface GPUDeviceLike extends EventTarget {
  lost: Promise<{ reason: string; message: string }>;
}

interface GPUAdapterLike {
  requestDevice: (...args: unknown[]) => Promise<GPUDeviceLike>;
}

const MAX_LINES = 60;

export function installDiagOverlay(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.getElementById('diag-overlay')) return;
  const verbose = new URLSearchParams(window.location.search).has('diag');

  const el = document.createElement('pre');
  el.id = 'diag-overlay';
  el.style.cssText = [
    'position:fixed',
    'left:8px',
    'bottom:8px',
    'z-index:99999',
    'max-width:72vw',
    'max-height:42vh',
    'overflow:auto',
    'margin:0',
    'padding:8px 10px',
    'background:rgba(0,0,0,0.88)',
    'color:#7fff9f',
    'font:11px/1.45 ui-monospace,monospace',
    'border:1px solid #1f6f3f',
    'border-radius:6px',
    'white-space:pre-wrap',
    'cursor:pointer',
    verbose ? 'display:block' : 'display:none',
  ].join(';');
  el.title = 'Click to dismiss';

  const lines: string[] = [`[diag] capture armed — ${new Date().toISOString()}`];
  let shown = verbose;
  const show = (): void => {
    if (shown) return;
    shown = true;
    el.style.display = 'block';
    el.style.pointerEvents = 'auto';
    push('[diag] ^^ GPU ERROR CAPTURED — screenshot this panel and send it ^^');
  };
  el.addEventListener('click', () => {
    el.style.display = 'none';
  });

  const push = (msg: string): void => {
    lines.push(msg.length > 3000 ? msg.slice(0, 3000) + ' …' : msg);
    el.textContent = lines.slice(-MAX_LINES).join('\n');
  };

  window.addEventListener('error', (e) => push(`[error] ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as unknown;
    const text =
      reason instanceof Error
        ? reason.stack || reason.message
        : String(reason);
    push(`[rejection] ${text}`);
  });

  // WebGPU: capture uncaptured device errors + device loss. Wrapped via the
  // prototype so it covers the renderer's own requestDevice call as long as
  // this runs first (CanvasRoot installs it before creating the canvas).
  const nav = navigator as Navigator & { gpu?: { requestAdapter?: unknown } };
  const gpuProto = (
    window as unknown as { GPUAdapter?: { prototype: GPUAdapterLike } }
  ).GPUAdapter?.prototype;
  if (nav.gpu && gpuProto) {
    const orig = gpuProto.requestDevice;
    gpuProto.requestDevice = async function (
      this: GPUAdapterLike,
      ...args: unknown[]
    ): Promise<GPUDeviceLike> {
      const device = await orig.apply(this, args);
      device.addEventListener('uncapturederror', (ev) => {
        const err = (ev as unknown as { error: GPUErrorLike }).error;
        push(`[webgpu ${err.constructor.name}] ${err.message}`);
        show();
      });
      void device.lost.then((info) => {
        push(`[webgpu device.lost] reason=${info.reason} ${info.message}`);
        show();
      });
      return device;
    };
    push('[diag] WebGPU error capture armed');
  } else {
    push('[diag] no WebGPU — CPU branch');
  }

  // Forward console.error so WGSL/driver messages three logs are visible too.
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args
      .map((a) => (a instanceof Error ? a.message : String(a)))
      .join(' ');
    push(`[console.error] ${text}`);
    // Auto-reveal on render/GPU failures (SimDriver, WGSL, three renderer).
    if (/webgpu|wgsl|tint|dawn|simdriver|three\.|gpu/i.test(text)) show();
    origError(...args);
  };

  document.body.appendChild(el);
}
