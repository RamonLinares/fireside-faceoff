import * as THREE from 'three';
import { TABLE } from '../../game/constants';
import { getMaterial } from '../MaterialLibrary';

/**
 * Hero asset: a wooden toy air hockey table. Visual-only — physics reads the
 * constants, never this geometry. Playfield top sits at y=0; the cabinet and
 * turned legs extend down to the room floor (y = FLOOR_Y).
 */

export const FLOOR_Y = -0.43;

export function createHeroTable(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hero-table';

  const woodWarm = getMaterial('woodWarm');
  const woodDark = getMaterial('woodDark');
  const honey = getMaterial('paintHoney');
  const rose = getMaterial('paintRoseDeep');
  const teal = getMaterial('paintTealDeep');

  // --- Playfield -----------------------------------------------------------
  const playfield = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.width, TABLE.length),
    getMaterial('playfield'),
  );
  playfield.rotation.x = -Math.PI / 2;
  // 2mm proud of the cabinet top so the plane never depth-fights it.
  playfield.position.y = 0.002;
  playfield.receiveShadow = true;
  playfield.name = 'playfield';
  group.add(playfield);

  // --- Cabinet body --------------------------------------------------------
  const cabinetW = TABLE.width + 0.13;
  const cabinetL = TABLE.length + 0.13;
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(cabinetW, 0.1, cabinetL), woodWarm);
  cabinet.position.y = -0.05;
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  cabinet.name = 'cabinet';
  group.add(cabinet);

  // Honey trim band around the cabinet top edge. Its top face sits 2mm BELOW
  // the cabinet top — previously both were at y=0 and z-fought across the
  // whole cabinet ring.
  const trim = new THREE.Mesh(new THREE.BoxGeometry(cabinetW + 0.012, 0.016, cabinetL + 0.012), honey);
  trim.position.y = -0.01;
  trim.name = 'cabinet-trim';
  group.add(trim);

  // Lower skirt line.
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(cabinetW + 0.006, 0.012, cabinetL + 0.006), woodDark);
  skirt.position.y = -0.096;
  skirt.name = 'cabinet-skirt';
  group.add(skirt);

  // --- Turned legs (instanced lathe) ---------------------------------------
  const legProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.016, 0),
    new THREE.Vector2(0.034, 0.012),
    new THREE.Vector2(0.02, 0.05),
    new THREE.Vector2(0.033, 0.1),
    new THREE.Vector2(0.02, 0.16),
    new THREE.Vector2(0.036, 0.22),
    new THREE.Vector2(0.038, 0.27),
    new THREE.Vector2(0.03, 0.3),
    new THREE.Vector2(0.038, 0.33),
  ];
  const legGeometry = new THREE.LatheGeometry(legProfile, 14);
  const legs = new THREE.InstancedMesh(legGeometry, woodDark, 4);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      matrix.setPosition(sx * (cabinetW / 2 - 0.075), FLOOR_Y, sz * (cabinetL / 2 - 0.085));
      legs.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  legs.castShadow = true;
  legs.name = 'legs';
  group.add(legs);

  // --- Rails ---------------------------------------------------------------
  // Anti-z-fighting rules used below:
  // - Rails sit 2.5mm above the cabinet top (no coplanar contact planes).
  // - Side rails run 4mm longer than the end rails' outer faces so the
  //   corner end-faces are never coplanar.
  // - Caps are slightly FATTER than the rail half-thickness and sunk 2mm so
  //   the cylinder crosses the rail faces at an angle instead of grazing
  //   them tangentially (tangential contact shimmers in motion).
  // - Cap lengths are 12mm shorter than their rails so cap end-faces never
  //   sit in the same plane as rail end-faces.
  const t = TABLE.wallThickness; // 0.035
  const railH = 0.058;
  const railLift = 0.0025;
  const capRadius = t / 2 + 0.003;
  const sideRailLength = TABLE.length + t * 2 + 0.008;
  const capGeometryLong = new THREE.CylinderGeometry(capRadius, capRadius, sideRailLength - 0.012, 10);
  const railMaterial = woodDark;

  const addRailBox = (w: number, d: number, x: number, z: number, name: string) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, railH, d), railMaterial);
    rail.position.set(x, railH / 2 + railLift, z);
    rail.castShadow = true;
    rail.receiveShadow = true;
    rail.name = name;
    group.add(rail);
    return rail;
  };

  // Long side rails: inner face flush with |x| = halfWidth.
  for (const sign of [-1, 1]) {
    const railBox = new THREE.Mesh(new THREE.BoxGeometry(t, railH, sideRailLength), railMaterial);
    railBox.position.set(sign * (TABLE.halfWidth + t / 2), railH / 2 + railLift, 0);
    railBox.castShadow = true;
    railBox.receiveShadow = true;
    railBox.name = `rail-side-${sign}`;
    group.add(railBox);
    const cap = new THREE.Mesh(capGeometryLong, honey);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(sign * (TABLE.halfWidth + t / 2), railH + railLift - 0.002, 0);
    cap.castShadow = false; // thin caps threw long streaks from the low lamp
    cap.name = `rail-cap-${sign}`;
    group.add(cap);
  }

  // Short end rails, split by the goal opening; painted in each player's color.
  const segmentWidth = TABLE.halfWidth - TABLE.goalHalfWidth;
  const segmentCenterX = TABLE.goalHalfWidth + segmentWidth / 2;
  const endZ = TABLE.halfLength + t / 2;
  const capGeometryEnd = new THREE.CylinderGeometry(capRadius, capRadius, segmentWidth + t - 0.012, 10);
  for (const zSign of [-1, 1]) {
    const paint = zSign > 0 ? rose : teal;
    for (const xSign of [-1, 1]) {
      addRailBox(segmentWidth + t, t, xSign * segmentCenterX, zSign * endZ, `rail-end-${zSign}-${xSign}`);
      const cap = new THREE.Mesh(capGeometryEnd, paint);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(xSign * segmentCenterX, railH + railLift - 0.002, zSign * endZ);
      cap.castShadow = false; // thin caps threw long streaks from the low lamp
      group.add(cap);
    }

    // Goal mouth frame: painted posts at the opening plus a painted sill.
    const postGeometry = new THREE.CylinderGeometry(0.016, 0.02, railH + 0.03, 10);
    for (const xSign of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, paint);
      post.position.set(xSign * (TABLE.goalHalfWidth + 0.012), (railH + 0.03) / 2 - 0.004, zSign * endZ);
      post.castShadow = true;
      post.name = `goal-post-${zSign}-${xSign}`;
      group.add(post);
      // Tiny ball finial on each post.
      const finial = new THREE.Mesh(finialGeometry(), honey);
      finial.position.set(xSign * (TABLE.goalHalfWidth + 0.012), railH + 0.033, zSign * endZ);
      group.add(finial);
    }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(TABLE.goalWidth, 0.008, t), paint);
    sill.position.set(0, 0.004, zSign * endZ);
    sill.name = `goal-sill-${zSign}`;
    group.add(sill);

    // Puck return slot on the cabinet's outer end face.
    const slotZ = zSign * (cabinetL / 2 + 0.001);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), getMaterial('feltDark'));
    slot.position.set(0, -0.045, slotZ);
    slot.name = `puck-return-${zSign}`;
    group.add(slot);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.014, 0.06), honey);
    tray.position.set(0, -0.075, zSign * (cabinetL / 2 + 0.028));
    tray.castShadow = true;
    tray.name = `puck-tray-${zSign}`;
    group.add(tray);
  }

  // --- Bead score keeper on the right cabinet side --------------------------
  group.add(createBeadScorer(cabinetW));

  return group;
}

let sharedFinial: THREE.SphereGeometry | null = null;
function finialGeometry(): THREE.SphereGeometry {
  if (!sharedFinial) sharedFinial = new THREE.SphereGeometry(0.014, 10, 8);
  return sharedFinial;
}

/** Two short wires of sliding wooden beads — one per player color. */
function createBeadScorer(cabinetW: number): THREE.Group {
  const scorer = new THREE.Group();
  scorer.name = 'bead-scorer';
  const x = cabinetW / 2 + 0.018;

  const barGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.36, 8);
  const bracketGeometry = new THREE.BoxGeometry(0.014, 0.05, 0.02);
  const honey = getMaterial('paintHoney');
  const beadGeometry = new THREE.SphereGeometry(0.014, 10, 8);

  const beadCounts: Array<[string, number]> = [
    ['paintRoseDeep', 0.31],
    ['paintTealDeep', -0.31],
  ];
  for (const [materialName, zCenter] of beadCounts) {
    const bar = new THREE.Mesh(barGeometry, getMaterial('brass'));
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, -0.022, zCenter);
    scorer.add(bar);

    const beads = new THREE.InstancedMesh(beadGeometry, getMaterial(materialName), 7);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 7; i += 1) {
      matrix.setPosition(x, -0.022, zCenter - 0.15 + i * 0.033);
      beads.setMatrixAt(i, matrix);
    }
    beads.name = `beads-${materialName}`;
    scorer.add(beads);

    for (const sign of [-1, 1]) {
      const bracket = new THREE.Mesh(bracketGeometry, honey);
      bracket.position.set(x, -0.03, zCenter + sign * 0.185);
      scorer.add(bracket);
    }
  }
  return scorer;
}
