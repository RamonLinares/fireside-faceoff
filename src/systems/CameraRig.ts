import * as THREE from 'three';
import { TABLE } from '../game/constants';

const DOWN_TILT_RADIANS = THREE.MathUtils.degToRad(46);
const FRAMING_MARGIN = 1.1;
/**
 * Look slightly toward the AI end and a touch above the playfield so the far
 * goal reads clearly and the diorama corner (window, posters, fairy lights)
 * composes into the top of the frame.
 */
const LOOK_TARGET = new THREE.Vector3(0, 0.06, -0.12);

/**
 * Perspective camera behind/above the player end (+Z), looking down the
 * table at ~53 degrees. `frame(aspect)` adapts distance to the aspect ratio
 * so the whole table plus goals stays visible (portrait pulls higher/further).
 * `impulse(strength)` is the hook for goal/hit kicks.
 */
export class CameraRig {
  private readonly basePosition = new THREE.Vector3();
  private readonly shakeOffset = new THREE.Vector3();
  private readonly workingPosition = new THREE.Vector3();
  private shakeEnergy = 0;
  private shakePhase = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.frame(camera.aspect);
  }

  /** Recompute framing for the given aspect ratio (call on resize). */
  frame(aspect: number): void {
    const safeAspect = Math.max(aspect, 0.2);

    // Bounding radius of the table incl. goal overshoot.
    const radius = Math.hypot(TABLE.halfLength + 0.1, TABLE.halfWidth) * FRAMING_MARGIN;

    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
    const halfFov = Math.min(vFov, hFov) / 2;
    const distance = radius / Math.sin(halfFov);

    this.basePosition.set(
      0,
      LOOK_TARGET.y + Math.sin(DOWN_TILT_RADIANS) * distance,
      LOOK_TARGET.z + Math.cos(DOWN_TILT_RADIANS) * distance,
    );

    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(LOOK_TARGET);
  }

  /**
   * Subtle camera impulse hook — goal/hit feedback. VFX agent may retune.
   * strength ~0.2 for hits, ~1 for goals.
   */
  impulse(strength: number): void {
    this.shakeEnergy = Math.min(this.shakeEnergy + strength * 0.02, 0.035);
  }

  update(dt: number): void {
    if (this.shakeEnergy > 0.0001) {
      this.shakePhase += dt * 60;
      this.shakeEnergy *= Math.exp(-7 * dt);
      this.shakeOffset.set(
        Math.sin(this.shakePhase * 1.3) * this.shakeEnergy,
        Math.sin(this.shakePhase * 1.7) * this.shakeEnergy * 0.6,
        0,
      );
    } else {
      this.shakeEnergy = 0;
      this.shakeOffset.set(0, 0, 0);
    }

    this.workingPosition.copy(this.basePosition).add(this.shakeOffset);
    this.camera.position.copy(this.workingPosition);
    this.camera.lookAt(LOOK_TARGET);
  }
}
