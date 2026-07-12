import * as THREE from 'three';
import { AI, PHYSICS, RULES, TABLE } from '../game/constants';
import type { CircleBody } from '../game/Physics';

type AiMode = 'defend' | 'intercept' | 'strike';

/**
 * Readable AI opponent for the far (-Z) side.
 *
 * Behavior: hovers on its defense line and mirrors the puck; predicts the
 * intercept point when the puck travels toward its goal; steps forward and
 * strikes (aiming at the player's goal) when the puck sits in its half.
 *
 * Beatable by design: it re-plans only every `reactionDelay` seconds and its
 * speed is capped. Both ramp slightly with the player's score.
 */
export class AiController {
  private mode: AiMode = 'defend';
  private reactionTimer = 0;
  private targetX = 0;
  private targetZ = -TABLE.halfLength + AI.defenseLineOffset;
  private maxSpeed: number = AI.baseMaxSpeed;
  private reactionDelay: number = AI.baseReactionDelay;

  constructor(private readonly body: CircleBody) {}

  /** Difficulty ramps slightly as the player's score grows. */
  setDifficulty(playerScore: number): void {
    const score = Math.min(playerScore, RULES.winScore);
    this.maxSpeed = Math.min(AI.baseMaxSpeed + AI.maxSpeedPerPlayerScore * score, AI.maxSpeedCap);
    this.reactionDelay = Math.max(
      AI.baseReactionDelay - AI.reactionDelayPerPlayerScore * score,
      AI.reactionDelayMin,
    );
  }

  /** Per-fixed-step: re-plan on the reaction timer, then chase the target. */
  fixedUpdate(dt: number, puck: CircleBody): void {
    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.reactionDelay;
      this.plan(puck);
    }
    this.move(dt);
  }

  reset(): void {
    this.mode = 'defend';
    this.reactionTimer = 0;
    this.targetX = 0;
    this.targetZ = -TABLE.halfLength + AI.defenseLineOffset;
    this.body.vx = 0;
    this.body.vz = 0;
  }

  get currentMode(): AiMode {
    return this.mode;
  }

  private plan(puck: CircleBody): void {
    const defenseZ = -TABLE.halfLength + AI.defenseLineOffset;
    const puckInAiHalf = puck.z < 0;
    const puckTowardAiGoal = puck.vz < -0.15;
    const puckSpeed = Math.hypot(puck.vx, puck.vz);

    if (puckInAiHalf && (puckSpeed < 0.8 || puck.vz > -0.4)) {
      // Strike: approach from behind the puck so the hit sends it at the
      // player's goal (at +halfLength).
      this.mode = 'strike';
      const dirX = 0 - puck.x;
      const dirZ = TABLE.halfLength - puck.z;
      const len = Math.hypot(dirX, dirZ) || 1;
      const behind = PHYSICS.malletRadius * 0.6;
      this.targetX = puck.x - (dirX / len) * behind;
      this.targetZ = puck.z - (dirZ / len) * behind;
    } else if (puckTowardAiGoal) {
      // Intercept: predict where the puck crosses the defense line, folding
      // side-wall bounces with a triangle-wave reflection.
      this.mode = 'intercept';
      const t = (defenseZ - puck.z) / puck.vz;
      this.targetX = foldX(puck.x + puck.vx * Math.max(t, 0));
      this.targetZ = defenseZ;
    } else {
      // Defend: hover on the goal line, loosely mirroring the puck.
      this.mode = 'defend';
      this.targetX = THREE.MathUtils.clamp(puck.x * 0.6, -TABLE.goalHalfWidth, TABLE.goalHalfWidth);
      this.targetZ = defenseZ;
    }
  }

  private move(dt: number): void {
    const body = this.body;
    const prevX = body.x;
    const prevZ = body.z;

    // Chase the target with damped smoothing, capped at maxSpeed.
    const omega = 2 / AI.smoothTime;
    let vx = body.vx + (omega * omega * (this.targetX - body.x) - 2 * omega * body.vx) * dt;
    let vz = body.vz + (omega * omega * (this.targetZ - body.z) - 2 * omega * body.vz) * dt;
    const speed = Math.hypot(vx, vz);
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      vx *= scale;
      vz *= scale;
    }

    body.x += vx * dt;
    body.z += vz * dt;

    // Clamp to the AI half and table bounds.
    const limitX = TABLE.halfWidth - PHYSICS.malletRadius;
    body.x = THREE.MathUtils.clamp(body.x, -limitX, limitX);
    body.z = THREE.MathUtils.clamp(body.z, -TABLE.halfLength + PHYSICS.malletRadius, -PHYSICS.malletRadius);

    // Effective kinematic velocity after clamping — what the puck feels.
    body.vx = (body.x - prevX) / dt;
    body.vz = (body.z - prevZ) / dt;
  }
}

/** Reflect an unbounded x prediction back into the side-wall bounds. */
function foldX(x: number): number {
  const limit = TABLE.halfWidth - PHYSICS.puckRadius;
  const period = 4 * limit;
  let value = ((x + limit) % period + period) % period;
  if (value > 2 * limit) value = period - value;
  return value - limit;
}
