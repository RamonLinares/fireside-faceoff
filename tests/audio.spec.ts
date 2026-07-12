import { expect, test } from '@playwright/test';

/**
 * Verifies the procedural audio system wires up end-to-end:
 * gesture unlock -> AudioContext running -> voices fired by gameplay events
 * -> ambience follows play/pause -> mute flag mirrored in diagnostics.
 */
test('audio unlocks on gesture, fires voices, and follows pause/mute', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

  // Before any gesture: context not created yet.
  expect(
    await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.contextState),
  ).toBe('none');

  // Real click = trusted user gesture: unlocks audio AND starts the match
  // (which emits uiClick + serve, so synthesized voices must fire).
  await page.locator('#btn-play').click();
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state))
    .toBe('playing');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.contextState))
    .toBe('running');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.unlocked))
    .toBe(true);
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.voicesFired ?? 0))
    .toBeGreaterThan(0);

  // Ambience bed runs while playing.
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.ambienceOn))
    .toBe(true);

  // Background music decodes after the gesture and loops while playing.
  await expect
    .poll(
      async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.musicLoaded),
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.musicOn))
    .toBe(true);

  // Pause stops ambience + music cleanly; resume restarts them (idempotent).
  await page.keyboard.press('KeyP');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.ambienceOn))
    .toBe(false);
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.musicOn))
    .toBe(false);
  await page.keyboard.press('KeyP');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.ambienceOn))
    .toBe(true);
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.musicOn))
    .toBe(true);

  // A goal jingle: force gameover through the QA hook after real play started.
  const voicesBefore = await page.evaluate(
    () => window.__THREE_GAME_DIAGNOSTICS__?.audio.voicesFired ?? 0,
  );
  await page.keyboard.press('KeyM'); // mute toggles diagnostics flag
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.muted))
    .toBe(true);
  await page.keyboard.press('KeyM');
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.muted))
    .toBe(false);

  // Restart (uiClick voice) proves event-driven voices keep firing.
  await page.evaluate(() => window.__GAME_TEST__?.forceState('gameover'));
  await page.locator('#btn-again').click();
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.audio.voicesFired ?? 0))
    .toBeGreaterThan(voicesBefore);

  // No audio-related console/page errors.
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
