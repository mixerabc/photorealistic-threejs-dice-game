# TESTING.md — Manual QA Checklist

## Automated tests

```bash
npm test          # vitest: RNG distribution, provably-fair verification,
                  # top-face detection, colour validation, dice-count limits
```

In-app: **Settings tab → "⚡ Stress test: 12 dice × 100 rolls"** runs a headless
physics soak test and reports escaped dice, cocked-die nudges, face
distribution, average settle time and render FPS.

## Functional checklist

- [ ] Dice count 1 → 12 via buttons, +/−, keys 1–9/0/Q/W and ↑/↓; dice fade in/out with a pop sound, never overlap at spawn, camera dollies to frame them.
- [ ] Count persists after reload (localStorage).
- [ ] Colour: "All" swatch recolours every die instantly; selecting Die N then a swatch recolours only that die.
- [ ] Random / Rainbow / Match #1 and all six presets work; colours persist after reload.
- [ ] Gold/silver read as polished metal; sapphire/ruby/emerald/crystal show refraction & coloured depth; obsidian is glossy black with gold pips; ivory looks like bone.
- [ ] ROLL button, Space and drag-pad all roll; drag direction/speed changes the throw.
- [ ] Physics: no tunnelling through felt or rails, no dice leaving the table, no endless jitter; cocked dice get nudged with a toast.
- [ ] Every die's floating label matches its visible top face; HUD total = sum of labels; history row matches.
- [ ] Fair tab: "Verify last roll" passes; editing the client seed changes future rolls; hash is shown pre-reveal.
- [ ] Game modes: Craps (2 dice) come-out/point flow; Target Sum guess feedback; Combos (5 dice) detects pairs/straights/Yahtzee.
- [ ] Settings: quality presets change sharpness/shadows; lighting presets (Casino/Studio/Dramatic) change mood; mute + volume work; FPS counter updates.
- [ ] Tab hidden → rendering pauses (CPU drops); returning resumes cleanly.

## Cross-browser matrix

| Browser | Render | Physics | Audio | Transmission materials |
|---|---|---|---|---|
| Chrome (latest, Win/Mac) | | | | |
| Edge (latest) | | | | |
| Firefox (latest) | | | | |
| Safari 17+ (Mac) | | | | |
| iOS Safari | | | | |
| Android Chrome | | | | |

Per browser: load, roll 12 dice 5×, run stress test, check console for errors.

## Mobile specifics

- [ ] 🎛️ / 📊 buttons toggle the panels; all controls reachable with touch.
- [ ] Drag-to-throw works with touch (no page scroll during drag).
- [ ] Auto quality downgrade engages on weak GPUs (toast appears) and holds 30+ FPS at Medium.
- [ ] Audio starts only after first tap (autoplay policy respected).

## Accessibility

- [ ] Full keyboard operation (tab order, Space to roll, number keys for count).
- [ ] ARIA labels present on icon-only buttons; `aria-pressed` on toggles.
- [ ] Pip contrast: every palette entry keeps ≥ 3:1 pip/body contrast (colour-blind safe).
