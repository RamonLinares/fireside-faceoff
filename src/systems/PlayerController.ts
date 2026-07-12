import * as THREE from 'three';
import type { InputController } from '../core/InputController';
import { PHYSICS, PLAYER_CONTROL, TABLE } from '../game/constants';
import type { CircleBody } from '../game/Physics';

/**
 * Drives the player mallet: raycasts the pointer onto the table plane, then
 * chases the target with critically-damped smoothing inside the fixed physics
 * step so the mallet has a real, consistent velocity to impart on the puck.
 * The mallet is clamped to the player's half (+Z) and the table bounds.
 */
export class PlayerController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE.surfaceY);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();

  private targetX: number;
  private targetZ: number;
  private hasTarget = false;

  // Critically-damped spring state (velocity kept between fixed steps).
  private springVx = 0;
  private springVz = 0;

  constructor(private readonly body: CircleBody) {
    this.targetX = body.x;
    this.targetZ = body.z;
  }

  /** Per-frame: refresh the pointer target (input -> intent). */
  readInput(input: InputController, camera: THREE.PerspectiveCamera): void {
    // Consume the dirty flag even while active so a stale flag never lingers;
    // either signal means we have a fresh pointer position to aim at.
    const dirty = input.consumePointerDirty();
    if (!input.pointerActive && !dirty) return;
    this.ndc.set(input.ndcX, input.ndcY);
    this.raycaster.setFromCamera(this.ndc, camera);
    if (this.raycaster.ray.intersectPlane(this.tablePlane, this.hit)) {
      this.targetX = clampX(this.hit.x);
      this.targetZ = clampPlayerZ(this.hit.z);
      this.hasTarget = true;
    }
  }

  /** Per-fixed-step: move the mallet toward the target with damped smoothing. */
  fixedUpdate(dt: number): void {
    const body = this.body;
    const prevX = body.x;
    const prevZ = body.z;

    if (this.hasTarget) {
      // Critically damped spring: x'' = w^2 (target - x) - 2w x'
      const omega = 2 / PLAYER_CONTROL.smoothTime;
      this.springVx += (omega * omega * (this.targetX - body.x) - 2 * omega * this.springVx) * dt;
      this.springVz += (omega * omega * (this.targetZ - body.z) - 2 * omega * this.springVz) * dt;

      const speed = Math.hypot(this.springVx, this.springVz);
      if (speed > PLAYER_CONTROL.maxSpeed) {
        const scale = PLAYER_CONTROL.maxSpeed / speed;
        this.springVx *= scale;
        this.springVz *= scale;
      }

      body.x += this.springVx * dt;
      body.z += this.springVz * dt;
    } else {
      this.springVx = 0;
      this.springVz = 0;
    }

    body.x = clampX(body.x);
    body.z = clampPlayerZ(body.z);

    // Effective kinematic velocity after clamping — what the puck feels.
    body.vx = (body.x - prevX) / dt;
    body.vz = (body.z - prevZ) / dt;
  }

  reset(): void {
    this.targetX = this.body.x;
    this.targetZ = this.body.z;
    this.hasTarget = false;
    this.springVx = 0;
    this.springVz = 0;
    this.body.vx = 0;
    this.body.vz = 0;
  }
}

function clampX(x: number): number {
  const limit = TABLE.halfWidth - PHYSICS.malletRadius;
  return THREE.MathUtils.clamp(x, -limit, limit);
}

function clampPlayerZ(z: number): number {
  // Player's half: from just past the center line to the back wall.
  return THREE.MathUtils.clamp(z, PHYSICS.malletRadius, TABLE.halfLength - PHYSICS.malletRadius);
}
