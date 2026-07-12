import * as THREE from 'three';
import { disposeMaterialLibrary } from '../assets/MaterialLibrary';
import { Environment } from '../assets/modelFactories/environment';
import { EventBus, type Side } from '../core/Events';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Mallet } from '../entities/Mallet';
import { Puck } from '../entities/Puck';
import { Table } from '../entities/Table';
import { AiController } from '../systems/AiController';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { Hud } from '../systems/Hud';
import { LightingRig } from '../systems/LightingRig';
import { settings } from '../systems/Settings';
import { PlayerController } from '../systems/PlayerController';
import { VfxSystem } from '../systems/VfxSystem';
import { PHYSICS, RULES, TABLE } from './constants';
import { Physics, type PhysicsListener } from './Physics';

export type GameState = 'title' | 'serving' | 'playing' | 'goal' | 'gameover';

const PLAYER_MALLET_START_Z = TABLE.halfLength * 0.6;
const AI_MALLET_START_Z = -TABLE.halfLength * 0.75;

export class Game {
  /** Gameplay event bus — audio/VFX/UI agents subscribe here. */
  readonly events = new EventBus();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20);
  private readonly input: InputController;
  private readonly hud: Hud;
  private readonly cameraRig: CameraRig;

  /** World group so the environment agent can build around the table. */
  private readonly world = new THREE.Group();
  private readonly table = new Table();
  private readonly puck = new Puck();
  private readonly playerMallet = new Mallet('player-mallet', 'rose', 0, PLAYER_MALLET_START_Z);
  private readonly aiMallet = new Mallet('ai-mallet', 'teal', 0, AI_MALLET_START_Z);
  private readonly environment = new Environment();
  private lightingRig!: LightingRig;
  private vfx!: VfxSystem;
  private readonly audio: AudioSystem;
  private assetCounts = { meshes: 0, instancedMeshes: 0 };

  private readonly physics = new Physics();
  private readonly playerController = new PlayerController(this.playerMallet.body);
  private readonly aiController = new AiController(this.aiMallet.body);
  private readonly malletBodies = [this.playerMallet.body, this.aiMallet.body];

  private readonly loop = new Loop(
    (delta) => this.update(delta),
    () => this.render(),
  );

  private state: GameState = 'title';
  private paused = false;
  private scores = { player: 0, ai: 0 };
  private stateTimer = 0;
  private serveToward: Side = 'player';
  private accumulator = 0;
  private frame = 0;
  private stuckTimer = 0;
  /** Mallet hits since the last goal / the best run this match (UI stat). */
  private currentRally = 0;
  private longestRally = 0;
  /** Dev builds or explicit `?test=1` enable the QA hook + diagnostics. */
  private readonly qaHooksEnabled =
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('test') === '1';

  /** Reused physics listener (hot loop stays allocation-free). */
  private readonly physicsListener: PhysicsListener = {
    onWallHit: (speed) => {
      this.events.emit('puckHitWall', { speed });
      this.cameraRig.impulse(Math.min(speed * 0.05, 0.2));
    },
    onMalletHit: (index, speed) => {
      this.events.emit('puckHitMallet', { speed, side: index === 0 ? 'player' : 'ai' });
      this.cameraRig.impulse(Math.min(speed * 0.08, 0.3));
      this.currentRally += 1;
    },
    onGoal: (concededSide) => this.onGoal(concededSide),
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.input = new InputController(canvas);
    this.cameraRig = new CameraRig(this.camera);
    this.hud = new Hud({
      start: () => this.requestStart(),
      resume: () => this.setPaused(false),
      restart: () => this.requestRestart(),
      togglePause: () => this.setPaused(!this.paused),
    });

    this.audio = new AudioSystem(this.events);

    this.buildScene();
    this.installTestHook();
    if (resizeRenderer(this.renderer, this.camera)) {
      this.cameraRig.frame(this.camera.aspect);
    }
    this.enterTitle();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.hud.dispose();
    window.__GAME_TEST__ = undefined;
    this.vfx.dispose();
    this.audio.dispose();
    this.events.clear();
    this.table.dispose();
    this.puck.dispose();
    this.playerMallet.dispose();
    this.aiMallet.dispose();
    this.environment.dispose();
    this.lightingRig.dispose(this.scene);
    disposeMaterialLibrary();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
  }

  // Explicit update order: input -> fixed physics -> game rules -> camera -> HUD -> render.
  private update(delta: number): void {
    this.frame += 1;

    if (resizeRenderer(this.renderer, this.camera)) {
      this.cameraRig.frame(this.camera.aspect);
    }

    // 1. Input.
    this.handleControlKeys();
    this.handleClicks();
    if (!this.paused) {
      this.playerController.readInput(this.input, this.camera);
    }

    // 2. Fixed-timestep physics (accumulator, dt = 1/120, frame delta
    //    already clamped to maxFrameDelta by the Loop).
    const simulating = !this.paused && (this.state === 'playing' || this.state === 'serving');
    if (simulating) {
      this.accumulator += delta;
      const dt = PHYSICS.fixedDt;
      while (this.accumulator >= dt) {
        this.accumulator -= dt;
        this.fixedStep(dt);
        if (this.state === 'goal' || this.state === 'gameover') break;
      }
    } else {
      this.accumulator = 0;
    }

    // 3. Game rules / state timers.
    if (!this.paused) {
      this.updateStateMachine(delta);
      this.updateStuckPuckRule(delta);
    }

    // Reconcile physics -> visuals in one place.
    this.puck.syncVisual();
    this.playerMallet.syncVisual();
    this.aiMallet.syncVisual();

    // Ambient visuals + event-driven VFX keep breathing even while paused.
    this.environment.update(delta);
    this.vfx.update(delta);

    // Audio follows game state (pause blips, ambience start/stop). Cheap diff.
    this.audio.sync(this.state, this.paused);

    // 4. Camera.
    this.cameraRig.update(delta);

    // 5. HUD (state messages are pushed on transitions; score is cheap).
    const showMatchPoint = this.state === 'gameover' ? 'none' : this.matchPointSide();
    this.hud.updateScore(this.scores.player, this.scores.ai, showMatchPoint);

    this.publishDiagnostics();
    // 6. Render happens in Loop's render callback.
  }

  private fixedStep(dt: number): void {
    this.playerController.fixedUpdate(dt);
    if (this.state === 'playing') {
      this.aiController.fixedUpdate(dt, this.puck.body);
      this.physics.step(this.puck.body, this.malletBodies, dt, this.physicsListener);
    } else {
      // Serving: mallets may move, puck stays put until play begins.
      this.aiController.fixedUpdate(dt, this.puck.body);
    }
  }

  private handleControlKeys(): void {
    if (this.input.consumePauseToggle()) {
      this.setPaused(!this.paused);
    }
    if (this.input.consumeRestart()) {
      if (this.state === 'gameover') this.requestRestart();
    }
    if (this.input.consumeMuteToggle()) {
      settings.toggleMuted();
    }
  }

  private handleClicks(): void {
    if (!this.input.consumeClick()) return;
    if (this.state === 'title') {
      this.requestStart();
    } else if (this.state === 'gameover') {
      this.requestRestart();
    } else if (this.paused) {
      this.setPaused(false);
    }
  }

  /** Intent: start from the title screen (Play button or tap anywhere). */
  private requestStart(): void {
    if (this.state !== 'title') return;
    this.events.emit('uiClick', undefined);
    this.restartMatch();
  }

  /** Intent: restart from pause menu or game over. */
  private requestRestart(): void {
    this.events.emit('uiClick', undefined);
    this.restartMatch();
  }

  /** Intent: pause/resume — only meaningful mid-match. */
  private setPaused(paused: boolean): void {
    if (this.state !== 'playing' && this.state !== 'serving' && this.state !== 'goal') return;
    if (paused === this.paused) return;
    this.paused = paused;
    this.hud.setPaused(paused);
    if (!paused && this.state === 'serving') this.hud.showServe();
  }

  private updateStateMachine(delta: number): void {
    switch (this.state) {
      case 'serving':
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          this.beginPlay();
        }
        break;
      case 'goal':
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          this.serve(this.serveToward);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Faceoff rule: a puck resting deep in the AI half can end up outside the
   * AI mallet's reach (e.g. its own back corner) and deadlock the game — the
   * player can never touch it either. Re-serve toward the AI after a timeout.
   * The player's half is exempt: reaching the puck there is the human's job.
   */
  private updateStuckPuckRule(delta: number): void {
    const stuck =
      this.state === 'playing' &&
      this.puck.body.z < 0 &&
      this.puck.speed < RULES.stuckSpeedThreshold;
    this.stuckTimer = stuck ? this.stuckTimer + delta : 0;
    if (this.stuckTimer >= RULES.stuckTimeoutSeconds) {
      this.stuckTimer = 0;
      this.serve('ai');
    }
  }

  private enterTitle(): void {
    this.state = 'title';
    this.resetPositions('player');
    this.hud.showTitle();
  }

  private restartMatch(): void {
    this.scores.player = 0;
    this.scores.ai = 0;
    this.paused = false;
    this.hud.setPaused(false);
    this.currentRally = 0;
    this.longestRally = 0;
    this.aiController.setDifficulty(0);
    this.serve('player');
  }

  private serve(toward: Side): void {
    this.state = 'serving';
    this.stateTimer = RULES.servePauseSeconds;
    this.serveToward = toward;
    this.resetPositions(toward);
    this.hud.showGameplay();
    this.hud.showServe();
    this.events.emit('serve', { toward });
  }

  private beginPlay(): void {
    this.state = 'playing';
    this.hud.hideBanner();
    // Nudge the puck toward the player who conceded.
    const sign = this.serveToward === 'player' ? 1 : -1;
    this.puck.body.vz = RULES.serveSpeed * sign;
  }

  private resetPositions(puckToward: Side): void {
    const sign = puckToward === 'player' ? 1 : -1;
    this.puck.reset(0, sign * TABLE.halfLength * 0.28);
    this.playerMallet.reset(0, PLAYER_MALLET_START_Z);
    this.aiMallet.reset(0, AI_MALLET_START_Z);
    this.playerController.reset();
    this.aiController.reset();
    this.accumulator = 0;
  }

  /** concededSide = whose goal was breached; the other side scores. */
  private onGoal(concededSide: Side): void {
    const scorer: Side = concededSide === 'player' ? 'ai' : 'player';
    this.scores[scorer] += 1;
    this.events.emit('goalScored', { side: scorer });
    this.cameraRig.impulse(1);
    this.aiController.setDifficulty(this.scores.player);
    this.longestRally = Math.max(this.longestRally, this.currentRally);
    this.currentRally = 0;

    if (this.scores[scorer] >= RULES.winScore) {
      this.state = 'gameover';
      this.events.emit('gameWon', { side: scorer });
      this.hud.showGameOver(scorer, this.scores.player, this.scores.ai, this.longestRally);
    } else {
      this.state = 'goal';
      this.stateTimer = RULES.goalPauseSeconds;
      this.serveToward = concededSide;
      this.hud.showGoal(scorer);
    }
  }

  /** Match point when a side is one goal from winning (rules stay in Game). */
  private matchPointSide(): Side | 'both' | 'none' {
    const playerAt = this.scores.player === RULES.winScore - 1;
    const aiAt = this.scores.ai === RULES.winScore - 1;
    if (playerAt && aiAt) return 'both';
    if (playerAt) return 'player';
    if (aiAt) return 'ai';
    return 'none';
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * QA hook: `window.__GAME_TEST__` lets automation drive states without
   * playing full matches. Gated to dev builds or an explicit `?test=1`.
   */
  private installTestHook(): void {
    if (!this.qaHooksEnabled) return;
    window.__GAME_TEST__ = {
      setScore: (player: number, ai: number) => {
        this.scores.player = Math.max(0, Math.floor(player));
        this.scores.ai = Math.max(0, Math.floor(ai));
        this.aiController.setDifficulty(this.scores.player);
      },
      forceState: (state: GameState) => this.debugForceState(state),
    };
  }

  private debugForceState(state: GameState): void {
    this.paused = false;
    this.hud.setPaused(false);
    switch (state) {
      case 'title':
        this.enterTitle();
        break;
      case 'serving':
        this.serve('player');
        break;
      case 'playing':
        this.serve('player');
        this.beginPlay();
        break;
      case 'goal':
        this.state = 'goal';
        this.stateTimer = RULES.goalPauseSeconds;
        this.serveToward = 'ai';
        this.hud.showGameplay();
        this.hud.showGoal('player');
        break;
      case 'gameover': {
        this.state = 'gameover';
        const winner: Side = this.scores.player >= this.scores.ai ? 'player' : 'ai';
        this.hud.showGameOver(winner, this.scores.player, this.scores.ai, this.longestRally);
        break;
      }
    }
  }

  private buildScene(): void {
    // Deep dusk-blue backdrop (visible past the room shell edges).
    this.scene.background = new THREE.Color('#252c40');

    this.world.name = 'world';
    this.world.add(this.table.root);
    this.world.add(this.puck.root);
    this.world.add(this.playerMallet.root);
    this.world.add(this.aiMallet.root);
    this.world.add(this.environment.root);
    this.scene.add(this.world);

    this.lightingRig = new LightingRig(this.scene, this.environment.lampAnchor);
    this.vfx = new VfxSystem(this.world, this.events, {
      puck: this.puck,
      playerMallet: this.playerMallet,
      aiMallet: this.aiMallet,
      environment: this.environment,
    });

    // One-time asset census for diagnostics.
    let meshes = 0;
    let instancedMeshes = 0;
    this.scene.traverse((object) => {
      if ((object as THREE.InstancedMesh).isInstancedMesh) instancedMeshes += 1;
      else if ((object as THREE.Mesh).isMesh) meshes += 1;
    });
    this.assetCounts = { meshes, instancedMeshes };
  }

  private publishDiagnostics(): void {
    if (!this.qaHooksEnabled) return;
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      state: this.state,
      paused: this.paused,
      scores: { player: this.scores.player, ai: this.scores.ai },
      puck: {
        position: { x: this.puck.body.x, z: this.puck.body.z },
        velocity: { x: this.puck.body.vx, z: this.puck.body.vz },
        speed: this.puck.speed,
      },
      playerMallet: { x: this.playerMallet.body.x, z: this.playerMallet.body.z },
      aiMallet: { x: this.aiMallet.body.x, z: this.aiMallet.body.z, mode: this.aiController.currentMode },
      physics: {
        engine: 'custom-2d',
        timestep: PHYSICS.fixedDt,
        bodies: 3,
        substeps: this.physics.lastSubstepCount,
      },
      input: {
        pointerActive: this.input.pointerActive,
        pointerDown: this.input.pointerDown,
        ndc: { x: this.input.ndcX, y: this.input.ndcY },
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      assets: {
        meshes: this.assetCounts.meshes,
        instancedMeshes: this.assetCounts.instancedMeshes,
      },
      audio: this.audio.diagnostics(),
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
      },
    };
  }
}
