/**
 * Global game state (zustand) with localStorage persistence for
 * dice count, colors, audio and quality settings, plus roll history/stats.
 */
import { create } from 'zustand';
import { PALETTE_IDS, randomColors } from '../game/colors';
import {
  clampDiceCount, validateColors, evalCraps, evalTarget, evalYahtzee,
  initialCraps, type CrapsState, type GameMode,
} from '../game/logic';
import { createFairRoll, randomHex, type FairRoll } from '../game/fairness';
import type { Quality, LightPreset } from '../game/engine';

export interface RollRecord {
  id: number;
  time: number;
  count: number;
  values: number[];
  sum: number;
}

interface Persisted {
  diceCount: number;
  colors: string[];
  muted: boolean;
  volume: number;
  quality: Quality;
  lightPreset: LightPreset;
  clientSeed: string;
  totalRolls: number;
  totalSum: number;
  faceDist: number[];
}

const LS_KEY = 'dice-game-v1';

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

export interface GameState extends Persisted {
  selectedSlot: number | null; // null = "apply to all"
  rolling: boolean;
  lastValues: number[] | null;
  history: RollRecord[];
  mode: GameMode;
  craps: CrapsState;
  target: number;
  modeMessage: string;
  fairness: FairRoll | null;
  nonce: number;
  fps: number;
  toast: string | null;

  setDiceCount: (n: number) => void;
  setSlot: (slot: number | null) => void;
  pickColor: (id: string) => void;
  setAllColors: (ids: string[]) => void;
  randomizeColors: () => void;
  matchAllToFirst: () => void;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  setQuality: (q: Quality) => void;
  setLightPreset: (p: LightPreset) => void;
  setMode: (m: GameMode) => void;
  setTarget: (t: number) => void;
  setClientSeed: (s: string) => void;
  setRolling: (r: boolean) => void;
  setFps: (f: number) => void;
  showToast: (msg: string) => void;
  /** "Server" step: validates the request and commits a provably-fair roll. */
  prepareRoll: () => FairRoll | null;
  recordResult: (values: number[]) => void;
}

const persisted = loadPersisted();
const initialCount = clampDiceCount(persisted.diceCount ?? 2);
const initialColors =
  persisted.colors && validateColors(persisted.colors.slice(0, 12), Math.min(12, persisted.colors.length), PALETTE_IDS) && persisted.colors.length === 12
    ? persisted.colors
    : ['casinoRed', 'casinoRed', ...randomColors(10)];

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let rollId = 1;

export const useGame = create<GameState>()((set, get) => ({
  diceCount: initialCount,
  colors: initialColors,
  muted: persisted.muted ?? false,
  volume: persisted.volume ?? 0.8,
  quality: persisted.quality ?? 'high',
  lightPreset: persisted.lightPreset ?? 'casino',
  clientSeed: persisted.clientSeed ?? randomHex(8),
  totalRolls: persisted.totalRolls ?? 0,
  totalSum: persisted.totalSum ?? 0,
  faceDist: persisted.faceDist ?? [0, 0, 0, 0, 0, 0],

  selectedSlot: null,
  rolling: false,
  lastValues: null,
  history: [],
  mode: 'free',
  craps: initialCraps,
  target: 7,
  modeMessage: '',
  fairness: null,
  nonce: 0,
  fps: 60,
  toast: null,

  setDiceCount: (n) => {
    if (get().rolling) return;
    const count = clampDiceCount(n);
    set((s) => ({
      diceCount: count,
      selectedSlot: s.selectedSlot !== null && s.selectedSlot >= count ? null : s.selectedSlot,
    }));
    save();
  },

  setSlot: (slot) => set({ selectedSlot: slot }),

  pickColor: (id) => {
    if (!PALETTE_IDS.includes(id)) return;
    const { selectedSlot, colors, diceCount } = get();
    const next = [...colors];
    if (selectedSlot === null) {
      for (let i = 0; i < diceCount; i++) next[i] = id;
    } else {
      next[selectedSlot] = id;
    }
    set({ colors: next });
    save();
  },

  setAllColors: (ids) => {
    const { colors, diceCount } = get();
    const next = [...colors];
    for (let i = 0; i < Math.min(diceCount, ids.length); i++) next[i] = ids[i];
    set({ colors: next });
    save();
  },

  randomizeColors: () => {
    get().setAllColors(randomColors(get().diceCount));
  },

  matchAllToFirst: () => {
    const { colors, diceCount } = get();
    get().setAllColors(Array(diceCount).fill(colors[0]));
  },

  setMuted: (m) => { set({ muted: m }); save(); },
  setVolume: (v) => { set({ volume: v }); save(); },
  setQuality: (q) => { set({ quality: q }); save(); },
  setLightPreset: (p) => { set({ lightPreset: p }); save(); },
  setMode: (m) => set({ mode: m, craps: initialCraps, modeMessage: '' }),
  setTarget: (t) => set({ target: Math.max(1, Math.min(72, Math.round(t))) }),
  setClientSeed: (s) => { set({ clientSeed: s.slice(0, 64) || randomHex(8) }); save(); },
  setRolling: (r) => set({ rolling: r }),
  setFps: (f) => set({ fps: f }),

  showToast: (msg) => {
    set({ toast: msg });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },

  prepareRoll: () => {
    const { diceCount, colors, clientSeed, nonce, rolling } = get();
    if (rolling) return null;
    // --- server-side validation (authoritative module) ---
    if (!Number.isInteger(diceCount) || diceCount < 1 || diceCount > 12) return null;
    if (!validateColors(colors.slice(0, diceCount), diceCount, PALETTE_IDS)) return null;
    const fair = createFairRoll(clientSeed, nonce, diceCount);
    set({ nonce: nonce + 1, fairness: fair });
    return fair;
  },

  recordResult: (values) => {
    const sum = values.reduce((a, b) => a + b, 0);
    const rec: RollRecord = { id: rollId++, time: Date.now(), count: values.length, values, sum };
    const s = get();
    const faceDist = [...s.faceDist];
    for (const v of values) faceDist[v - 1]++;

    let craps = s.craps;
    let modeMessage = '';
    if (s.mode === 'craps' && values.length === 2) {
      craps = evalCraps(s.craps, sum);
      modeMessage = craps.message;
    } else if (s.mode === 'target') {
      modeMessage = evalTarget(s.target, sum).message;
    } else if (s.mode === 'yahtzee' && values.length === 5) {
      modeMessage = evalYahtzee(values);
    }

    set({
      lastValues: values,
      history: [rec, ...s.history].slice(0, 20),
      totalRolls: s.totalRolls + 1,
      totalSum: s.totalSum + sum,
      faceDist,
      craps,
      modeMessage,
      rolling: false,
    });
    save();
  },
}));

function save(): void {
  const s = useGame.getState();
  const data: Persisted = {
    diceCount: s.diceCount,
    colors: s.colors,
    muted: s.muted,
    volume: s.volume,
    quality: s.quality,
    lightPreset: s.lightPreset,
    clientSeed: s.clientSeed,
    totalRolls: s.totalRolls,
    totalSum: s.totalSum,
    faceDist: s.faceDist,
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — ignore */
  }
}
