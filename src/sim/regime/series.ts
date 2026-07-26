import type { PairedLogReturnSeries } from './types';

const BLOCK_LENGTH = 12;
const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;
const SHA256_ROUND = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

interface HistoricalBlocksFile {
  _meta: {
    blockCount: number;
    blockLength: 12;
    monthCount: number;
    startDate: string;
    endDate: string;
  };
  blocks: number[];
  bondBlocks: number[];
}

interface ParsedMonth {
  year: number;
  month: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`regime series: ${label} must be a positive integer, got ${String(value)}`);
  }
}

function parseMonth(value: unknown, label: string): ParsedMonth {
  if (typeof value !== 'string') {
    throw new Error(`regime series: ${label} must be a strict YYYY-MM string`);
  }
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (match === null) {
    throw new Error(`regime series: ${label} must be a strict YYYY-MM string, got ${value}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function assertReturnArray(
  value: unknown,
  label: 'blocks' | 'bondBlocks',
  expectedLength: number,
): asserts value is number[] {
  if (!Array.isArray(value)) {
    throw new Error(`regime series: ${label} must be an array`);
  }
  if (value.length !== expectedLength) {
    throw new Error(
      `regime series: ${label} length must be ${expectedLength}, got ${value.length}`,
    );
  }
  for (let index = 0; index < value.length; index++) {
    const returnValue: unknown = value[index];
    if (typeof returnValue !== 'number' || !Number.isFinite(returnValue)) {
      throw new Error(
        `regime series: ${label}[${index}] must be a finite number, got ${String(returnValue)}`,
      );
    }
    if (returnValue <= -1) {
      throw new Error(
        `regime series: ${label}[${index}] must be greater than -1, got ${returnValue}`,
      );
    }
  }
}

function assertHistoricalShape(file: unknown): asserts file is HistoricalBlocksFile {
  if (!isPlainObject(file)) {
    throw new Error('regime series: input must be a plain object');
  }
  if (!isPlainObject(file._meta)) {
    throw new Error('regime series: _meta must be a plain object');
  }

  const meta = file._meta;
  assertPositiveInteger(meta.blockCount, '_meta.blockCount');
  if (meta.blockLength !== BLOCK_LENGTH) {
    throw new Error(
      `regime series: _meta.blockLength must be ${BLOCK_LENGTH}, got ${String(meta.blockLength)}`,
    );
  }
  assertPositiveInteger(meta.monthCount, '_meta.monthCount');
  const expectedMonthCount = meta.blockCount + BLOCK_LENGTH - 1;
  if (meta.monthCount !== expectedMonthCount) {
    throw new Error(
      `regime series: _meta.monthCount must equal blockCount + 11 (${expectedMonthCount}), got ${meta.monthCount}`,
    );
  }
  parseMonth(meta.startDate, '_meta.startDate');
  parseMonth(meta.endDate, '_meta.endDate');

  const expectedArrayLength = meta.blockCount * BLOCK_LENGTH;
  assertReturnArray(file.blocks, 'blocks', expectedArrayLength);
  assertReturnArray(file.bondBlocks, 'bondBlocks', expectedArrayLength);
}

function assertOverlap(
  values: readonly number[],
  arrayName: 'blocks' | 'bondBlocks',
  sleeveName: 'equity' | 'bond',
  blockCount: number,
): void {
  for (let block = 0; block < blockCount - 1; block++) {
    for (let month = 1; month < BLOCK_LENGTH; month++) {
      const earlierIndex = block * BLOCK_LENGTH + month;
      const laterIndex = (block + 1) * BLOCK_LENGTH + month - 1;
      if (values[earlierIndex] !== values[laterIndex]) {
        throw new Error(
          `regime series: ${sleeveName} overlap mismatch in ${arrayName}: ` +
            `block ${block} month ${month} (index ${earlierIndex}) !== ` +
            `block ${block + 1} month ${month - 1} (index ${laterIndex})`,
        );
      }
    }
  }
}

function recoverSleeve(values: readonly number[], blockCount: number): number[] {
  const recovered = Array.from(
    { length: blockCount },
    (_, block) => values[block * BLOCK_LENGTH],
  );
  const finalBlockStart = (blockCount - 1) * BLOCK_LENGTH;
  recovered.push(...values.slice(finalBlockStart + 1, finalBlockStart + BLOCK_LENGTH));
  return recovered;
}

function monthSequence(startDate: string, count: number): string[] {
  const { year: startYear, month: startMonth } = parseMonth(startDate, '_meta.startDate');
  return Array.from({ length: count }, (_, index) => {
    const zeroBasedMonth = startMonth - 1 + index;
    const year = startYear + Math.floor(zeroBasedMonth / 12);
    const month = (zeroBasedMonth % 12) + 1;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  });
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state: number[] = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index++) {
      const word15 = words[index - 15];
      const word2 = words[index - 2];
      const sigma0 =
        rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 =
        rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];

    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + SHA256_ROUND[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function recoverPairedLogReturns(file: unknown): PairedLogReturnSeries {
  assertHistoricalShape(file);

  const { blockCount, monthCount, startDate, endDate } = file._meta;
  assertOverlap(file.blocks, 'blocks', 'equity', blockCount);
  assertOverlap(file.bondBlocks, 'bondBlocks', 'bond', blockCount);

  const equity = recoverSleeve(file.blocks, blockCount);
  const bonds = recoverSleeve(file.bondBlocks, blockCount);
  const dates = monthSequence(startDate, monthCount);
  const recoveredEndDate = dates.at(-1);
  if (recoveredEndDate !== endDate) {
    throw new Error(
      `regime series: recovered end date ${String(recoveredEndDate)} does not match ` +
        `_meta.endDate ${endDate}`,
    );
  }

  const canonical = dates
    .map(
      (date, index) =>
        `${date}\t${equity[index].toPrecision(17)}\t${bonds[index].toPrecision(17)}\n`,
    )
    .join('');

  return {
    dates,
    values: equity.map(
      (equityReturn, index) =>
        [Math.log1p(equityReturn), Math.log1p(bonds[index])] as const,
    ),
    inputSha256: sha256Hex(canonical),
  };
}
