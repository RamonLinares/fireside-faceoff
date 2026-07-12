import * as THREE from 'three';
import {
  createFloorTexture,
  createGlowTexture,
  createPlayfieldTexture,
  createPuckDecalTexture,
  createRugTexture,
  createSkyTexture,
  createWallTexture,
  createWoodTexture,
  PALETTE,
} from './ProceduralTextures';

/**
 * Shared materials/textures for the diorama. Everything is created lazily on
 * first access and reused everywhere (props, table, VFX) to keep program and
 * texture counts low. Call `disposeMaterialLibrary()` on teardown.
 */

interface Library {
  textures: {
    woodWarm: THREE.CanvasTexture;
    woodDark: THREE.CanvasTexture;
    floor: THREE.CanvasTexture;
    playfield: THREE.CanvasTexture;
    rug: THREE.CanvasTexture;
    wall: THREE.CanvasTexture;
    sky: THREE.CanvasTexture;
    puckDecal: THREE.CanvasTexture;
    glow: THREE.CanvasTexture;
  };
  materials: Record<string, THREE.Material>;
}

let library: Library | null = null;

function build(): Library {
  const woodWarm = createWoodTexture('#b98d5f', '#8a6238', 7);
  const woodDark = createWoodTexture('#6b5138', '#463322', 13);
  const floor = createFloorTexture();
  floor.repeat.set(3, 3);
  const playfield = createPlayfieldTexture();
  playfield.anisotropy = 4;
  const rug = createRugTexture();
  const wall = createWallTexture();
  wall.repeat.set(3, 2);
  const sky = createSkyTexture();
  const puckDecal = createPuckDecalTexture();
  const glow = createGlowTexture();

  const materials: Record<string, THREE.Material> = {
    // Woods.
    woodWarm: new THREE.MeshStandardMaterial({ map: woodWarm, roughness: 0.62, metalness: 0.02 }),
    woodHoney: new THREE.MeshStandardMaterial({
      map: woodWarm,
      color: '#e8c08a',
      roughness: 0.55,
      metalness: 0.02,
    }),
    woodDark: new THREE.MeshStandardMaterial({ map: woodDark, roughness: 0.58, metalness: 0.03 }),
    floor: new THREE.MeshStandardMaterial({ map: floor, roughness: 0.7, metalness: 0.02 }),
    playfield: new THREE.MeshStandardMaterial({ map: playfield, roughness: 0.48, metalness: 0.0 }),
    rug: new THREE.MeshStandardMaterial({ map: rug, roughness: 0.92, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ map: wall, roughness: 0.94, metalness: 0 }),
    sky: new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }),

    // Painted accents.
    paintCream: new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.6 }),
    paintRose: new THREE.MeshStandardMaterial({ color: PALETTE.dustyRose, roughness: 0.55 }),
    paintRoseDeep: new THREE.MeshStandardMaterial({ color: PALETTE.dustyRoseDeep, roughness: 0.55 }),
    paintTeal: new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.55 }),
    paintTealDeep: new THREE.MeshStandardMaterial({ color: PALETTE.tealDeep, roughness: 0.55 }),
    paintSage: new THREE.MeshStandardMaterial({ color: PALETTE.sage, roughness: 0.62 }),
    paintHoney: new THREE.MeshStandardMaterial({ color: PALETTE.honey, roughness: 0.5 }),
    walnut: new THREE.MeshStandardMaterial({ color: PALETTE.walnut, roughness: 0.5, metalness: 0.04 }),

    // Fabric / soft.
    feltDark: new THREE.MeshStandardMaterial({ color: '#3c3630', roughness: 1 }),
    plush: new THREE.MeshStandardMaterial({ color: '#b98a5e', roughness: 1 }),
    plushLight: new THREE.MeshStandardMaterial({ color: '#e5cba4', roughness: 1 }),
    curtain: new THREE.MeshStandardMaterial({
      color: '#d8b9a5',
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    leaf: new THREE.MeshStandardMaterial({
      color: PALETTE.sageDeep,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),

    // Metal / shiny.
    brass: new THREE.MeshStandardMaterial({ color: '#c9a35a', roughness: 0.32, metalness: 0.85 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#e8ded0', roughness: 0.25, metalness: 0 }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#b06f4e', roughness: 0.75 }),

    // Emissives.
    lampShade: new THREE.MeshStandardMaterial({
      color: '#f5d9a8',
      emissive: '#ffb85c',
      emissiveIntensity: 1.6,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
    lampGlow: new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }),
    windowGlow: new THREE.MeshStandardMaterial({
      color: '#f7d9b0',
      emissive: '#c9b090',
      emissiveIntensity: 0.35,
      roughness: 0.9,
    }),
  };

  return {
    textures: { woodWarm, woodDark, floor, playfield, rug, wall, sky, puckDecal, glow },
    materials,
  };
}

export function getLibrary(): Library {
  if (!library) library = build();
  return library;
}

export function getMaterial(name: string): THREE.Material {
  const lib = getLibrary();
  const material = lib.materials[name];
  if (!material) throw new Error(`Unknown material: ${name}`);
  return material;
}

export function getTexture<K extends keyof Library['textures']>(name: K): THREE.CanvasTexture {
  return getLibrary().textures[name];
}

export function disposeMaterialLibrary(): void {
  if (!library) return;
  for (const material of Object.values(library.materials)) material.dispose();
  for (const texture of Object.values(library.textures)) texture.dispose();
  library = null;
}
