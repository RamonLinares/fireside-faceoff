/** Central gameplay constants. Miniature table scale: 1.8 long x 1.0 wide at y=0. */

export const TABLE = {
  /** Full length along Z. Player defends +Z end, AI defends -Z end. */
  length: 1.8,
  /** Full width along X. */
  width: 1.0,
  halfLength: 0.9,
  halfWidth: 0.5,
  /** Goal opening ~35% of table width, centered on each short wall. */
  goalWidth: 0.35,
  goalHalfWidth: 0.175,
  wallHeight: 0.05,
  wallThickness: 0.035,
  surfaceY: 0,
} as const;

export const PHYSICS = {
  fixedDt: 1 / 120,
  maxFrameDelta: 0.1,
  puckRadius: 0.038,
  puckHeight: 0.018,
  malletRadius: 0.068,
  malletHeight: 0.05,
  /** Puck speed clamp ~2.5x table length per second. */
  puckMaxSpeed: 2.5 * 1.8,
  wallRestitution: 0.85,
  malletRestitution: 0.62,
  /** Exponential linear damping coefficient (per second) — low table friction. */
  puckDamping: 0.22,
  /** Below this speed the puck comes to rest (units/s). */
  puckRestSpeed: 0.02,
  /** Max puck travel per collision substep, as a fraction of puck radius. */
  maxTravelPerSubstepFactor: 0.5,
} as const;

export const RULES = {
  winScore: 7,
  /** Seconds the 'goal' celebration state lasts before serving. */
  goalPauseSeconds: 1.4,
  /** Seconds the 'serving' state lasts before play begins. */
  servePauseSeconds: 0.9,
  /**
   * Gentle nudge speed given to the puck toward the conceding player on
   * serve. Kept low enough (with damping + rest threshold) that an untouched
   * serve stalls before it can drift into a goal.
   */
  serveSpeed: 0.15,
  /** Puck slower than this in the AI half counts toward a stuck faceoff. */
  stuckSpeedThreshold: 0.05,
  /** Seconds a dead puck may sit in the AI half before a faceoff re-serve. */
  stuckTimeoutSeconds: 4,
} as const;

export const PLAYER_CONTROL = {
  /** Critically-damped smoothing time for the player mallet chase (seconds). */
  smoothTime: 0.045,
  /** Hard cap so a teleporting pointer cannot create absurd impact speeds. */
  maxSpeed: 6.0,
} as const;

export const AI = {
  /** Defensive hover line (distance from AI back wall). */
  defenseLineOffset: 0.16,
  baseMaxSpeed: 1.5,
  maxSpeedPerPlayerScore: 0.09,
  maxSpeedCap: 2.3,
  baseReactionDelay: 0.16,
  reactionDelayPerPlayerScore: 0.012,
  reactionDelayMin: 0.07,
  smoothTime: 0.09,
} as const;
