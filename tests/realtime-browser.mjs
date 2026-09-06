import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const dataDir = await mkdtemp(join(tmpdir(), 'pocket-draft-duel-browser-'));
let roomProcess;
let webProcess;
let browser;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitFor(url) {
  for (let retry = 0; retry < 80; retry += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* wait for the owned process */ }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function check(value, message) { if (!value) throw new Error(message); }
function stop(child) { if (child && !child.killed) child.kill('SIGTERM'); }

try {
  roomProcess = spawn('cargo', ['run', '--quiet'], {
    cwd: join(root, 'realtime'),
    env: { ...process.env, DATA_DIR: dataDir, PORT: '18788' },
    stdio: 'ignore',
  });
  await waitFor('http://127.0.0.1:18788/health');
  webProcess = spawn('npm', ['run', 'dev', '--', '--port', '4174'], {
    cwd: root,
    env: { ...process.env, VITE_REALTIME_URL: 'http://127.0.0.1:18788' },
    stdio: 'ignore',
  });
  await waitFor('http://127.0.0.1:4174/');

  browser = await chromium.launch();
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto('http://127.0.0.1:4174/');
  const hostForm = host.locator('form[data-form="host-room"]');
  await hostForm.getByLabel('Your name').fill('Avery');
  await hostForm.getByLabel('Players').selectOption('2');
  await hostForm.getByRole('button', { name: 'Create room code' }).click();
  await host.waitForURL(/\?room=/);
  const code = new URL(host.url()).searchParams.get('room');
  check(code && /^[A-Z0-9]{6}$/.test(code), 'Host did not receive a usable room code.');

  await guest.goto('http://127.0.0.1:4174/');
  const guestForm = guest.locator('form[data-form="join-room"]');
  await guestForm.getByLabel('Room code').fill(code);
  await guestForm.getByLabel('Your name').fill('Blair');
  await guestForm.getByRole('button', { name: 'Join room' }).click();
  await guest.waitForURL(/\?room=/);

  await host.reload();
  await host.getByRole('button', { name: 'Start the draft' }).click();
  for (let round = 0; round < 3; round += 1) {
    await host.locator('.phase-panel .game-card').first().click();
    await guest.locator('.phase-panel .game-card').first().click();
    if (round < 2) await host.getByText(`Draft ${round + 2} of 3`).waitFor();
  }
  for (let round = 0; round < 3; round += 1) {
    await host.locator('.battle-choice .game-card').first().click();
    await host.getByRole('button', { name: 'Advance Use the red number.' }).click();
    await host.getByRole('button', { name: 'Lock card and tactic' }).click();
    await guest.locator('.battle-choice .game-card').first().click();
    await guest.getByRole('button', { name: 'Brace Use the green number.' }).click();
    await guest.getByRole('button', { name: 'Lock card and tactic' }).click();
    if (round < 2) await host.getByText(`Battle ${round + 2} of 3`).waitFor();
  }
  await host.getByRole('heading', { name: /won the duel/ }).waitFor();
  await host.screenshot({ path: join(dataDir, 'real-room-result.png'), fullPage: true });
  await host.reload();
  await host.getByRole('heading', { name: /won the duel/ }).waitFor();
  console.log('realtime browser passed: two independent browsers completed a room, saw a result, and reconnected after reload');
} finally {
  await browser?.close();
  stop(webProcess);
  stop(roomProcess);
  await rm(dataDir, { recursive: true, force: true });
}
