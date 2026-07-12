import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const game = new Game(canvas);
game.start();

// Testing hook: `?autostart=1` clicks through the title screen so automated
// canvas inspection can capture active play. Harmless for players.
if (new URLSearchParams(window.location.search).get('autostart') === '1') {
  window.setTimeout(() => {
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight * 0.75,
        pointerId: 1,
        bubbles: true,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight * 0.75,
        pointerId: 1,
        bubbles: true,
      }),
    );
  }, 400);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
