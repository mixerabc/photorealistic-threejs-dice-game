/**
 * Premium craps-style table, fully procedural (no downloaded assets needed).
 * - Green felt with canvas-generated fibre noise (albedo + bump) and a subtle
 *   printed border line, matte with a hint of sheen like real baize.
 * - Walnut wood outer rail (procedural grain) + dark leather padded bumper.
 * The physics bounds in engine.ts match PLAY_W/PLAY_D exactly.
 */
import * as THREE from 'three';

export const PLAY_W = 7.6; // half-extent X of the felt play area
export const PLAY_D = 4.7; // half-extent Z
export const WALL_H = 2.2; // invisible wall height

function feltTexture(colorA: string, colorB: string): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const b = document.createElement('canvas');
  b.width = b.height = size;
  const bctx = b.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // fibre speckle
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const l = Math.random();
    ctx.fillStyle = `rgba(${l > 0.5 ? 255 : 0},${l > 0.5 ? 255 : 0},${l > 0.5 ? 255 : 0},0.035)`;
    ctx.fillRect(x, y, 1, 1);
    const g = 100 + Math.floor(Math.random() * 56);
    bctx.fillStyle = `rgba(${g},${g},${g},0.5)`;
    bctx.fillRect(x, y, 1, 1);
  }
  // short directional fibres
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(b);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(4, 4);
  return { map, bump };
}

function woodTexture(): THREE.CanvasTexture {
  const w = 512, h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4a2c17';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const wave = Math.sin(t * 24 + Math.sin(t * 7) * 3) * 0.5 + 0.5;
    const l = 26 + wave * 16 + Math.random() * 6;
    ctx.fillStyle = `hsl(${22 + wave * 6}, ${46 + wave * 8}%, ${l}%)`;
    ctx.fillRect(0, y, w, 1);
  }
  // knots / grain streaks
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? '#2c1808' : '#7a4b24';
    ctx.lineWidth = 0.5 + Math.random() * 1.2;
    ctx.beginPath();
    const y = Math.random() * h;
    ctx.moveTo(0, y);
    for (let x = 0; x < w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface TableTheme {
  feltA: string;
  feltB: string;
  line: string;
}

export const TABLE_THEMES: Record<string, TableTheme> = {
  casino: { feltA: '#1d6b40', feltB: '#0d4226', line: 'rgba(255,255,255,0.14)' },
  midnight: { feltA: '#20315c', feltB: '#101a36', line: 'rgba(255,255,255,0.12)' },
  bordeaux: { feltA: '#6e1f2e', feltB: '#3c0e18', line: 'rgba(255,230,180,0.14)' },
};

export function createTable(scene: THREE.Scene, themeId: keyof typeof TABLE_THEMES = 'casino'): THREE.Group {
  const theme = TABLE_THEMES[themeId] ?? TABLE_THEMES.casino;
  const group = new THREE.Group();

  // ---- felt ----
  const { map, bump } = feltTexture(theme.feltA, theme.feltB);
  // printed border line baked into the felt map
  {
    const img = map.image as HTMLCanvasElement;
    const ctx = img.getContext('2d')!;
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, img.width - 76, img.height - 76);
    ctx.strokeStyle = theme.line.replace('0.14', '0.07').replace('0.12', '0.06');
    ctx.lineWidth = 1.5;
    ctx.strokeRect(58, 58, img.width - 116, img.height - 116);
    map.needsUpdate = true;
  }
  const feltMat = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.012,
    roughness: 0.96,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color(theme.feltA),
  });
  const felt = new THREE.Mesh(new THREE.PlaneGeometry((PLAY_W + 0.8) * 2, (PLAY_D + 0.8) * 2), feltMat);
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  group.add(felt);

  // ---- wooden rail + leather bumper ----
  const wood = woodTexture();
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: wood,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
  });
  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: '#1d1410',
    roughness: 0.55,
    metalness: 0,
    sheen: 0.4,
    sheenColor: new THREE.Color('#3a2a1c'),
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
  });

  const railT = 0.85; // rail thickness
  const railH = 0.62; // rail height
  const ix = PLAY_W + 0.8; // inner edge of rail
  const iz = PLAY_D + 0.8;

  const mkBox = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // wood rail ring
  mkBox((ix + railT) * 2, railH, railT, woodMat, 0, railH / 2 - 0.05, -(iz + railT / 2));
  mkBox((ix + railT) * 2, railH, railT, woodMat, 0, railH / 2 - 0.05, iz + railT / 2);
  mkBox(railT, railH, iz * 2, woodMat, -(ix + railT / 2), railH / 2 - 0.05, 0);
  mkBox(railT, railH, iz * 2, woodMat, ix + railT / 2, railH / 2 - 0.05, 0);

  // leather padded bumper (inside face of the rail, what dice bounce off)
  const padT = 0.22;
  const padH = 0.5;
  mkBox(ix * 2, padH, padT, leatherMat, 0, padH / 2, -(iz - padT / 2));
  mkBox(ix * 2, padH, padT, leatherMat, 0, padH / 2, iz - padT / 2);
  mkBox(padT, padH, iz * 2 - padT * 2, leatherMat, -(ix - padT / 2), padH / 2, 0);
  mkBox(padT, padH, iz * 2 - padT * 2, leatherMat, ix - padT / 2, padH / 2, 0);

  // dark floor far below so reflections/transmission have something to hit
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 32),
    new THREE.MeshStandardMaterial({ color: '#07090c', roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.5;
  group.add(floor);

  scene.add(group);
  return group;
}
