import '@fontsource/dm-serif-display/400.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import './styles/main.css';
import { CARD_BY_ID, CARDS, TACTICS, cardForSet, cardIcon, type Card, type Stat } from './cards';
import { LOCAL_PLAYER_ID, createPractice, draftOffers, lockPracticeBattle, lockPracticeDraft, ranking, type PracticeState, type BattlePlay } from './game';

type Settings = { motion: 'full' | 'reduced' };
type Route = 'home' | 'demo' | 'privacy' | 'terms' | 'notfound';
type RoomPlayer = { id: string; name: string; seat: number; cards: string[]; score: number };
type RoomRecord = { round: number; plays: { playerId: string; cardId: string; tactic: Stat; value: number }[]; winnerId: string; runnerUpId?: string };
type RoomView = {
  code: string;
  setId: string;
  status: 'lobby' | 'draft' | 'battle' | 'result';
  player: RoomPlayer;
  players: { id: string; name: string; seat: number; score: number; cardCount: number }[];
  draftRound: number;
  battleRound: number;
  offers: string[];
  lockedCount: number;
  maxPlayers: number;
  records: RoomRecord[];
  winnerId?: string;
  message: string;
  isHost: boolean;
};

const app = document.querySelector<HTMLDivElement>('#app')!;
const DEMO_RUN_KEY = 'demo:pocket-draft-duel:run';
const DEMO_SETTINGS_KEY = 'demo:pocket-draft-duel:settings';
const SETTINGS_KEY = 'pocket-draft-duel:settings';
const TOKEN_KEY = (code: string) => `pocket-draft-duel:room:${code.toUpperCase()}`;
const API_BASE = (import.meta.env.VITE_REALTIME_URL || '/api').replace(/\/$/, '');

let practice: PracticeState | null = null;
let settings: Settings = { motion: 'full' };
let selectedPracticeCard = '';
let selectedPracticeTactic: Stat | '' = '';
let selectedRoomCard = '';
let selectedRoomTactic: Stat | '' = '';
let room: RoomView | null = null;
let roomError = '';
let roomPoll: number | undefined;
let roomLoadInFlight = false;
let recoveredRoomCode = '';

class RoomServiceError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: string | null) {
    super(message);
    this.name = 'RoomServiceError';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function route(): Route {
  switch (window.location.pathname) {
    case '/': return 'home';
    case '/demo': return 'demo';
    case '/privacy': return 'privacy';
    case '/terms': return 'terms';
    default: return 'notfound';
  }
}

function isDemo(): boolean { return route() === 'demo'; }

function roomCodeFromLocation(): string | null {
  const code = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
  return code && /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

function readSettings(demo: boolean): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(demo ? DEMO_SETTINGS_KEY : SETTINGS_KEY) || '{}');
    return saved.motion === 'reduced' ? { motion: 'reduced' } : { motion: 'full' };
  } catch { return { motion: 'full' }; }
}

function saveSettings(): void {
  localStorage.setItem(isDemo() ? DEMO_SETTINGS_KEY : SETTINGS_KEY, JSON.stringify(settings));
  document.documentElement.dataset.motion = settings.motion;
}

function loadPractice(): PracticeState {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_RUN_KEY) || '');
    if (saved?.version === 1 && Array.isArray(saved.players)) return saved as PracticeState;
  } catch { /* The sample starts fresh if its saved state is malformed. */ }
  return createPractice();
}

function savePractice(): void {
  if (practice) localStorage.setItem(DEMO_RUN_KEY, JSON.stringify(practice));
}

function resetPractice(): void {
  localStorage.removeItem(DEMO_RUN_KEY);
  practice = createPractice();
  selectedPracticeCard = '';
  selectedPracticeTactic = '';
  savePractice();
  render();
}

function titleFor(current: Route): string {
  if (current === 'demo') return 'Demo — Pocket Draft Duel';
  if (current === 'privacy') return 'Privacy — Pocket Draft Duel';
  if (current === 'terms') return 'Terms — Pocket Draft Duel';
  if (current === 'notfound') return 'Page not found — Pocket Draft Duel';
  return 'Pocket Draft Duel — Draft and duel with friends';
}

function navigate(path: string): void {
  window.history.pushState({}, '', path);
  stopPolling();
  room = null;
  roomError = '';
  recoveredRoomCode = '';
  if (path === '/demo') {
    practice = loadPractice();
    settings = readSettings(true);
  } else {
    settings = readSettings(false);
  }
  render(true);
  recoverRoomFromLocation();
  if (window.location.hash) requestAnimationFrame(() => document.querySelector(window.location.hash)?.scrollIntoView({ behavior: settings.motion === 'reduced' ? 'auto' : 'smooth' }));
}

function stopPolling(): void {
  if (roomPoll) window.clearInterval(roomPoll);
  roomPoll = undefined;
}

function cardMarkup(card: Card, action?: string, selected = false, disabled = false): string {
  const buttonStart = action
    ? `<button class="game-card ${selected ? 'is-selected' : ''}" type="button" data-action="${action}" data-card="${card.id}" ${disabled ? 'disabled' : ''} aria-pressed="${selected}">`
    : '<div class="game-card">';
  const buttonEnd = action ? '</button>' : '</div>';
  return `${buttonStart}
    <span class="card-icon">${cardIcon(card.icon, `${card.name} symbol`)}</span>
    <span class="card-name">${card.name}</span>
    <span class="card-stats" aria-label="Advance ${card.advance}, Brace ${card.brace}, Feint ${card.feint}">
      <b class="stat-advance">A ${card.advance}</b><b class="stat-brace">B ${card.brace}</b><b class="stat-feint">F ${card.feint}</b>
    </span>
    <span class="card-note">${card.note}</span>
  ${buttonEnd}`;
}

function playerStrip(players: { id: string; name: string; seat: number; score: number; cardCount?: number }[], currentId?: string): string {
  return `<ol class="player-strip" aria-label="Players and scores">${players.map((player) => `
    <li class="${player.id === currentId ? 'is-you' : ''}">
      <span class="seat-mark">${player.seat + 1}</span><span>${escapeHtml(player.name)}</span>
      <b>${player.score} <span class="sr-only">points</span></b>
      ${player.cardCount !== undefined ? `<small>${player.cardCount} cards</small>` : ''}
    </li>`).join('')}</ol>`;
}

function demoBanner(): string {
  return `<aside class="demo-banner" aria-label="Demo status">
    <strong>Demo — sample data, nothing is saved</strong>
    <span>Practice opponents stay on this device.</span>
    <button type="button" class="text-button" data-action="reset-demo">Reset demo</button>
    <a href="/" data-route>Start for real</a>
  </aside>`;
}

function settingsMarkup(): string {
  return `<details class="settings">
    <summary>Settings</summary>
    <label>Motion
      <select data-setting="motion" aria-label="Motion setting">
        <option value="full" ${settings.motion === 'full' ? 'selected' : ''}>Full</option>
        <option value="reduced" ${settings.motion === 'reduced' ? 'selected' : ''}>Reduced</option>
      </select>
    </label>
  </details>`;
}

function tacticsMarkup(selected: Stat | '', action: string): string {
  return `<div class="tactics" role="group" aria-label="Choose a tactic">${TACTICS.map((tactic) => `
    <button type="button" class="tactic tactic-${tactic.id} ${selected === tactic.id ? 'is-selected' : ''}" data-action="${action}" data-tactic="${tactic.id}" aria-pressed="${selected === tactic.id}">
      <strong>${tactic.name}</strong><span>${tactic.help}</span>
    </button>`).join('')}</div>`;
}

function historyMarkup(records: RoomRecord[], setId = 'marsh'): string {
  if (!records.length) return '<p class="quiet">No battles resolved yet.</p>';
  return `<ol class="battle-history">${records.map((record) => {
    const winner = record.plays.find((play) => play.playerId === record.winnerId)!;
    return `<li><strong>Battle ${record.round}</strong><span>${cardForSet(setId, winner.cardId)?.name} / ${winner.tactic} scored ${winner.value}</span></li>`;
  }).join('')}</ol>`;
}

function renderPracticeGame(): string {
  const state = practice!;
  const players = state.players.map((player) => ({ ...player, cardCount: player.cards.length }));
  let body = '';
  if (state.phase === 'draft') {
    body = `<section class="phase-panel" aria-labelledby="phase-heading">
      <div class="phase-heading"><p class="eyebrow">Draft ${state.draftRound} of 3</p><h2 id="phase-heading">Choose one shared card</h2><p>Everyone chooses in secret. Priority rotates when picks collide.</p></div>
      <div class="card-grid" role="list" aria-label="Six shared draft cards">${draftOffers(state).map((card) => `<div role="listitem">${cardMarkup(card, 'practice-draft')}</div>`).join('')}</div>
      <p class="draft-rule">18 cards are in this set. Twelve are used in this four-player practice game.</p>
    </section>`;
  } else if (state.phase === 'battle') {
    const you = state.players[0];
    body = `<section class="phase-panel" aria-labelledby="phase-heading">
      <div class="phase-heading"><p class="eyebrow">Battle ${state.battleRound} of 3</p><h2 id="phase-heading">Choose a card and tactic</h2><p>Your card uses the matching A, B, or F number. Highest total takes two points.</p></div>
      <div class="battle-choice"><div><h3>Your cards</h3><div class="card-grid compact" role="list">${you.cards.map((id) => `<div role="listitem">${cardMarkup(CARD_BY_ID.get(id)!, 'practice-battle-card', selectedPracticeCard === id)}</div>`).join('')}</div></div>
      <div><h3>Your tactic</h3>${tacticsMarkup(selectedPracticeTactic, 'practice-tactic')}<button type="button" class="primary" data-action="practice-lock-battle" ${selectedPracticeCard && selectedPracticeTactic ? '' : 'disabled'}>Lock card and tactic</button></div></div>
    </section>`;
  } else {
    const result = ranking(state.players, state.seed);
    const winner = result[0];
    body = `<section class="result-sheet" aria-labelledby="phase-heading">
      <p class="eyebrow">Result</p><h2 id="phase-heading">${winner.id === LOCAL_PLAYER_ID ? 'You won the duel' : `${escapeHtml(winner.name)} won the duel`}</h2>
      <p>Three battles are settled. Ties use the final rotating initiative order.</p>
      <ol class="ranking">${result.map((player, index) => `<li class="${player.id === LOCAL_PLAYER_ID ? 'is-you' : ''}"><span>${index + 1}</span><strong>${escapeHtml(player.name)}</strong><b>${player.score} points</b></li>`).join('')}</ol>
      <button type="button" class="primary" data-action="reset-demo">Play practice again</button>
    </section>`;
  }
  return `<h1 id="page-heading" tabindex="-1" class="sr-only">Play a Pocket Draft Duel practice game</h1><section class="tabletop game-live" aria-label="Practice game">
    <div class="tabletop-top"><div><p class="table-label">Practice table</p><p class="notice" aria-live="polite">${escapeHtml(state.notice)}</p></div>${settingsMarkup()}</div>
    ${playerStrip(players, LOCAL_PLAYER_ID)}
    ${body}
    <aside class="history-panel"><h2>Battle record</h2>${historyMarkup(state.records)}</aside>
  </section>`;
}

function homePreview(): string {
  const preview = [CARDS[2], CARDS[0], CARDS[5]];
  return `<section class="tabletop home-table" aria-label="Game preview">
    <div class="tabletop-top"><div><p class="table-label">A short game for 2–4</p><p class="notice">Draft 3 cards, play 3 battles, see one result.</p></div>${settingsMarkup()}</div>
    ${playerStrip([
      { id: 'you', name: 'You', seat: 0, score: 0, cardCount: 0 },
      { id: 'one', name: 'Friend 2', seat: 1, score: 0, cardCount: 0 },
      { id: 'two', name: 'Friend 3', seat: 2, score: 0, cardCount: 0 },
      { id: 'three', name: 'Friend 4', seat: 3, score: 0, cardCount: 0 },
    ], 'you')}
    <div class="preview-grid"><div><p class="eyebrow">Shared draft</p><div class="card-grid compact">${preview.map((card) => cardMarkup(card)).join('')}</div></div>
      <div class="preview-note"><h2>Pick at the same time</h2><p>Friends see one shared row. Picks stay hidden until every player locks one.</p><p>Then choose one card and one tactic for each battle.</p></div></div>
  </section>`;
}

function roomGame(): string {
  const current = room!;
  const playerRows = current.players.map((player) => ({ ...player, cardCount: player.cardCount }));
  let phase = '';
  if (current.status === 'lobby') {
    phase = `<section class="phase-panel" aria-labelledby="phase-heading"><p class="eyebrow">Room ${current.code}</p><h2 id="phase-heading">Wait for ${current.maxPlayers} players</h2><p>Share this room code: <strong class="room-code">${current.code}</strong></p><p>${current.players.length} of ${current.maxPlayers} seats are filled. The host starts after everyone joins.</p>${current.isHost && current.players.length === current.maxPlayers ? '<button class="primary" data-action="start-real">Start the draft</button>' : ''}</section>`;
  } else if (current.status === 'draft') {
    phase = `<section class="phase-panel" aria-labelledby="phase-heading"><div class="phase-heading"><p class="eyebrow">Draft ${current.draftRound} of 3 · room ${current.code}</p><h2 id="phase-heading">Lock one shared card</h2><p>${current.lockedCount} of ${current.players.length} picks are locked. Pending choices are private.</p></div><div class="card-grid" role="list">${current.offers.map((id) => `<div role="listitem">${cardMarkup(cardForSet(current.setId, id)!, 'real-draft')}</div>`).join('')}</div></section>`;
  } else if (current.status === 'battle') {
    phase = `<section class="phase-panel" aria-labelledby="phase-heading"><div class="phase-heading"><p class="eyebrow">Battle ${current.battleRound} of 3 · room ${current.code}</p><h2 id="phase-heading">Lock a card and tactic</h2><p>${current.lockedCount} of ${current.players.length} plays are locked. Other choices stay private.</p></div><div class="battle-choice"><div><h3>Your cards</h3><div class="card-grid compact">${current.player.cards.map((id) => cardMarkup(cardForSet(current.setId, id)!, 'real-battle-card', selectedRoomCard === id)).join('')}</div></div><div><h3>Your tactic</h3>${tacticsMarkup(selectedRoomTactic, 'real-tactic')}<button class="primary" data-action="real-lock-battle" ${selectedRoomCard && selectedRoomTactic ? '' : 'disabled'}>Lock card and tactic</button></div></div></section>`;
  } else {
    const results = [...current.players].sort((a, b) => b.score - a.score || a.seat - b.seat);
    const winner = results.find((player) => player.id === current.winnerId) || results[0];
    phase = `<section class="result-sheet" aria-labelledby="phase-heading"><p class="eyebrow">Room ${current.code} result</p><h2 id="phase-heading">${escapeHtml(winner.name)} won the duel</h2><p>Three battles are settled by the room service.</p><ol class="ranking">${results.map((player, index) => `<li class="${player.id === current.player.id ? 'is-you' : ''}"><span>${index + 1}</span><strong>${escapeHtml(player.name)}</strong><b>${player.score} points</b></li>`).join('')}</ol>${current.isHost ? '<button class="primary" data-action="real-rematch">Start rematch</button>' : '<p class="quiet">The host can start the rematch. Your seat will stay connected.</p>'}</section>`;
  }
  return `<section class="tabletop game-live" aria-label="Real room game"><div class="tabletop-top"><div><p class="table-label">Room code ${current.code}</p><p class="notice" aria-live="polite">${escapeHtml(current.message)}</p></div>${settingsMarkup()}</div>${playerStrip(playerRows, current.player.id)}${phase}<aside class="history-panel"><h2>Battle record</h2>${historyMarkup(current.records, current.setId)}</aside></section>`;
}

function realRoomPanel(): string {
  const suggestedRoomCode = roomCodeFromLocation() || '';
  return `<section class="real-room" id="real-room" aria-labelledby="real-room-heading"><h2 id="real-room-heading">Play with friends</h2><p>Make a room, share its six-letter code, then all players choose in the same room.</p>
    <div class="real-forms"><form data-form="host-room"><h3>Host a room</h3><label>Your name<input required maxlength="18" name="name" value="Host" autocomplete="nickname" /></label><label>Players<select name="players"><option value="2">2 players</option><option value="3">3 players</option><option value="4" selected>4 players</option></select></label><button class="secondary" type="submit">Create room code</button></form>
    <form data-form="join-room"><h3>Join a room</h3><label>Room code<input required maxlength="6" pattern="[A-Za-z0-9]{6}" name="code" value="${escapeHtml(suggestedRoomCode)}" autocapitalize="characters" aria-describedby="join-room-help" /></label><label>Your name<input required maxlength="18" name="name" autocomplete="nickname" /></label><button class="secondary" type="submit">Join room</button></form></div>
    ${roomError ? `<p class="form-error" role="alert">${escapeHtml(roomError)}</p>` : ''}<p class="quiet" id="join-room-help">The shared-room service must be connected for live rooms. Practice does not use it.</p></section>`;
}

function paidMarkup(): string {
  return `<section class="paid" aria-labelledby="paid-heading"><div><p class="eyebrow">Host set unlock</p><h2 id="paid-heading">Add two balanced draft sets</h2><p>Stone rotates each card toward holding a line. Market rotates cards toward quick turns. No packs or collection.</p><ul class="locked-sets"><li>Stone set — locked</li><li>Market set — locked</li></ul></div><div class="price"><strong>$4.99</strong><span>one time</span><button type="button" disabled aria-describedby="billing-note">Billing registration pending</button><small id="billing-note">Checkout and activation are not available yet.</small></div></section>`;
}

function homePage(): string {
  const hasRoomCode = roomCodeFromLocation();
  return `<section class="intro" aria-labelledby="page-heading"><div class="intro-copy"><p class="eyebrow">Pocket Draft Duel</p><h1 id="page-heading" tabindex="-1">Draft cards and duel with friends</h1><p class="lede">For two to four friends who want a complete tactical game with three quick battles.</p><div class="intro-actions"><a class="primary" href="/demo" data-route>Try it with sample data</a><span>Starts a full practice draft now.</span></div><ul class="facts"><li>2–4 players by room code</li><li>Fixed 18-card set</li><li>Practice starts with no account</li></ul></div>${homePreview()}</section>${hasRoomCode && room ? roomGame() : realRoomPanel()}<section class="how" aria-labelledby="how-heading"><h2 id="how-heading">How a room works</h2><ol><li><strong>Make a room.</strong><span>Share its code with two to four friends.</span></li><li><strong>Lock draft picks.</strong><span>Everyone picks together from one shared row.</span></li><li><strong>Fight three battles.</strong><span>Use each drafted card once and see the result.</span></li></ol></section><section class="privacy-note" aria-labelledby="privacy-heading"><h2 id="privacy-heading">What it does not do</h2><p>The game does not ask you to create an account. It has no ranked ladder, chat, custom cards, or random packs.</p><p>Practice data stays in a separate browser-only sample area. Live room data belongs to the room service.</p></section>${paidMarkup()}`;
}

function legalPage(kind: 'privacy' | 'terms'): string {
  const privacy = kind === 'privacy';
  return `<article class="legal" aria-labelledby="page-heading"><p class="eyebrow">Pocket Draft Duel</p><h1 id="page-heading" tabindex="-1">${privacy ? 'Privacy for Pocket Draft Duel' : 'Terms for Pocket Draft Duel'}</h1>${privacy ? `
    <h2>What is stored</h2><p>Practice game progress is stored only in this browser under a demo-only key. Reset demo removes it.</p><p>When the room service is connected, it stores a room code, player name, reconnect token, choices, and game result so friends can finish a room after a refresh. It does not require an account.</p>
    <h2>What is not collected</h2><p>This site has no analytics, advertising pixels, chat, or third-party scripts. It does not sell personal data.</p>
    <h2>Contact</h2><p>Questions about this product can be sent to the Param Factory through the product listing.</p>` : `
    <h2>Using the game</h2><p>Use a room code only with people you know. Do not use player names that reveal sensitive personal information.</p>
    <h2>Host set unlock</h2><p>The planned host set unlock is a one-time $4.99 purchase for two additional balanced sets. Billing registration, checkout, and activation are not available at this time.</p><p>When billing is available, an activated host unlock will apply to rooms hosted by the licensed browser. It will not provide random cards, a collection, or a subscription.</p>
    <h2>Availability</h2><p>The game is provided as available. Do not rely on a room code for records that need permanent storage.</p>`}</article>`;
}

function notFoundPage(): string {
  return `<section class="not-found" aria-labelledby="page-heading"><p class="eyebrow">Pocket Draft Duel</p><h1 id="page-heading" tabindex="-1">That page is not on this sheet</h1><p>Go back to the game to start a practice draft or make a room.</p><a class="primary" href="/" data-route>Go to the game</a></section>`;
}

function shell(content: string, current: Route): string {
  return `<a class="skip-link" href="#main">Skip to game</a><header class="site-header"><a class="wordmark" href="/" data-route aria-label="Pocket Draft Duel home"><span aria-hidden="true">✦</span> Pocket Draft Duel</a><nav aria-label="Main navigation"><a href="/demo" data-route ${current === 'demo' ? 'aria-current="page"' : ''}>Demo</a><a href="/#real-room" data-route>Rooms</a><a href="/privacy" data-route ${current === 'privacy' ? 'aria-current="page"' : ''}>Privacy</a></nav></header>${current === 'demo' ? demoBanner() : ''}<main id="main">${content}</main><footer><p>Draft shared cards and settle three tactical battles.</p><nav aria-label="Footer"><a href="/privacy" data-route>Privacy</a><a href="/terms" data-route>Terms</a><span>Built by Param Factory · v1.0.0</span></nav></footer><div class="sr-only" aria-live="polite" id="route-status"></div>`;
}

function render(moveFocus = false): void {
  const current = route();
  document.title = titleFor(current);
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) canonical.href = `https://pocket-draft-duel.sociobot.in${window.location.pathname}`;
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = current === 'demo'
    ? 'Play a local Pocket Draft Duel practice game with four labelled practice opponents.'
    : current === 'privacy'
      ? 'Read what Pocket Draft Duel stores in practice mode and in a live room.'
      : current === 'terms'
        ? 'Read the Pocket Draft Duel game terms and host set unlock status.'
        : 'Draft six shared cards, pick tactics, and settle three quick battles with friends by room code.';
  if (current === 'demo') {
    if (!practice) practice = loadPractice();
    settings = readSettings(true);
  } else if (current !== 'home' || !room) {
    settings = readSettings(false);
  }
  document.documentElement.dataset.motion = settings.motion;
  let content = current === 'home' ? homePage() : current === 'demo' ? renderPracticeGame() : current === 'privacy' || current === 'terms' ? legalPage(current) : notFoundPage();
  app.innerHTML = shell(content, current);
  if (room && current === 'home' && roomCodeFromLocation()) startPolling();
  if (moveFocus) {
    const heading = document.querySelector<HTMLElement>('h1');
    heading?.focus();
    document.querySelector('#route-status')!.textContent = document.title;
  }
}

function tokenFor(code: string): string | null { return localStorage.getItem(TOKEN_KEY(code)); }

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RoomServiceError((body as { error?: string }).error || `Room service returned ${response.status}.`, response.status, response.headers.get('Retry-After'));
  return body as T;
}

async function createRoom(data: FormData): Promise<void> {
  roomError = '';
  try {
    const response = await api<{ code: string; token: string; room: RoomView }>('/rooms', { method: 'POST', body: JSON.stringify({ name: data.get('name'), players: Number(data.get('players')), setId: 'marsh' }) });
    localStorage.setItem(TOKEN_KEY(response.code), response.token);
    room = response.room;
    recoveredRoomCode = response.code;
    window.history.replaceState({}, '', `/?room=${response.code}`);
    render();
  } catch (error) {
    roomError = error instanceof Error ? `Could not create a room: ${error.message} Try practice while the service is unavailable.` : 'Could not create a room.';
    render();
  }
}

async function joinRoom(data: FormData): Promise<void> {
  roomError = '';
  const code = String(data.get('code') || '').trim().toUpperCase();
  try {
    const response = await api<{ code: string; token: string; room: RoomView }>(`/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify({ name: data.get('name') }) });
    localStorage.setItem(TOKEN_KEY(response.code), response.token);
    room = response.room;
    recoveredRoomCode = response.code;
    window.history.replaceState({}, '', `/?room=${response.code}`);
    render();
  } catch (error) {
    roomError = error instanceof Error ? `Could not join this room: ${error.message}` : 'Could not join this room.';
    render();
  }
}

async function loadRoom(code: string): Promise<void> {
  if (roomLoadInFlight) return;
  const token = tokenFor(code);
  if (!token) {
    stopPolling();
    room = null;
    roomError = 'This browser does not have a reconnect token for that room. Enter your name to join with the room code.';
    render();
    return;
  }
  roomLoadInFlight = true;
  try {
    room = await api<RoomView>(`/rooms/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`);
    roomError = '';
    render();
  } catch (error) {
    stopPolling();
    room = null;
    if (error instanceof RoomServiceError && error.status === 401) {
      localStorage.removeItem(TOKEN_KEY(code));
      roomError = 'This saved room link cannot reconnect this seat. Enter your name to join with the room code.';
    } else if (error instanceof RoomServiceError && error.status === 404) {
      roomError = 'This room code no longer exists. Check the code with the host, then try again.';
    } else if (error instanceof RoomServiceError && error.status === 429) {
      roomError = `Room requests are paused. Wait ${error.retryAfter || 'a minute'} before trying again.`;
    } else {
      roomError = error instanceof Error ? `Could not reconnect: ${error.message}` : 'Could not reconnect to this room.';
    }
    render();
  } finally {
    roomLoadInFlight = false;
  }
}

function recoverRoomFromLocation(): void {
  const code = roomCodeFromLocation();
  if (!code || room || roomLoadInFlight || recoveredRoomCode === code) return;
  recoveredRoomCode = code;
  void loadRoom(code);
}

function startPolling(): void {
  if (roomPoll) return;
  roomPoll = window.setInterval(() => {
    const code = roomCodeFromLocation();
    if (code && room) void loadRoom(code);
  }, 1500);
}

async function roomAction(path: string, body?: object): Promise<void> {
  if (!room) return;
  try {
    room = await api<RoomView>(path, { method: 'POST', body: JSON.stringify({ token: tokenFor(room.code), ...body }) });
    selectedRoomCard = '';
    selectedRoomTactic = '';
    render();
  } catch (error) {
    roomError = error instanceof Error ? error.message : 'The room action could not be completed.';
    render();
  }
}

document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-route], [data-scroll]');
  if (!target) return;
  if (target.dataset.route !== undefined) {
    event.preventDefault();
    navigate((target as HTMLAnchorElement).getAttribute('href') || '/');
    return;
  }
  if (target.dataset.scroll !== undefined) {
    event.preventDefault();
    document.querySelector((target as HTMLAnchorElement).getAttribute('href') || '#main')?.scrollIntoView({ behavior: settings.motion === 'reduced' ? 'auto' : 'smooth' });
    return;
  }
  const action = target.dataset.action;
  if (action === 'reset-demo') resetPractice();
  if (action === 'practice-draft') {
    practice = lockPracticeDraft(practice!, target.dataset.card!);
    savePractice(); render();
  }
  if (action === 'practice-battle-card') { selectedPracticeCard = target.dataset.card!; render(); }
  if (action === 'practice-tactic') { selectedPracticeTactic = target.dataset.tactic as Stat; render(); }
  if (action === 'practice-lock-battle' && selectedPracticeCard && selectedPracticeTactic) {
    practice = lockPracticeBattle(practice!, { cardId: selectedPracticeCard, tactic: selectedPracticeTactic });
    selectedPracticeCard = ''; selectedPracticeTactic = ''; savePractice(); render();
  }
  if (action === 'real-draft') void roomAction(`/rooms/${room?.code}/draft`, { cardId: target.dataset.card });
  if (action === 'real-battle-card') { selectedRoomCard = target.dataset.card!; render(); }
  if (action === 'real-tactic') { selectedRoomTactic = target.dataset.tactic as Stat; render(); }
  if (action === 'real-lock-battle' && selectedRoomCard && selectedRoomTactic) void roomAction(`/rooms/${room?.code}/battle`, { cardId: selectedRoomCard, tactic: selectedRoomTactic });
  if (action === 'start-real') void roomAction(`/rooms/${room?.code}/start`);
  if (action === 'real-rematch') void roomAction(`/rooms/${room?.code}/rematch`);
});

document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (!form.dataset.form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (form.dataset.form === 'host-room') void createRoom(new FormData(form));
  if (form.dataset.form === 'join-room') void joinRoom(new FormData(form));
});

document.addEventListener('change', (event) => {
  const element = event.target as HTMLSelectElement;
  if (element.dataset.setting === 'motion') {
    settings.motion = element.value === 'reduced' ? 'reduced' : 'full';
    saveSettings();
  }
});

window.addEventListener('popstate', () => {
  stopPolling();
  room = null;
  roomError = '';
  recoveredRoomCode = '';
  practice = null;
  render(true);
  recoverRoomFromLocation();
});

if (route() === 'demo') practice = loadPractice();
settings = readSettings(isDemo());
render();
recoverRoomFromLocation();
