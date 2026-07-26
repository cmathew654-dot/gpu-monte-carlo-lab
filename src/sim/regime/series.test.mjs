import { createHash } from 'node:crypto';

import historical from '../../data/historicalReturns.json';
import { recoverPairedLogReturns } from './series.ts';

let failures = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  PASS ${name}`);
    return;
  }
  failures++;
  console.error(`  FAIL ${name}`);
}

function checkThrows(name, action, expected) {
  try {
    action();
    failures++;
    console.error(`  FAIL ${name}: did not throw`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, expected.test(message));
    if (!expected.test(message)) {
      console.error(`       unexpected error: ${message}`);
    }
  }
}

function cloneHistorical() {
  return structuredClone(historical);
}

function recoverSimpleReturns(file) {
  const { blockCount, blockLength } = file._meta;
  const recover = (blocks) => {
    const values = Array.from(
      { length: blockCount },
      (_, block) => blocks[block * blockLength],
    );
    const finalBlockStart = (blockCount - 1) * blockLength;
    values.push(...blocks.slice(finalBlockStart + 1, finalBlockStart + blockLength));
    return values;
  };
  return {
    equity: recover(file.blocks),
    bonds: recover(file.bondBlocks),
  };
}

function monthSequence(startDate, count) {
  const [startYear, startMonth] = startDate.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const monthIndex = startMonth - 1 + index;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  });
}

function nodeCryptoDigest(file) {
  const { equity, bonds } = recoverSimpleReturns(file);
  const dates = monthSequence(file._meta.startDate, equity.length);
  const canonical = dates
    .map(
      (date, index) =>
        `${date}\t${equity[index].toPrecision(17)}\t${bonds[index].toPrecision(17)}\n`,
    )
    .join('');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

console.log('\n[regime series] deterministic paired recovery');
{
  const first = recoverPairedLogReturns(historical);
  const second = recoverPairedLogReturns(historical);
  const lastBlockStart = (historical._meta.blockCount - 1) * historical._meta.blockLength;

  check(
    'recovers the declared 1,206 paired observations',
    first.values.length === 1206 &&
      first.dates.length === 1206 &&
      first.values.length === historical._meta.monthCount,
  );
  check(
    'dates cover 1926-01 through 2026-06',
    first.dates[0] === '1926-01' && first.dates.at(-1) === '2026-06',
  );
  check(
    'uses each block start and the final block tail exactly once',
    first.values[1194][0] === Math.log1p(historical.blocks[lastBlockStart]) &&
      first.values[1195][0] === Math.log1p(historical.blocks[lastBlockStart + 1]) &&
      first.values.at(-1)[1] === Math.log1p(historical.bondBlocks.at(-1)),
  );
  check(
    'log1p conversion preserves equity and bond pairing',
    first.values[0][0] === Math.log1p(historical.blocks[0]) &&
      first.values[0][1] === Math.log1p(historical.bondBlocks[0]),
  );
  check(
    'digest is deterministic lowercase SHA-256',
    first.inputSha256 === second.inputSha256 &&
      /^[0-9a-f]{64}$/.test(first.inputSha256),
  );
  check(
    'browser-safe SHA-256 matches the independent node:crypto oracle',
    first.inputSha256 === nodeCryptoDigest(historical),
  );

  const mutableInput = cloneHistorical();
  const recovered = recoverPairedLogReturns(mutableInput);
  const originalFirstPair = recovered.values[0];
  const originalDigest = recovered.inputSha256;
  mutableInput.blocks[0] = 0.5;
  mutableInput.bondBlocks[0] = 0.25;
  mutableInput._meta.startDate = '2000-01';
  check(
    'returned values and digest do not alias caller-owned input',
    recovered.values[0] === originalFirstPair &&
      recovered.values[0][0] === Math.log1p(historical.blocks[0]) &&
      recovered.inputSha256 === originalDigest &&
      recovered.dates[0] === '1926-01',
  );
}

console.log('\n[regime series] strict shape and value rejection');
{
  const missingMeta = cloneHistorical();
  delete missingMeta._meta;
  checkThrows(
    'rejects a missing metadata object',
    () => recoverPairedLogReturns(missingMeta),
    /_meta/,
  );

  const zeroBlocks = cloneHistorical();
  zeroBlocks._meta.blockCount = 0;
  checkThrows(
    'rejects non-positive blockCount',
    () => recoverPairedLogReturns(zeroBlocks),
    /blockCount.*positive integer/,
  );

  const fractionalBlocks = cloneHistorical();
  fractionalBlocks._meta.blockCount = 1.5;
  checkThrows(
    'rejects non-integer blockCount',
    () => recoverPairedLogReturns(fractionalBlocks),
    /blockCount.*positive integer/,
  );

  const wrongBlockLength = cloneHistorical();
  wrongBlockLength._meta.blockLength = 11;
  checkThrows(
    'requires twelve-month blocks',
    () => recoverPairedLogReturns(wrongBlockLength),
    /blockLength.*12/,
  );

  const wrongMonthCount = cloneHistorical();
  wrongMonthCount._meta.monthCount++;
  checkThrows(
    'requires monthCount to equal blockCount plus eleven',
    () => recoverPairedLogReturns(wrongMonthCount),
    /monthCount.*blockCount.*11/,
  );

  const missingBonds = cloneHistorical();
  delete missingBonds.bondBlocks;
  checkThrows(
    'requires the paired bond sleeve',
    () => recoverPairedLogReturns(missingBonds),
    /bondBlocks/,
  );

  const shortEquity = cloneHistorical();
  shortEquity.blocks.pop();
  checkThrows(
    'rejects the wrong equity array length',
    () => recoverPairedLogReturns(shortEquity),
    /blocks.*length/,
  );

  const shortBonds = cloneHistorical();
  shortBonds.bondBlocks.pop();
  checkThrows(
    'rejects the wrong bond array length',
    () => recoverPairedLogReturns(shortBonds),
    /bondBlocks.*length/,
  );

  const nonFiniteEquity = cloneHistorical();
  nonFiniteEquity.blocks[0] = Number.NaN;
  checkThrows(
    'rejects a non-finite equity return',
    () => recoverPairedLogReturns(nonFiniteEquity),
    /blocks\[0\].*finite/,
  );

  const nonFiniteBond = cloneHistorical();
  nonFiniteBond.bondBlocks[0] = Number.POSITIVE_INFINITY;
  checkThrows(
    'rejects a non-finite bond return',
    () => recoverPairedLogReturns(nonFiniteBond),
    /bondBlocks\[0\].*finite/,
  );

  for (const invalidReturn of [-1, -1.01]) {
    const invalidEquity = cloneHistorical();
    invalidEquity.blocks[0] = invalidReturn;
    checkThrows(
      `rejects equity simple return ${invalidReturn}`,
      () => recoverPairedLogReturns(invalidEquity),
      /blocks\[0\].*greater than -1/,
    );

    const invalidBond = cloneHistorical();
    invalidBond.bondBlocks[0] = invalidReturn;
    checkThrows(
      `rejects bond simple return ${invalidReturn}`,
      () => recoverPairedLogReturns(invalidBond),
      /bondBlocks\[0\].*greater than -1/,
    );
  }
}

console.log('\n[regime series] exact paired overlap and calendar rejection');
{
  const brokenEquityOverlap = cloneHistorical();
  brokenEquityOverlap.blocks[13] += 1e-12;
  checkThrows(
    'rejects any equity overlap mismatch with block/month context',
    () => recoverPairedLogReturns(brokenEquityOverlap),
    /equity overlap.*blocks.*block 0.*month 2.*block 1.*month 1/,
  );

  const brokenBondOverlap = cloneHistorical();
  brokenBondOverlap.bondBlocks[13] += 1e-12;
  checkThrows(
    'rejects any bond overlap mismatch with block/month context',
    () => recoverPairedLogReturns(brokenBondOverlap),
    /bond overlap.*bondBlocks.*block 0.*month 2.*block 1.*month 1/,
  );

  const invalidStartDate = cloneHistorical();
  invalidStartDate._meta.startDate = '1926-1';
  checkThrows(
    'rejects a non-YYYY-MM start date',
    () => recoverPairedLogReturns(invalidStartDate),
    /startDate.*YYYY-MM/,
  );

  const invalidEndDate = cloneHistorical();
  invalidEndDate._meta.endDate = '2026-13';
  checkThrows(
    'rejects a non-YYYY-MM end date',
    () => recoverPairedLogReturns(invalidEndDate),
    /endDate.*YYYY-MM/,
  );

  const wrongEndDate = cloneHistorical();
  wrongEndDate._meta.endDate = '2026-05';
  checkThrows(
    'rejects metadata whose end date disagrees with the recovered window',
    () => recoverPairedLogReturns(wrongEndDate),
    /recovered end date.*2026-06.*endDate.*2026-05/,
  );
}

if (failures > 0) {
  console.error(`\n${failures} regime series check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll regime series checks passed.');
}
