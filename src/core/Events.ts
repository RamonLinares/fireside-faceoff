/**
 * Tiny typed event bus. Audio/VFX/UI agents subscribe to gameplay events here
 * without coupling to game internals.
 */

export type Side = 'player' | 'ai';

export interface GameEventMap {
  /** Puck struck by a mallet. speed = puck speed after impact (units/s). */
  puckHitMallet: { speed: number; side: Side };
  /** Puck bounced off a wall or goal post. speed = puck speed at impact. */
  puckHitWall: { speed: number };
  /** A goal was scored. side = who scored the point. */
  goalScored: { side: Side };
  /** Match finished. side = winner. */
  gameWon: { side: Side };
  /** A new serve just happened. toward = who receives the puck. */
  serve: { toward: Side };
  /** Any state-advancing click/tap (start, restart). */
  uiClick: undefined;
}

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

export class EventBus {
  private readonly handlers = new Map<keyof GameEventMap, Set<Handler<keyof GameEventMap>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<keyof GameEventMap>);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEventMap>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as Handler<keyof GameEventMap>);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<K>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
