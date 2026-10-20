/**
 * Dice material palette.
 * Every entry is a *full* physically-based material description (not a flat color):
 * metals, translucent gemstones (transmission / IOR / attenuation), acrylics, bone, glass.
 * These map 1:1 onto THREE.MeshPhysicalMaterial parameters.
 */
export interface DieColorDef {
  id: string;
  name: string;
  /** base albedo */
  baseColor: string;
  metalness: number;
  roughness: number;
  /** 0 = opaque, 1 = fully transmissive gem/glass */
  transmission: number;
  ior: number;
  thickness: number;
  attenuationColor: string;
  attenuationDistance: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenColor: string;
  iridescence: number;
  pipColor: string;
  pipMetalness: number;
  pipRoughness: number;
  envMapIntensity: number;
  /** css color used for UI swatches */
  swatch: string;
}

const base = {
  transmission: 0,
  ior: 1.5,
  thickness: 0,
  attenuationColor: '#ffffff',
  attenuationDistance: 10,
  clearcoat: 0,
  clearcoatRoughness: 0.1,
  sheen: 0,
  sheenColor: '#ffffff',
  iridescence: 0,
  pipMetalness: 0,
  pipRoughness: 0.35,
  envMapIntensity: 1.0,
};

export const PALETTE: DieColorDef[] = [
  {
    ...base, id: 'gold', name: 'Royal Gold', baseColor: '#d4af37', swatch: '#e7c349',
    metalness: 1.0, roughness: 0.21, clearcoat: 0.3, clearcoatRoughness: 0.2,
    pipColor: '#3d2b05', pipMetalness: 0.9, pipRoughness: 0.6, envMapIntensity: 1.35,
  },
  {
    ...base, id: 'silver', name: 'Chrome Silver', baseColor: '#e8eaee', swatch: '#cfd4dc',
    metalness: 1.0, roughness: 0.1, clearcoat: 0.15,
    pipColor: '#14161a', pipMetalness: 0.85, pipRoughness: 0.5, envMapIntensity: 1.4,
  },
  {
    ...base, id: 'bronze', name: 'Antique Bronze', baseColor: '#b0703c', swatch: '#b0703c',
    metalness: 1.0, roughness: 0.32, clearcoat: 0.1,
    pipColor: '#241104', pipMetalness: 0.8, pipRoughness: 0.7, envMapIntensity: 1.2,
  },
  {
    ...base, id: 'sapphire', name: 'Sapphire Blue', baseColor: '#3a6cff', swatch: '#2f5fe8',
    metalness: 0, roughness: 0.06, transmission: 0.92, ior: 1.77, thickness: 1.1,
    attenuationColor: '#0a2fa0', attenuationDistance: 1.4, clearcoat: 1.0, clearcoatRoughness: 0.05,
    iridescence: 0.15, pipColor: '#ffffff', pipMetalness: 0.6, pipRoughness: 0.25, envMapIntensity: 1.2,
  },
  {
    ...base, id: 'ruby', name: 'Ruby Red', baseColor: '#ff2d4e', swatch: '#d61f3e',
    metalness: 0, roughness: 0.07, transmission: 0.9, ior: 1.76, thickness: 1.1,
    attenuationColor: '#8f0318', attenuationDistance: 1.2, clearcoat: 1.0, clearcoatRoughness: 0.05,
    pipColor: '#ffe9ec', pipMetalness: 0.5, pipRoughness: 0.25, envMapIntensity: 1.2,
  },
  {
    ...base, id: 'emerald', name: 'Emerald Night', baseColor: '#18c964', swatch: '#11a854',
    metalness: 0, roughness: 0.08, transmission: 0.88, ior: 1.57, thickness: 1.0,
    attenuationColor: '#02571f', attenuationDistance: 1.3, clearcoat: 1.0, clearcoatRoughness: 0.06,
    pipColor: '#eafff2', pipMetalness: 0.5, pipRoughness: 0.3, envMapIntensity: 1.15,
  },
  {
    ...base, id: 'amethyst', name: 'Amethyst', baseColor: '#9b5cf6', swatch: '#8b4de4',
    metalness: 0, roughness: 0.08, transmission: 0.9, ior: 1.54, thickness: 1.0,
    attenuationColor: '#3c0e7e', attenuationDistance: 1.4, clearcoat: 1.0, clearcoatRoughness: 0.05,
    iridescence: 0.25, pipColor: '#f6edff', pipMetalness: 0.5, pipRoughness: 0.3, envMapIntensity: 1.2,
  },
  {
    ...base, id: 'crystal', name: 'Crystal Clear', baseColor: '#ffffff', swatch: '#dfe9f0',
    metalness: 0, roughness: 0.03, transmission: 1.0, ior: 1.5, thickness: 1.0,
    attenuationColor: '#dfefff', attenuationDistance: 4.0, clearcoat: 1.0, clearcoatRoughness: 0.03,
    pipColor: '#1c2733', pipMetalness: 0.2, pipRoughness: 0.3, envMapIntensity: 1.3,
  },
  {
    ...base, id: 'obsidian', name: 'Obsidian Black', baseColor: '#0b0b0f', swatch: '#15151c',
    metalness: 0.25, roughness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.04,
    pipColor: '#f4d87c', pipMetalness: 0.9, pipRoughness: 0.35, envMapIntensity: 1.25,
  },
  {
    ...base, id: 'ivory', name: 'Ivory Bone', baseColor: '#f3ead2', swatch: '#efe6cc',
    metalness: 0, roughness: 0.42, sheen: 0.5, sheenColor: '#fff6df', clearcoat: 0.12,
    pipColor: '#141414', pipRoughness: 0.5, envMapIntensity: 0.85,
  },
  {
    ...base, id: 'casinoRed', name: 'Casino Red', baseColor: '#c8102e', swatch: '#c8102e',
    metalness: 0, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.12,
    pipColor: '#ffffff', pipRoughness: 0.35, envMapIntensity: 1.0,
  },
  {
    ...base, id: 'casinoBlue', name: 'Casino Blue', baseColor: '#0a4fc2', swatch: '#0a4fc2',
    metalness: 0, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.12,
    pipColor: '#ffffff', pipRoughness: 0.35, envMapIntensity: 1.0,
  },
  {
    ...base, id: 'casinoGreen', name: 'Casino Green', baseColor: '#0e7a3a', swatch: '#0e7a3a',
    metalness: 0, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.12,
    pipColor: '#ffffff', pipRoughness: 0.35, envMapIntensity: 1.0,
  },
  {
    ...base, id: 'rose', name: 'Rose Pink', baseColor: '#ff7eb3', swatch: '#ff7eb3',
    metalness: 0, roughness: 0.15, transmission: 0.55, ior: 1.45, thickness: 0.8,
    attenuationColor: '#c42a68', attenuationDistance: 2.2, clearcoat: 0.8, clearcoatRoughness: 0.08,
    pipColor: '#5e1030', pipRoughness: 0.35, envMapIntensity: 1.1,
  },
  {
    ...base, id: 'amber', name: 'Orange Amber', baseColor: '#ff9d1c', swatch: '#f59311',
    metalness: 0, roughness: 0.1, transmission: 0.75, ior: 1.55, thickness: 1.0,
    attenuationColor: '#9a4c00', attenuationDistance: 1.6, clearcoat: 0.9, clearcoatRoughness: 0.07,
    pipColor: '#331a00', pipRoughness: 0.4, envMapIntensity: 1.15,
  },
  {
    ...base, id: 'cyan', name: 'Cyan Aqua', baseColor: '#1fd4e0', swatch: '#1fd4e0',
    metalness: 0, roughness: 0.08, transmission: 0.85, ior: 1.49, thickness: 1.0,
    attenuationColor: '#026d78', attenuationDistance: 1.8, clearcoat: 1.0, clearcoatRoughness: 0.05,
    pipColor: '#04343a', pipRoughness: 0.3, envMapIntensity: 1.2,
  },
  {
    ...base, id: 'jade', name: 'Imperial Jade', baseColor: '#53b98a', swatch: '#4bb083',
    metalness: 0, roughness: 0.22, transmission: 0.35, ior: 1.66, thickness: 1.2,
    attenuationColor: '#0c4a2f', attenuationDistance: 2.4, clearcoat: 0.7, clearcoatRoughness: 0.12,
    sheen: 0.3, sheenColor: '#bfffe0', pipColor: '#f7f2e4', pipRoughness: 0.4, envMapIntensity: 0.95,
  },
];

export const PALETTE_IDS = PALETTE.map((p) => p.id);
export const colorById = (id: string): DieColorDef =>
  PALETTE.find((p) => p.id === id) ?? PALETTE[0];

/** Curated multi-die presets. Function of dice count -> color ids. */
export const PRESETS: { id: string; name: string; colors: (n: number) => string[] }[] = [
  { id: 'casino', name: 'Casino Red', colors: (n) => Array(n).fill('casinoRed') },
  { id: 'royal', name: 'Royal Gold', colors: (n) => Array(n).fill('gold') },
  { id: 'ocean', name: 'Ocean Blue', colors: (n) => Array(n).fill('sapphire') },
  { id: 'emeraldNight', name: 'Emerald Night', colors: (n) => Array(n).fill('emerald') },
  {
    id: 'blackGold', name: 'Black & Gold',
    colors: (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 'obsidian' : 'gold')),
  },
  { id: 'crystal', name: 'Crystal Clear', colors: (n) => Array(n).fill('crystal') },
];

const RAINBOW_ORDER = ['ruby', 'amber', 'gold', 'emerald', 'cyan', 'sapphire', 'amethyst', 'rose'];
export const rainbowColors = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => RAINBOW_ORDER[i % RAINBOW_ORDER.length]);

export const randomColors = (n: number): string[] =>
  Array.from({ length: n }, () => PALETTE[Math.floor(Math.random() * PALETTE.length)].id);
