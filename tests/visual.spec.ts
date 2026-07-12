import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

type CanvasSample = {
  ok: boolean;
  reason: string;
  variance?: number;
  colorBuckets?: number;
};

async function sampleCanvas(page: import('@playwright/test').Page): Promise<CanvasSample> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) {
    return { ok: false, reason: 'canvas-too-small' };
  }

  const buffer = await canvas.screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  let alphaPixels = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));

  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) alphaPixels += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
  }

  const variance = max - min;
  return {
    ok: alphaPixels > 256 && (variance > 8 || buckets.size > 3),
    reason: 'sampled',
    variance,
    colorBuckets: buckets.size,
  };
}

test('renders and plays a round of air hockey', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });

  // Title state: overlay shown, then tap-anywhere (below the card) to start.
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state)).toBe('title');
  await expect(page.locator('#title-overlay')).toBeVisible();
  const startBox = await canvas.boundingBox();
  expect(startBox).not.toBeNull();
  await canvas.click({
    position: { x: startBox!.width / 2, y: startBox!.height * 0.92 },
  });
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state))
    .toBe('playing');
  await expect(page.locator('#title-overlay')).toBeHidden();

  // Drag the pointer across the player's half and verify the mallet chases it.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.playerMallet.x ?? 0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.75);
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.75, { steps: 8 });
    await expect
      .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.playerMallet.x ?? 0))
      .toBeGreaterThan(before + 0.08);
  }

  // Pause freezes the state, resume restores it.
  await page.keyboard.press('KeyP');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.paused))
    .toBe(true);
  await page.keyboard.press('KeyP');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.paused))
    .toBe(false);

  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-game`, {
    body: screenshot,
    contentType: 'image/png',
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('UI overlays: title, pause menu, mute, game over', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

  // Title: Play button starts the match.
  await expect(page.locator('#title-overlay')).toBeVisible();
  await page.locator('#btn-play').click();
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state))
    .toBe('playing');

  // Pause via icon button; resume via menu button.
  await page.locator('#btn-pause').click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.paused))
    .toBe(true);
  await page.locator('#btn-resume').click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.paused))
    .toBe(false);

  // Mute: button toggles, persists to localStorage, M key toggles back.
  await page.locator('#btn-mute').click();
  await expect(page.locator('#btn-mute')).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() => window.localStorage.getItem('dusk-air-hockey.muted')),
  ).toBe('1');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#btn-mute')).toHaveAttribute('aria-pressed', 'false');

  // Match point indicator via the dev hook.
  await page.evaluate(() => window.__GAME_TEST__?.setScore(6, 2));
  await expect(page.locator('#match-point')).toBeVisible();

  // Game over via the dev hook; Play Again resets scores and overlay.
  await page.evaluate(() => window.__GAME_TEST__?.forceState('gameover'));
  await expect(page.locator('#gameover-overlay')).toBeVisible();
  await expect(page.locator('#final-player')).toHaveText('6');
  await expect(page.locator('#final-ai')).toHaveText('2');
  await page.locator('#btn-again').click();
  await expect(page.locator('#gameover-overlay')).toBeHidden();
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.scores.player))
    .toBe(0);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
