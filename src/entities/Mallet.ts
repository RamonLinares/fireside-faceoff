import * as THREE from 'three';
import { createMalletVisual } from '../assets/modelFactories/gamePieces';
import { PHYSICS } from '../game/constants';
import { createBody, type CircleBody } from '../game/Physics';
import { disposeObject3D } from '../utils/dispose';

/**
 * Kinematic mallet: a physics circle body plus authored toy visuals.
 * Gameplay reads/writes `body`; visuals under `root` are swappable.
 */
export class Mallet {
  readonly root = new THREE.Group();
  readonly body: CircleBody;

  private readonly glowMaterial: THREE.MeshStandardMaterial;

  constructor(name: string, accent: 'rose' | 'teal', x: number, z: number) {
    this.body = createBody(PHYSICS.malletRadius, x, z);
    this.root.name = name;

    const visual = createMalletVisual(accent);
    this.glowMaterial = visual.glowMaterial;
    this.root.add(visual.group);

    this.syncVisual();
  }

  /** Emissive rim pulse (0..1) — driven by the VFX system on strikes. */
  setStrikeGlow(value: number): void {
    this.glowMaterial.emissiveIntensity = value * 2.2;
  }

  /** Snap the mallet (and zero its velocity) — used on serve/reset. */
  reset(x: number, z: number): void {
    this.body.x = x;
    this.body.z = z;
    this.body.vx = 0;
    this.body.vz = 0;
    this.syncVisual();
  }

  syncVisual(): void {
    this.root.position.set(this.body.x, 0, this.body.z);
  }

  dispose(): void {
    disposeObject3D(this.root);
  }
}
