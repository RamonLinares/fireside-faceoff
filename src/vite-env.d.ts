/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  state: 'title' | 'serving' | 'playing' | 'goal' | 'gameover';
  paused: boolean;
  scores: { player: number; ai: number };
  puck: {
    position: { x: number; z: number };
    velocity: { x: number; z: number };
    speed: number;
  };
  playerMallet: { x: number; z: number };
  aiMallet: { x: number; z: number; mode: string };
  physics: {
    engine: 'custom-2d';
    timestep: number;
    bodies: number;
    substeps: number;
  };
  input: {
    pointerActive: boolean;
    pointerDown: boolean;
    ndc: { x: number; y: number };
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  assets: {
    meshes: number;
    instancedMeshes: number;
  };
  audio: {
    unlocked: boolean;
    contextState: string;
    activeVoices: number;
    voicesFired: number;
    ambienceOn: boolean;
    muted: boolean;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
  };
}

/** QA state-driving hook — present only in dev builds or with `?test=1`. */
interface GameTestHook {
  setScore(player: number, ai: number): void;
  forceState(state: 'title' | 'serving' | 'playing' | 'goal' | 'gameover'): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __GAME_TEST__?: GameTestHook;
}
