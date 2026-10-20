/**
 * Pure game logic — no three.js / rapier imports so everything here is unit-testable.
 */

export interface Quat { x: number; y: number; z: number; w: number }
export interface Vec3 { x: number; y: number; z: number }

export const MIN_DICE = 1;
export const MAX_DICE = 12;

/**
 * Local-space face normals for each die value.
 * Standard casino die: opposite faces sum to 7 (1-6, 2-5, 3-4).
 *   1 -> +Y, 6 -> -Y, 2 -> +X, 5 -> -X, 3 -> +Z, 4 -> -Z
 */
export const FACE_NORMALS: Record<number, Vec3> = {
  1: { x: 0, y: 1, z: 0 },
  6: { x: 0, y: -1, z: 0 },
  2: { x: 1, y: 0, z: 0 },
  5: { x: -1, y: 0, z: 0 },
  3: { x: 0, y: 0, z: 1 },
  4: { x: 0, y: 0, z: -1 },
};

/** Rotate vector v by quaternion q (pure math, no three.js). */
export function rotateVecByQuat(v: Vec3, q: Quat): Vec3 {
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  // v' = v + w*t + cross(q.xyz, t)
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * Determine the value on the top face of a die given its world rotation.
 * Compares every face normal (rotated to world space) against world-up (0,1,0)
 * and returns the value whose normal has the greatest dot product, plus that dot.
 * A dot < ~0.99 at rest means the die is "cocked" (leaning on something).
 */
export function topFaceFromQuaternion(q: Quat): { value: number; dot: number } {
  let best = 1;
  let bestDot = -Infinity;
  for (let v = 1; v <= 6; v++) {
    const n = rotateVecByQuat(FACE_NORMALS[v], q);
    if (n.y > bestDot) {
      bestDot = n.y;
      best = v;
    }
  }
  return { value: best, dot: bestDot };
}

export function clampDiceCount(n: number): number {
  if (!Number.isFinite(n)) return 2;
  return Math.min(MAX_DICE, Math.max(MIN_DICE, Math.round(n)));
}

export function isValidDiceCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_DICE && n <= MAX_DICE;
}

/** Validate a colors array against dice count and the known palette ids. */
export function validateColors(ids: unknown, count: number, validIds: string[]): boolean {
  if (!Array.isArray(ids) || ids.length !== count) return false;
  return ids.every((id) => typeof id === 'string' && validIds.includes(id));
}

/**
 * Idle layout: where dice rest between rolls.
 * 1 die centered, up to 12 in a neat centered grid so they never overlap.
 * Returns [x, z] pairs in table space.
 */
export function spawnLayout(count: number, spacing = 1.7): [number, number][] {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = r === rows - 1 ? count - r * cols : cols;
    const x = (c - (inRow - 1) / 2) * spacing;
    const z = (r - (rows - 1) / 2) * spacing;
    out.push([x, z]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Game modes                                                          */
/* ------------------------------------------------------------------ */

export type GameMode = 'free' | 'craps' | 'target' | 'yahtzee';

export interface CrapsState {
  phase: 'comeOut' | 'point';
  point: number | null;
  message: string;
  outcome: 'win' | 'lose' | 'point' | 'roll' | null;
}

export const initialCraps: CrapsState = { phase: 'comeOut', point: null, message: 'Come-out roll', outcome: null };

/** Classic pass-line craps state machine (2 dice). */
export function evalCraps(state: CrapsState, sum: number): CrapsState {
  if (state.phase === 'comeOut') {
    if (sum === 7 || sum === 11) {
      return { phase: 'comeOut', point: null, message: `Natural ${sum} — Pass line WINS!`, outcome: 'win' };
    }
    if (sum === 2 || sum === 3 || sum === 12) {
      return { phase: 'comeOut', point: null, message: `Craps ${sum} — Pass line loses.`, outcome: 'lose' };
    }
    return { phase: 'point', point: sum, message: `Point is ${sum}. Roll it again before a 7!`, outcome: 'point' };
  }
  // point phase
  if (sum === state.point) {
    return { phase: 'comeOut', point: null, message: `Hit the point (${sum}) — WINNER!`, outcome: 'win' };
  }
  if (sum === 7) {
    return { phase: 'comeOut', point: null, message: 'Seven out — Pass line loses.', outcome: 'lose' };
  }
  return { ...state, message: `Rolled ${sum}. Still chasing point ${state.point}.`, outcome: 'roll' };
}

/** Yahtzee-style combo detection for 5 dice. */
export function evalYahtzee(values: number[]): string {
  const counts = new Array<number>(7).fill(0);
  for (const v of values) counts[v]++;
  const sorted = [...counts.slice(1)].sort((a, b) => b - a);
  const uniq = [...new Set(values)].sort((a, b) => a - b).join('');
  if (sorted[0] === 5) return 'YAHTZEE! Five of a kind!';
  if (sorted[0] === 4) return 'Four of a Kind';
  if (sorted[0] === 3 && sorted[1] === 2) return 'Full House';
  if ('12345'.includes(uniq) && uniq.length === 5) return 'Large Straight';
  if ('23456'.includes(uniq) && uniq.length === 5) return 'Large Straight';
  if (['1234', '2345', '3456'].some((s) => uniq.includes(s[0]) && s.split('').every((c) => uniq.includes(c)))) {
    return 'Small Straight';
  }
  if (sorted[0] === 3) return 'Three of a Kind';
  if (sorted[0] === 2 && sorted[1] === 2) return 'Two Pair';
  if (sorted[0] === 2) return 'One Pair';
  return 'Chance';
}

export function evalTarget(target: number, sum: number): { hit: boolean; message: string } {
  const hit = target === sum;
  return {
    hit,
    message: hit
      ? `Nailed it! You called ${target} and rolled ${sum}!`
      : `You called ${target}, rolled ${sum} (off by ${Math.abs(target - sum)}).`,
  };
}
