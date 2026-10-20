/**
 * Provably-fair authoritative RNG.
 *
 * In the original spec this lives on a Node server; this build is a static,
 * serverless deployment so the *same authoritative scheme* runs locally:
 *   1. Before each roll a random server seed is generated and its SHA-256
 *      hash is committed (shown to the player BEFORE the outcome exists).
 *   2. Each die value is derived with HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${die}:${round}`)
 *      using unbiased rejection sampling on 32-bit windows.
 *   3. After the roll the server seed is revealed so anyone can re-derive the
 *      values and check the hash commit — identical to casino provably-fair systems.
 *
 * SHA-256 / HMAC are implemented in pure TS (synchronous) so the module works
 * in every browser context and inside vitest without WebCrypto.
 */

/* ------------------------- pure SHA-256 ------------------------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256Bytes(msg: Uint8Array): Uint8Array {
  const len = msg.length;
  const bitLen = len * 8;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
  return out;
}

const encoder = new TextEncoder();
export const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const sha256Hex = (msg: string): string => toHex(sha256Bytes(encoder.encode(msg)));

/** HMAC-SHA256 (RFC 2104). */
export function hmacSha256(key: string, message: string): Uint8Array {
  let keyBytes: Uint8Array = encoder.encode(key);
  if (keyBytes.length > 64) keyBytes = sha256Bytes(keyBytes);
  const ipad = new Uint8Array(64 + encoder.encode(message).length);
  const opad = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    ipad[i] = (keyBytes[i] ?? 0) ^ 0x36;
    opad[i] = (keyBytes[i] ?? 0) ^ 0x5c;
  }
  ipad.set(encoder.encode(message), 64);
  opad.set(sha256Bytes(ipad), 64);
  return sha256Bytes(opad);
}

/* ------------------------- fairness API ------------------------- */

export function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return toHex(arr);
}

/** Largest multiple of 6 below 2^32 — rejection-sampling bound for unbiased d6. */
const REJECT_BOUND = 4294967292; // floor(2^32 / 6) * 6

/**
 * Derive `count` unbiased d6 values from the seed triple.
 * Deterministic: same inputs always give the same dice.
 */
export function deriveDiceValues(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): number[] {
  const values: number[] = [];
  for (let die = 0; die < count; die++) {
    let round = 0;
    let value: number | null = null;
    while (value === null) {
      const mac = hmacSha256(serverSeed, `${clientSeed}:${nonce}:${die}:${round}`);
      const dv = new DataView(mac.buffer, mac.byteOffset, mac.byteLength);
      for (let i = 0; i + 4 <= mac.length; i += 4) {
        const u = dv.getUint32(i);
        if (u < REJECT_BOUND) {
          value = (u % 6) + 1;
          break;
        }
      }
      round++;
    }
    values.push(value);
  }
  return values;
}

export interface FairRoll {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  values: number[];
}

export function createFairRoll(clientSeed: string, nonce: number, count: number): FairRoll {
  const serverSeed = randomHex(32);
  const serverSeedHash = sha256Hex(serverSeed);
  return { serverSeed, serverSeedHash, clientSeed, nonce, values: deriveDiceValues(serverSeed, clientSeed, nonce, count) };
}

export interface VerifyResult {
  hashValid: boolean;
  valuesValid: boolean;
  derivedValues: number[];
  derivedHash: string;
}

/** Re-derive everything from the revealed seeds and compare — the /verify page logic. */
export function verifyRoll(roll: FairRoll): VerifyResult {
  const derivedHash = sha256Hex(roll.serverSeed);
  const derivedValues = deriveDiceValues(roll.serverSeed, roll.clientSeed, roll.nonce, roll.values.length);
  return {
    hashValid: derivedHash === roll.serverSeedHash,
    valuesValid:
      derivedValues.length === roll.values.length && derivedValues.every((v, i) => v === roll.values[i]),
    derivedValues,
    derivedHash,
  };
}
