# 🎲 Monte Carlo Dice — Photoreal 3D Dice Roller

A production-quality, browser-based 3D dice game: real-time PBR rendering
(three.js), deterministic rigid-body physics (Rapier/WASM), provably-fair
cryptographic RNG, procedural spatial audio, and a full game UI — 1 to 12 dice,
17 physically-based materials, 4 game modes.

## Run it

```bash
npm install
npm run dev       # dev server
npm run build     # production build -> dist/index.html (single file)
npm test          # vitest unit tests (RNG, fairness, top-face detection, limits)
```

No downloads, no API keys: every texture, environment and sound is generated
procedurally at runtime, so the project always runs standalone.

## Architecture

```
src/
  game/
    colors.ts    palette data — full PBR descriptions (metal/gem/acrylic/bone)
    logic.ts     pure logic: top-face detection, layouts, validation, game modes
    fairness.ts  provably-fair RNG: SHA-256 commit, HMAC-SHA256 derivation, verify
    dice.ts      die factory: rounded-box D6, real pip geometry, micro-detail maps
    table.ts     procedural casino table: felt, walnut rail, leather bumper
    audio.ts     synthesized spatial audio (felt/wood/die impacts by impulse)
    engine.ts    renderer + lights + postfx + physics + roll orchestration
  state/store.ts zustand store, localStorage persistence, history/stats
  components/    Controls (count/colors/modes), Panels (HUD/history/stats/fair)
  App.tsx        boot, keyboard shortcuts, drag-to-throw pad, layout
tests/           vitest suites
```

### The provably-fair steering trick

1. `fairness.ts` commits `SHA-256(serverSeed)` and derives each die value with
   `HMAC-SHA256(serverSeed, clientSeed:nonce:die)` + unbiased rejection sampling
   — **before** any physics runs.
2. The engine throws the dice, snapshots the Rapier world, and pre-simulates the
   whole roll off-screen. Rapier is bit-exact deterministic (verified: 0 error
   over 900 replay steps), so we know which face each die *will* land on.
3. Each die's **visual mesh** is rotated inside its rigid body by a
   cube-symmetry rotation mapping the committed value onto the landing face.
   The collider is a symmetric cube, so physics is untouched.
4. The world is restored and replayed in real time (cocked-die nudges replayed
   at identical step indices). Result: 100% natural physics whose final top
   faces always equal the committed, verifiable values.

### Rendering (honest UE5 notes)

Browsers can't run Lumen/Nanite; the closest WebGL2 equivalents used here:
ACES filmic tonemapping, `MeshPhysicalMaterial` everywhere (clearcoat, sheen,
transmission + IOR + attenuation for gems, iridescence), PMREM image-based
lighting, 3-point light rig, 1–4K PCF-soft shadows + per-die blob contact
shadows, and a pmndrs `postprocessing` chain (SMAA, soft bloom, subtle
chromatic aberration, film grain, vignette), plus drifting dust motes.

## Performance tuning guide

- **Quality presets** (Settings tab): pixel ratio 1→2, shadow map 1024→4096,
  postfx on/off. An FPS monitor auto-downgrades one level below ~45 FPS.
- Rendering pauses when the tab is hidden; physics runs at a fixed 120 Hz with
  an accumulator (max 12 sub-steps/frame) so slow frames never explode.
- Shared geometry across all dice; materials are per-die instances only.
- If you target very weak mobiles: set Low (disables postfx + dust, PR 1).
- Gem dice (transmission) are the most expensive material — prefer opaque
  palettes on low-end hardware.

## Optional CC0 asset upgrades

The game is fully procedural, but drops in nicely:

| Asset | Source | Where |
|---|---|---|
| Casino/studio HDRI (.hdr) | polyhaven.com/hdris | load via `RGBELoader`, replace `RoomEnvironment` in `engine.ts` |
| Felt / fabric PBR maps | ambientcg.com (Fabric030 etc.) | swap canvas textures in `table.ts` |
| Wood veneer PBR | ambientcg.com (Wood051) | `table.ts` rail material |
| Dice impact recordings | freesound.org (CC0) | replace synth calls in `audio.ts` |

## Acceptance criteria status

- 1–12 dice: instant switching, animated add/remove, camera auto-framing ✓
- Per-die materials: gold reads as metal, sapphire as refractive gem, etc. ✓
- Physics: CCD (no tunnelling), sleeping (no jitter), walls (no escapes),
  cocked-die detection + nudge ✓ — verify with the built-in stress test
- Sum/values always match the committed server values (deterministic steering) ✓
- Provably fair with in-app verification ✓ · Unit tested ✓ (`npm test`)
