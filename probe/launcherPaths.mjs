import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function projectRootFromModuleUrl(moduleUrl) {
  return path.resolve(fileURLToPath(new URL('..', moduleUrl)));
}

export function systemChromiumCandidates(platform = process.platform) {
  if (platform === 'linux') {
    return [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ];
  }

  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  return [];
}

export function resolveChromiumExecutable({
  environmentPath,
  systemCandidates,
  playwrightPath,
  existsSync = fs.existsSync,
}) {
  const candidates = [
    environmentPath,
    ...systemCandidates,
    playwrightPath,
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (executable) return executable;

  throw new Error(
    `No Chromium executable found. Checked: ${candidates.join(', ') || '(none)'}. ` +
      'Set CHROMIUM_PATH to an installed Chromium-compatible browser.',
  );
}
