import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FULL_CONFIG, PREVIEW_CONFIG, runBenchmark } from './benchmark.ts';
import { renderBenchmarkHtml } from './report.ts';

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function runCli(args: readonly string[] = process.argv.slice(2)): void {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--preview' && args[0] !== '--full')) {
    throw new Error('Usage: benchmark:policy [--preview|--full]');
  }
  const full = args[0] === '--full';
  const config = full ? FULL_CONFIG : PREVIEW_CONFIG;
  const report = runBenchmark({ ...config, gitSha: gitSha() });
  const outputDir = join(process.cwd(), 'research', 'policy-benchmark', 'out');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'policy-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(join(outputDir, 'policy-benchmark.html'), renderBenchmarkHtml(report), 'utf8');
  console.log(`${report.previewBanner}\nWrote ${join(outputDir, 'policy-benchmark.json')}\nWrote ${join(outputDir, 'policy-benchmark.html')}\nRuntime ${report.runtimeMs} ms`);
}

runCli();
