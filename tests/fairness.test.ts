import { describe, it, expect } from 'vitest';
import {
  sha256Hex, hmacSha256, toHex, deriveDiceValues, createFairRoll, verifyRoll, randomHex,
} from '../src/game/fairness';

describe('SHA-256 / HMAC primitives', () => {
  it('matches known SHA-256 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches known HMAC-SHA256 test vector (RFC 4231 #2)', () => {
    expect(toHex(hmacSha256('Jefe', 'what do ya want for nothing?'))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });
});

describe('provably-fair dice derivation', () => {
  it('is deterministic for identical seeds', () => {
    const a = deriveDiceValues('server-seed', 'client-seed', 5, 12);
    const b = deriveDiceValues('server-seed', 'client-seed', 5, 12);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
  });

  it('changes when any seed component changes', () => {
    const base = deriveDiceValues('s', 'c', 1, 6);
    expect(deriveDiceValues('s2', 'c', 1, 6)).not.toEqual(base);
    expect(deriveDiceValues('s', 'c2', 1, 6)).not.toEqual(base);
    expect(deriveDiceValues('s', 'c', 2, 6)).not.toEqual(base);
  });

  it('only produces values 1..6', () => {
    for (let n = 0; n < 50; n++) {
      for (const v of deriveDiceValues(`seed${n}`, 'client', n, 12)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(6);
      }
    }
  });

  it('RNG distribution is roughly uniform (chi-square, 6000 samples)', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    let produced = 0;
    let nonce = 0;
    while (produced < 6000) {
      const vals = deriveDiceValues('distribution-seed', 'client', nonce++, 12);
      for (const v of vals) {
        counts[v - 1]++;
        produced++;
      }
    }
    const expected = produced / 6;
    const chi2 = counts.reduce((acc, c) => acc + ((c - expected) ** 2) / expected, 0);
    // df=5, p=0.001 critical value ≈ 20.52 — a fair RNG fails this < 0.1% of the time
    expect(chi2).toBeLessThan(20.52);
  });
});

describe('commit-reveal verification', () => {
  it('a legitimate roll verifies', () => {
    const roll = createFairRoll('my-client-seed', 3, 7);
    expect(roll.values).toHaveLength(7);
    const res = verifyRoll(roll);
    expect(res.hashValid).toBe(true);
    expect(res.valuesValid).toBe(true);
    expect(res.derivedValues).toEqual(roll.values);
  });

  it('a tampered server seed fails the hash check', () => {
    const roll = createFairRoll('c', 0, 3);
    const res = verifyRoll({ ...roll, serverSeed: randomHex(32) });
    expect(res.hashValid).toBe(false);
  });

  it('tampered values fail re-derivation', () => {
    const roll = createFairRoll('c', 0, 3);
    const forged = roll.values.map((v) => (v % 6) + 1);
    const res = verifyRoll({ ...roll, values: forged });
    expect(res.valuesValid).toBe(false);
  });

  it('server seeds are unpredictable (unique across generations)', () => {
    const seeds = new Set(Array.from({ length: 200 }, () => randomHex(32)));
    expect(seeds.size).toBe(200);
  });
});
