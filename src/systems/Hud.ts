/**
 * DOM/CSS overlay UI for every game state: title, gameplay HUD (wooden
 * scoreboard + pause/mute icon buttons), goal banner, pause menu, game over.
 *
 * The Hud never mutates game rules — it renders what the Game pushes in and
 * dispatches player intents (start/resume/restart/pause/mute) back out via
 * callbacks. Mute state lives in the shared `settings` store.
 */
import type { Side } from '../core/Events';
import { settings } from './Settings';

export interface HudIntents {
  start(): void;
  resume(): void;
  restart(): void;
  togglePause(): void;
}

const GOAL_LINES = ['Goal!', 'What a shot!', 'Lovely strike!'];
const CONCEDE_LINES = ['Ooh, so close!', 'They snuck one in…', 'Shake it off!'];

export class Hud {
  // Gameplay HUD
  private readonly scorePlayer = this.getElement('#score-player');
  private readonly scoreAi = this.getElement('#score-ai');
  private readonly matchPoint = this.getElement('#match-point');
  private readonly btnPause = this.getElement<HTMLButtonElement>('#btn-pause');
  private readonly btnMute = this.getElement<HTMLButtonElement>('#btn-mute');

  // Banner
  private readonly banner = this.getElement('#banner');
  private readonly bannerText = this.getElement('#banner-text');

  // Overlays
  private readonly titleOverlay = this.getElement('#title-overlay');
  private readonly pauseOverlay = this.getElement('#pause-overlay');
  private readonly gameoverOverlay = this.getElement('#gameover-overlay');
  private readonly btnPlay = this.getElement<HTMLButtonElement>('#btn-play');
  private readonly btnResume = this.getElement<HTMLButtonElement>('#btn-resume');
  private readonly btnRestart = this.getElement<HTMLButtonElement>('#btn-restart');
  private readonly btnMuteMenu = this.getElement<HTMLButtonElement>('#btn-mute-menu');
  private readonly btnAgain = this.getElement<HTMLButtonElement>('#btn-again');
  private readonly gameoverKicker = this.getElement('#gameover-kicker');
  private readonly gameoverTitle = this.getElement('#gameover-title');
  private readonly finalPlayer = this.getElement('#final-player');
  private readonly finalAi = this.getElement('#final-ai');
  private readonly gameoverStats = this.getElement('#gameover-stats');

  // Cached to avoid DOM churn from per-frame updates.
  private lastPlayer = -1;
  private lastAi = -1;
  private lastMatchPoint: Side | 'both' | 'none' = 'none';
  private bannerTimeout: number | undefined;
  private readonly unsubscribeMute: () => void;

  constructor(private readonly intents: HudIntents) {
    this.wireButton(this.btnPlay, () => this.intents.start());
    this.wireButton(this.btnResume, () => this.intents.resume());
    this.wireButton(this.btnRestart, () => this.intents.restart());
    this.wireButton(this.btnAgain, () => this.intents.restart());
    this.wireButton(this.btnPause, () => this.intents.togglePause());
    this.wireButton(this.btnMute, () => settings.toggleMuted());
    this.wireButton(this.btnMuteMenu, () => settings.toggleMuted());

    this.unsubscribeMute = settings.onChange(() => this.renderMuteState());
    this.renderMuteState();
  }

  dispose(): void {
    this.unsubscribeMute();
    window.clearTimeout(this.bannerTimeout);
  }

  // ------------------------------------------------------------- gameplay

  /** Called every frame; only touches the DOM when values change. */
  updateScore(player: number, ai: number, matchPoint: Side | 'both' | 'none'): void {
    if (player !== this.lastPlayer) {
      this.lastPlayer = player;
      this.scorePlayer.textContent = String(player);
    }
    if (ai !== this.lastAi) {
      this.lastAi = ai;
      this.scoreAi.textContent = String(ai);
    }
    if (matchPoint !== this.lastMatchPoint) {
      this.lastMatchPoint = matchPoint;
      this.matchPoint.hidden = matchPoint === 'none';
      this.matchPoint.textContent =
        matchPoint === 'player'
          ? 'match point — you!'
          : matchPoint === 'ai'
            ? 'match point — rival'
            : 'match point!';
    }
  }

  /** Brief celebratory banner during the 'goal' state. */
  showGoal(scorer: Side): void {
    const lines = scorer === 'player' ? GOAL_LINES : CONCEDE_LINES;
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.showBanner(line, scorer === 'player' ? 'rose' : 'teal', 1300);
  }

  /** Small toast while serving. */
  showServe(): void {
    this.showBanner('Get ready…', 'neutral', 850);
  }

  hideBanner(): void {
    window.clearTimeout(this.bannerTimeout);
    this.banner.classList.remove('visible');
  }

  // -------------------------------------------------------------- overlays

  showTitle(): void {
    this.setOverlay(this.titleOverlay, true);
    this.setOverlay(this.pauseOverlay, false);
    this.setOverlay(this.gameoverOverlay, false);
    this.hideBanner();
    this.setHudButtonsEnabled(false);
  }

  /** Entering play (serving/playing). Hides menus, enables HUD buttons. */
  showGameplay(): void {
    this.setOverlay(this.titleOverlay, false);
    this.setOverlay(this.pauseOverlay, false);
    this.setOverlay(this.gameoverOverlay, false);
    this.setHudButtonsEnabled(true);
  }

  setPaused(paused: boolean): void {
    this.setOverlay(this.pauseOverlay, paused);
    this.btnPause.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
    if (paused) this.hideBanner();
  }

  showGameOver(winner: Side, player: number, ai: number, longestRally: number): void {
    const won = winner === 'player';
    this.gameoverKicker.textContent = won ? 'what a match' : 'a valiant effort';
    this.gameoverTitle.textContent = won ? 'You did it! ⭐' : 'Next time, champ';
    this.finalPlayer.textContent = String(player);
    this.finalAi.textContent = String(ai);
    this.gameoverStats.textContent =
      longestRally > 1 ? `longest rally: ${longestRally} hits` : '';
    this.hideBanner();
    this.setOverlay(this.pauseOverlay, false);
    this.setOverlay(this.gameoverOverlay, true);
    this.setHudButtonsEnabled(false);
  }

  // -------------------------------------------------------------- internals

  private showBanner(text: string, tone: 'rose' | 'teal' | 'neutral', holdMs: number): void {
    window.clearTimeout(this.bannerTimeout);
    this.bannerText.textContent = text;
    this.banner.classList.remove('banner-rose', 'banner-teal', 'banner-neutral');
    this.banner.classList.add(`banner-${tone}`, 'visible');
    this.bannerTimeout = window.setTimeout(() => {
      this.banner.classList.remove('visible');
    }, holdMs);
  }

  private setOverlay(overlay: HTMLElement, visible: boolean): void {
    overlay.hidden = !visible;
  }

  private setHudButtonsEnabled(enabled: boolean): void {
    // Pause makes no sense on title/gameover; mute is always available.
    this.btnPause.disabled = !enabled;
  }

  private renderMuteState(): void {
    const muted = settings.muted;
    this.btnMute.classList.toggle('is-muted', muted);
    this.btnMute.setAttribute('aria-pressed', String(muted));
    this.btnMute.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    this.btnMuteMenu.textContent = muted ? 'Sound: off' : 'Sound: on';
    this.btnMuteMenu.setAttribute('aria-pressed', String(muted));
  }

  private wireButton(button: HTMLButtonElement, action: () => void): void {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      action();
      button.blur(); // keep Space/Enter from re-triggering the last button
    });
  }

  private getElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
