/**
 * Raw input collection, decoupled from simulation. Pointer position is kept
 * in NDC space; the Game raycasts it onto the table plane.
 *
 * Keyboard: P/Escape = pause toggle, R = restart (consumed by Game when in
 * gameover), M = mute (reserved for the audio agent; queued but unused).
 */
export class InputController {
  /** Pointer position in NDC (-1..1). Valid while `pointerActive`. */
  ndcX = 0;
  ndcY = 0;
  /** True while we have a live pointer position (until pointerup/cancel/blur/leave). */
  pointerActive = false;
  /** True while a pointer button/touch is held down. */
  pointerDown = false;

  /**
   * Set whenever a pointer event updates the NDC position; consumed by the
   * player controller. Guarantees a fast tap (down+up between two frames,
   * which also clears `pointerActive` via the trailing pointerleave on touch)
   * still registers as a one-frame move target.
   */
  private pointerDirty = false;

  private clickQueued = false;
  private pauseQueued = false;
  private restartQueued = false;
  private muteQueued = false;

  private readonly onPointerMove = (event: PointerEvent) => {
    this.updateNdc(event);
    this.pointerActive = true;
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.updateNdc(event);
    this.pointerActive = true;
    this.pointerDown = true;
    this.clickQueued = true;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events may not have a capturable pointer id.
    }
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.updateNdc(event);
    this.pointerDown = false;
  };

  private readonly onPointerCancel = () => {
    this.pointerDown = false;
    this.pointerActive = false;
  };

  private readonly onBlur = () => {
    this.pointerDown = false;
    this.pointerActive = false;
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'KeyP' || event.code === 'Escape') {
      this.pauseQueued = true;
    } else if (event.code === 'KeyR') {
      this.restartQueued = true;
    } else if (event.code === 'KeyM') {
      this.muteQueued = true;
    }
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerCancel);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** One-shot: did any pointer event update the NDC position since last consume? */
  consumePointerDirty(): boolean {
    const value = this.pointerDirty;
    this.pointerDirty = false;
    return value;
  }

  /** One-shot: was there a click/tap since last consume? */
  consumeClick(): boolean {
    const value = this.clickQueued;
    this.clickQueued = false;
    return value;
  }

  consumePauseToggle(): boolean {
    const value = this.pauseQueued;
    this.pauseQueued = false;
    return value;
  }

  consumeRestart(): boolean {
    const value = this.restartQueued;
    this.restartQueued = false;
    return value;
  }

  consumeMuteToggle(): boolean {
    const value = this.muteQueued;
    this.muteQueued = false;
    return value;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerleave', this.onPointerCancel);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private updateNdc(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerDirty = true;
  }
}
