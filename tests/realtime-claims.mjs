import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const realtimeDir = join(root, 'realtime');
const requested = process.argv.find((value) => value.startsWith('@claim:'))
  || process.argv[process.argv.indexOf('--grep') + 1];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${signal || code}`));
    });
  });
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForHealthy(url) {
  const stopAt = Date.now() + 30_000;
  while (Date.now() < stopAt) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* The owned service is still starting. */ }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startService(dataDir, port) {
  const child = spawn(join(realtimeDir, 'target', 'debug', 'pocket-draft-duel-realtime'), [], {
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port) },
    stdio: 'ignore',
  });
  await waitForHealthy(`http://127.0.0.1:${port}/health`);
  return child;
}

async function stop(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function withService(runClaim) {
  const dataDir = await mkdtemp(join(tmpdir(), 'pocket-draft-duel-claim-'));
  const port = 18810 + Math.floor(Math.random() * 300);
  let service;
  const api = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => undefined);
    return { response, json };
  };
  try {
    service = await startService(dataDir, port);
    await runClaim({ api, restart: async () => {
      await stop(service);
      service = await startService(dataDir, port);
    } });
  } finally {
    await stop(service);
    await rm(dataDir, { recursive: true, force: true });
  }
}

function status(result, expected, message) {
  assert.equal(result.response.status, expected, `${message}: ${JSON.stringify(result.json)}`);
  return result.json;
}

async function createRoom(api, playerCount = 2) {
  const created = status(await api('/rooms', {
    method: 'POST', body: { name: 'Avery', players: playerCount, setId: 'marsh' },
  }), 201, 'Room creation should succeed');
  const players = [{ token: created.token, id: created.room.player.id, name: 'Avery' }];
  for (let seat = 2; seat <= playerCount; seat += 1) {
    const joined = status(await api(`/rooms/${created.code}/join`, {
      method: 'POST', body: { name: `Player ${seat}` },
    }), 200, 'Room join should succeed');
    players.push({ token: joined.token, id: joined.room.player.id, name: `Player ${seat}` });
  }
  return { code: created.code, players };
}

async function roomView(api, code, token, headers) {
  return status(await api(`/rooms/${code}?token=${encodeURIComponent(token)}`, { headers }), 200, 'Room read should succeed');
}

async function completeRoom(api, room) {
  status(await api(`/rooms/${room.code}/start`, { method: 'POST', body: { token: room.players[0].token } }), 200, 'Host should start a full room');
  for (let round = 0; round < 3; round += 1) {
    const view = await roomView(api, room.code, room.players[0].token);
    assert.equal(view.status, 'draft', 'The room should expose the next draft round');
    for (const player of room.players) {
      status(await api(`/rooms/${room.code}/draft`, {
        method: 'POST', body: { token: player.token, cardId: view.offers[0] },
      }), 200, 'A visible shared card should lock');
    }
  }
  for (let round = 0; round < 3; round += 1) {
    const views = await Promise.all(room.players.map((player) => roomView(api, room.code, player.token)));
    assert.equal(views[0].status, 'battle', 'The completed draft should start a battle');
    for (let index = 0; index < room.players.length; index += 1) {
      status(await api(`/rooms/${room.code}/battle`, {
        method: 'POST',
        body: { token: room.players[index].token, cardId: views[index].player.cards[0], tactic: index % 2 ? 'brace' : 'advance' },
      }), 200, 'A drafted card and tactic should lock');
    }
  }
  return roomView(api, room.code, room.players[0].token);
}

async function liveRoomCodeClaim() {
  await withService(async ({ api }) => {
    for (const playerCount of [2, 3, 4]) {
      const room = await createRoom(api, playerCount);
      const hostView = await roomView(api, room.code, room.players[0].token);
      assert.equal(hostView.players.length, playerCount, `${playerCount}-player room should fill every seat`);
      assert.equal(hostView.maxPlayers, playerCount, 'The room should retain its chosen player count');
    }
    const completed = await createRoom(api, 2);
    const result = await completeRoom(api, completed);
    assert.equal(result.status, 'result', 'Two independent room clients should reach a result');
    assert.equal(result.records.length, 3, 'A finished room should show all three battles');
    const rematch = status(await api(`/rooms/${completed.code}/rematch`, {
      method: 'POST', body: { token: completed.players[0].token },
    }), 200, 'The host should start a rematch');
    assert.equal(rematch.status, 'draft', 'Rematch should return the same room to Draft 1');
    assert.equal(rematch.draftRound, 1, 'Rematch should begin at the first draft');
    assert.ok(rematch.players.every((player) => player.score === 0), 'Rematch should reset scores');
  });
}

async function privatePicksClaim() {
  await withService(async ({ api }) => {
    const room = await createRoom(api, 2);
    status(await api(`/rooms/${room.code}/start`, { method: 'POST', body: { token: room.players[0].token } }), 200, 'Host should start the room');
    const host = await roomView(api, room.code, room.players[0].token);
    const pick = host.offers[0];
    const hostLocked = status(await api(`/rooms/${room.code}/draft`, {
      method: 'POST', body: { token: room.players[0].token, cardId: pick },
    }), 200, 'Host draft pick should lock');
    assert.equal(hostLocked.status, 'draft', 'The room should wait for the other player');
    const guestView = await roomView(api, room.code, room.players[1].token);
    assert.equal(guestView.status, 'draft', 'A pending choice should not advance the round');
    assert.equal(guestView.lockedCount, 1, 'Only the number of locked choices is public');
    assert.equal(guestView.offers.length, 6, 'The full shared row remains visible while a pick is pending');
    assert.deepEqual(guestView.player.cards, [], 'An opponent hand is not exposed before allocation');
    assert.ok(guestView.players.every((player) => !Object.hasOwn(player, 'cards')), 'Public player rows expose counts, not other hands');
    assert.equal(Object.hasOwn(guestView, 'picks'), false, 'A room response does not disclose pending picks');
    const released = status(await api(`/rooms/${room.code}/draft`, {
      method: 'POST', body: { token: room.players[1].token, cardId: pick },
    }), 200, 'Guest draft pick should lock');
    assert.equal(released.status, 'draft', 'The round should release only after every player locks');
    assert.equal(released.draftRound, 2, 'Both locks should advance to the next shared draft');
  });
}

async function reconnectClaim() {
  await withService(async ({ api, restart }) => {
    const room = await createRoom(api, 2);
    const before = await roomView(api, room.code, room.players[0].token);
    await restart();
    const after = await roomView(api, room.code, room.players[0].token);
    assert.equal(after.code, before.code, 'The same room code should survive a service restart');
    assert.equal(after.player.id, before.player.id, 'The reconnect token should restore the same player seat');
    assert.equal(after.players.length, 2, 'All joined seats should persist after restart');
  });
}

const cardValues = {
  anchor: [1, 5, 2], anvil: [2, 5, 1], arrow: [5, 1, 2], bell: [2, 3, 4],
  crown: [4, 2, 3], compass: [3, 2, 4], fox: [3, 1, 5], gate: [1, 4, 3],
  hammer: [5, 2, 1], horn: [4, 1, 3], key: [2, 2, 5], lantern: [2, 3, 4],
  leaf: [3, 3, 3], owl: [1, 3, 5], shield: [1, 5, 2], star: [4, 3, 1],
  tower: [2, 4, 2], wave: [4, 1, 4],
};
const tacticIndex = { advance: 0, brace: 1, feint: 2 };

function strongest(cards) {
  return cards.flatMap((cardId) => Object.keys(tacticIndex).map((tactic) => ({ cardId, tactic, value: cardValues[cardId][tacticIndex[tactic]] })))
    .sort((left, right) => right.value - left.value)[0];
}

function weakest(cards) {
  return cards.flatMap((cardId) => Object.keys(tacticIndex).map((tactic) => ({ cardId, tactic, value: cardValues[cardId][tacticIndex[tactic]] })))
    .sort((left, right) => left.value - right.value)[0];
}

async function deterministicResolutionClaim() {
  await withService(async ({ api }) => {
    const room = await createRoom(api, 2);
    status(await api(`/rooms/${room.code}/start`, { method: 'POST', body: { token: room.players[0].token } }), 200, 'Host should start the room');
    for (let round = 0; round < 3; round += 1) {
      const view = await roomView(api, room.code, room.players[0].token);
      for (const player of room.players) {
        status(await api(`/rooms/${room.code}/draft`, {
          method: 'POST', body: { token: player.token, cardId: view.offers[0] },
        }), 200, 'Visible cards should complete the draft');
      }
    }
    const hostView = await roomView(api, room.code, room.players[0].token);
    const guestView = await roomView(api, room.code, room.players[1].token);
    const hostPlay = strongest(hostView.player.cards);
    const guestPlay = weakest(guestView.player.cards);
    assert.ok(hostPlay.value > guestPlay.value, 'The test chooses a visibly higher card value');
    status(await api(`/rooms/${room.code}/battle`, { method: 'POST', body: { token: room.players[0].token, cardId: hostPlay.cardId, tactic: hostPlay.tactic } }), 200, 'Host battle choice should lock');
    const battle = status(await api(`/rooms/${room.code}/battle`, { method: 'POST', body: { token: room.players[1].token, cardId: guestPlay.cardId, tactic: guestPlay.tactic } }), 200, 'Guest battle choice should lock');
    const record = battle.records[0];
    const playedHost = record.plays.find((play) => play.playerId === room.players[0].id);
    const playedGuest = record.plays.find((play) => play.playerId === room.players[1].id);
    assert.equal(playedHost.value, hostPlay.value, 'The battle record should use the card’s visible tactic value');
    assert.equal(playedGuest.value, guestPlay.value, 'The battle record should use the opponent’s visible tactic value');
    assert.equal(record.winnerId, room.players[0].id, 'The highest revealed value should win the resolved battle');
  });
}

async function rateLimitClaim() {
  await withService(async ({ api }) => {
    const room = await createRoom(api, 2);
    const headers = { 'x-forwarded-for': '203.0.113.42' };
    for (let request = 0; request < 60; request += 1) {
      const result = await api(`/rooms/${room.code}?token=${encodeURIComponent(room.players[0].token)}`, { headers });
      assert.equal(result.response.status, 200, `Request ${request + 1} should be within the per-minute allowance`);
    }
    const limited = await api(`/rooms/${room.code}?token=${encodeURIComponent(room.players[0].token)}`, { headers });
    assert.equal(limited.response.status, 429, 'The request after the allowance should be rate limited');
    assert.equal(limited.response.headers.get('retry-after'), '60', 'A rate-limited room request should tell the client when to retry');
  });
}

async function rotatingDraftPriorityClaim() {
  await withService(async ({ api }) => {
    const room = await createRoom(api, 3);
    status(await api(`/rooms/${room.code}/start`, {
      method: 'POST', body: { token: room.players[0].token },
    }), 200, 'Host should start the room');
    const contestedWinners = [];
    for (let round = 0; round < 3; round += 1) {
      const before = await roomView(api, room.code, room.players[0].token);
      const contestedCard = before.offers[0];
      for (const player of room.players) {
        status(await api(`/rooms/${room.code}/draft`, {
          method: 'POST', body: { token: player.token, cardId: contestedCard },
        }), 200, 'Every seat should be able to request the same visible card');
      }
      const views = await Promise.all(room.players.map((player) => roomView(api, room.code, player.token)));
      const winners = views.filter((view) => view.player.cards.includes(contestedCard));
      assert.equal(winners.length, 1, 'Exactly one seat should receive a contested card');
      contestedWinners.push(winners[0].player.id);
    }
    const winnerSeats = contestedWinners.map((id) => room.players.findIndex((player) => player.id === id));
    assert.equal(new Set(winnerSeats).size, 3, 'Each seat should receive one contested card across three draft rounds');
    assert.equal(winnerSeats[1], (winnerSeats[0] + 1) % 3, 'Collision priority should move to the next seat in Draft 2');
    assert.equal(winnerSeats[2], (winnerSeats[1] + 1) % 3, 'Collision priority should move to the next seat in Draft 3');
  });
}

const claims = {
  '@claim:live-room-code': liveRoomCodeClaim,
  '@claim:private-simultaneous-picks': privatePicksClaim,
  '@claim:reconnect-persistence': reconnectClaim,
  '@claim:deterministic-resolution': deterministicResolutionClaim,
  '@claim:room-rate-limit': rateLimitClaim,
  '@claim:rotating-draft-priority': rotatingDraftPriorityClaim,
};

if (requested && !claims[requested]) {
  throw new Error(`Unknown realtime claim ${requested}. Use one of: ${Object.keys(claims).join(', ')}`);
}

await run('cargo', ['build', '--quiet'], { cwd: realtimeDir });
for (const [tag, claim] of Object.entries(claims)) {
  if (!requested || requested === tag) {
    await claim();
    console.log(`${tag} passed`);
  }
}
