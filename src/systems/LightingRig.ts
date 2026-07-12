import * as THREE from 'three';

/**
 * Diorama lighting: warm lamp key (the only shadow caster), cool window
 * fill, soft dusk hemisphere, and a subtle rim to separate the toys from the
 * playfield. Tuned so the cream playfield and dark puck stay the highest
 * contrast pairing on screen.
 */
export class LightingRig {
  private readonly lights: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, lampAnchor: THREE.Vector3) {
    // Dusk ambience: cool sky, warm wood floor bounce.
    const hemisphere = new THREE.HemisphereLight('#93a5c9', '#584434', 0.85);
    this.lights.push(hemisphere);

    // Warm key from the table lamp — casts the one real shadow map.
    const key = new THREE.SpotLight('#ffc98a', 26, 8, 1.05, 0.7, 1.6);
    key.shadow.radius = 6;
    key.position.copy(lampAnchor);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
    this.lights.push(key, key.target);

    // Small point light inside the lamp shade for local warm pooling.
    const lampPoint = new THREE.PointLight('#ffb35c', 1.4, 2.4, 1.8);
    lampPoint.position.copy(lampAnchor);
    this.lights.push(lampPoint);

    // Cool fill from the window (soft, no shadow).
    const fill = new THREE.DirectionalLight('#9db4e6', 1.1);
    fill.position.set(-2.2, 1.6, -1.6);
    fill.target.position.set(0.4, 0, 0.4);
    this.lights.push(fill, fill.target);

    // Gentle warm rim from behind the player to lift mallet/puck edges.
    const rim = new THREE.DirectionalLight('#f7dcc0', 0.35);
    rim.position.set(0.6, 1.4, 2.2);
    rim.target.position.set(0, 0, -0.4);
    this.lights.push(rim, rim.target);

    for (const light of this.lights) scene.add(light);
  }

  dispose(scene: THREE.Scene): void {
    for (const light of this.lights) {
      scene.remove(light);
      (light as Partial<THREE.Light>).dispose?.();
    }
    this.lights.length = 0;
  }
}
