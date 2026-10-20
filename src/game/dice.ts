/**
 * Dice visual factory.
 * - Rounded-corner casino D6 (RoundedBoxGeometry, smooth normals) at 1 scene
 *   unit per die (~17 mm real-world proportion).
 * - Pips are real cylinder geometry slightly proud of the surface with their
 *   own material (engraved/painted look); opposite faces sum to 7.
 * - Procedural micro-detail: a shared canvas roughness/bump map adds scratches
 *   and roughness variation; every die also gets a tiny random roughness and
 *   hue jitter so no two dice are perfectly identical (manufacturing noise).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DieColorDef } from './colors';
import { FACE_NORMALS } from './logic';

export const DIE_SIZE = 1.0;
export const DIE_RADIUS = 0.09;

/* -------------------- shared resources (created once) -------------------- */

let sharedBody: THREE.BufferGeometry | null = null;
let sharedPip: THREE.BufferGeometry | null = null;
let sharedDetail: THREE.CanvasTexture | null = null;

function getBodyGeometry(): THREE.BufferGeometry {
  if (!sharedBody) sharedBody = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 5, DIE_RADIUS);
  return sharedBody;
}

function getPipGeometry(): THREE.BufferGeometry {
  if (!sharedPip) {
    // shallow dome-capped cylinder reads as an inset painted pip
    sharedPip = new THREE.CylinderGeometry(0.082, 0.095, 0.035, 24, 1);
  }
  return sharedPip;
}

/** Procedural scratches / roughness variation texture (shared). */
function getDetailTexture(): THREE.CanvasTexture {
  if (sharedDetail) return sharedDetail;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  // roughness blotches
  for (let i = 0; i < 900; i++) {
    const g = 110 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${g},${g},${g},${0.06 + Math.random() * 0.08})`;
    const r = 2 + Math.random() * 10;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // fine scratches
  ctx.strokeStyle = 'rgba(200,200,200,0.10)';
  for (let i = 0; i < 60; i++) {
    ctx.lineWidth = 0.4 + Math.random();
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const a = Math.random() * Math.PI * 2;
    const l = 8 + Math.random() * 40;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  sharedDetail = new THREE.CanvasTexture(c);
  sharedDetail.wrapS = sharedDetail.wrapT = THREE.RepeatWrapping;
  return sharedDetail;
}

/* ------------------------------ pip layout ------------------------------ */

const A = 0.27; // pip offset from face center
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-A, -A], [A, A]],
  3: [[-A, -A], [0, 0], [A, A]],
  4: [[-A, -A], [-A, A], [A, -A], [A, A]],
  5: [[-A, -A], [-A, A], [0, 0], [A, -A], [A, A]],
  6: [[-A, -A], [-A, 0], [-A, A], [A, -A], [A, 0], [A, A]],
};

/* ------------------------------ materials ------------------------------- */

export function makeBodyMaterial(def: DieColorDef, env: THREE.Texture | null): THREE.MeshPhysicalMaterial {
  const detail = getDetailTexture();
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(def.baseColor),
    metalness: def.metalness,
    roughness: def.roughness,
    clearcoat: def.clearcoat,
    clearcoatRoughness: def.clearcoatRoughness,
    sheen: def.sheen,
    sheenColor: new THREE.Color(def.sheenColor),
    iridescence: def.iridescence,
    envMapIntensity: def.envMapIntensity,
    roughnessMap: detail,
    bumpMap: detail,
    bumpScale: 0.004,
  });
  if (def.transmission > 0) {
    mat.transmission = def.transmission;
    mat.ior = def.ior;
    mat.thickness = def.thickness;
    mat.attenuationColor = new THREE.Color(def.attenuationColor);
    mat.attenuationDistance = def.attenuationDistance;
  }
  if (env) mat.envMap = env;
  // manufacturing imperfection: tiny per-die variation
  mat.roughness = Math.max(0.02, mat.roughness + (Math.random() - 0.5) * 0.03);
  const hsl = { h: 0, s: 0, l: 0 };
  mat.color.getHSL(hsl);
  mat.color.setHSL(hsl.h + (Math.random() - 0.5) * 0.004, hsl.s, hsl.l + (Math.random() - 0.5) * 0.01);
  return mat;
}

export function makePipMaterial(def: DieColorDef, env: THREE.Texture | null): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.pipColor),
    metalness: def.pipMetalness,
    roughness: def.pipRoughness,
    envMapIntensity: def.envMapIntensity * 0.8,
  });
  if (env) mat.envMap = env;
  return mat;
}

/* ------------------------------ die visual ------------------------------ */

export interface DieVisual {
  /** inner group — receives the "steering" orientation offset */
  group: THREE.Group;
  body: THREE.Mesh;
  pips: THREE.Mesh[];
  bodyMat: THREE.MeshPhysicalMaterial;
  pipMat: THREE.MeshStandardMaterial;
}

/** Build one die: rounded body plus pip geometry on all six faces. */
export function createDieVisual(def: DieColorDef, env: THREE.Texture | null): DieVisual {
  const group = new THREE.Group();
  const bodyMat = makeBodyMaterial(def, env);
  const pipMat = makePipMaterial(def, env);

  const body = new THREE.Mesh(getBodyGeometry(), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const pips: THREE.Mesh[] = [];
  const pipGeo = getPipGeometry();
  const up = new THREE.Vector3(0, 1, 0);

  for (let value = 1; value <= 6; value++) {
    const n = FACE_NORMALS[value];
    const normal = new THREE.Vector3(n.x, n.y, n.z);
    // orthonormal basis on the face
    const u = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(u, normal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
    const q = new THREE.Quaternion().setFromUnitVectors(up, normal);

    for (const [px, py] of PIP_LAYOUTS[value]) {
      const pip = new THREE.Mesh(pipGeo, pipMat);
      pip.position
        .copy(normal)
        .multiplyScalar(DIE_SIZE / 2 - 0.012)
        .addScaledVector(tangent, px)
        .addScaledVector(bitangent, py);
      pip.quaternion.copy(q);
      pip.castShadow = false;
      pip.receiveShadow = true;
      pips.push(pip);
      group.add(pip);
    }
  }
  return { group, body, pips, bodyMat, pipMat };
}

/** Swap a die's materials to a new palette entry (instant, GPU-cheap). */
export function applyDieColor(die: DieVisual, def: DieColorDef, env: THREE.Texture | null): void {
  const oldBody = die.bodyMat;
  const oldPip = die.pipMat;
  die.bodyMat = makeBodyMaterial(def, env);
  die.pipMat = makePipMaterial(def, env);
  die.body.material = die.bodyMat;
  for (const p of die.pips) p.material = die.pipMat;
  oldBody.dispose();
  oldPip.dispose();
}
