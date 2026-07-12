import * as THREE from 'three';
import { createHeroTable } from '../assets/modelFactories/heroTable';
import { disposeObject3D } from '../utils/dispose';

/**
 * Air hockey table visuals — the authored wooden toy table. Gameplay never
 * reads mesh geometry, only the constants in `constants.ts`, so everything
 * under `root` is purely presentational.
 */
export class Table {
  /** Root group at world origin; the table playfield sits at y=0. */
  readonly root = new THREE.Group();

  constructor() {
    this.root.name = 'table';
    this.root.add(createHeroTable());
  }

  dispose(): void {
    disposeObject3D(this.root);
  }
}
