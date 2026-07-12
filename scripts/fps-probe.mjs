// Quick headless FPS probe: with music vs with the mp3 request blocked.
import { chromium } from '@playwright/test';

const url = process.env.URL ?? 'http://127.0.0.1:5195/?test=1';
const blockMusic = process.argv.includes('--block-music');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (blockMusic) await page.route('**/*.mp3', (route) => route.abort());

await page.goto(url);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
await page.mouse.click(640, 660); // gesture: start game + unlock audio

for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return { frame: d.frame, state: d.state, audio: d.audio };
  });
  const fps = i === 0 ? null : ((s.frame - prev.frame) / 2).toFixed(1);
  console.log(`t=${(i + 1) * 2}s state=${s.state} frame=${s.frame} fps=${fps} music=${s.audio.musicOn}/${s.audio.musicLoaded} ambience=${s.audio.ambienceOn} ctx=${s.audio.contextState}`);
  var prev = s;
}
await browser.close();
