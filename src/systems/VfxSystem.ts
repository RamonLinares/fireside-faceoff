import * as THREE from 'three';
import { getTexture } from '../assets/MaterialLibrary';
import type { Environment } from '../assets/modelFactories/environment';
import type { EventBus } from '../core/Events';
import type { Mallet } from '../entities/Mallet';
import type { Puck } from '../entities/Puck';
import { TABLE } from '../game/constants';

/**
 * Event-driven, pooled VFX: hit rings, goal confetti, goal-mouth glow, puck
 * speed trail, mallet strike pulses, and ambient dust motes in the lamp
 * light. Everything is preallocated — no per-event allocations.
 */

const CONFETTI_COUNT = 130;
const TRAIL_COUNT = 22;
const RING_COUNT = 6;
const DUST_COUNT = 64;

const CONFETTI_COLORS = ['#c98a8a', '#6fa3a0', '#d9a45b', '#8ba888', '#f3ead8'].map(
  (c) => new THREE.Color(c),
);

interface Refs {
  puck: Puck;
  playerMallet: Mallet;
  aiMallet: Mallet;
  environment: Environment;
}

export class VfxSystem {
  readonly root = new THREE.Group();

  private readonly refs: Refs;
  private readonly unsubscribes: Array<() => void> = [];

  // Ring pool.
  private readonly rings: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; life: number; maxScale: number }> = [];

  // Confetti.
  private readonly confetti: THREE.InstancedMesh;
  private readonly confettiVelocity = new Float32Array(CONFETTI_COUNT * 3);
  private readonly confettiSpin = new Float32Array(CONFETTI_COUNT * 2);
  private readonly confettiLife = new Float32Array(CONFETTI_COUNT);
  private readonly confettiPosition = new Float32Array(CONFETTI_COUNT * 3);
  private confettiCursor = 0;

  // Puck trail.
  private readonly trail: THREE.InstancedMesh;
  private readonly trailLife = new Float32Array(TRAIL_COUNT);
  private readonly trailPosition = new Float32Array(TRAIL_COUNT * 2);
  private trailCursor = 0;
  private trailAccumulator = 0;

  // Goal mouth glows.
  private readonly goalGlows: Array<{ material: THREE.MeshBasicMaterial; energy: number }> = [];

  // Dust motes.
  private readonly dust: THREE.Points;
  private readonly dustSeeds: Float32Array;
  private dustTime = 0;

  // Mallet strike pulses.
  private playerPulse = 0;
  private aiPulse = 0;

  // Scratch objects.
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(parent: THREE.Object3D, events: EventBus, refs: Refs) {
    this.refs = refs;
    this.root.name = 'vfx';
    parent.add(this.root);

    // --- Ring pool ---------------------------------------------------------
    const ringGeometry = new THREE.RingGeometry(0.62, 1, 24);
    for (let i = 0; i < RING_COUNT; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: '#ffd9a0',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.root.add(mesh);
      this.rings.push({ mesh, material, life: 0, maxScale: 0.1 });
    }

    // --- Confetti ----------------------------------------------------------
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.02, 0.032),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      CONFETTI_COUNT,
    );
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      this.confetti.setColorAt(i, CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      this.matrix.makeScale(0, 0, 0);
      this.confetti.setMatrixAt(i, this.matrix);
    }
    this.confetti.frustumCulled = false;
    this.confetti.name = 'confetti';
    this.root.add(this.confetti);

    // --- Puck trail ---------------------------------------------------------
    this.trail = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.032, 12),
      new THREE.MeshBasicMaterial({
        map: getTexture('glow'),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      TRAIL_COUNT,
    );
    for (let i = 0; i < TRAIL_COUNT; i += 1) {
      this.matrix.makeScale(0, 0, 0);
      this.trail.setMatrixAt(i, this.matrix);
      this.trail.setColorAt(i, this.color.setRGB(0, 0, 0));
    }
    this.trail.frustumCulled = false;
    this.trail.name = 'puck-trail';
    this.root.add(this.trail);

    // --- Goal mouth glows ----------------------------------------------------
    for (const sign of [-1, 1]) {
      const material = new THREE.MeshBasicMaterial({
        map: getTexture('glow'),
        color: sign > 0 ? '#ff9d8a' : '#7de8e0',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.goalWidth * 2.4, 0.5), material);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(0, 0.004, sign * (TABLE.halfLength - 0.08));
      glow.name = sign > 0 ? 'goal-glow-player' : 'goal-glow-ai';
      this.root.add(glow);
      this.goalGlows.push({ material, energy: 0 });
    }

    // --- Dust motes in the lamp cone -----------------------------------------
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    this.dustSeeds = new Float32Array(DUST_COUNT * 3);
    const anchor = refs.environment.lampAnchor;
    for (let i = 0; i < DUST_COUNT; i += 1) {
      this.dustSeeds[i * 3] = Math.random() * Math.PI * 2;
      this.dustSeeds[i * 3 + 1] = Math.random();
      this.dustSeeds[i * 3 + 2] = 0.15 + Math.random() * 0.85;
      dustPositions[i * 3] = anchor.x;
      dustPositions[i * 3 + 1] = anchor.y;
      dustPositions[i * 3 + 2] = anchor.z;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        map: getTexture('glow'),
        color: '#ffd9a0',
        size: 0.014,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.dust.name = 'dust-motes';
    this.root.add(this.dust);

    // --- Event wiring ---------------------------------------------------------
    this.unsubscribes.push(
      events.on('puckHitMallet', ({ speed, side }) => {
        const strength = Math.min(speed / 3, 1);
        this.spawnRing(
          refs.puck.body.x,
          refs.puck.body.z,
          side === 'player' ? '#ffb3a0' : '#8fe8e0',
          0.09 + strength * 0.12,
          0.5 + strength * 0.4,
        );
        if (side === 'player') this.playerPulse = 1;
        else this.aiPulse = 1;
      }),
      events.on('puckHitWall', ({ speed }) => {
        const strength = Math.min(speed / 3, 1);
        this.spawnRing(refs.puck.body.x, refs.puck.body.z, '#f3e6c8', 0.05 + strength * 0.08, 0.35);
      }),
      events.on('goalScored', ({ side }) => {
        // Glow the breached mouth (opposite end scored into it).
        const breachedSign = side === 'player' ? -1 : 1;
        const glow = this.goalGlows[breachedSign > 0 ? 1 : 0];
        glow.energy = 1;
        this.burstConfetti(0, breachedSign * (TABLE.halfLength - 0.15), 55, 1);
        refs.environment.celebrate(1.6);
      }),
      events.on('gameWon', () => {
        this.burstConfetti(0, 0, CONFETTI_COUNT, 1.5);
        refs.environment.celebrate(6);
      }),
      events.on('serve', () => {
        this.spawnRing(refs.puck.body.x, refs.puck.body.z, '#ffd9a0', 0.1, 0.5);
      }),
    );
  }

  private spawnRing(x: number, z: number, color: string, maxScale: number, opacity: number): void {
    const ring = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    ring.life = 1;
    ring.maxScale = maxScale;
    ring.material.color.set(color);
    ring.material.opacity = opacity;
    ring.mesh.position.set(x, 0.006, z);
    ring.mesh.visible = true;
  }

  private burstConfetti(x: number, z: number, count: number, energy: number): void {
    for (let i = 0; i < count; i += 1) {
      const index = this.confettiCursor;
      this.confettiCursor = (this.confettiCursor + 1) % CONFETTI_COUNT;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.4 + Math.random() * 0.9) * energy;
      this.confettiLife[index] = 1.6 + Math.random() * 0.9;
      this.confettiPosition[index * 3] = x + (Math.random() - 0.5) * 0.1;
      this.confettiPosition[index * 3 + 1] = 0.05;
      this.confettiPosition[index * 3 + 2] = z + (Math.random() - 0.5) * 0.1;
      this.confettiVelocity[index * 3] = Math.cos(angle) * speed * 0.55;
      this.confettiVelocity[index * 3 + 1] = 0.9 + Math.random() * 1.1 * energy;
      this.confettiVelocity[index * 3 + 2] = Math.sin(angle) * speed * 0.55;
      this.confettiSpin[index * 2] = Math.random() * Math.PI * 2;
      this.confettiSpin[index * 2 + 1] = (Math.random() - 0.5) * 12;
    }
  }

  update(dt: number): void {
    this.updateRings(dt);
    this.updateConfetti(dt);
    this.updateTrail(dt);
    this.updateGoalGlows(dt);
    this.updateDust(dt);
    this.updateMalletPulses(dt);
  }

  private updateRings(dt: number): void {
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt * 3.2;
      if (ring.life <= 0) {
        ring.mesh.visible = false;
        continue;
      }
      const t = 1 - ring.life;
      const s = 0.03 + t * ring.maxScale;
      ring.mesh.scale.setScalar(s);
      ring.material.opacity = ring.life * 0.7;
    }
  }

  private updateConfetti(dt: number): void {
    let any = false;
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      if (this.confettiLife[i] <= 0) continue;
      any = true;
      this.confettiLife[i] -= dt;
      const px = (this.confettiPosition[i * 3] += this.confettiVelocity[i * 3] * dt);
      let py = (this.confettiPosition[i * 3 + 1] += this.confettiVelocity[i * 3 + 1] * dt);
      const pz = (this.confettiPosition[i * 3 + 2] += this.confettiVelocity[i * 3 + 2] * dt);
      this.confettiVelocity[i * 3 + 1] -= 2.6 * dt;
      // Flutter drag.
      this.confettiVelocity[i * 3] *= 1 - 0.9 * dt;
      this.confettiVelocity[i * 3 + 2] *= 1 - 0.9 * dt;
      if (py < 0.012 && this.confettiVelocity[i * 3 + 1] < 0) {
        py = this.confettiPosition[i * 3 + 1] = 0.012;
        this.confettiVelocity[i * 3 + 1] = 0;
      }
      this.confettiSpin[i * 2] += this.confettiSpin[i * 2 + 1] * dt;

      const fade = Math.min(this.confettiLife[i] / 0.5, 1);
      if (fade <= 0) {
        this.matrix.makeScale(0, 0, 0);
      } else {
        this.euler.set(this.confettiSpin[i * 2], this.confettiSpin[i * 2] * 0.7, this.confettiSpin[i * 2] * 1.3);
        this.quaternion.setFromEuler(this.euler);
        this.position.set(px, py, pz);
        this.scale.setScalar(fade);
        this.matrix.compose(this.position, this.quaternion, this.scale);
      }
      this.confetti.setMatrixAt(i, this.matrix);
    }
    if (any) this.confetti.instanceMatrix.needsUpdate = true;
  }

  private updateTrail(dt: number): void {
    const puck = this.refs.puck;
    const speed = puck.speed;

    // Under-glow follows speed directly.
    puck.glowMaterial.opacity = THREE.MathUtils.clamp((speed - 0.9) * 0.35, 0, 0.65);

    // Emit fading discs while the puck is fast.
    this.trailAccumulator += dt;
    if (speed > 1.1 && this.trailAccumulator > 0.024) {
      this.trailAccumulator = 0;
      const index = this.trailCursor;
      this.trailCursor = (this.trailCursor + 1) % TRAIL_COUNT;
      this.trailLife[index] = 1;
      this.trailPosition[index * 2] = puck.body.x;
      this.trailPosition[index * 2 + 1] = puck.body.z;
    }

    for (let i = 0; i < TRAIL_COUNT; i += 1) {
      if (this.trailLife[i] <= 0) continue;
      this.trailLife[i] -= dt * 3.4;
      const life = Math.max(this.trailLife[i], 0);
      this.position.set(this.trailPosition[i * 2], 0.004, this.trailPosition[i * 2 + 1]);
      this.scale.setScalar(0.35 + (1 - life) * 0.5);
      this.quaternion.setFromEuler(this.euler.set(-Math.PI / 2, 0, 0));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.trail.setMatrixAt(i, this.matrix);
      // Warm ember fading to nothing (additive: black = invisible).
      this.color.setRGB(1.0 * life, 0.62 * life, 0.3 * life);
      this.trail.setColorAt(i, this.color);
    }
    this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
  }

  private updateGoalGlows(dt: number): void {
    for (const glow of this.goalGlows) {
      if (glow.energy <= 0) continue;
      glow.energy = Math.max(0, glow.energy - dt * 0.8);
      const pulse = glow.energy * (0.65 + 0.35 * Math.sin(glow.energy * 22));
      glow.material.opacity = pulse * 0.8;
    }
  }

  private updateDust(dt: number): void {
    this.dustTime += dt;
    const anchor = this.refs.environment.lampAnchor;
    const positions = this.dust.geometry.attributes.position;
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const seed = this.dustSeeds[i * 3];
      const fall = (this.dustSeeds[i * 3 + 1] + this.dustTime * 0.03) % 1;
      const radius = this.dustSeeds[i * 3 + 2];
      // Drift down inside the lamp's light cone, widening toward the table.
      const cone = 0.12 + fall * 0.55;
      const sway = seed + this.dustTime * (0.18 + radius * 0.12);
      positions.setXYZ(
        i,
        anchor.x + Math.cos(sway) * cone * radius - fall * 0.9,
        anchor.y + 0.15 - fall * (anchor.y + 0.32),
        anchor.z + Math.sin(sway) * cone * radius + fall * 0.75,
      );
    }
    positions.needsUpdate = true;
  }

  private updateMalletPulses(dt: number): void {
    const decay = Math.exp(-6 * dt);
    this.playerPulse *= decay;
    this.aiPulse *= decay;
    this.refs.playerMallet.setStrikeGlow(this.playerPulse);
    this.refs.aiMallet.setStrikeGlow(this.aiPulse);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes.length = 0;
    this.root.removeFromParent();
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) material.dispose();
    });
  }
}
