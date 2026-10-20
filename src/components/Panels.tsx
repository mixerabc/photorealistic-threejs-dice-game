/**
 * HUD (total + per-die values + mode messages), right-side tabbed panel
 * (History / Stats / Settings / Provably Fair), toast notifications.
 */
import { useState } from 'react';
import { useGame } from '../state/store';
import { verifyRoll, type VerifyResult } from '../game/fairness';
import type { Quality, LightPreset, StressReport } from '../game/engine';

/* ------------------------------- HUD ---------------------------------- */

export function Hud() {
  const { lastValues, rolling, modeMessage, mode, craps } = useGame();
  const sum = lastValues?.reduce((a, b) => a + b, 0) ?? null;

  return (
    <div className="flex flex-col items-center gap-2 pointer-events-none select-none">
      <div className="px-8 py-3 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/10 shadow-2xl text-center min-w-44">
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">Total</div>
        <div className="text-5xl font-black text-white tabular-nums leading-tight drop-shadow-[0_0_18px_rgba(251,191,36,0.35)]">
          {rolling ? <span className="animate-pulse text-white/50">···</span> : sum ?? '—'}
        </div>
        {lastValues && !rolling && (
          <div className="flex flex-wrap justify-center gap-1 mt-1.5 max-w-80">
            {lastValues.map((v, i) => (
              <span key={i} className="w-6 h-6 grid place-items-center rounded-md bg-white/10 border border-white/15 text-xs font-bold text-amber-100 tabular-nums">
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
      {(modeMessage || (mode === 'craps' && craps.phase === 'point')) && !rolling && (
        <div className="px-4 py-1.5 rounded-xl bg-emerald-900/70 backdrop-blur border border-emerald-400/30 text-emerald-100 text-sm font-semibold shadow-lg">
          {modeMessage || `Point is ${craps.point}`}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- toast -------------------------------- */

export function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/75 backdrop-blur border border-amber-300/30 text-amber-100 text-sm shadow-2xl pointer-events-none z-50">
      {toast}
    </div>
  );
}

/* ---------------------------- side panel ------------------------------- */

type Tab = 'history' | 'stats' | 'settings' | 'fair';

export function SidePanel({ onStressTest }: { onStressTest: (n: number, cb: (d: number) => void) => Promise<StressReport> }) {
  const [tab, setTab] = useState<Tab>('history');
  return (
    <div className="w-72 max-w-[85vw] rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 shadow-2xl text-sm pointer-events-auto flex flex-col max-h-[calc(100vh-7.5rem)]">
      <div className="flex p-1.5 gap-1" role="tablist">
        {(
          [
            ['history', 'History'],
            ['stats', 'Stats'],
            ['settings', 'Settings'],
            ['fair', 'Fair'],
          ] as [Tab, string][]
        ).map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 h-8 rounded-xl text-[11px] font-semibold transition ${
              tab === id ? 'bg-amber-400 text-black' : 'text-white/60 hover:bg-white/10'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="px-4 pb-4 overflow-y-auto">
        {tab === 'history' && <HistoryTab />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'settings' && <SettingsTab onStressTest={onStressTest} />}
        {tab === 'fair' && <FairTab />}
      </div>
    </div>
  );
}

function HistoryTab() {
  const history = useGame((s) => s.history);
  if (history.length === 0) return <p className="text-white/40 text-xs py-3">No rolls yet — hit ROLL!</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {history.map((r) => (
        <li key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8">
          <span className="text-[10px] text-white/40 tabular-nums w-14">
            {new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="flex-1 flex flex-wrap gap-0.5">
            {r.values.map((v, i) => (
              <span key={i} className="w-4.5 h-4.5 w-[18px] h-[18px] grid place-items-center rounded bg-white/10 text-[10px] font-bold text-white/85 tabular-nums">
                {v}
              </span>
            ))}
          </span>
          <span className="text-amber-300 font-black tabular-nums">{r.sum}</span>
        </li>
      ))}
    </ul>
  );
}

function StatsTab() {
  const { totalRolls, totalSum, faceDist, history } = useGame();
  const totalFaces = faceDist.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...faceDist);
  const avg = history.length ? (history.reduce((a, r) => a + r.sum, 0) / history.length).toFixed(1) : '—';
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Rolls', String(totalRolls)],
          ['Avg sum', totalRolls ? (totalSum / totalRolls).toFixed(1) : '—'],
          ['Session avg', String(avg)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/5 border border-white/8 py-2">
            <div className="text-lg font-black text-white tabular-nums">{v}</div>
            <div className="text-[9px] uppercase tracking-wider text-white/40">{k}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Face distribution</div>
        {faceDist.map((c, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <span className="w-3 text-xs font-bold text-white/70">{i + 1}</span>
            <div className="flex-1 h-3.5 rounded bg-white/5 overflow-hidden">
              <div
                className="h-full rounded bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                style={{ width: `${(c / max) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-[10px] text-white/50 tabular-nums">
              {c} {totalFaces ? `(${((c / totalFaces) * 100).toFixed(0)}%)` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab({ onStressTest }: { onStressTest: (n: number, cb: (d: number) => void) => Promise<StressReport> }) {
  const s = useGame();
  const [report, setReport] = useState<StressReport | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const runStress = async () => {
    if (progress !== null) return;
    setProgress(0);
    setReport(null);
    try {
      const r = await onStressTest(100, setProgress);
      setReport(r);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 py-1">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Quality</div>
        <div className="grid grid-cols-4 gap-1">
          {(['low', 'medium', 'high', 'ultra'] as Quality[]).map((q) => (
            <button
              key={q}
              onClick={() => s.setQuality(q)}
              aria-pressed={s.quality === q}
              className={`h-7 rounded-lg text-[10px] font-semibold capitalize transition ${
                s.quality === q ? 'bg-amber-400 text-black' : 'bg-white/5 text-white/60 hover:bg-white/15'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-white/30 mt-1">Auto-downgrades if FPS drops. Current: {s.fps} fps</p>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Lighting</div>
        <div className="grid grid-cols-3 gap-1">
          {(['casino', 'studio', 'dramatic'] as LightPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => s.setLightPreset(p)}
              aria-pressed={s.lightPreset === p}
              className={`h-7 rounded-lg text-[10px] font-semibold capitalize transition ${
                s.lightPreset === p ? 'bg-amber-400 text-black' : 'bg-white/5 text-white/60 hover:bg-white/15'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Audio</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => s.setMuted(!s.muted)}
            aria-label={s.muted ? 'Unmute' : 'Mute'}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition"
          >
            {s.muted ? '🔇' : '🔊'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            aria-label="Volume"
            onChange={(e) => s.setVolume(Number(e.target.value))}
            className="flex-1 accent-amber-400"
          />
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Debug</div>
        <button
          onClick={runStress}
          disabled={progress !== null || s.rolling}
          className="w-full h-8 rounded-lg bg-rose-500/20 border border-rose-400/30 text-rose-200 text-[11px] font-semibold hover:bg-rose-500/35 disabled:opacity-40 transition"
        >
          {progress !== null ? `Stress testing… ${progress}/100` : '⚡ Stress test: 12 dice × 100 rolls'}
        </button>
        {report && (
          <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/8 text-[10px] text-white/70 leading-relaxed">
            <div>Rolls: {report.rolls} × {report.diceCount} dice in {(report.durationMs / 1000).toFixed(1)}s</div>
            <div className={report.offTable ? 'text-rose-300' : 'text-emerald-300'}>
              Dice left table: {report.offTable}
            </div>
            <div>Cocked-die nudges: {report.cockedNudges}</div>
            <div>Avg settle time: {(report.avgSettleSteps / 120).toFixed(1)}s</div>
            <div>Render FPS during test: {report.renderFps}</div>
            <div className="mt-1">
              Faces: {report.faceDist.map((c, i) => `${i + 1}:${c}`).join('  ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FairTab() {
  const { fairness, clientSeed, setClientSeed, nonce } = useGame();
  const [result, setResult] = useState<VerifyResult | null>(null);

  return (
    <div className="flex flex-col gap-2.5 py-1 text-[11px] text-white/70">
      <p className="leading-relaxed text-white/50">
        Every roll is derived from <b className="text-white/80">HMAC-SHA256(serverSeed, clientSeed:nonce:die)</b>. The
        server seed hash is committed before the roll, then revealed so you can verify nothing was rigged.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Your client seed</span>
        <input
          value={clientSeed}
          onChange={(e) => setClientSeed(e.target.value)}
          className="h-8 px-2 rounded-lg bg-white/10 border border-white/15 text-white font-mono text-[11px]"
        />
      </label>
      <div className="text-[10px] text-white/40">Next nonce: {nonce}</div>
      {fairness ? (
        <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-white/5 border border-white/8 break-all font-mono text-[9.5px] leading-relaxed">
          <div><span className="text-amber-300/80">hash (committed):</span> {fairness.serverSeedHash}</div>
          <div><span className="text-amber-300/80">server seed (revealed):</span> {fairness.serverSeed}</div>
          <div><span className="text-amber-300/80">client seed:</span> {fairness.clientSeed}</div>
          <div><span className="text-amber-300/80">nonce:</span> {fairness.nonce} · <span className="text-amber-300/80">values:</span> [{fairness.values.join(', ')}]</div>
          <button
            onClick={() => setResult(verifyRoll(fairness))}
            className="mt-1 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 font-sans font-semibold hover:bg-emerald-500/35 transition"
          >
            Verify last roll
          </button>
          {result && (
            <div className={`font-sans font-semibold ${result.hashValid && result.valuesValid ? 'text-emerald-300' : 'text-rose-300'}`}>
              {result.hashValid && result.valuesValid
                ? '✓ Verified — hash matches & values re-derive exactly'
                : `✗ MISMATCH (hash ${result.hashValid ? 'ok' : 'BAD'}, values ${result.valuesValid ? 'ok' : 'BAD'})`}
            </div>
          )}
        </div>
      ) : (
        <p className="text-white/35">Roll once to get a verifiable seed reveal.</p>
      )}
    </div>
  );
}
