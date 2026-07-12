import * as THREE from 'three';
import { createPuckVisual } from '../assets/modelFactories/gamePieces';
import { PHYSICS } from '../game/constants';
import { createBody, type CircleBody } from '../game/Physics';
import { disposeObject3D } from '../utils/dispose';

/** The puck: a dynamic physics circle body plus walnut-toy visuals. */
export class Puck {
  readonly root = new THREE.Group();
  readonly body: CircleBody;
  /** Warm under-glow — the VFX system drives opacity with puck speed. */
  readonly glowMaterial: THREE.MeshBasicMaterial;

  constructor() {
    this.body = createBody(PHYSICS.puckRadius);
    this.root.name = 'puck';

    const visual = createPuckVisual();
    this.glowMaterial = visual.glowMaterial;
    this.root.add(visual.group);

    this.syncVisual();
  }

  reset(x: number, z: number, vx = 0, vz = 0): void {
    this.body.x = x;
    this.body.z = z;
    this.body.vx = vx;
    this.body.vz = vz;
    this.syncVisual();
  }

  syncVisual(): void {
    this.root.position.set(this.body.x, 0, this.body.z);
  }

  get speed(): number {
    return Math.hypot(this.body.vx, this.body.vz);
  }

  dispose(): void {
    disposeObject3D(this.root);
  }
}
