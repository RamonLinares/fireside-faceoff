import * as THREE from 'three';
import { getMaterial } from '../MaterialLibrary';
import { createPosterTexture } from '../ProceduralTextures';
import { FLOOR_Y } from './heroTable';

/**
 * The bedroom-corner shell: plank floor, round rug, two dusk-blue walls with
 * baseboards, a glowing window with curtains, posters, a pennant, and a shelf.
 * Camera sits at +Z looking toward -Z, so the corner is behind the AI end.
 */

const BACK_Z = -2.0;
const LEFT_X = -2.3;
const WALL_H = 2.6;

export function createRoomShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'room-shell';

  // --- Floor ----------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4), getMaterial('floor'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0.9, FLOOR_Y, 0.9);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // --- Rug under the table ----------------------------------------------------
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.55, 40), getMaterial('rug'));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, FLOOR_Y + 0.004, 0.1);
  rug.receiveShadow = true;
  rug.name = 'rug';
  group.add(rug);

  // --- Walls ------------------------------------------------------------------
  const wallMaterial = getMaterial('wall');
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(7.0, WALL_H), wallMaterial);
  backWall.position.set(LEFT_X + 3.5, FLOOR_Y + WALL_H / 2, BACK_Z);
  backWall.receiveShadow = true;
  backWall.name = 'wall-back';
  group.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(6.4, WALL_H), wallMaterial);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(LEFT_X, FLOOR_Y + WALL_H / 2, BACK_Z + 3.2);
  leftWall.receiveShadow = true;
  leftWall.name = 'wall-left';
  group.add(leftWall);

  // Baseboards.
  const baseboardMaterial = getMaterial('paintCream');
  const backBase = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.09, 0.02), baseboardMaterial);
  backBase.position.set(LEFT_X + 3.5, FLOOR_Y + 0.045, BACK_Z + 0.011);
  group.add(backBase);
  const leftBase = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 6.4), baseboardMaterial);
  leftBase.position.set(LEFT_X + 0.011, FLOOR_Y + 0.045, BACK_Z + 3.2);
  group.add(leftBase);

  // --- Window with dusk glow and curtains --------------------------------------
  group.add(createWindow());

  // --- Posters and pennant ------------------------------------------------------
  group.add(
    createPoster(0, 0.46, 0.58, new THREE.Vector3(0.72, FLOOR_Y + 1.02, BACK_Z + 0.012), 0, 0.015),
    createPoster(1, 0.4, 0.5, new THREE.Vector3(1.38, FLOOR_Y + 1.18, BACK_Z + 0.012), 0, -0.03),
    createPoster(2, 0.42, 0.52, new THREE.Vector3(LEFT_X + 0.012, FLOOR_Y + 1.05, -0.75), Math.PI / 2, 0.02),
  );
  group.add(createPennant(new THREE.Vector3(2.05, FLOOR_Y + 1.3, BACK_Z + 0.012)));

  // --- Shelf with tiny keepsakes -------------------------------------------------
  group.add(createShelf(new THREE.Vector3(LEFT_X + 0.02, FLOOR_Y + 1.42, 0.35)));

  return group;
}

function createWindow(): THREE.Group {
  const window = new THREE.Group();
  window.name = 'window';
  const cx = -0.95;
  const cy = FLOOR_Y + 1.15;
  const w = 0.84;
  const h = 1.06;

  // Dusk sky plane slightly proud of the wall so it never z-fights.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), getMaterial('sky'));
  sky.position.set(cx, cy, BACK_Z + 0.008);
  sky.name = 'window-sky';
  window.add(sky);

  // Frame: four cream bars plus a cross muntin.
  const frameMaterial = getMaterial('paintCream');
  const bars: Array<[number, number, number, number]> = [
    // [width, height, offsetX, offsetY]
    [w, 0.07, 0, h / 2],
    [w, 0.07, 0, -h / 2],
    [0.07, h + 0.07, -w / 2, 0],
    [0.07, h + 0.07, w / 2, 0],
    [0.045, h, 0, 0],
    [w, 0.045, 0, 0.06],
  ];
  for (const [bw, bh, ox, oy] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.035), frameMaterial);
    bar.position.set(cx + ox, cy + oy, BACK_Z + 0.02);
    window.add(bar);
  }

  // Sill.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.035, 0.09), frameMaterial);
  sill.position.set(cx, cy - h / 2 - 0.05, BACK_Z + 0.045);
  sill.castShadow = false;
  window.add(sill);

  // Curtain rod + two soft panels.
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, w + 0.42, 8), getMaterial('woodDark'));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(cx, cy + h / 2 + 0.09, BACK_Z + 0.06);
  window.add(rod);

  const curtainGeometry = createCurtainGeometry(0.22, h + 0.22);
  for (const side of [-1, 1]) {
    const curtain = new THREE.Mesh(curtainGeometry, getMaterial('curtain'));
    curtain.position.set(cx + side * (w / 2 + 0.06), cy + 0.045, BACK_Z + 0.05);
    curtain.name = `curtain-${side}`;
    window.add(curtain);
  }
  return window;
}

/** Gently waving curtain panel (plane with sinusoidal z-folds). */
function createCurtainGeometry(width: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 12, 1);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    positions.setZ(i, Math.sin((x / width) * Math.PI * 4) * 0.022);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createPoster(
  variant: 0 | 1 | 2,
  width: number,
  height: number,
  position: THREE.Vector3,
  yaw: number,
  tilt: number,
): THREE.Mesh {
  const texture = createPosterTexture(variant);
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),
  );
  poster.position.copy(position);
  poster.rotation.set(0, yaw, tilt);
  poster.name = `poster-${variant}`;
  return poster;
}

function createPennant(position: THREE.Vector3): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-0.11, 0.09);
  shape.lineTo(0.11, 0.09);
  shape.lineTo(0, -0.22);
  shape.closePath();
  const pennant = new THREE.Mesh(new THREE.ShapeGeometry(shape), getMaterial('paintRoseDeep'));
  pennant.position.copy(position);
  pennant.rotation.z = 0.04;
  pennant.name = 'pennant';
  return pennant;
}

function createShelf(position: THREE.Vector3): THREE.Group {
  const shelf = new THREE.Group();
  shelf.name = 'shelf';

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.9), getMaterial('woodHoney'));
  board.scale.x = 5;
  board.position.copy(position);
  board.castShadow = true;
  shelf.add(board);

  for (const dz of [-0.32, 0.32]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.03), getMaterial('woodDark'));
    bracket.position.set(position.x + 0.05, position.y - 0.055, position.z + dz);
    shelf.add(bracket);
  }

  // Tiny keepsakes: a jar, a small stack, a mini plane of a photo frame.
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 12), getMaterial('ceramic'));
  jar.position.set(position.x + 0.05, position.y + 0.065, position.z - 0.28);
  shelf.add(jar);

  const miniStack = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.14), getMaterial('paintSage'));
  miniStack.position.set(position.x + 0.05, position.y + 0.055, position.z + 0.05);
  miniStack.rotation.y = 0.2;
  shelf.add(miniStack);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.1), getMaterial('paintHoney'));
  frame.position.set(position.x + 0.05, position.y + 0.08, position.z + 0.3);
  frame.rotation.y = -0.25;
  shelf.add(frame);

  return shelf;
}
