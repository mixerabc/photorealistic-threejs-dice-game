/**
 * DiceEngine — the real-time core.
 *
 * Rendering (honest notes about the "UE5 target"): a browser cannot run Lumen
 * or Nanite, so we use the closest WebGL2 equivalents: ACES filmic tonemapping,
 * full MeshPhysicalMaterial PBR (clearcoat/transmission/sheen/iridescence),
 * PMREM image-based lighting, 2–4K PCF-soft shadow maps, blob contact shadows,
 * and a pmndrs postprocessing stack (SMAA, bloom, chromatic aberration,
 * film grain, vignette).
 *
 * Physics: Rapier (WASM) at a fixed 120 Hz timestep with CCD enabled.
 *
 * Provably-fair steering: the fairness module decides the outcome BEFORE the
 * throw. We then pre-simulate the entire roll deterministically (Rapier is
 * deterministic), look at which face each die *will* land on, and rotate each
 * die's visual mesh inside its rigid body by a cube-symmetry rotation so the
 * committed value ends up on top. The world is then restored from a snapshot
 * and replayed in real time — physically identical, visually seamless, and the
 * final faces always match the committed values.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  VignetteEffect,
} from 'postprocessing';
import { createDieVisual, applyDieColor, DIE_SIZE, DIE_RADIUS, type DieVisual } from './dice';
import { colorById } from './colors';
import { createTable, PLAY_W, PLAY_D, WALL_H } from './table';
import { FACE_NORMALS, topFaceFromQuaternion, spawnLayout } from './logic';
import { audio } from './audio';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type LightPreset = 'casino' | 'studio' | 'dramatic';

export interface StressReport {
  rolls: number;
  diceCount: number;
  offTable: number;
  cockedNudges: number;
  faceDist: number[]; // index 0..5 -> value 1..6
  avgSettleSteps: number;
  durationMs: number;
  renderFps: number;
}

export interface EngineEvents {
  onRollStart: () => void;
  onSettled: (values: number[]) => void;
  onToast: (msg: string) => void;
  onQualityChange: (q: Quality) => void;
  onFps: (fps: number) => void;
}

interface RuntimeDie {
  outer: THREE.Group; // follows the rigid body
  visual: DieVisual; // inner group — receives the steering offset quaternion
  body: RAPIER.RigidBody;
  handle: number;
  colliderHandle: number;
  colorId: string;
  shadow: THREE.Mesh; // blob contact shadow
  scale: number;
  targetScale: number;
  removing: boolean;
  label: THREE.Sprite | null;
}

interface Nudge { step: number; idx: number; imp: THREE.Vector3Like; torq: THREE.Vector3Like }

interface Playback {
  nudges: Nudge[];
  restStep: number;
  step: number;
  values: number[];
  nudgeToastShown: boolean;
}

const STEP = 1 / 120;
const GRAVITY = { x: 0, y: -34, z: 0 }; // tuned for snappy dice feel at this scale
const WALL_X = PLAY_W + 0.55; // matches inner face of the leather bumper
const WALL_Z = PLAY_D + 0.55;

const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high', 'ultra'];

export class DiceEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private composer!: EffectComposer;
  private fxPass!: EffectPass;
  private smaaPass!: EffectPass;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.SpotLight;
  private envTex: THREE.Texture | null = null;

  private world!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;
  private floorHandles = new Set<number>();
  private wallHandles = new Set<number>();

  private dice: RuntimeDie[] = [];
  private dust: THREE.Points | null = null;
  private dustBase: Float32Array | null = null;

  private playback: Playback | null = null;
  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private running = false;
  private disposed = false;

  private fpsSamples: number[] = [];
  private fpsTimer = 0;
  private lastFpsAvg = 60;
  private autoQuality = true;

  quality: Quality = 'high';
  rolling = false;

  private desiredDist = 11;
  private events: EngineEvents;
  private container: HTMLElement;
  private resizeObs: ResizeObserver | null = null;
  private onVisibility = () => {
    if (document.hidden) this.stopLoop();
    else this.startLoop();
  };

  private constructor(container: HTMLElement, events: EngineEvents) {
    this.container = container;
    this.events = events;
  }

  static async create(container: HTMLElement, events: EngineEvents): Promise<DiceEngine> {
    await RAPIER.init();
    const e = new DiceEngine(container, events);
    e.setup();
    return e;
  }

  /* ------------------------------ setup ------------------------------ */

  private setup(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0d12');
    this.scene.fog = new THREE.FogExp2('#0a0d12', 0.012);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
    this.camera.position.set(0, 8.6, 10.4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 24;
    this.controls.enablePan = false;

    // image-based lighting from a procedural studio room (no .hdr download needed;
    // drop a real HDRI in and swap via RGBELoader for even richer reflections)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    // three-point lighting rig
    this.keyLight = new THREE.DirectionalLight('#ffe6c0', 2.6);
    this.keyLight.position.set(6, 12, 5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -11;
    this.keyLight.shadow.camera.right = 11;
    this.keyLight.shadow.camera.top = 11;
    this.keyLight.shadow.camera.bottom = -11;
    this.keyLight.shadow.camera.far = 40;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.shadow.radius = 6;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight('#9db4ff', 0.45);
    this.fillLight.position.set(-7, 6, -4);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.SpotLight('#ffd9a0', 60, 40, 0.7, 1);
    this.rimLight.position.set(-5, 7, -10);
    this.rimLight.target.position.set(0, 0, 0);
    this.scene.add(this.rimLight, this.rimLight.target);

    createTable(this.scene, 'casino');
    this.createDust();

    // physics
    this.world = new RAPIER.World(GRAVITY);
    this.world.timestep = STEP;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.createBounds();

    // post-processing
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const smaa = new SMAAEffect();
    const bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 0.85, mipmapBlur: true });
    const chroma = new ChromaticAberrationEffect();
    chroma.offset.set(0.00035, 0.00035);
    const grain = new NoiseEffect({ premultiply: true });
    grain.blendMode.opacity.value = 0.06;
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.55 });
    this.smaaPass = new EffectPass(this.camera, smaa);
    this.fxPass = new EffectPass(this.camera, bloom, chroma, grain, vignette);
    this.composer.addPass(this.fxPass);
    this.composer.addPass(this.smaaPass);

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(this.container);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.applyQuality(this.quality, false);
    this.startLoop();
  }

  private createBounds(): void {
    const mk = (desc: RAPIER.ColliderDesc, set: Set<number>) => {
      const c = this.world.createCollider(desc);
      set.add(c.handle);
    };
    // felt floor: high friction, soft bounce
    mk(
      RAPIER.ColliderDesc.cuboid(WALL_X + 2, 0.5, WALL_Z + 2)
        .setTranslation(0, -0.5, 0)
        .setFriction(0.85)
        .setRestitution(0.28),
      this.floorHandles,
    );
    // leather/wood rail walls: lower friction, livelier bounce
    const wall = (hx: number, hz: number, x: number, z: number) =>
      mk(
        RAPIER.ColliderDesc.cuboid(hx, WALL_H, hz)
          .setTranslation(x, WALL_H, z)
          .setFriction(0.25)
          .setRestitution(0.5),
        this.wallHandles,
      );
    wall(WALL_X + 1, 0.5, 0, -(WALL_Z + 0.5));
    wall(WALL_X + 1, 0.5, 0, WALL_Z + 0.5);
    wall(0.5, WALL_Z + 1, -(WALL_X + 0.5), 0);
    wall(0.5, WALL_Z + 1, WALL_X + 0.5, 0);
    // invisible ceiling so wild throws stay contained
    mk(RAPIER.ColliderDesc.cuboid(WALL_X + 2, 0.5, WALL_Z + 2).setTranslation(0, 9, 0), this.wallHandles);
  }

  private createDust(): void {
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = 0.3 + Math.random() * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 13;
    }
    this.dustBase = pos.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: '#ffe9b8',
      size: 0.035,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  /* --------------------------- dice management --------------------------- */

  private makeBlobShadow(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    return mesh;
  }

  private randomRestQuat(): THREE.Quaternion {
    // random cube orientation: random face up + random yaw — dice idle naturally
    const face = 1 + Math.floor(Math.random() * 6);
    const n = FACE_NORMALS[face];
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(n.x, n.y, n.z),
      new THREE.Vector3(0, 1, 0),
    );
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.floor(Math.random() * 4) * (Math.PI / 2) + (Math.random() - 0.5) * 0.4,
    );
    return yaw.multiply(q);
  }

  private createDie(colorId: string, x: number, z: number): RuntimeDie {
    const def = colorById(colorId);
    const visual = createDieVisual(def, null);
    const outer = new THREE.Group();
    outer.add(visual.group);
    outer.position.set(x, DIE_SIZE / 2 + 0.01, z);
    this.scene.add(outer);

    const shadow = this.makeBlobShadow();
    shadow.position.set(x, 0.015, z);
    this.scene.add(shadow);

    const q = this.randomRestQuat();
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, DIE_SIZE / 2 + 0.01, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCcdEnabled(true)
      .setAngularDamping(0.12)
      .setLinearDamping(0.06);
    const body = this.world.createRigidBody(bodyDesc);
    const half = DIE_SIZE / 2 - DIE_RADIUS;
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(half, half, half, DIE_RADIUS)
        .setFriction(0.62)
        .setRestitution(0.38)
        .setDensity(2.2)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(25),
      body,
    );
    body.sleep();

    outer.quaternion.copy(q);
    return {
      outer, visual, body,
      handle: body.handle,
      colliderHandle: collider.handle,
      colorId,
      shadow,
      scale: 0.01,
      targetScale: 1,
      removing: false,
      label: null,
    };
  }

  /** Sync dice to the requested colors array (length = dice count). */
  setDice(colorIds: string[]): void {
    if (this.rolling) return;
    const count = colorIds.length;
    const layout = spawnLayout(count);

    // remove extras (animate out, body removed immediately)
    while (this.dice.filter((d) => !d.removing).length > count) {
      const d = [...this.dice].reverse().find((x) => !x.removing)!;
      d.removing = true;
      d.targetScale = 0.01;
      this.world.removeRigidBody(d.body);
      audio.pop();
    }

    const active = this.dice.filter((d) => !d.removing);
    // add new dice
    for (let i = active.length; i < count; i++) {
      const [x, z] = layout[i];
      const d = this.createDie(colorIds[i], x, z);
      this.dice.push(d);
      active.push(d);
      audio.pop();
    }

    // reposition + recolor existing dice
    active.forEach((d, i) => {
      const [x, z] = layout[i];
      d.body.setTranslation({ x, y: DIE_SIZE / 2 + 0.01, z }, false);
      d.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      d.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      d.body.sleep();
      d.visual.group.quaternion.identity();
      if (d.colorId !== colorIds[i]) {
        d.colorId = colorIds[i];
        applyDieColor(d.visual, colorById(colorIds[i]), null);
        d.scale = Math.min(d.scale, 0.85); // little pop on recolor
      }
      this.clearLabel(d);
    });

    this.desiredDist = 10 + Math.max(0, count - 2) * 0.35;
  }

  /* ------------------------------- rolling ------------------------------- */

  /**
   * Roll with committed values (from the provably-fair module).
   * dirX -1..1 and power 0..1 come from the drag-to-throw pad (optional).
   */
  roll(values: number[], dirX = 0, power = 0.55): boolean {
    const active = this.dice.filter((d) => !d.removing);
    if (this.rolling || values.length !== active.length || active.length === 0) return false;
    this.rolling = true;
    this.events.onRollStart();
    audio.ensure();
    audio.rattle();
    for (const d of active) this.clearLabel(d);

    // throw from the near (camera) edge toward the far wall, like a craps shooter
    active.forEach((d, i) => {
      const lane = (i % 4) - 1.5;
      const row = Math.floor(i / 4);
      const x = lane * 1.5 + (Math.random() - 0.5) * 0.5 + dirX * 1.5;
      const z = PLAY_D - 0.7 - row * 0.4;
      const y = 1.6 + row * 1.0 + Math.random() * 0.4;
      const q = new THREE.Quaternion().random();
      d.body.setTranslation({ x, y, z }, true);
      d.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      d.body.setLinvel(
        {
          x: dirX * 7 + (Math.random() - 0.5) * 3 - x * 0.35,
          y: 1.2 + Math.random() * 1.6,
          z: -(9 + power * 7 + Math.random() * 2.5),
        },
        true,
      );
      d.body.setAngvel(
        {
          x: (Math.random() - 0.5) * 32,
          y: (Math.random() - 0.5) * 20,
          z: (Math.random() - 0.5) * 32,
        },
        true,
      );
      d.body.wakeUp();
    });

    this.presimulateAndSteer(active, values);
    return true;
  }

  private isCalm(body: RAPIER.RigidBody): boolean {
    if (body.isSleeping()) return true;
    const lv = body.linvel();
    const av = body.angvel();
    return (
      lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < 0.006 &&
      av.x * av.x + av.y * av.y + av.z * av.z < 0.01
    );
  }

  /** Deterministic pre-simulation + cube-symmetry steering (see file header). */
  private presimulateAndSteer(active: RuntimeDie[], values: number[]): void {
    const snapshot = this.world.takeSnapshot();
    const nudges: Nudge[] = [];
    const MAX = 2400; // 20 s cap
    let step = 0;
    let restStep = -1;

    while (step < MAX) {
      this.world.step();
      step++;
      if (step % 24 !== 0 || step < 60) continue;
      if (!active.every((d) => this.isCalm(d.body))) continue;
      // everyone is calm — check for cocked dice (leaning on a die or wall)
      let anyCocked = false;
      active.forEach((d, i) => {
        const { dot } = topFaceFromQuaternion(d.body.rotation());
        if (dot < 0.985) {
          anyCocked = true;
          const imp = { x: (Math.random() - 0.5) * 3, y: 3.2 + Math.random() * 1.5, z: (Math.random() - 0.5) * 3 };
          const torq = { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 };
          d.body.applyImpulse(imp, true);
          d.body.applyTorqueImpulse(torq, true);
          nudges.push({ step, idx: i, imp, torq });
        }
      });
      if (!anyCocked) {
        restStep = step;
        break;
      }
    }
    if (restStep < 0) restStep = MAX;

    // steering: rotate each visual so the committed value faces up at rest
    const up = new THREE.Vector3(0, 1, 0);
    active.forEach((d, i) => {
      const rot = d.body.rotation();
      const { value: actual } = topFaceFromQuaternion(rot);
      const target = values[i];
      const nT = FACE_NORMALS[target];
      const nA = FACE_NORMALS[actual];
      // cube-symmetry rotation mapping the target face normal onto the actual
      // landing face normal — the collider is a cube so physics is unaffected
      const offset = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(nT.x, nT.y, nT.z),
        new THREE.Vector3(nA.x, nA.y, nA.z),
      );
      d.visual.group.quaternion.copy(offset);
      void up;
    });

    // rewind: restore the world and replay in real time
    const oldWorld = this.world;
    this.world = RAPIER.World.restoreSnapshot(snapshot);
    this.world.timestep = STEP;
    oldWorld.free();
    for (const d of this.dice) {
      if (!d.removing) d.body = this.world.getRigidBody(d.handle)!;
    }
    this.playback = { nudges, restStep, step: 0, values, nudgeToastShown: false };
    this.accumulator = 0;
  }

  private finishRoll(): void {
    const pb = this.playback!;
    this.playback = null;
    this.rolling = false;
    const active = this.dice.filter((d) => !d.removing);
    active.forEach((d, i) => {
      d.body.sleep();
      this.showLabel(d, pb.values[i]);
    });
    audio.settle();
    this.events.onSettled(pb.values);
  }

  /* ------------------------------- labels -------------------------------- */

  private labelTexCache = new Map<string, THREE.CanvasTexture>();

  private showLabel(d: RuntimeDie, value: number): void {
    const key = `${value}`;
    let tex = this.labelTexCache.get(key);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(64, 64, 52, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,10,16,0.82)';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,214,120,0.95)';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), 64, 68);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.labelTexCache.set(key, tex);
    }
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.62);
    const p = d.body.translation();
    sprite.position.set(p.x, p.y + 1.05, p.z);
    this.scene.add(sprite);
    d.label = sprite;
  }

  private clearLabel(d: RuntimeDie): void {
    if (d.label) {
      this.scene.remove(d.label);
      (d.label.material as THREE.SpriteMaterial).dispose();
      d.label = null;
    }
  }

  /* ------------------------------ main loop ------------------------------ */

  private startLoop(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - this.lastTime) / 1000);
      this.lastTime = t;
      this.update(dt, t / 1000);
      this.composer.render(dt);
      this.trackFps(dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private update(dt: number, time: number): void {
    // fixed-step physics with replayed nudges (deterministic match to presim)
    if (this.playback) {
      const pb = this.playback;
      this.accumulator += dt;
      let guard = 0;
      while (this.accumulator >= STEP && guard < 12) {
        this.world.step(this.eventQueue);
        pb.step++;
        guard++;
        this.accumulator -= STEP;
        for (const n of pb.nudges) {
          if (n.step === pb.step) {
            const d = this.dice.filter((x) => !x.removing)[n.idx];
            d.body.applyImpulse(n.imp, true);
            d.body.applyTorqueImpulse(n.torq, true);
            if (!pb.nudgeToastShown) {
              pb.nudgeToastShown = true;
              this.events.onToast('Cocked die — giving it a nudge');
            }
          }
        }
        this.drainSounds();
        if (pb.step >= pb.restStep + 30) {
          this.finishRoll();
          break;
        }
      }
    }

    // sync visuals to bodies, animate scale tweens & blob shadows
    for (let i = this.dice.length - 1; i >= 0; i--) {
      const d = this.dice[i];
      d.scale += (d.targetScale - d.scale) * Math.min(1, dt * 10);
      if (d.removing && d.scale < 0.04) {
        this.scene.remove(d.outer, d.shadow);
        this.clearLabel(d);
        d.visual.bodyMat.dispose();
        d.visual.pipMat.dispose();
        this.dice.splice(i, 1);
        continue;
      }
      d.outer.scale.setScalar(d.scale);
      if (!d.removing) {
        const p = d.body.translation();
        const q = d.body.rotation();
        d.outer.position.set(p.x, p.y, p.z);
        d.outer.quaternion.set(q.x, q.y, q.z, q.w);
        const hgt = Math.max(0, p.y - DIE_SIZE / 2);
        d.shadow.position.set(p.x, 0.015, p.z);
        d.shadow.scale.setScalar((1 + hgt * 0.35) * d.scale);
        (d.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - hgt * 0.18) * d.scale;
        if (d.label) {
          d.label.position.set(p.x, p.y + 1.05 + Math.sin(time * 2) * 0.04, p.z);
          const m = d.label.material as THREE.SpriteMaterial;
          m.opacity = Math.min(1, m.opacity + dt * 3);
        }
      }
    }

    // drifting dust motes
    if (this.dust && this.dustBase && (this.dust.visible = this.quality !== 'low')) {
      const attr = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = this.dustBase[i * 3] + Math.sin(time * 0.12 + i * 1.7) * 0.5;
        arr[i * 3 + 1] = this.dustBase[i * 3 + 1] + Math.sin(time * 0.2 + i * 2.3) * 0.35;
      }
      attr.needsUpdate = true;
    }

    // smooth camera dolly to frame all dice
    const target = this.controls.target;
    const dir = this.camera.position.clone().sub(target);
    const dist = dir.length();
    const nd = dist + (this.desiredDist - dist) * Math.min(1, dt * 2.2);
    this.camera.position.copy(target).addScaledVector(dir.normalize(), nd);
    this.controls.update();
  }

  /** Map collision pairs to material sounds; impulse drives volume. */
  private drainSounds(): void {
    this.eventQueue.drainContactForceEvents((ev) => {
      const h1 = ev.collider1();
      const h2 = ev.collider2();
      const force = ev.maxForceMagnitude();
      const strength = Math.min(1, force / 700);
      if (strength < 0.06) return;
      const die1 = this.dice.find((d) => d.colliderHandle === h1 && !d.removing);
      const die2 = this.dice.find((d) => d.colliderHandle === h2 && !d.removing);
      const die = die1 ?? die2;
      if (!die) return;
      const pan = THREE.MathUtils.clamp(die.body.translation().x / PLAY_W, -1, 1) * 0.7;
      if (die1 && die2) audio.impact('die', strength, pan);
      else if (this.floorHandles.has(h1) || this.floorHandles.has(h2)) audio.impact('felt', strength, pan);
      else audio.impact('wood', strength, pan);
    });
  }

  private trackFps(dt: number): void {
    if (dt <= 0) return;
    this.fpsSamples.push(1 / dt);
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1.5) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.lastFpsAvg = avg;
      this.events.onFps(Math.round(avg));
      this.fpsSamples = [];
      this.fpsTimer = 0;
      // adaptive quality: drop one level if we can't hold ~45 fps
      if (this.autoQuality && avg < 45) {
        const i = QUALITY_ORDER.indexOf(this.quality);
        if (i > 0) {
          this.applyQuality(QUALITY_ORDER[i - 1], false);
          this.events.onQualityChange(this.quality);
          this.events.onToast(`Performance: quality lowered to ${this.quality}`);
        }
      }
    }
  }

  /* ------------------------------ settings ------------------------------- */

  applyQuality(q: Quality, manual = true): void {
    this.quality = q;
    if (manual) this.autoQuality = false;
    const dpr = window.devicePixelRatio;
    const settings: Record<Quality, { pr: number; shadow: number; fx: boolean }> = {
      low: { pr: 1, shadow: 1024, fx: false },
      medium: { pr: Math.min(dpr, 1.5), shadow: 2048, fx: true },
      high: { pr: Math.min(dpr, 2), shadow: 2048, fx: true },
      ultra: { pr: Math.min(dpr, 2), shadow: 4096, fx: true },
    };
    const s = settings[q];
    this.renderer.setPixelRatio(s.pr);
    if (this.keyLight.shadow.mapSize.x !== s.shadow) {
      this.keyLight.shadow.mapSize.set(s.shadow, s.shadow);
      this.keyLight.shadow.map?.dispose();
      (this.keyLight.shadow as unknown as { map: unknown }).map = null;
    }
    this.fxPass.enabled = s.fx;
    this.onResize();
  }

  applyLightPreset(p: LightPreset): void {
    const presets: Record<LightPreset, { key: number; keyColor: string; env: number; fill: number; rim: number; bg: string }> = {
      casino: { key: 2.6, keyColor: '#ffe6c0', env: 0.45, fill: 0.45, rim: 60, bg: '#0a0d12' },
      studio: { key: 3.2, keyColor: '#ffffff', env: 0.95, fill: 0.9, rim: 25, bg: '#14181f' },
      dramatic: { key: 4.0, keyColor: '#ffd090', env: 0.12, fill: 0.12, rim: 140, bg: '#05060a' },
    };
    const s = presets[p];
    this.keyLight.intensity = s.key;
    this.keyLight.color.set(s.keyColor);
    this.scene.environmentIntensity = s.env;
    this.fillLight.intensity = s.fill;
    this.rimLight.intensity = s.rim;
    (this.scene.background as THREE.Color).set(s.bg);
    (this.scene.fog as THREE.FogExp2).color.set(s.bg);
  }

  private onResize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /* ----------------------------- stress test ----------------------------- */

  /**
   * Headless stress test: 12 dice rolled `rolls` times in a dedicated physics
   * world (no rendering). Reports escaped dice, cocked-die nudges, face
   * distribution and settle statistics.
   */
  async stressTest(rolls = 100, onProgress?: (done: number) => void): Promise<StressReport> {
    const t0 = performance.now();
    const world = new RAPIER.World(GRAVITY);
    world.timestep = STEP;
    // same bounds as the live table
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_X + 2, 0.5, WALL_Z + 2).setTranslation(0, -0.5, 0).setFriction(0.85).setRestitution(0.28),
    );
    const wall = (hx: number, hz: number, x: number, z: number) =>
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, WALL_H, hz).setTranslation(x, WALL_H, z).setFriction(0.25).setRestitution(0.5),
      );
    wall(WALL_X + 1, 0.5, 0, -(WALL_Z + 0.5));
    wall(WALL_X + 1, 0.5, 0, WALL_Z + 0.5);
    wall(0.5, WALL_Z + 1, -(WALL_X + 0.5), 0);
    wall(0.5, WALL_Z + 1, WALL_X + 0.5, 0);
    world.createCollider(RAPIER.ColliderDesc.cuboid(WALL_X + 2, 0.5, WALL_Z + 2).setTranslation(0, 9, 0));

    const N = 12;
    const half = DIE_SIZE / 2 - DIE_RADIUS;
    const bodies: RAPIER.RigidBody[] = [];
    for (let i = 0; i < N; i++) {
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setAngularDamping(0.12).setLinearDamping(0.06),
      );
      world.createCollider(
        RAPIER.ColliderDesc.roundCuboid(half, half, half, DIE_RADIUS).setFriction(0.62).setRestitution(0.38).setDensity(2.2),
        b,
      );
      bodies.push(b);
    }

    const report: StressReport = {
      rolls, diceCount: N, offTable: 0, cockedNudges: 0,
      faceDist: [0, 0, 0, 0, 0, 0], avgSettleSteps: 0, durationMs: 0,
      renderFps: Math.round(this.lastFpsAvg),
    };
    let totalSteps = 0;

    for (let r = 0; r < rolls; r++) {
      bodies.forEach((b, i) => {
        const lane = (i % 4) - 1.5;
        const row = Math.floor(i / 4);
        const q = new THREE.Quaternion().random();
        b.setTranslation({ x: lane * 1.5 + (Math.random() - 0.5) * 0.5, y: 1.6 + row + Math.random() * 0.4, z: PLAY_D - 0.7 - row * 0.4 }, true);
        b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        b.setLinvel({ x: (Math.random() - 0.5) * 6, y: 1 + Math.random() * 2, z: -(9 + Math.random() * 8) }, true);
        b.setAngvel({ x: (Math.random() - 0.5) * 32, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 32 }, true);
        b.wakeUp();
      });
      let step = 0;
      const MAX = 2400;
      while (step < MAX) {
        world.step();
        step++;
        if (step % 24 !== 0 || step < 60) continue;
        const calm = bodies.every((b) => {
          if (b.isSleeping()) return true;
          const lv = b.linvel();
          const av = b.angvel();
          return lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < 0.006 && av.x * av.x + av.y * av.y + av.z * av.z < 0.01;
        });
        if (!calm) continue;
        let anyCocked = false;
        for (const b of bodies) {
          const { dot } = topFaceFromQuaternion(b.rotation());
          if (dot < 0.985) {
            anyCocked = true;
            report.cockedNudges++;
            b.applyImpulse({ x: (Math.random() - 0.5) * 3, y: 3.5, z: (Math.random() - 0.5) * 3 }, true);
            b.applyTorqueImpulse({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }, true);
          }
        }
        if (!anyCocked) break;
      }
      totalSteps += step;
      for (const b of bodies) {
        const p = b.translation();
        if (Math.abs(p.x) > WALL_X + 1 || Math.abs(p.z) > WALL_Z + 1 || p.y < -0.5) report.offTable++;
        const { value } = topFaceFromQuaternion(b.rotation());
        report.faceDist[value - 1]++;
      }
      if (r % 10 === 9) {
        onProgress?.(r + 1);
        await new Promise((res) => setTimeout(res, 0)); // keep UI responsive
      }
    }
    world.free();
    report.avgSettleSteps = Math.round(totalSteps / rolls);
    report.durationMs = Math.round(performance.now() - t0);
    return report;
  }

  /* ------------------------------- cleanup -------------------------------- */

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.world.free();
  }
}
