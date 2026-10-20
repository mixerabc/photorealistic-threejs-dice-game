/**
 * Left control panel: dice count (1–12), per-die colour picker with
 * "apply to all" / per-slot selection, curated presets and game modes.
 */
import { PALETTE, PRESETS, colorById, rainbowColors } from '../game/colors';
import { MAX_DICE, MIN_DICE, type GameMode } from '../game/logic';
import { useGame } from '../state/store';

const MODES: { id: GameMode; name: string; hint: string }[] = [
  { id: 'free', name: 'Free Roll', hint: 'Any dice count, just roll.' },
  { id: 'craps', name: 'Craps', hint: 'Pass-line craps — needs 2 dice.' },
  { id: 'target', name: 'Target Sum', hint: 'Call the sum before you roll.' },
  { id: 'yahtzee', name: 'Combos', hint: 'Yahtzee-style combos — needs 5 dice.' },
];

export function Controls() {
  const s = useGame();

  return (
    <div className="flex flex-col gap-4 w-72 max-w-[85vw] p-4 rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 shadow-2xl text-sm pointer-events-auto max-h-[calc(100vh-7.5rem)] overflow-y-auto">
      {/* ---- dice count ---- */}
      <section aria-label="Dice count">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-amber-200/80">Dice</h2>
          <div className="flex items-center gap-1">
            <button
              aria-label="Fewer dice"
              onClick={() => s.setDiceCount(s.diceCount - 1)}
              disabled={s.rolling || s.diceCount <= MIN_DICE}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-bold transition"
            >
              −
            </button>
            <span className="w-8 text-center text-white font-bold tabular-nums">{s.diceCount}</span>
            <button
              aria-label="More dice"
              onClick={() => s.setDiceCount(s.diceCount + 1)}
              disabled={s.rolling || s.diceCount >= MAX_DICE}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-bold transition"
            >
              +
            </button>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Choose number of dice">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => s.setDiceCount(n)}
              disabled={s.rolling}
              aria-pressed={s.diceCount === n}
              className={`h-9 rounded-lg font-bold tabular-nums transition border ${
                s.diceCount === n
                  ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/15'
              } disabled:opacity-40`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-white/35">Keys: 1–9, 0 = 10, Q = 11, W = 12 · ↑/↓</p>
      </section>

      {/* ---- colors ---- */}
      <section aria-label="Dice colours">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-amber-200/80 mb-2">Colour / Material</h2>

        {/* slot row */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            onClick={() => s.setSlot(null)}
            aria-pressed={s.selectedSlot === null}
            className={`px-2 h-7 rounded-lg text-[11px] font-semibold transition border ${
              s.selectedSlot === null
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/15'
            }`}
          >
            All
          </button>
          {Array.from({ length: s.diceCount }, (_, i) => (
            <button
              key={i}
              onClick={() => s.setSlot(i)}
              aria-pressed={s.selectedSlot === i}
              aria-label={`Die ${i + 1}: ${colorById(s.colors[i]).name}`}
              title={`Die ${i + 1}: ${colorById(s.colors[i]).name}`}
              className={`w-7 h-7 rounded-lg border-2 transition text-[10px] font-bold text-white/90 ${
                s.selectedSlot === i ? 'border-amber-300 scale-110' : 'border-white/15 hover:border-white/40'
              }`}
              style={{ background: colorById(s.colors[i]).swatch }}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* palette */}
        <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Colour palette">
          {PALETTE.map((p) => {
            const activeAll = s.selectedSlot === null && s.colors.slice(0, s.diceCount).every((c) => c === p.id);
            const activeOne = s.selectedSlot !== null && s.colors[s.selectedSlot] === p.id;
            return (
              <button
                key={p.id}
                onClick={() => s.pickColor(p.id)}
                title={p.name}
                aria-label={p.name}
                className={`h-8 rounded-lg border-2 transition ${
                  activeAll || activeOne ? 'border-amber-300 scale-110 shadow-lg' : 'border-white/10 hover:border-white/50'
                }`}
                style={{
                  background:
                    p.transmission > 0.5
                      ? `linear-gradient(135deg, ${p.swatch}cc, ${p.swatch}66)`
                      : p.metalness > 0.5
                        ? `linear-gradient(135deg, #ffffff55, ${p.swatch} 45%, #00000044)`
                        : p.swatch,
                }}
              />
            );
          })}
        </div>

        <div className="flex gap-1.5 mt-2">
          <button onClick={s.randomizeColors} className="flex-1 h-7 rounded-lg bg-white/8 border border-white/10 text-[11px] text-white/80 hover:bg-white/15 transition">
            🎲 Random
          </button>
          <button onClick={() => s.setAllColors(rainbowColors(s.diceCount))} className="flex-1 h-7 rounded-lg bg-white/8 border border-white/10 text-[11px] text-white/80 hover:bg-white/15 transition">
            🌈 Rainbow
          </button>
          <button onClick={s.matchAllToFirst} className="flex-1 h-7 rounded-lg bg-white/8 border border-white/10 text-[11px] text-white/80 hover:bg-white/15 transition">
            Match #1
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {PRESETS.map((pr) => (
            <button
              key={pr.id}
              onClick={() => s.setAllColors(pr.colors(s.diceCount))}
              className="px-2 h-6 rounded-md bg-white/5 border border-white/10 text-[10px] text-white/65 hover:bg-white/15 hover:text-white transition"
            >
              {pr.name}
            </button>
          ))}
        </div>
      </section>

      {/* ---- game mode ---- */}
      <section aria-label="Game mode">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-amber-200/80 mb-2">Game Mode</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => s.setMode(m.id)}
              title={m.hint}
              aria-pressed={s.mode === m.id}
              className={`h-8 rounded-lg text-[11px] font-semibold transition border ${
                s.mode === m.id
                  ? 'bg-emerald-500/80 text-white border-emerald-300/60'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/15'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        {s.mode === 'target' && (
          <div className="flex items-center gap-2 mt-2">
            <label htmlFor="target" className="text-[11px] text-white/60">
              Call the sum:
            </label>
            <input
              id="target"
              type="number"
              min={s.diceCount}
              max={s.diceCount * 6}
              value={s.target}
              onChange={(e) => s.setTarget(Number(e.target.value))}
              className="w-16 h-7 rounded-lg bg-white/10 border border-white/15 text-white text-center text-sm"
            />
            <span className="text-[10px] text-white/35">
              {s.diceCount}–{s.diceCount * 6}
            </span>
          </div>
        )}
        {s.mode === 'craps' && s.diceCount !== 2 && (
          <p className="mt-1.5 text-[10px] text-amber-300/90">Craps needs exactly 2 dice — set the count to 2.</p>
        )}
        {s.mode === 'yahtzee' && s.diceCount !== 5 && (
          <p className="mt-1.5 text-[10px] text-amber-300/90">Combos need exactly 5 dice — set the count to 5.</p>
        )}
        {s.mode === 'craps' && s.craps.phase === 'point' && (
          <p className="mt-1.5 text-[11px] text-emerald-300 font-semibold">Point: {s.craps.point}</p>
        )}
      </section>
    </div>
  );
}
