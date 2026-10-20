/**
 * App shell: boots the DiceEngine, wires the zustand store to it,
 * handles keyboard shortcuts, the drag-to-throw pad and the overlay UI.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DiceEngine, type StressReport } from './game/engine';
import { audio } from './game/audio';
import { useGame } from './state/store';
import { Controls } from './components/Controls';
import { Hud, SidePanel, Toast } from './components/Panels';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DiceEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(10);
  const [showControls, setShowControls] = useState(true);
  const [showPanel, setShowPanel] = useState(true);

  /* ------------------------------ boot ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const fakeProgress = setInterval(() => setProgress((p) => Math.min(88, p + 7)), 120);

    DiceEngine.create(container, {
      onRollStart: () => useGame.getState().setRolling(true),
      onSettled: (values) => useGame.getState().recordResult(values),
      onToast: (msg) => useGame.getState().showToast(msg),
      onQualityChange: (q) => useGame.getState().setQuality(q),
      onFps: (fps) => useGame.getState().setFps(fps),
    })
      .then((engine) => {
        clearInterval(fakeProgress);
        if (cancelled) {
          engine.dispose();
          return;
        }
        engineRef.current = engine;
        const s = useGame.getState();
        engine.applyQuality(s.quality, false);
        engine.applyLightPreset(s.lightPreset);
        engine.setDice(s.colors.slice(0, s.diceCount));
        audio.setMuted(s.muted);
        audio.setVolume(s.volume);
        setProgress(100);
        setTimeout(() => setReady(true), 250);
      })
      .catch((err) => {
        clearInterval(fakeProgress);
        console.error('Engine failed to start', err);
      });

    const unlock = () => audio.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });

    return () => {
      cancelled = true;
      clearInterval(fakeProgress);
      window.removeEventListener('pointerdown', unlock);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  /* --------------------- store -> engine subscriptions --------------------- */
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        const engine = engineRef.current;
        if (!engine) return;
        if (s.diceCount !== prev.diceCount || s.colors !== prev.colors) {
          engine.setDice(s.colors.slice(0, s.diceCount));
        }
        if (s.quality !== prev.quality && s.quality !== engine.quality) {
          engine.applyQuality(s.quality);
        }
        if (s.lightPreset !== prev.lightPreset) engine.applyLightPreset(s.lightPreset);
        if (s.muted !== prev.muted) audio.setMuted(s.muted);
        if (s.volume !== prev.volume) audio.setVolume(s.volume);
      }),
    [],
  );

  /* ------------------------------ rolling ------------------------------ */
  const doRoll = useCallback((dirX = 0, power = 0.55) => {
    const engine = engineRef.current;
    if (!engine || engine.rolling) return;
    const fair = useGame.getState().prepareRoll();
    if (!fair) return;
    if (!engine.roll(fair.values, dirX, power)) {
      useGame.getState().setRolling(false);
    }
  }, []);

  /* --------------------------- keyboard shortcuts --------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const s = useGame.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        doRoll();
      } else if (e.key >= '1' && e.key <= '9') s.setDiceCount(Number(e.key));
      else if (e.key === '0') s.setDiceCount(10);
      else if (e.key.toLowerCase() === 'q') s.setDiceCount(11);
      else if (e.key.toLowerCase() === 'w') s.setDiceCount(12);
      else if (e.key === 'ArrowUp') s.setDiceCount(s.diceCount + 1);
      else if (e.key === 'ArrowDown') s.setDiceCount(s.diceCount - 1);
      else if (e.key.toLowerCase() === 'r') s.randomizeColors();
      else if (e.key.toLowerCase() === 'm') s.setMuted(!s.muted);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doRoll]);

  /* ---------------------------- drag-to-throw pad ---------------------------- */
  const dragRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const padDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDragging(true);
  };
  const padUp = (e: React.PointerEvent) => {
    setDragging(false);
    const start = dragRef.current;
    dragRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = start.y - e.clientY; // upward = forward
    const dist = Math.hypot(dx, dy);
    const dt = (performance.now() - start.t) / 1000;
    if (dist < 12) return; // treat as a tap, not a throw
    const speed = dist / Math.max(0.05, dt);
    const power = Math.min(1, Math.max(0.25, dist / 260 + speed / 4000));
    const dirX = Math.max(-1, Math.min(1, dx / 160));
    doRoll(dirX, power);
  };

  const rolling = useGame((s) => s.rolling);
  const fps = useGame((s) => s.fps);

  return (
    <div className="fixed inset-0 bg-[#0a0d12] overflow-hidden font-sans">
      {/* 3D canvas host */}
      <div ref={containerRef} className="absolute inset-0" aria-label="3D dice table" />

      {/* preloader */}
      {!ready && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#0a0d12]">
          <div className="flex flex-col items-center gap-5">
            <div className="text-4xl">🎲</div>
            <h1 className="text-xl font-black tracking-[0.3em] text-amber-200 uppercase">Monte Carlo Dice</h1>
            <div className="w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-200 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[11px] text-white/35">Loading physics engine & building the table…</p>
          </div>
        </div>
      )}

      {/* top bar */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setShowControls((v) => !v)}
            aria-label="Toggle dice controls"
            className="w-9 h-9 rounded-xl bg-black/50 backdrop-blur border border-white/10 text-white/80 hover:bg-black/70 transition"
          >
            🎛️
          </button>
          <div className="px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur border border-white/10">
            <span className="text-sm font-black tracking-[0.2em] text-amber-200 uppercase">🎲 Monte Carlo Dice</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="hidden sm:block px-2.5 py-1 rounded-lg bg-black/40 backdrop-blur border border-white/10 text-[10px] text-white/50 tabular-nums">
            {fps} FPS
          </span>
          <button
            onClick={() => setShowPanel((v) => !v)}
            aria-label="Toggle history panel"
            className="w-9 h-9 rounded-xl bg-black/50 backdrop-blur border border-white/10 text-white/80 hover:bg-black/70 transition"
          >
            📊
          </button>
        </div>
      </header>

      {/* HUD */}
      <div className="absolute top-16 inset-x-0 z-10 flex justify-center">
        <Hud />
      </div>

      {/* left controls */}
      {showControls ? (
        <aside className="absolute left-4 top-20 z-20">
          <div className="relative">
            <button
              onClick={() => setShowControls(false)}
              aria-label="Hide controls panel"
              title="Hide controls"
              className="absolute -top-2 -right-2 z-30 w-7 h-7 rounded-lg bg-black/70 backdrop-blur border border-white/10 text-white/60 hover:text-white hover:bg-black/90 transition grid place-items-center text-xs font-bold"
            >
              ✕
            </button>
            <Controls />
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setShowControls(true)}
          aria-label="Show controls panel"
          title="Show controls"
          className="absolute left-4 top-20 z-20 h-9 px-3 rounded-xl bg-black/50 backdrop-blur border border-white/10 text-white/80 hover:bg-black/70 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
        >
          <span aria-hidden="true">🎛️</span> Controls
        </button>
      )}

      {/* right panel */}
      {showPanel ? (
        <aside className="absolute right-4 top-20 z-20">
          <div className="relative">
            <button
              onClick={() => setShowPanel(false)}
              aria-label="Hide history panel"
              title="Hide panel"
              className="absolute -top-2 -right-2 z-30 w-7 h-7 rounded-lg bg-black/70 backdrop-blur border border-white/10 text-white/60 hover:text-white hover:bg-black/90 transition grid place-items-center text-xs font-bold"
            >
              ✕
            </button>
            <SidePanel
              onStressTest={(n, cb) => {
                const engine = engineRef.current;
                if (!engine) return Promise.reject(new Error('engine not ready'));
                return engine.stressTest(n, cb) as Promise<StressReport>;
              }}
            />
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setShowPanel(true)}
          aria-label="Show history panel"
          title="Show history panel"
          className="absolute right-4 top-20 z-20 h-9 px-3 rounded-xl bg-black/50 backdrop-blur border border-white/10 text-white/80 hover:bg-black/70 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
        >
          History <span aria-hidden="true">📊</span>
        </button>
      )}

      {/* bottom: roll button + throw pad */}
      <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col items-center gap-2 pb-5 pointer-events-none">
        <div
          role="button"
          aria-label="Drag here to throw the dice: drag direction aims, speed sets power"
          tabIndex={0}
          onPointerDown={padDown}
          onPointerUp={padUp}
          onPointerCancel={() => setDragging(false)}
          className={`pointer-events-auto w-72 max-w-[70vw] h-12 rounded-2xl border-2 border-dashed grid place-items-center text-[11px] uppercase tracking-widest select-none touch-none transition ${
            dragging
              ? 'border-amber-300 bg-amber-400/15 text-amber-200'
              : 'border-white/15 bg-black/30 text-white/35 hover:border-white/30'
          }`}
        >
          {dragging ? 'release to throw!' : 'drag to throw'}
        </div>
        <button
          onClick={() => doRoll()}
          disabled={rolling}
          className="pointer-events-auto px-12 py-3.5 rounded-2xl font-black text-lg tracking-[0.25em] uppercase transition bg-gradient-to-b from-amber-300 to-amber-500 text-black shadow-[0_8px_30px_rgba(251,191,36,0.4)] hover:shadow-[0_8px_40px_rgba(251,191,36,0.6)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:translate-y-0"
        >
          {rolling ? 'Rolling…' : 'Roll'}
        </button>
        <p className="text-[10px] text-white/25">Space = roll · R = random colours · M = mute · drag the table to orbit</p>
      </div>

      <Toast />
    </div>
  );
}
