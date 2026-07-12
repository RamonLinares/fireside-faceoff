import * as THREE from 'three';
import { getMaterial } from '../MaterialLibrary';
import { FLOOR_Y } from './heroTable';

/**
 * Strings of fairy lights draped across the corner walls — instanced emissive
 * bulbs hanging from sagging wires. `update(dt)` twinkles the bulbs;
 * `excite(seconds)` makes them sparkle faster (goal / win celebration).
 */

const BULB_COLORS = ['#ffbe6e', '#ff9d8a', '#8fe3da', '#f3d9a4', '#c9e8a8'];

interface Strand {
  curve: THREE.CatmullRomCurve3;
  bulbCount: number;
}

export class FairyLights {
  readonly root = new THREE.Group();
  private readonly bulbs: THREE.InstancedMesh;
  private readonly phases: Float32Array;
  private readonly baseColors: THREE.Color[] = [];
  private readonly workColor = new THREE.Color();
  private time = Math.random() * 10;
  private excitement = 0;

  constructor() {
    this.root.name = 'fairy-lights';

    const strands: Strand[] = [
      {
        // Along the back wall, dipping over the table's far end.
        curve: new THREE.CatmullRomCurve3([
          new THREE.Vector3(-2.26, FLOOR_Y + 1.78, -1.96),
          new THREE.Vector3(-1.1, FLOOR_Y + 1.28, -1.96),
          new THREE.Vector3(0.1, FLOOR_Y + 1.12, -1.96),
          new THREE.Vector3(1.3, FLOOR_Y + 1.34, -1.96),
          new THREE.Vector3(2.5, FLOOR_Y + 1.86, -1.96),
        ]),
        bulbCount: 22,
      },
      {
        // Along the left wall toward the camera.
        curve: new THREE.CatmullRomCurve3([
          new THREE.Vector3(-2.26, FLOOR_Y + 1.78, -1.9),
          new THREE.Vector3(-2.26, FLOOR_Y + 1.3, -0.7),
          new THREE.Vector3(-2.26, FLOOR_Y + 1.2, 0.4),
          new THREE.Vector3(-2.26, FLOOR_Y + 1.5, 1.6),
        ]),
        bulbCount: 16,
      },
    ];

    // Wires.
    const wireMaterial = getMaterial('feltDark');
    for (const strand of strands) {
      const wire = new THREE.Mesh(new THREE.TubeGeometry(strand.curve, 32, 0.0045, 5), wireMaterial);
      wire.name = 'fairy-wire';
      this.root.add(wire);
    }

    // Instanced bulbs.
    const total = strands.reduce((sum, s) => sum + s.bulbCount, 0);
    const bulbGeometry = new THREE.SphereGeometry(0.02, 8, 6);
    const bulbMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, total);
    this.bulbs.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.phases = new Float32Array(total);

    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    let index = 0;
    for (const strand of strands) {
      for (let i = 0; i < strand.bulbCount; i += 1) {
        strand.curve.getPoint((i + 0.5) / strand.bulbCount, point);
        point.y -= 0.028; // Hang below the wire.
        matrix.setPosition(point);
        this.bulbs.setMatrixAt(index, matrix);
        this.phases[index] = Math.random() * Math.PI * 2;
        const color = new THREE.Color(BULB_COLORS[index % BULB_COLORS.length]);
        this.baseColors.push(color);
        this.bulbs.setColorAt(index, color);
        index += 1;
      }
    }
    this.bulbs.name = 'fairy-bulbs';
    this.root.add(this.bulbs);
  }

  /** Speed up + brighten the twinkle for `seconds` (goal/win celebration). */
  excite(seconds: number): void {
    this.excitement = Math.max(this.excitement, seconds);
  }

  update(dt: number): void {
    const excited = this.excitement > 0;
    this.excitement = Math.max(0, this.excitement - dt);
    this.time += dt * (excited ? 7 : 1.6);

    const lift = excited ? 0.75 : 0.45;
    for (let i = 0; i < this.phases.length; i += 1) {
      const twinkle = 0.72 + Math.sin(this.time + this.phases[i]) * lift * 0.5 + lift * 0.28;
      this.workColor.copy(this.baseColors[i]).multiplyScalar(twinkle);
      this.bulbs.setColorAt(i, this.workColor);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}
