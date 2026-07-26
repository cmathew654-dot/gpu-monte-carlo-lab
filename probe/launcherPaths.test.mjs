import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectRootFromModuleUrl,
  resolveChromiumExecutable,
} from './launcherPaths.mjs';

const expectedRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const actualRoot = projectRootFromModuleUrl(import.meta.url);

assert.equal(actualRoot, expectedRoot);
assert.equal(path.isAbsolute(actualRoot), true);

const existing = new Set(['/env/chrome', '/system/chrome', '/playwright/chrome']);
const existsSync = (candidate) => existing.has(candidate);

assert.equal(
  resolveChromiumExecutable({
    environmentPath: '/env/chrome',
    systemCandidates: ['/system/chrome'],
    playwrightPath: '/playwright/chrome',
    existsSync,
  }),
  '/env/chrome',
);

assert.equal(
  resolveChromiumExecutable({
    environmentPath: '/missing/env',
    systemCandidates: ['/system/chrome'],
    playwrightPath: '/playwright/chrome',
    existsSync,
  }),
  '/system/chrome',
);

assert.equal(
  resolveChromiumExecutable({
    environmentPath: '/missing/env',
    systemCandidates: ['/missing/system'],
    playwrightPath: '/playwright/chrome',
    existsSync,
  }),
  '/playwright/chrome',
);

assert.throws(
  () =>
    resolveChromiumExecutable({
      environmentPath: '/missing/env',
      systemCandidates: ['/missing/system'],
      playwrightPath: '/missing/playwright',
      existsSync,
    }),
  /No Chromium executable found/,
);

console.log('launcherPaths: 6 passed, 0 failed');
