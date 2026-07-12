/**
 * Custom fixed-timestep 2D physics for air hockey, simulated in the table
 * plane (world X/Z at y=0).
 *
 * Approach:
 * - The Game runs a fixed dt of 1/120 via an accumulator (frame delta clamped
 *   to 0.1s in the Loop/Game).
 * - Inside each fixed step the puck is integrated in substeps sized so it
 *   never travels more than half its radius per substep. Combined with the
 *   mallets' own speed caps (mallet travel per fixed step << contact radius),
 *   overlap tests per substep cannot tunnel through walls or mallets.
 * - Mallets are kinematic circles: they are positioned by their controllers
 *   and impart their velocity on the puck via a restitution impulse.
 * - Walls are axis-aligned with a centered goal opening in each short wall;
 *   goal posts are point-collided so the puck deflects realistically off the
 *   opening edges.
 */

import { PHYSICS, TABLE } from './constants';
import type { Side } from '../core/Events';

export interface CircleBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
}

export function createBody(radius: number, x = 0, z = 0): CircleBody {
  return { x, z, vx: 0, vz: 0, radius };
}

export interface PhysicsListener {
  /** Puck bounced off a wall or goal post. */
  onWallHit(speed: number): void;
  /** Puck struck by mallets[index]. speed = puck speed after impulse. */
  onMalletHit(index: number, speed: number): void;
  /**
   * Puck fully crossed a goal line. side = whose goal was breached
   * ('player' means the player conceded).
   */
  onGoal(side: Side): void;
}

export class Physics {
  /** Substeps used during the most recent step (diagnostics). */
  lastSubstepCount = 1;

  private goalScoredThisStep = false;

  /**
   * Advance the puck one fixed timestep against the table walls and the
   * given kinematic mallets. Allocation-free.
   */
  step(puck: CircleBody, mallets: readonly CircleBody[], dt: number, listener: PhysicsListener): void {
    // Low table friction: exponential linear damping.
    const damping = Math.exp(-PHYSICS.puckDamping * dt);
    puck.vx *= damping;
    puck.vz *= damping;
    clampSpeed(puck, PHYSICS.puckMaxSpeed);

    // Rest threshold: let a slow puck actually stop.
    if (puck.vx * puck.vx + puck.vz * puck.vz < PHYSICS.puckRestSpeed * PHYSICS.puckRestSpeed) {
      puck.vx = 0;
      puck.vz = 0;
    }

    const travel = Math.hypot(puck.vx, puck.vz) * dt;
    const maxTravel = puck.radius * PHYSICS.maxTravelPerSubstepFactor;
    const substeps = Math.max(1, Math.ceil(travel / maxTravel));
    this.lastSubstepCount = substeps;
    const h = dt / substeps;

    this.goalScoredThisStep = false;

    for (let i = 0; i < substeps; i += 1) {
      puck.x += puck.vx * h;
      puck.z += puck.vz * h;

      // Mallets first, walls last: walls get the final positional word, so a
      // mallet squeezing the puck into a wall/corner can never shove it
      // outside the table.
      for (let m = 0; m < mallets.length; m += 1) {
        this.collideMallet(puck, mallets[m], m, listener);
      }

      this.collideWalls(puck, listener);
      if (this.goalScoredThisStep) return;
    }
  }

  private collideWalls(puck: CircleBody, listener: PhysicsListener): void {
    const r = puck.radius;
    const maxX = TABLE.halfWidth - r;
    const maxZ = TABLE.halfLength - r;
    const gh = TABLE.goalHalfWidth;
    const e = PHYSICS.wallRestitution;

    // Long side walls (X axis).
    if (puck.x < -maxX) {
      puck.x = -maxX;
      if (puck.vx < 0) {
        listener.onWallHit(Math.hypot(puck.vx, puck.vz));
        puck.vx = -puck.vx * e;
      }
    } else if (puck.x > maxX) {
      puck.x = maxX;
      if (puck.vx > 0) {
        listener.onWallHit(Math.hypot(puck.vx, puck.vz));
        puck.vx = -puck.vx * e;
      }
    }

    // Short end walls (Z axis) with centered goal openings.
    if (Math.abs(puck.z) > maxZ) {
      const sideSign = Math.sign(puck.z);
      const overMouth = Math.abs(puck.x) < gh;

      if (!overMouth) {
        // Solid wall segment or post edge.
        this.collideGoalPost(puck, sideSign, listener);
        if (Math.abs(puck.z) > maxZ) {
          puck.z = maxZ * sideSign;
          if (puck.vz * sideSign > 0) {
            listener.onWallHit(Math.hypot(puck.vx, puck.vz));
            puck.vz = -puck.vz * e;
          }
        }
      } else {
        // Center is over the goal mouth: body may still clip a post.
        this.collideGoalPost(puck, sideSign, listener);

        // Goal: puck fully crossed the goal line.
        if (Math.abs(puck.z) > TABLE.halfLength + r) {
          this.goalScoredThisStep = true;
          listener.onGoal(sideSign > 0 ? 'player' : 'ai');
        }
      }
    }
  }

  /** Circle-vs-point collision against the nearest goal post corner. */
  private collideGoalPost(puck: CircleBody, sideSign: number, listener: PhysicsListener): void {
    const px = Math.sign(puck.x || 1) * TABLE.goalHalfWidth;
    const pz = sideSign * TABLE.halfLength;
    const dx = puck.x - px;
    const dz = puck.z - pz;
    const d2 = dx * dx + dz * dz;
    const r = puck.radius;
    if (d2 >= r * r || d2 < 1e-12) return;

    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    // Separate.
    puck.x = px + nx * r;
    puck.z = pz + nz * r;
    // Reflect if moving into the post.
    const vn = puck.vx * nx + puck.vz * nz;
    if (vn < 0) {
      listener.onWallHit(Math.hypot(puck.vx, puck.vz));
      const j = -(1 + PHYSICS.wallRestitution) * vn;
      puck.vx += j * nx;
      puck.vz += j * nz;
    }
  }

  private collideMallet(puck: CircleBody, mallet: CircleBody, index: number, listener: PhysicsListener): void {
    const dx = puck.x - mallet.x;
    const dz = puck.z - mallet.z;
    const rr = puck.radius + mallet.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) return;

    let nx: number;
    let nz: number;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      nx = dx / d;
      nz = dz / d;
    } else {
      // Degenerate perfectly-overlapping case: push toward the center line.
      nx = 0;
      nz = mallet.z >= 0 ? -1 : 1;
    }

    // Positional separation (mallet is kinematic — only the puck moves).
    puck.x = mallet.x + nx * rr;
    puck.z = mallet.z + nz * rr;

    // Velocity response in the mallet's frame.
    const rvx = puck.vx - mallet.vx;
    const rvz = puck.vz - mallet.vz;
    const vn = rvx * nx + rvz * nz;
    if (vn < 0) {
      const j = -(1 + PHYSICS.malletRestitution) * vn;
      puck.vx += j * nx;
      puck.vz += j * nz;
      clampSpeed(puck, PHYSICS.puckMaxSpeed);
      listener.onMalletHit(index, Math.hypot(puck.vx, puck.vz));
    }
  }
}

export function clampSpeed(body: CircleBody, maxSpeed: number): void {
  const speedSq = body.vx * body.vx + body.vz * body.vz;
  if (speedSq > maxSpeed * maxSpeed) {
    const scale = maxSpeed / Math.sqrt(speedSq);
    body.vx *= scale;
    body.vz *= scale;
  }
}
