import { describe, it, expect } from 'vitest';
import {
  topFaceFromQuaternion, clampDiceCount, isValidDiceCount, validateColors,
  spawnLayout, rotateVecByQuat, FACE_NORMALS, evalCraps, initialCraps, evalYahtzee,
} from '../src/game/logic';
import { PALETTE_IDS } from '../src/game/colors';

/** quaternion from axis+angle (pure helper for tests) */
function quat(ax: number, ay: number, az: number, angle: number) {
  const s = Math.sin(angle / 2);
  const len = Math.hypot(ax, ay, az) || 1;
  return { x: (ax / len) * s, y: (ay / len) * s, z: (az / len) * s, w: Math.cos(angle / 2) };
}

describe('top-face detection', () => {
  it('identity rotation puts face 1 (+Y) on top', () => {
    const r = topFaceFromQuaternion({ x: 0, y: 0, z: 0, w: 1 });
    expect(r.value).toBe(1);
    expect(r.dot).toBeCloseTo(1, 5);
  });

  it('180° about X puts face 6 on top', () => {
    expect(topFaceFromQuaternion(quat(1, 0, 0, Math.PI)).value).toBe(6);
  });

  it('90° rotations expose the correct side faces', () => {
    // +90° about Z sends +X (face 2) to +Y
    expect(topFaceFromQuaternion(quat(0, 0, 1, Math.PI / 2)).value).toBe(2);
    expect(topFaceFromQuaternion(quat(0, 0, 1, -Math.PI / 2)).value).toBe(5);
    // rotations about X bring 3/4 up: Rx(−90°) sends +Z (face 3) to +Y
    expect(topFaceFromQuaternion(quat(1, 0, 0, -Math.PI / 2)).value).toBe(3);
    expect(topFaceFromQuaternion(quat(1, 0, 0, Math.PI / 2)).value).toBe(4);
  });

  it('every face value can be brought on top and opposite faces sum to 7', () => {
    for (let v = 1; v <= 6; v++) {
      const n = FACE_NORMALS[v];
      const opp = FACE_NORMALS[7 - v];
      expect(n.x + opp.x).toBe(0);
      expect(n.y + opp.y).toBe(0);
      expect(n.z + opp.z).toBe(0);
    }
  });

  it('a slightly tilted die still reports the closest face with dot < 1', () => {
    const r = topFaceFromQuaternion(quat(1, 0, 0, 0.2));
    expect(r.value).toBe(1);
    expect(r.dot).toBeLessThan(1);
    expect(r.dot).toBeGreaterThan(0.9);
  });

  it('rotateVecByQuat preserves length', () => {
    const v = rotateVecByQuat({ x: 1, y: 2, z: 3 }, quat(0.3, 1, -0.5, 1.1));
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(Math.hypot(1, 2, 3), 6);
  });
});

describe('dice count limits (1–12)', () => {
  it('clamps out-of-range values', () => {
    expect(clampDiceCount(0)).toBe(1);
    expect(clampDiceCount(-5)).toBe(1);
    expect(clampDiceCount(13)).toBe(12);
    expect(clampDiceCount(999)).toBe(12);
    expect(clampDiceCount(7.4)).toBe(7);
    expect(clampDiceCount(NaN)).toBe(2);
  });

  it('validates integers 1..12 only', () => {
    for (let i = 1; i <= 12; i++) expect(isValidDiceCount(i)).toBe(true);
    expect(isValidDiceCount(0)).toBe(false);
    expect(isValidDiceCount(13)).toBe(false);
    expect(isValidDiceCount(2.5)).toBe(false);
    expect(isValidDiceCount('3')).toBe(false);
  });
});

describe('colour validation', () => {
  it('accepts arrays of known palette ids matching the count', () => {
    expect(validateColors(['gold', 'sapphire', 'ruby'], 3, PALETTE_IDS)).toBe(true);
  });
  it('rejects wrong lengths and unknown ids', () => {
    expect(validateColors(['gold'], 2, PALETTE_IDS)).toBe(false);
    expect(validateColors(['gold', 'notAColor'], 2, PALETTE_IDS)).toBe(false);
    expect(validateColors('gold', 1, PALETTE_IDS)).toBe(false);
    expect(validateColors([42], 1, PALETTE_IDS)).toBe(false);
  });
});

describe('spawn layout', () => {
  it('produces the requested number of non-overlapping slots for 1..12', () => {
    for (let n = 1; n <= 12; n++) {
      const slots = spawnLayout(n);
      expect(slots).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(slots[i][0] - slots[j][0], slots[i][1] - slots[j][1]);
          expect(d).toBeGreaterThan(1.2); // die is 1 unit wide
        }
      }
    }
  });
  it('centers a single die', () => {
    expect(spawnLayout(1)[0]).toEqual([0, 0]);
  });
});

describe('game modes', () => {
  it('craps naturals and craps-outs on the come-out roll', () => {
    expect(evalCraps(initialCraps, 7).outcome).toBe('win');
    expect(evalCraps(initialCraps, 11).outcome).toBe('win');
    expect(evalCraps(initialCraps, 2).outcome).toBe('lose');
    expect(evalCraps(initialCraps, 12).outcome).toBe('lose');
    const pt = evalCraps(initialCraps, 6);
    expect(pt.phase).toBe('point');
    expect(pt.point).toBe(6);
    expect(evalCraps(pt, 6).outcome).toBe('win');
    expect(evalCraps(pt, 7).outcome).toBe('lose');
  });

  it('detects yahtzee combos', () => {
    expect(evalYahtzee([3, 3, 3, 3, 3])).toContain('YAHTZEE');
    expect(evalYahtzee([2, 2, 5, 5, 5])).toBe('Full House');
    expect(evalYahtzee([1, 2, 3, 4, 5])).toBe('Large Straight');
    expect(evalYahtzee([1, 1, 4, 4, 6])).toBe('Two Pair');
  });
});
