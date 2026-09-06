import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function finishPractice(page: import('@playwright/test').Page): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await page.locator('.phase-panel .game-card').first().click();
    if (round < 2) await expect(page.getByText(`Draft ${round + 2} of 3`)).toBeVisible();
  }
  for (let round = 0; round < 3; round += 1) {
    await page.locator('.battle-choice .game-card').first().click();
    await page.getByRole('button', { name: 'Advance Use the red number.' }).click();
    await page.getByRole('button', { name: 'Lock card and tactic' }).click();
  }
}

test('@claim:practice-complete completes a full practice game from draft to result', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('Demo — sample data, nothing is saved')).toBeVisible();
  await expect(page.getByText('Draft 1 of 3')).toBeVisible();
  await finishPractice(page);
  await expect(page.getByRole('heading', { name: /won the duel/ })).toBeVisible();
  await expect(page.getByText('Three battles are settled.')).toBeVisible();
});

test('@claim:demo-reset resets the sample without changing real room storage', async ({ page }) => {
  await page.goto('/demo');
  await page.evaluate(() => localStorage.setItem('pocket-draft-duel:room:REAL12', 'real-token'));
  await page.locator('.phase-panel .game-card').first().click();
  await expect(page.getByText('Draft 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByText('Draft 1 of 3')).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('pocket-draft-duel:room:REAL12'))).resolves.toBe('real-token');
});

test('@claim:demo-local-only keeps practice requests on the product origin', async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/demo');
  await page.locator('.phase-panel .game-card').first().click();
  await expect(page.getByText('Draft 2 of 3')).toBeVisible();
  const origin = new URL(baseURL!).origin;
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
});

test('@claim:keyboard-draft lets a player lock a practice draft card with the keyboard', async ({ page }) => {
  await page.goto('/demo');
  const firstCard = page.locator('.phase-panel .game-card').first();
  await firstCard.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Draft 2 of 3')).toBeVisible();
});

test('@claim:settings-persist keeps the demo motion setting after reload', async ({ page }) => {
  await page.goto('/demo');
  await page.getByText('Settings', { exact: true }).click();
  await page.locator('[data-setting="motion"]').selectOption('reduced');
  await page.reload();
  await expect(page.locator('[data-setting="motion"]')).toHaveValue('reduced');
});

test('@claim:no-account-practice starts the practice game without a sign-in step', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Choose one shared card' })).toBeVisible();
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
});

test('@claim:no-third-party-requests loads the practice game without third-party requests', async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/demo');
  const origin = new URL(baseURL!).origin;
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
});

test('stops an invalid room reconnect and keeps the room code ready to join again', async ({ page }) => {
  let reconnectRequests = 0;
  await page.addInitScript(() => localStorage.setItem('pocket-draft-duel:room:STALE1', 'stale-token'));
  await page.route(/\/api\/rooms\/STALE1\?token=stale-token$/, async (route) => {
    reconnectRequests += 1;
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'This reconnect token does not match the room.' }) });
  });
  await page.goto('/?room=STALE1');
  await expect(page.getByRole('alert')).toHaveText(/cannot reconnect this seat/i);
  await expect(page.locator('form[data-form="join-room"] input[name="code"]')).toHaveValue('STALE1');
  await page.waitForTimeout(500);
  expect(reconnectRequests).toBe(1);
  await expect(page.evaluate(() => localStorage.getItem('pocket-draft-duel:room:STALE1'))).resolves.toBeNull();
});

test('shows a stable join path when a room link has no saved reconnect token', async ({ page }) => {
  let roomRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/rooms/NOCODE')) roomRequests += 1;
  });
  await page.goto('/?room=NOCODE');
  await expect(page.getByRole('alert')).toHaveText(/does not have a reconnect token/i);
  await expect(page.locator('form[data-form="join-room"] input[name="code"]')).toHaveValue('NOCODE');
  expect(roomRequests).toBe(0);
});

test('keeps demo exits and site links at least 44 pixels tall and wide', async ({ page }) => {
  const expectTouchTarget = async (locator: import('@playwright/test').Locator) => {
    const box = await locator.boundingBox();
    expect(box, 'The control should have a visible box.').not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  };
  await page.goto('/demo');
  await expectTouchTarget(page.getByRole('button', { name: 'Reset demo' }));
  await expectTouchTarget(page.getByRole('link', { name: 'Start for real' }));
  await page.goto('/');
  await expectTouchTarget(page.getByRole('link', { name: 'Pocket Draft Duel home' }));
  await expectTouchTarget(page.locator('footer').getByRole('link', { name: 'Privacy' }));
  await expectTouchTarget(page.locator('footer').getByRole('link', { name: 'Terms' }));
});

test('has no serious or critical accessibility issues on the first practice screen', async ({ page }) => {
  await page.goto('/demo');
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious).toEqual([]);
});

test('uses route titles, designed not-found content, and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/privacy');
  await expect(page).toHaveTitle('Privacy — Pocket Draft Duel');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy');
  await page.goto('/not-a-real-page');
  await expect(page).toHaveTitle('Page not found — Pocket Draft Duel');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('not on this sheet');
  expect(errors).toEqual([]);
});
