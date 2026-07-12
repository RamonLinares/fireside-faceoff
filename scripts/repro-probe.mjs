import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));

await page.goto('http://127.0.0.1:5196/');
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
console.log('frame>10 ok');

const canvas = page.locator('#game-canvas');
const box = await canvas.boundingBox();
console.log('canvas box:', JSON.stringify(box));

// exact same click as the failing test
await canvas.click({ position: { x: box.width / 2, y: box.height * 0.92 }, timeout: 8000 })
  .then(() => console.log('canvas.click done'))
  .catch((e) => console.log('canvas.click FAILED:', e.message.split('\n').slice(0, 6).join(' | ')));

for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return { state: d.state, frame: d.frame, audio: d.audio.contextState, music: d.audio.musicOn };
  });
  console.log(`t=${i + 1}s`, JSON.stringify(s));
}
await browser.close();
