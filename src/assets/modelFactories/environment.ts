import * as THREE from 'three';
import { disposeObject3D } from '../../utils/dispose';
import { getTexture } from '../MaterialLibrary';
import { FairyLights } from './fairyLights';
import { FLOOR_Y } from './heroTable';
import { createProps } from './props';
import { createRoomShell } from './room';

/**
 * Assembles the diorama around the table: room shell, props, fairy lights,
 * and cheap instanced blob shadows that ground every prop without extra
 * shadow-casting lights.
 */
export class Environment {
  readonly root = new THREE.Group();
  /** World position of the lamp bulb — the LightingRig anchors its key here. */
  readonly lampAnchor: THREE.Vector3;

  private readonly fairyLights = new FairyLights();

  constructor() {
    this.root.name = 'environment';
    this.root.add(createRoomShell());

    const props = createProps();
    this.root.add(props.group);
    this.lampAnchor = props.lampAnchor;

    this.root.add(this.createBlobShadows(props.blobs));
    this.root.add(this.fairyLights.root);
  }

  private createBlobShadows(blobs: Array<{ x: number; z: number; r: number }>): THREE.InstancedMesh {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
      map: getTexture('glow'),
      color: '#000000',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const shadows = new THREE.InstancedMesh(geometry, material, blobs.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    blobs.forEach((blob, i) => {
      position.set(blob.x, FLOOR_Y + 0.006, blob.z);
      scale.set(blob.r, blob.r, 1);
      matrix.compose(position, rotation, scale);
      shadows.setMatrixAt(i, matrix);
    });
    shadows.name = 'blob-shadows';
    shadows.renderOrder = 1;
    return shadows;
  }

  /** Fairy lights celebrate (goal: short burst, win: long sparkle). */
  celebrate(seconds: number): void {
    this.fairyLights.excite(seconds);
  }

  update(dt: number): void {
    this.fairyLights.update(dt);
  }

  dispose(): void {
    disposeObject3D(this.root);
  }
}
