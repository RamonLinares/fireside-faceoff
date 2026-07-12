import * as THREE from 'three';
import { getMaterial } from '../MaterialLibrary';
import { createBlockLetterTexture, PALETTE } from '../ProceduralTextures';
import { FLOOR_Y } from './heroTable';

/**
 * Reusable diorama props arranged around the table: lamp on a stool, book
 * stack, potted plant, teddy bear, toy blocks, mug of pencils, trophy crate,
 * and a little radio. Positions keep the playfield unobstructed from the
 * gameplay camera (+Z looking toward -Z).
 */

export interface PropsResult {
  group: THREE.Group;
  /** Blob-shadow footprints (x, z, radius) for cheap contact grounding. */
  blobs: Array<{ x: number; z: number; r: number }>;
  /** World-space point where the lamp bulb sits (lighting rig anchors here). */
  lampAnchor: THREE.Vector3;
}

export function createProps(): PropsResult {
  const group = new THREE.Group();
  group.name = 'props';
  const blobs: PropsResult['blobs'] = [];

  // --- Stool with the table lamp (hero prop, casts real shadow) -------------
  const stoolPosition = new THREE.Vector3(1.42, FLOOR_Y, -1.12);
  const stool = createStool();
  stool.position.copy(stoolPosition);
  group.add(stool);
  const lamp = createLamp();
  lamp.position.set(stoolPosition.x, FLOOR_Y + 0.36, stoolPosition.z);
  group.add(lamp);
  blobs.push({ x: stoolPosition.x, z: stoolPosition.z, r: 0.3 });
  const lampAnchor = new THREE.Vector3(stoolPosition.x, FLOOR_Y + 0.85, stoolPosition.z);

  // --- Book stack ------------------------------------------------------------
  const books = createBookStack();
  books.position.set(-1.42, FLOOR_Y, -1.05);
  books.rotation.y = 0.5;
  group.add(books);
  blobs.push({ x: -1.42, z: -1.05, r: 0.26 });

  // --- Potted plant (leaf cards) ----------------------------------------------
  const plant = createPlant();
  plant.position.set(2.0, FLOOR_Y, -1.62);
  group.add(plant);
  blobs.push({ x: 2.0, z: -1.62, r: 0.24 });

  // --- Teddy bear, sitting against the left rug edge ---------------------------
  const bear = createTeddyBear();
  bear.position.set(-1.55, FLOOR_Y, 0.12);
  bear.rotation.y = 0.9;
  group.add(bear);
  blobs.push({ x: -1.55, z: 0.12, r: 0.24 });

  // --- Toy blocks spelling PLAY -------------------------------------------------
  const blocks = createToyBlocks();
  blocks.position.set(-1.18, FLOOR_Y, 0.86);
  group.add(blocks);
  blobs.push({ x: -1.18, z: 0.86, r: 0.3 });

  // --- Crate with mug of pencils + trophy ----------------------------------------
  const crate = createCrateStillLife();
  crate.position.set(1.32, FLOOR_Y, 0.28);
  crate.rotation.y = -0.22;
  group.add(crate);
  blobs.push({ x: 1.32, z: 0.28, r: 0.3 });

  // --- Radio ----------------------------------------------------------------------
  const radio = createRadio();
  radio.position.set(-1.9, FLOOR_Y, -1.55);
  radio.rotation.y = 0.7;
  group.add(radio);
  blobs.push({ x: -1.9, z: -1.55, r: 0.28 });

  return { group, blobs, lampAnchor };
}

function createStool(): THREE.Group {
  const stool = new THREE.Group();
  stool.name = 'stool';
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 18), getMaterial('woodHoney'));
  seat.position.y = 0.34;
  seat.castShadow = true;
  stool.add(seat);
  const legGeometry = new THREE.CylinderGeometry(0.016, 0.02, 0.34, 8);
  const legs = new THREE.InstancedMesh(legGeometry, getMaterial('woodDark'), 4);
  const matrix = new THREE.Matrix4();
  const tilt = new THREE.Euler();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    tilt.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
    matrix.makeRotationFromEuler(tilt);
    matrix.setPosition(Math.cos(a) * 0.12, 0.17, Math.sin(a) * 0.12);
    legs.setMatrixAt(i, matrix);
  }
  legs.castShadow = true;
  stool.add(legs);
  return stool;
}

function createLamp(): THREE.Group {
  const lamp = new THREE.Group();
  lamp.name = 'table-lamp';

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.035, 16), getMaterial('brass'));
  base.position.y = 0.018;
  base.castShadow = true;
  lamp.add(base);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.3, 10), getMaterial('brass'));
  stem.position.y = 0.18;
  lamp.add(stem);

  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.15, 0.17, 18, 1, true),
    getMaterial('lampShade'),
  );
  shade.position.y = 0.42;
  lamp.add(shade);

  // Warm bulb glow visible under the shade.
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), getMaterial('lampGlow'));
  bulb.position.y = 0.38;
  lamp.add(bulb);
  return lamp;
}

function createBookStack(): THREE.Group {
  const books = new THREE.Group();
  books.name = 'book-stack';
  const specs: Array<[number, number, number, string, number]> = [
    // [width, height, depth, material, yaw]
    [0.34, 0.05, 0.25, 'paintTealDeep', 0],
    [0.3, 0.045, 0.22, 'paintRose', 0.25],
    [0.32, 0.05, 0.24, 'paintSage', -0.15],
    [0.26, 0.04, 0.2, 'paintHoney', 0.4],
  ];
  let y = 0;
  for (const [w, h, d, materialName, yaw] of specs) {
    const cover = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMaterial(materialName));
    cover.position.y = y + h / 2;
    cover.rotation.y = yaw;
    books.add(cover);
    // Page block peeking out.
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, h * 0.7, d * 0.96), getMaterial('paintCream'));
    pages.position.set(Math.cos(yaw) * 0.012, y + h / 2, -Math.sin(yaw) * 0.012);
    pages.rotation.y = yaw;
    books.add(pages);
    y += h;
  }
  return books;
}

function createPlant(): THREE.Group {
  const plant = new THREE.Group();
  plant.name = 'potted-plant';

  const potProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.09, 0),
    new THREE.Vector2(0.11, 0.05),
    new THREE.Vector2(0.12, 0.16),
    new THREE.Vector2(0.135, 0.18),
    new THREE.Vector2(0.13, 0.2),
  ];
  const pot = new THREE.Mesh(new THREE.LatheGeometry(potProfile, 16), getMaterial('terracotta'));
  plant.add(pot);

  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.115, 14), getMaterial('feltDark'));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.185;
  plant.add(soil);

  // Leaf cards fanned around the stem.
  const leafGeometry = createLeafGeometry();
  const leaves = new THREE.InstancedMesh(leafGeometry, getMaterial('leaf'), 11);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2 + (i % 3) * 0.35;
    const lean = 0.55 + (i % 4) * 0.18;
    rotation.set(-lean, a, 0, 'YXZ');
    quaternion.setFromEuler(rotation);
    const s = 0.75 + (i % 3) * 0.22;
    scale.setScalar(s);
    position.set(Math.cos(a) * 0.03, 0.2, Math.sin(a) * 0.03);
    matrix.compose(position, quaternion, scale);
    leaves.setMatrixAt(i, matrix);
  }
  leaves.name = 'leaves';
  plant.add(leaves);
  return plant;
}

function createLeafGeometry(): THREE.PlaneGeometry {
  // Long oval leaf, pivot at the base, gently curved.
  const geometry = new THREE.PlaneGeometry(0.11, 0.34, 1, 4);
  geometry.translate(0, 0.17, 0);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i);
    const pinch = 1 - Math.abs(y / 0.34 - 0.5) * 1.6;
    positions.setX(i, positions.getX(i) * Math.max(0.12, pinch));
    positions.setZ(i, Math.sin((y / 0.34) * Math.PI) * 0.03);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createTeddyBear(): THREE.Group {
  const bear = new THREE.Group();
  bear.name = 'teddy-bear';
  const plush = getMaterial('plush');
  const light = getMaterial('plushLight');

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), plush);
  body.position.y = 0.13;
  body.scale.set(1, 1.12, 0.9);
  bear.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), light);
  belly.position.set(0, 0.14, 0.075);
  belly.scale.set(1, 1.15, 0.55);
  bear.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), plush);
  head.position.y = 0.32;
  bear.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), light);
  muzzle.position.set(0, 0.3, 0.075);
  muzzle.scale.set(1.15, 0.8, 0.8);
  bear.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), getMaterial('feltDark'));
  nose.position.set(0, 0.315, 0.115);
  bear.add(nose);

  const earGeometry = new THREE.SphereGeometry(0.035, 8, 6);
  const limbGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeometry, plush);
    ear.position.set(side * 0.07, 0.41, 0);
    bear.add(ear);
    const arm = new THREE.Mesh(limbGeometry, plush);
    arm.position.set(side * 0.13, 0.18, 0.02);
    arm.scale.set(0.8, 1.3, 0.8);
    arm.rotation.z = side * 0.5;
    bear.add(arm);
    const leg = new THREE.Mesh(limbGeometry, plush);
    leg.position.set(side * 0.085, 0.045, 0.09);
    leg.scale.set(0.9, 0.75, 1.4);
    bear.add(leg);
  }
  return bear;
}

function createToyBlocks(): THREE.Group {
  const blocks = new THREE.Group();
  blocks.name = 'toy-blocks';
  const letters: Array<[string, string, string]> = [
    ['P', PALETTE.dustyRose, PALETTE.cream],
    ['L', PALETTE.cream, PALETTE.tealDeep],
    ['A', PALETTE.sage, PALETTE.cream],
    ['Y', PALETTE.honey, PALETTE.walnut],
  ];
  const size = 0.115;
  const geometry = new THREE.BoxGeometry(size, size, size);
  letters.forEach(([letter, bg, fg], i) => {
    const material = new THREE.MeshStandardMaterial({
      map: createBlockLetterTexture(letter, bg, fg),
      roughness: 0.6,
    });
    const block = new THREE.Mesh(geometry, material);
    block.position.set(i * (size + 0.035) - 0.2, size / 2, (i % 2) * 0.05);
    block.rotation.y = (i - 1.5) * 0.22;
    blocks.add(block);
  });
  // One tipped-over extra block for casual charm.
  const extra = new THREE.Mesh(geometry, getMaterial('paintTeal'));
  extra.position.set(0.34, size / 2 - 0.012, 0.22);
  extra.rotation.set(0.12, 0.8, 0.06);
  blocks.add(extra);
  return blocks;
}

function createCrateStillLife(): THREE.Group {
  const crate = new THREE.Group();
  crate.name = 'crate-still-life';

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.32), getMaterial('woodWarm'));
  box.position.y = 0.13;
  crate.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.025, 0.35), getMaterial('woodHoney'));
  lid.position.y = 0.272;
  crate.add(lid);

  // Mug with pencils.
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 14), getMaterial('paintTeal'));
  mug.position.set(-0.1, 0.33, 0.04);
  crate.add(mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12), getMaterial('paintTeal'));
  handle.position.set(-0.055, 0.33, 0.04);
  handle.rotation.y = Math.PI / 2;
  crate.add(handle);
  const pencilGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6);
  const pencils = new THREE.InstancedMesh(pencilGeometry, getMaterial('paintHoney'), 5);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Euler();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    rotation.set(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24);
    matrix.makeRotationFromEuler(rotation);
    matrix.setPosition(-0.1 + Math.cos(a) * 0.018, 0.415, 0.04 + Math.sin(a) * 0.018);
    pencils.setMatrixAt(i, matrix);
  }
  crate.add(pencils);

  // Little tournament trophy.
  const trophy = createTrophy();
  trophy.position.set(0.09, 0.285, -0.02);
  crate.add(trophy);
  return crate;
}

function createTrophy(): THREE.Group {
  const trophy = new THREE.Group();
  trophy.name = 'trophy';
  const brass = getMaterial('brass');

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.09), getMaterial('woodDark'));
  plinth.position.y = 0.015;
  trophy.add(plinth);

  const cupProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.016, 0.03),
    new THREE.Vector2(0.012, 0.05),
    new THREE.Vector2(0.03, 0.07),
    new THREE.Vector2(0.048, 0.1),
    new THREE.Vector2(0.05, 0.13),
  ];
  const cup = new THREE.Mesh(new THREE.LatheGeometry(cupProfile, 14), brass);
  trophy.add(cup);

  const handleGeometry = new THREE.TorusGeometry(0.02, 0.005, 6, 10, Math.PI * 1.4);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(handleGeometry, brass);
    handle.position.set(side * 0.052, 0.1, 0);
    handle.rotation.z = side * -0.5;
    trophy.add(handle);
  }
  const star = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), brass);
  star.position.y = 0.14;
  trophy.add(star);
  return trophy;
}

function createRadio(): THREE.Group {
  const radio = new THREE.Group();
  radio.name = 'radio';

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.14), getMaterial('paintSage'));
  body.position.y = 0.12;
  radio.add(body);

  const face = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.008), getMaterial('paintCream'));
  face.position.set(0, 0.12, 0.072);
  radio.add(face);

  const speaker = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), getMaterial('feltDark'));
  speaker.position.set(-0.07, 0.12, 0.078);
  radio.add(speaker);

  const knobGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.015, 10);
  for (const [kx, ky] of [
    [0.07, 0.16],
    [0.07, 0.08],
  ] as const) {
    const knob = new THREE.Mesh(knobGeometry, getMaterial('walnut'));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(kx, ky, 0.08);
    radio.add(knob);
  }

  const feetGeometry = new THREE.CylinderGeometry(0.014, 0.018, 0.02, 8);
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(feetGeometry, getMaterial('woodDark'));
    foot.position.set(side * 0.12, 0.01, 0);
    radio.add(foot);
  }

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.26, 6), getMaterial('brass'));
  antenna.position.set(0.13, 0.32, -0.03);
  antenna.rotation.z = -0.4;
  radio.add(antenna);
  return radio;
}
