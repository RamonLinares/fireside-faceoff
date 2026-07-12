import * as THREE from 'three';
import { PHYSICS } from '../../game/constants';
import { getMaterial, getTexture } from '../MaterialLibrary';

/**
 * Mallet and puck visuals — chunky painted wooden toys. Collision stays the
 * physics circle bodies; these groups are purely visual and sized off the
 * gameplay radii so silhouettes still match hitboxes.
 */

export interface MalletVisual {
  group: THREE.Group;
  /** Emissive ring material — VfxSystem pulses emissiveIntensity on hits. */
  glowMaterial: THREE.MeshStandardMaterial;
}

export function createMalletVisual(accent: 'rose' | 'teal'): MalletVisual {
  const group = new THREE.Group();
  const r = PHYSICS.malletRadius;
  const bodyMaterial = getMaterial(accent === 'rose' ? 'paintRose' : 'paintTeal');
  const deepMaterial = getMaterial(accent === 'rose' ? 'paintRoseDeep' : 'paintTealDeep');

  // Felt-like base rim so the toy "slides" on the table.
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r, 0.008, 28), getMaterial('feltDark'));
  felt.position.y = 0.004;
  group.add(felt);

  // Painted dome body (lathe: base flare -> shoulder -> rounded top).
  const bodyProfile: THREE.Vector2[] = [
    new THREE.Vector2(r * 0.97, 0.008),
    new THREE.Vector2(r, 0.02),
    new THREE.Vector2(r * 0.96, 0.036),
    new THREE.Vector2(r * 0.8, 0.05),
    new THREE.Vector2(r * 0.62, 0.056),
    new THREE.Vector2(r * 0.44, 0.058),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile, 28), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Painted ring detail around the shoulder.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.885, 0.006, 8, 28), getMaterial('paintCream'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.043;
  group.add(ring);

  // Emissive rim near the base — pulses on strike.
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: accent === 'rose' ? '#c98a8a' : '#6fa3a0',
    emissive: accent === 'rose' ? '#ff9d8a' : '#7de8e0',
    emissiveIntensity: 0,
    roughness: 0.5,
  });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.005, 8, 28), glowMaterial);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.014;
  group.add(glowRing);

  // Turned wooden handle with a knob.
  const handleProfile: THREE.Vector2[] = [
    new THREE.Vector2(r * 0.42, 0.058),
    new THREE.Vector2(r * 0.3, 0.07),
    new THREE.Vector2(r * 0.26, 0.082),
    new THREE.Vector2(r * 0.34, 0.09),
    new THREE.Vector2(r * 0.28, 0.098),
  ];
  const handle = new THREE.Mesh(new THREE.LatheGeometry(handleProfile, 20), getMaterial('woodHoney'));
  handle.castShadow = true;
  group.add(handle);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 18, 14), deepMaterial);
  knob.position.y = 0.118;
  knob.scale.y = 0.85;
  knob.castShadow = true;
  group.add(knob);

  return { group, glowMaterial };
}

export interface PuckVisual {
  group: THREE.Group;
  /** Additive under-glow — VfxSystem drives opacity with puck speed. */
  glowMaterial: THREE.MeshBasicMaterial;
}

export function createPuckVisual(): PuckVisual {
  const group = new THREE.Group();
  const r = PHYSICS.puckRadius;
  const h = PHYSICS.puckHeight;

  // Dark walnut disc with a soft edge chamfer (two stacked cylinders).
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.78, 28), getMaterial('walnut'));
  disc.position.y = (h * 0.78) / 2;
  disc.castShadow = true;
  disc.receiveShadow = true;
  group.add(disc);
  const chamfer = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.9, r, h * 0.24, 28),
    getMaterial('woodDark'),
  );
  chamfer.position.y = h * 0.78 + (h * 0.24) / 2;
  group.add(chamfer);

  // Tiny star decal on top.
  const decal = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.72, 20),
    new THREE.MeshBasicMaterial({
      map: getTexture('puckDecal'),
      transparent: true,
      depthWrite: false,
    }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = h + 0.0008;
  group.add(decal);

  // Warm under-glow that VFX brightens while the puck is fast.
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: getTexture('glow'),
    color: '#ffb36b',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(r * 5, r * 5), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.0015;
  group.add(glow);

  return { group, glowMaterial };
}
