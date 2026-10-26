/* Mindmela — a real-time desi party game.
 *
 * Each question has two answers. Everyone picks a side, then guesses how many
 * people (including themselves) picked the same. Exactly right scores 3,
 * off by one scores 1. Then the whole room sees who picked what.
 *
 * Questions come from questions.js: hand-written ones, plus a generator that pairs answers
 * from the same category, so a room can play for a very long time without repeats.
 *
 * How the multiplayer works:
 * - The host's browser runs the game. It is the only place the rules run and
 *   the only place answers are kept secret until the reveal.
 * - Everyone else connects straight to the host over WebRTC (via PeerJS).
 *   The room code is part of the host's peer id, so we need no server of our own.
 * - Whenever anything changes, the host sends the full game state to every
 *   player (and again every 2 s as a heartbeat), so all screens stay in sync.
 * - Players keep a stable id per tab, so a refresh or a dropped connection
 *   rejoins as the same player with the same score.
 */
'use strict';

const CONFIG = {
  peerPrefix: 'mindmela-v2-',
  answerSeconds: 30,
  revealSeconds: 60, // the host usually moves on sooner; this keeps a stalled game going
  maxPlayers: 12,
  heartbeatMs: 2000,
  staleMs: 9000,
  connectTimeoutMs: 20000,
  reconnectForMs: 45000,
  retryEveryMs: 6000,
  lengths: {
    quick: { rounds: 5, icon: '⚡', label: 'Quick' },
    classic: { rounds: 10, icon: '🎯', label: 'Classic' },
    long: { rounds: 20, icon: '🔥', label: 'Long' },
    marathon: { rounds: 50, icon: '🏆', label: 'Marathon' },
  },
};
const DEFAULT_LENGTH = 'classic';
const POINTS = { exact: 3, close: 1 };
const HANDWRITTEN_SHARE = 0.35; // how often a round uses a hand-written question while unused ones remain
const RECENT_ROUNDS = 4;        // no question or answer repeats within this many rounds
const RECENT_CATEGORIES = 2;    // and no generator category repeats within this many
const MIX = { icon: '🎲', title: 'Mix', blurb: 'A bit of everything, from every section', color: '#ffcf5a' };
const PACK_ORDER = ['mix', 'desi', 'meerut', 'filmy', 'cricket', 'school', 'pyaar', 'ajeeb', 'family', 'grownups', 'hottakes'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L or O: easy to read aloud
const COLORS = ['#ff8fa3', '#ffd166', '#7ae582', '#74b9ff', '#c39bff', '#ffa94d',
  '#5ee7d8', '#f78fd0', '#c0eb75', '#8fd3ff', '#ffc078', '#b6a6ff'];

// ---------- small helpers ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
  set(area, key, value) { try { window[area].setItem(key, value); } catch { /* storage blocked */ } },
  del(area, key) { try { window[area].removeItem(key); } catch { /* storage blocked */ } },
};
const makeId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const randomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 14);
const initial = (name) => (Array.from(name.trim())[0] || '?').toUpperCase();
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const rand = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rand(list.length)];
const shortCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n));
function listNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

// ---------- questions (data in questions.js) ----------
const packInfo = (key) => (key === 'mix' ? MIX : PACKS[key]);
const handwrittenIds = (key) => Object.keys(PACKS).filter((k) => key === 'mix' || k === key)
  .flatMap((k) => PACKS[k].prompts.map((_, i) => `${k}:${i}`));
const genCategories = (key) => Object.keys(GEN).filter((c) => key === 'mix' || GEN[c].packs.includes(key));
const pairCount = (n) => (n * (n - 1)) / 2;
const questionCount = (key) => handwrittenIds(key).length
  + genCategories(key).reduce((sum, c) => sum + pairCount(GEN[c].items.length) * GEN[c].frames.length, 0);
const pairKey = (cat, a, b) => `g:${cat}:${Math.min(a, b)}:${Math.max(a, b)}`;
const option = (s) => { const at = s.indexOf(' '); return { e: s.slice(0, at), t: s.slice(at + 1) }; };
const lengthInfo = (key) => CONFIG.lengths[key] || CONFIG.lengths[DEFAULT_LENGTH];

// Hand-written ids look like "desi:4"; generated ones look like "g:khaana:3:17:2"
// (category, answer A, answer B, frame). `tag` is the round label shown above the question.
function getPrompt(id) {
  const parts = String(id).split(':');
  if (parts[0] === 'g') {
    const [, cat, a, b, f] = parts;
    const g = GEN[cat];
    if (!g || !g.items[a] || !g.items[b] || !g.frames[f]) return null;
    return { id, q: g.frames[f], a: option(g.items[a]), b: option(g.items[b]), tag: g.label };
  }
  const pack = PACKS[parts[0]];
  const raw = pack && pack.prompts[Number(parts[1])];
  return raw ? { id, q: raw[0], a: option(raw[1]), b: option(raw[2]), tag: `${pack.icon} ${pack.title}` } : null;
}

// A question is "fresh" if none of the last few rounds asked the same thing or offered the same
// answer, and (when strict) it doesn't come from a generator category used in the last few rounds.
const categoryOf = (id) => (String(id).startsWith('g:') ? id.split(':')[1] : null);
function isFresh(s, id, strict) {
  const p = getPrompt(id);
  const recent = s.recent || [];
  if (recent.some((r) => r.q === p.q || r.texts.includes(p.a.t) || r.texts.includes(p.b.t))) return false;
  const cat = categoryOf(id);
  return !strict || !cat || !recent.slice(-RECENT_CATEGORIES).some((r) => r.cat === cat);
}

function remember(s, id, key = id) {
  const p = getPrompt(id);
  s.used.push(key);
  s.recent = [...(s.recent || []), { cat: categoryOf(id), q: p.q, texts: [p.a.t, p.b.t] }].slice(-RECENT_ROUNDS);
  return id;
}

// Picks the next question. While hand-written questions remain, some rounds use one; the rest pair
// two answers from one generator category. Tries the strict freshness rules first, then relaxes them.
function nextPrompt(s, retried = false) {
  const used = new Set(s.used);
  for (const strict of [true, false]) {
    const fresh = handwrittenIds(s.pack).filter((id) => !used.has(id) && isFresh(s, id, strict));
    if (fresh.length && Math.random() < HANDWRITTEN_SHARE) return remember(s, pick(fresh));
    const cats = genCategories(s.pack);
    for (let tries = 0; tries < 150; tries++) {
      const cat = pick(cats);
      const n = GEN[cat].items.length;
      const a = rand(n);
      const b = rand(n);
      if (a === b || used.has(pairKey(cat, a, b))) continue;
      const id = `g:${cat}:${a}:${b}:${rand(GEN[cat].frames.length)}`;
      if (isFresh(s, id, strict)) return remember(s, id, pairKey(cat, a, b));
    }
    if (fresh.length) return remember(s, pick(fresh));
  }
  if (!retried) { s.used = []; return nextPrompt(s, true); } // this room has seen nearly everything: start over
  return remember(s, pick(handwrittenIds(s.pack)));
}

// Who am I? The id lives in sessionStorage, so it survives a refresh but each tab is its own player.
const me = {
  id: store.get('sessionStorage', 'mm-id') || makeId(),
  name: store.get('localStorage', 'mm-name') || '',
};
store.set('sessionStorage', 'mm-id', me.id);

const ui = {
  screen: 'home',   // home | busy | error | game
  view: null,       // latest game state received from the host
  endsAt: 0,        // local clock time when the current phase ends
  pending: null,    // { round, at, ans }: an answer sent but not yet confirmed by the host
  stageKey: '',
  lastTick: -1,
};
let net = null;     // { role: 'host', code } or the guest connection object

// =====================================================================
// Host: owns the game state and runs the rules
// =====================================================================
const host = { peer: null, state: null, answers: {}, conns: new Map(), lastSeen: {}, timer: null, loop: null };

function openRoom(code, saved = null, attempt = 0) {
  showBusy(saved ? 'Reopening your room…' : 'Opening a room…');
  const peer = new Peer(CONFIG.peerPrefix + code, { debug: 1 });
  let opened = false;

  peer.on('open', () => {
    opened = true;
    host.peer = peer;
    host.state = saved ? saved.state : freshState(code);
    host.answers = saved ? saved.answers : {};
    host.conns = new Map();
    host.lastSeen = {};
    if (saved) host.state.players.forEach((p) => { if (p.id !== me.id) p.connected = false; });
    else addPlayer(me.id, me.name);
    net = { role: 'host', code };
    store.set('sessionStorage', 'mm-role', 'host');
    setRoomInUrl(code);
    resumeHostTimer();
    clearInterval(host.loop);
    host.loop = setInterval(hostHeartbeat, CONFIG.heartbeatMs);
    enterGame();
    hostChanged();
  });
  peer.on('connection', acceptConnection);
  peer.on('disconnected', () => { if (!peer.destroyed) try { peer.reconnect(); } catch { /* retried on next drop */ } });
  peer.on('error', (err) => {
    if (opened) { console.warn('Peer error:', err.type, err); return; }
    peer.destroy();
    if (err.type === 'unavailable-id') {
      // After a refresh the old room id can take a few seconds to free up.
      if (saved && attempt < 10) { setTimeout(() => openRoom(code, saved, attempt + 1), 1500); return; }
      if (!saved) { openRoom(randomCode()); return; }
    }
    showError(networkHelp(err));
  });
}

function freshState(code) {
  return {
    code, phase: 'lobby', hostId: me.id, pack: 'mix', length: DEFAULT_LENGTH,
    round: 0, totalRounds: 0, used: [], recent: [], prompt: null, final: false,
    endsAt: 0, last: null, players: [], pairs: {}, winners: [], titles: [],
  };
}

const blankStats = () => ({ answered: 0, exact: 0, close: 0, miss: 0, minority: 0, majority: 0, skipped: 0, streak: 0, bestStreak: 0 });

function addPlayer(id, rawName) {
  const s = host.state;
  let p = s.players.find((x) => x.id === id);
  if (p) { p.connected = true; return p; }
  if (s.players.length >= CONFIG.maxPlayers) return null;
  const used = new Set(s.players.map((x) => x.color));
  p = {
    id,
    name: uniqueName(cleanName(rawName) || 'Guest', id),
    color: COLORS.find((c) => !used.has(c)) || COLORS[s.players.length % COLORS.length],
    score: 0,
    tag: '',
    connected: true,
    stats: blankStats(),
  };
  s.players.push(p);
  return p;
}

function uniqueName(name, id) {
  const taken = new Set(host.state.players.filter((p) => p.id !== id).map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name.slice(0, 11)} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function acceptConnection(conn) {
  let pid = null;
  conn.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
      const id = String(msg.id || '').slice(0, 64);
      if (!id || id === me.id) return;
      const player = addPlayer(id, msg.name);
      if (!player) { conn.send({ type: 'rejected', reason: 'This room is full (12 players max).' }); return; }
      pid = id;
      const old = host.conns.get(id);
      host.conns.set(id, conn); // set before closing the old one so its close event is ignored
      if (old && old !== conn) old.close();
      host.lastSeen[id] = Date.now();
      hostChanged();
      return;
    }
    if (!pid || host.conns.get(pid) !== conn) return;
    host.lastSeen[pid] = Date.now();
    handleAction(pid, msg);
  });
  const gone = () => { if (pid && host.conns.get(pid) === conn) dropPlayer(pid); };
  conn.on('close', gone);
  conn.on('error', gone);
}

function dropPlayer(pid) {
  host.conns.delete(pid);
  const s = host.state;
  const p = s.players.find((x) => x.id === pid);
  if (!p) return;
  if (s.phase === 'lobby') s.players = s.players.filter((x) => x.id !== pid);
  else p.connected = false; // keep their score in case they come back
  if (!maybeEndRound()) hostChanged();
}

function hostHeartbeat() {
  const now = Date.now();
  for (const [pid, conn] of host.conns) {
    if (now - (host.lastSeen[pid] || 0) > CONFIG.staleMs) {
      dropPlayer(pid);
      try { conn.close(); } catch { /* already closed */ }
    }
  }
  broadcast();
}

const isDone = (ans) => !!(ans && ans.side && ans.guess);

// Every player action (including the host's own) comes through here.
function handleAction(pid, msg) {
  const s = host.state;
  const fromHost = pid === s.hostId;
  switch (msg.type) {
    case 'answer': {
      if (s.phase !== 'answer') return;
      const ans = { ...(host.answers[pid] || {}) };
      if (msg.side === 'a' || msg.side === 'b') ans.side = msg.side;
      if (Number.isInteger(msg.guess) && msg.guess >= 1 && msg.guess <= CONFIG.maxPlayers) ans.guess = msg.guess;
      host.answers[pid] = ans;
      if (!maybeEndRound()) hostChanged();
      return;
    }
    case 'settings':
      if (!fromHost || s.phase !== 'lobby') return;
      if (PACK_ORDER.includes(msg.pack)) s.pack = msg.pack;
      if (has(CONFIG.lengths, msg.length)) s.length = msg.length;
      hostChanged();
      return;
    case 'start':
      if (fromHost && s.phase === 'lobby' && s.players.filter((p) => p.connected).length >= 2) startGame();
      return;
    case 'next':
      if (fromHost && s.phase === 'reveal') advance();
      return;
    case 'again':
      if (fromHost && s.phase === 'over') {
        s.players = s.players.filter((p) => p.connected);
        s.players.forEach((p) => { p.tag = ''; });
        Object.assign(s, { phase: 'lobby', round: 0, last: null, winners: [], titles: [] });
        hostChanged();
      }
      return;
    case 'bye':
      dropPlayer(pid);
      return;
    default:
  }
}

function startGame() {
  const s = host.state;
  s.players.forEach((p) => { p.score = 0; p.tag = ''; p.stats = blankStats(); });
  Object.assign(s, { pairs: {}, round: 0, last: null, winners: [], titles: [], final: false, recent: [] });
  s.totalRounds = lengthInfo(s.length).rounds;
  startRound();
}

function startRound() {
  const s = host.state;
  clearTimeout(host.timer);
  s.round += 1;
  s.phase = 'answer';
  s.prompt = nextPrompt(s);
  host.answers = {};
  s.endsAt = Date.now() + CONFIG.answerSeconds * 1000;
  host.timer = setTimeout(endRound, CONFIG.answerSeconds * 1000);
  hostChanged();
}

// The round ends early as soon as every connected player has picked a side and guessed.
function maybeEndRound() {
  const s = host.state;
  if (s.phase !== 'answer') return false;
  const active = s.players.filter((p) => p.connected);
  if (active.length && active.every((p) => isDone(host.answers[p.id]))) { endRound(); return true; }
  return false;
}

function endRound() {
  const s = host.state;
  if (s.phase !== 'answer') return;
  clearTimeout(host.timer);

  // Anyone who picked a side counts toward the split, even without a guess.
  const answers = {};
  for (const p of s.players) {
    const a = host.answers[p.id];
    if (a && a.side) answers[p.id] = { side: a.side, guess: a.guess || null };
  }
  const counts = { a: 0, b: 0 };
  Object.values(answers).forEach((a) => { counts[a.side] += 1; });
  const total = counts.a + counts.b;

  const points = {};
  for (const p of s.players) {
    const st = p.stats;
    const a = answers[p.id];
    points[p.id] = 0;
    if (!a) {
      if (p.connected) st.skipped += 1;
      st.streak = 0;
      continue;
    }
    const same = counts[a.side];
    st.answered += 1;
    if (same < total - same) st.minority += 1;
    else if (same > total - same) st.majority += 1;
    if (!a.guess) { st.streak = 0; continue; }
    const off = Math.abs(a.guess - same);
    const kind = off === 0 ? 'exact' : off === 1 ? 'close' : 'miss';
    st[kind] += 1;
    st.streak = kind === 'exact' ? st.streak + 1 : 0;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    points[p.id] = kind === 'exact' ? POINTS.exact : kind === 'close' ? POINTS.close : 0;
    p.score += points[p.id];
  }

  // Track how often each pair of players agrees, for the end-of-game tags.
  const ids = Object.keys(answers);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = [ids[i], ids[j]].sort().join('|');
      const pair = s.pairs[key] || (s.pairs[key] = { same: 0, total: 0 });
      pair.total += 1;
      if (answers[ids[i]].side === answers[ids[j]].side) pair.same += 1;
    }
  }

  s.last = { round: s.round, prompt: s.prompt, answers, counts, points };
  updateLiveTags(s);
  s.final = s.round >= s.totalRounds;
  s.phase = 'reveal';
  s.endsAt = Date.now() + CONFIG.revealSeconds * 1000;
  host.timer = setTimeout(advance, CONFIG.revealSeconds * 1000);
  hostChanged();
}

// The tag next to each name during the game, based on the scores and the round just played.
function updateLiveTags(s) {
  const { answers, counts, points } = s.last;
  const total = counts.a + counts.b;
  const top = Math.max(...s.players.map((p) => p.score));
  const leaders = s.players.filter((p) => p.score === top);
  for (const p of s.players) {
    const a = answers[p.id];
    const same = a ? counts[a.side] : 0;
    if (top > 0 && leaders.length === 1 && leaders[0] === p) p.tag = '👑 Leader';
    else if (p.stats.streak >= 2) p.tag = `🔥 On fire ×${p.stats.streak}`;
    else if (points[p.id] === POINTS.exact) p.tag = '🎯 Bullseye';
    else if (a && same === 1 && total >= 3) p.tag = '🦄 Lone wolf';
    else if (points[p.id] === POINTS.close) p.tag = '🤏 So close';
    else if (!a) p.tag = '😴 Snoozed';
    else if (same * 2 === total) p.tag = '⚖️ Split vote';
    else if (same * 2 > total) p.tag = '🐑 With the crowd';
    else p.tag = '🌶️ Spicy pick';
  }
}

function advance() {
  const s = host.state;
  if (!s || s.phase !== 'reveal') return;
  if (s.final) finishGame();
  else startRound();
}

function finishGame() {
  const s = host.state;
  clearTimeout(host.timer);
  const top = Math.max(...s.players.map((p) => p.score));
  s.winners = s.players.filter((p) => p.score === top).map((p) => p.id);
  s.titles = computeTitles(s);
  s.phase = 'over';
  hostChanged();
}

// At the end, every player gets a personal tag. Rules are tried in order; each goes to the
// untagged player with the highest number for it, and anyone left over gets a friendly fallback.
const TITLE_RULES = [
  { icon: '🎯', title: 'Mind Reader', stat: 'exact', note: (n) => `Read the room perfectly ${times(n)}` },
  { icon: '🔥', title: 'Hot Streak', stat: 'bestStreak', min: 2, note: (n) => `${n} perfect guesses in a row` },
  { icon: '🦄', title: 'Lone Wolf', stat: 'minority', note: (n) => `Went against the crowd ${times(n)}` },
  { pair: 'twin' },
  { pair: 'opposite' },
  { icon: '🐑', title: 'Crowd Favourite', stat: 'majority', note: (n) => `Sided with the crowd ${times(n)}` },
  { icon: '🤏', title: 'Almost There', stat: 'close', note: (n) => `Missed by just one ${times(n)}` },
  { icon: '🎲', title: 'Wild Guesser', stat: 'miss', note: (n) => `Made ${n} bold guesses that missed` },
  { icon: '🐢', title: 'Fashionably Late', stat: 'skipped', note: (n) => `Let the timer win ${times(n)}` },
];
const FALLBACK_TITLES = [
  { icon: '🌟', title: 'Steady Star', note: 'Kept it cool all game' },
  { icon: '😄', title: 'Good Vibes', note: 'Here for the fun, and it showed' },
  { icon: '🍿', title: 'Entertainer', note: 'Made every round more fun' },
  { icon: '🧘', title: 'Zen Master', note: 'Never rattled, not once' },
  { icon: '🎉', title: 'Party Starter', note: 'Brought the energy' },
  { icon: '🦚', title: 'Showstopper', note: 'All eyes on this one' },
  { icon: '🧠', title: 'Deep Thinker', note: 'Every pick had a reason' },
  { icon: '🕵️', title: 'Undercover', note: 'Nobody could read this one' },
  { icon: '🌈', title: 'Free Spirit', note: 'Picked from the heart' },
  { icon: '🍵', title: 'Chai Philosopher', note: 'Had a theory for everything' },
  { icon: '🎭', title: 'Drama King/Queen', note: 'Every reveal was a show' },
  { icon: '🚀', title: 'Rising Star', note: 'One to watch next game' },
];

function computeTitles(s) {
  const titles = {};
  const nameOf = (id) => (s.players.find((p) => p.id === id) || {}).name || 'someone';
  const present = new Set(s.players.map((p) => p.id));
  const pairs = Object.entries(s.pairs).filter(([key, pr]) => pr.total >= 3 && key.split('|').every((id) => present.has(id)));
  const rate = ([, pr]) => pr.same / pr.total;

  for (const rule of TITLE_RULES) {
    if (rule.pair && pairs.length) {
      const best = rule.pair === 'twin'
        ? pairs.reduce((x, y) => (rate(y) > rate(x) ? y : x))
        : pairs.reduce((x, y) => (rate(y) < rate(x) ? y : x));
      const ok = rule.pair === 'twin' ? rate(best) >= 0.7 : rate(best) <= 0.3;
      const [x, y] = best[0].split('|');
      if (!ok) continue;
      for (const [id, other] of [[x, y], [y, x]]) {
        if (titles[id]) continue;
        titles[id] = rule.pair === 'twin'
          ? { icon: '💞', title: 'Twin Soul', note: `Thinks just like ${nameOf(other)}` }
          : { icon: '⚡', title: 'Total Opposite', note: `Hardly ever agreed with ${nameOf(other)}` };
      }
      continue;
    }
    if (rule.pair) continue;
    const candidates = s.players.filter((p) => !titles[p.id] && p.stats[rule.stat] >= (rule.min || 1));
    if (!candidates.length) continue;
    const winner = candidates.reduce((x, y) => (y.stats[rule.stat] > x.stats[rule.stat]
      || (y.stats[rule.stat] === x.stats[rule.stat] && y.score > x.score) ? y : x));
    titles[winner.id] = { icon: rule.icon, title: rule.title, note: rule.note(winner.stats[rule.stat]) };
  }

  let spare = 0;
  return s.players.map((p) => ({ id: p.id, ...(titles[p.id] || FALLBACK_TITLES[spare++ % FALLBACK_TITLES.length]) }));
}

function resumeHostTimer() {
  const s = host.state;
  clearTimeout(host.timer);
  const left = Math.max(0, s.endsAt - Date.now());
  if (s.phase === 'answer') host.timer = setTimeout(endRound, left);
  if (s.phase === 'reveal') host.timer = setTimeout(advance, left);
}

function hostChanged() {
  store.set('sessionStorage', 'mm-host', JSON.stringify({ state: host.state, answers: host.answers }));
  broadcast();
}

function broadcast() {
  const now = Date.now();
  for (const [pid, conn] of host.conns) {
    if (!conn.open) continue;
    try { conn.send(snapshotFor(pid, now)); } catch (e) { console.warn('send failed', e); }
  }
  receiveState(snapshotFor(me.id, now));
}

// What one player is allowed to see: who has answered, but never what, until the reveal.
function snapshotFor(pid, now) {
  const s = host.state;
  const timed = s.phase === 'answer' || s.phase === 'reveal';
  return {
    type: 'state',
    code: s.code,
    phase: s.phase,
    hostId: s.hostId,
    pack: s.pack,
    length: s.length,
    round: s.round,
    totalRounds: s.totalRounds,
    final: s.final,
    players: s.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, score: p.score, tag: p.tag || '', connected: p.connected,
      done: s.phase === 'answer' && isDone(host.answers[p.id]),
    })),
    prompt: s.phase === 'answer' ? getPrompt(s.prompt) : null,
    timeLeft: timed ? Math.max(0, s.endsAt - now) : 0,
    last: s.last ? { ...s.last, prompt: getPrompt(s.last.prompt) } : null,
    winners: s.winners,
    titles: s.titles || [],
    myAnswer: s.phase === 'answer' ? (host.answers[pid] || null) : null,
  };
}

function closeRoom() {
  for (const conn of host.conns.values()) if (conn.open) try { conn.send({ type: 'closed' }); } catch { /* ignore */ }
  clearTimeout(host.timer);
  clearInterval(host.loop);
  const peer = host.peer;
  setTimeout(() => peer && peer.destroy(), 400);
  Object.assign(host, { peer: null, state: null, answers: {}, conns: new Map(), lastSeen: {} });
}

// =====================================================================
// Guest: connects to the host and shows whatever state it sends
// =====================================================================
function joinRoom(code) {
  showBusy(`Joining room ${code}…`);
  const g = {
    role: 'guest', code, peer: null, conn: null,
    startedAt: Date.now(), lastHeard: 0, connected: false,
    reconnectingSince: 0, retryTimer: null, watch: null,
  };
  net = g;
  store.set('sessionStorage', 'mm-role', 'guest');
  setRoomInUrl(code);
  makeGuestPeer(g);
  g.watch = setInterval(guestWatchdog, CONFIG.heartbeatMs);
}

function makeGuestPeer(g) {
  const peer = new Peer({ debug: 1 });
  g.peer = peer;
  peer.on('open', () => { if (net === g && g.peer === peer) connectToHost(g); });
  peer.on('disconnected', () => { if (net === g && !peer.destroyed) try { peer.reconnect(); } catch { /* retry loop handles it */ } });
  peer.on('error', (err) => {
    if (net !== g || g.peer !== peer) return;
    if (g.connected) return; // mid-game hiccup: the reconnect loop keeps trying
    if (err.type === 'peer-unavailable') failGuest(`Room ${g.code} doesn’t exist. Double-check the code with whoever invited you.`);
    else failGuest(networkHelp(err));
  });
}

function connectToHost(g) {
  const conn = g.peer.connect(CONFIG.peerPrefix + g.code, { reliable: true, serialization: 'json' });
  const old = g.conn;
  g.conn = conn;
  if (old) try { old.close(); } catch { /* ignore */ }

  conn.on('open', () => { if (g.conn === conn) conn.send({ type: 'join', id: me.id, name: me.name }); });
  conn.on('data', (msg) => {
    if (net !== g || g.conn !== conn || !msg) return;
    g.lastHeard = Date.now();
    if (msg.type === 'state') {
      if (!g.connected) { g.connected = true; enterGame(); }
      if (g.reconnectingSince) { g.reconnectingSince = 0; clearTimeout(g.retryTimer); setBanner(''); }
      receiveState(msg);
    } else if (msg.type === 'rejected') {
      failGuest(msg.reason);
    } else if (msg.type === 'closed') {
      failGuest('The host ended the game. Thanks for playing!', '👋');
    }
  });
  const lost = () => { if (net === g && g.conn === conn && g.connected) lostHost(g); };
  conn.on('close', lost);
  conn.on('error', lost);
}

function guestWatchdog() {
  const g = net;
  if (!g || g.role !== 'guest') return;
  const now = Date.now();
  if (!g.connected) {
    if (now - g.startedAt > CONFIG.connectTimeoutMs) {
      failGuest('Couldn’t connect to the room. Some school or office Wi-Fi blocks live games — try switching to mobile data.');
    }
    return;
  }
  if (g.conn && g.conn.open && !g.reconnectingSince) try { g.conn.send({ type: 'ping' }); } catch { /* ignore */ }
  if (!g.reconnectingSince && now - g.lastHeard > CONFIG.staleMs) lostHost(g);
}

function lostHost(g) {
  if (g.reconnectingSince) return;
  g.reconnectingSince = Date.now();
  setBanner('Connection lost — reconnecting…');
  retryHost(g);
}

function retryHost(g) {
  if (net !== g || !g.reconnectingSince) return;
  if (Date.now() - g.reconnectingSince > CONFIG.reconnectForMs) {
    failGuest('Lost the connection to the host, so the game has ended.', '🌙');
    return;
  }
  if (g.peer.destroyed) makeGuestPeer(g);
  else if (g.peer.disconnected) try { g.peer.reconnect(); } catch { makeGuestPeer(g); }
  else connectToHost(g);
  g.retryTimer = setTimeout(() => retryHost(g), CONFIG.retryEveryMs);
}

function stopGuest(g) {
  clearInterval(g.watch);
  clearTimeout(g.retryTimer);
  try { g.peer && g.peer.destroy(); } catch { /* ignore */ }
}

function failGuest(message, emoji) {
  const g = net;
  if (g && g.role === 'guest') stopGuest(g);
  net = null;
  forgetRoom();
  setBanner('');
  showError(message, emoji);
}

// Send an action to the game, wherever it runs.
function act(msg) {
  if (!net) return;
  if (net.role === 'host') handleAction(me.id, msg);
  else if (net.conn && net.conn.open) net.conn.send(msg);
}

function leaveGame() {
  if (net && net.role === 'host') closeRoom();
  if (net && net.role === 'guest') {
    const g = net;
    if (g.conn && g.conn.open) try { g.conn.send({ type: 'bye' }); } catch { /* ignore */ }
    setTimeout(() => stopGuest(g), 300);
  }
  net = null;
  forgetRoom();
  setBanner('');
  releaseWakeLock();
  history.replaceState(null, '', location.pathname);
  renderHome();
}

function forgetRoom() {
  store.del('sessionStorage', 'mm-role');
  store.del('sessionStorage', 'mm-host');
  ui.view = null;
  ui.stageKey = '';
}

function networkHelp(err) {
  switch (err && err.type) {
    case 'browser-incompatible': return 'This browser can’t run live games. Try a recent Chrome, Safari, Firefox or Edge.';
    case 'unavailable-id': return 'Couldn’t reopen that room. Start a new one from the home screen.';
    case 'network':
    case 'socket-error':
    case 'socket-closed':
    case 'server-error': return 'Couldn’t reach the game server. Check your internet connection and try again.';
    default: return `Something went wrong (${(err && err.type) || 'unknown error'}). Please try again.`;
  }
}

// =====================================================================
// Rendering
// =====================================================================
const app = $('#app');

function setScreen(name) {
  ui.screen = name;
  ui.stageKey = '';
  document.body.dataset.screen = name;
}

function receiveState(st) {
  const prev = ui.view;
  ui.view = st;
  ui.endsAt = Date.now() + (st.timeLeft || 0);
  if (prev && (prev.phase !== st.phase || prev.round !== st.round)) onPhaseChange(prev, st);
  render();
}

function onPhaseChange(prev, st) {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (st.phase === 'answer') {
    ui.pending = null;
    ui.lastTick = -1;
    sfx.start();
    buzz(30);
  } else if (st.phase === 'reveal' && prev.phase === 'answer') {
    sfx.whoosh();
    const r = myResult(st);
    const cheered = roundWinners(st).length > 0;
    setTimeout(() => (r.mood === 'exact' ? sfx.win() : cheered ? sfx.cheer() : r.mood === 'close' ? sfx.close() : sfx.miss()), 1500);
  } else if (st.phase === 'over') {
    sfx.fanfare();
    confetti();
  }
}

function render() {
  if (ui.screen !== 'game' || !ui.view) return;
  const v = ui.view;
  const amHost = v.hostId === me.id;
  const key = `${v.phase}:${v.round}:${amHost}`;
  if (ui.stageKey !== key) {
    ui.stageKey = key;
    app.innerHTML = topBar(v) + stageHTML(v, amHost);
    if (v.phase === 'lobby') drawQr(v.code);
  }
  updateRegions(v, amHost);
}

function topBar(v) {
  return `
    <header class="topbar">
      <button class="chip" data-action="copy" title="Copy invite link">Room<b>${esc(v.code)}</b></button>
      <div class="topbar-right">
        <button class="icon-btn" data-action="help" aria-label="How to play">?</button>
        <button class="icon-btn" data-action="mute" aria-label="Toggle sound">${sfx.muted ? '🔇' : '🔊'}</button>
        <button class="icon-btn" data-action="leave" aria-label="Leave game">✕</button>
      </div>
    </header>`;
}

function stageHTML(v, amHost) {
  if (v.phase === 'lobby') return lobbyHTML(v);
  if (v.phase === 'answer') return answerHTML(v);
  if (v.phase === 'reveal') return revealHTML(v, amHost);
  return overHTML(v, amHost);
}

const RULES_HTML = `
  <ol class="rules">
    <li><b>A desi question pops up with two answers.</b> Pick yours.</li>
    <li><b>Guess how many people picked the same as you</b> (count yourself).</li>
    <li><b>Exactly right scores ${POINTS.exact} points.</b> Off by one scores ${POINTS.close}.</li>
    <li><b>Then everyone sees who picked what.</b> Let the arguments begin.</li>
  </ol>`;

const hostName = (v) => (v.players.find((p) => p.id === v.hostId) || {}).name || 'the host';
const roundLabel = (v) => `Question ${v.round} of ${v.totalRounds}`;
const chip = (p, extra = '', prefix = '') => `<span class="pchip ${p.id === me.id ? 'me' : ''} ${extra}" style="--c:${p.color}">${prefix}${esc(p.name)}</span>`;
const roundWinners = (v) => (v.last ? v.players.filter((p) => (v.last.points[p.id] || 0) === POINTS.exact) : []);

function lobbyHTML(v) {
  const share = navigator.share ? '<button class="btn" data-action="share">Share…</button>' : '';
  return `
    <section class="card lobby">
      <p class="eyebrow">Room code</p>
      <div class="big-code">${esc(v.code)}</div>
      <p class="muted small">Friends open <b>${esc(prettyUrl())}</b> and type this code — or scan:</p>
      <div class="qr" id="qr" hidden></div>
      <div class="row">
        <button class="btn" data-action="copy">Copy invite link</button>
        ${share}
      </div>
      ${isLocalHost() ? '<p class="muted small" style="margin-top:12px">You’re hosting from your own computer, so friends join through the public site. Same room, same game.</p>' : ''}
    </section>
    <section class="card">
      <h2>Who’s here <span class="muted small" id="player-count"></span></h2>
      <ul class="player-list" id="lobby-players"></ul>
      <div id="start-area"></div>
    </section>
    <section class="card">
      <h2>Pick a section</h2>
      <div id="settings"></div>
    </section>
    <section class="card">
      <h2>How to play</h2>
      ${RULES_HTML}
    </section>`;
}

function settingsHTML(v, amHost) {
  const packs = PACK_ORDER.map((k) => {
    const info = packInfo(k);
    const on = v.pack === k;
    return `
      <button class="pack ${on ? 'on' : ''}" style="--pc:${info.color}" ${amHost ? `data-action="pack" data-pack="${k}"` : 'disabled'} aria-pressed="${on}">
        <span class="pack-top"><span class="pack-icon">${info.icon}</span><span class="pack-count">${shortCount(questionCount(k))} Qs</span></span>
        <span class="pack-title">${esc(info.title)}</span>
        <span class="pack-blurb">${esc(info.blurb)}</span>
      </button>`;
  }).join('');
  const lengths = Object.entries(CONFIG.lengths).map(([k, l]) => `
    <button class="seg ${v.length === k ? 'on' : ''}" ${amHost ? `data-action="length" data-length="${k}"` : 'disabled'} aria-pressed="${v.length === k}">
      <span class="seg-icon">${l.icon}</span><b>${l.label}</b><small>${l.rounds} questions</small>
    </button>`).join('');
  return `
    <div class="packs">${packs}</div>
    <p class="field-label">Game length</p>
    <div class="segs">${lengths}</div>
    ${amHost ? '' : `<p class="muted small center" style="margin-top:12px">${esc(hostName(v))} picks the section and length.</p>`}`;
}

function answerHTML(v) {
  const p = v.prompt;
  const option = (side, o) => `
    <button class="option opt-${side}" data-action="side" data-side="${side}" aria-pressed="false" aria-label="${esc(o.t)}">
      <span class="opt-emoji">${esc(o.e)}</span><span class="opt-text">${esc(o.t)}</span>
    </button>`;
  return `
    <section class="q-head">
      <p class="eyebrow">${roundLabel(v)}</p>
      <div class="timer" id="timer"><div class="timer-track"><div class="timer-fill" id="timer-fill"></div></div><span class="secs" data-countdown></span></div>
    </section>
    <section class="prompt">
      <p class="round-tag">${esc(p.tag)}</p>
      <h1 class="prompt-q">${esc(p.q)}</h1>
      <div class="options">${option('a', p.a)}<span class="or">or</span>${option('b', p.b)}</div>
    </section>
    <section class="guess" id="guess">
      <h2>How many will pick the same as you?</h2>
      <div class="guess-row" id="guess-row"></div>
      <p class="muted small" id="guess-legend"></p>
    </section>
    <p class="lock-note" id="lock-note"></p>
    <div class="status" id="answer-status"></div>
    <section class="card"><h2>Scores</h2><div class="scores" id="scores"></div></section>`;
}

// An original cheering mascot: a dancing laddoo in a party hat.
const LADDOO_SVG = `
  <svg class="laddoo" viewBox="0 0 140 150" role="img" aria-label="Laddoo the mascot cheering">
    <g class="burst">
      <rect x="16" y="22" width="6" height="11" rx="2" fill="#ff5e7e" transform="rotate(-25 19 27)"/>
      <rect x="116" y="18" width="6" height="11" rx="2" fill="#2fd9c2" transform="rotate(25 119 23)"/>
      <rect x="34" y="6" width="5" height="9" rx="2" fill="#7ae582"/>
      <rect x="100" y="4" width="5" height="9" rx="2" fill="#ffcf5a"/>
      <circle cx="10" cy="56" r="3.5" fill="#ffcf5a"/>
      <circle cx="130" cy="58" r="3.5" fill="#c39bff"/>
    </g>
    <g class="arm arm-l"><path d="M40 96 Q20 80 22 56" fill="none" stroke="#d97300" stroke-width="9" stroke-linecap="round"/><circle cx="22" cy="53" r="8" fill="#ffb347"/></g>
    <g class="arm arm-r"><path d="M100 96 Q120 80 118 56" fill="none" stroke="#d97300" stroke-width="9" stroke-linecap="round"/><circle cx="118" cy="53" r="8" fill="#ffb347"/></g>
    <ellipse cx="54" cy="141" rx="11" ry="6" fill="#b85a00"/>
    <ellipse cx="86" cy="141" rx="11" ry="6" fill="#b85a00"/>
    <circle cx="70" cy="98" r="40" fill="#ffa62b"/>
    <g fill="#e07b00" opacity=".55">
      <circle cx="50" cy="72" r="3"/><circle cx="66" cy="66" r="2.5"/><circle cx="86" cy="70" r="3"/><circle cx="98" cy="86" r="2.5"/>
      <circle cx="42" cy="90" r="2.5"/><circle cx="100" cy="108" r="3"/><circle cx="56" cy="124" r="2.5"/><circle cx="84" cy="126" r="3"/>
      <circle cx="70" cy="134" r="2"/><circle cx="40" cy="112" r="2.5"/>
    </g>
    <path d="M52 92 q6 -8 12 0" fill="none" stroke="#3b1d00" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M76 92 q6 -8 12 0" fill="none" stroke="#3b1d00" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="48" cy="104" rx="6" ry="4" fill="#ff5e7e" opacity=".5"/>
    <ellipse cx="92" cy="104" rx="6" ry="4" fill="#ff5e7e" opacity=".5"/>
    <path d="M58 104 q12 20 24 0 z" fill="#7a1f00"/>
    <path d="M64 111 q6 7 12 0 q-6 -3 -12 0 z" fill="#ff7a8a"/>
    <g class="hat">
      <path d="M70 26 L55 62 L85 62 Z" fill="#ff5e7e"/>
      <path d="M63 44 L77 44 L80 52 L60 52 Z" fill="#ffcf5a"/>
      <circle cx="70" cy="25" r="5.5" fill="#2fd9c2"/>
    </g>
  </svg>`;

function revealHTML(v, amHost) {
  const L = v.last;
  const p = L.prompt;
  const total = L.counts.a + L.counts.b;
  const pa = total ? (L.counts.a / total) * 100 : 50;
  const names = (side) => v.players.filter((pl) => L.answers[pl.id] && L.answers[pl.id].side === side).map((pl) => chip(pl)).join('')
    || '<span class="muted small">nobody</span>';
  const r = myResult(v);
  const winners = roundWinners(v);
  const cheer = winners.length ? `
    <section class="cheer">
      ${LADDOO_SVG}
      <div class="bubble">
        <b>Cheers, ${esc(listNames(winners.map((w) => (w.id === me.id ? 'you' : w.name))))}! 🎉</b>
        <span>Read the room perfectly: +${POINTS.exact} points</span>
      </div>
    </section>` : '';
  const next = amHost
    ? `<button class="btn primary big" data-action="next">${v.final ? 'See final results' : 'Next question'}</button>
       <p class="muted small">Talk it out! Moving on by itself in <span data-countdown></span>s</p>`
    : `<p class="muted">Talk it out! ${esc(hostName(v))} will move on soon<span class="dots"></span></p>`;
  return `
    <section class="q-head"><p class="eyebrow">${roundLabel(v)} · results</p></section>
    <section class="prompt small"><p class="round-tag">${esc(p.tag)}</p><h1 class="prompt-q">${esc(p.q)}</h1></section>
    <section class="split">
      <div class="split-labels"><span class="lab-a">${esc(p.a.e)} ${esc(p.a.t)}</span><span class="lab-b">${esc(p.b.e)} ${esc(p.b.t)}</span></div>
      <div class="split-row">
        <b class="count count-a">${L.counts.a}</b>
        <div class="split-bar"><div class="split-a" style="--pa:${pa}%"></div><div class="split-b"></div></div>
        <b class="count count-b">${L.counts.b}</b>
      </div>
      <div class="split-names"><div class="names names-a">${names('a')}</div><div class="names names-b">${names('b')}</div></div>
      <p class="room-quip">${esc(roomQuip(v))}</p>
    </section>
    ${cheer}
    <section class="result ${r.mood}"><h2>${esc(r.title)}</h2><p>${esc(r.sub)}</p></section>
    <div class="next-area">${next}</div>
    <section class="card"><h2>Scores</h2><div class="scores" id="scores"></div></section>`;
}

function overHTML(v, amHost) {
  const winners = v.players.filter((p) => v.winners.includes(p.id));
  let title = 'Game over!';
  if (winners.length === 1) title = winners[0].id === me.id ? 'You read the room best!' : `${winners[0].name} read the room best!`;
  else if (winners.length > 1) title = `It’s a tie: ${listNames(winners.map((p) => (p.id === me.id ? 'you' : p.name)))}!`;
  const ranked = [...v.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const medal = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
  const cards = ranked.map((p, i) => {
    const t = v.titles.find((x) => x.id === p.id) || { icon: '🌟', title: 'Player', note: '' };
    return `
      <div class="tagcard" style="--c:${p.color};--i:${i}">
        <span class="tc-rank">${medal(i)}</span>
        <span class="tc-avatar">${esc(initial(p.name))}</span>
        <div class="tc-body">
          <p class="tc-name">${esc(p.name)}${p.id === me.id ? ' <em>you</em>' : ''}</p>
          <p class="tc-tag">${t.icon} ${esc(t.title)}</p>
          <p class="tc-note">${esc(t.note)}</p>
        </div>
        <span class="tc-score">${p.score}<small>pts</small></span>
      </div>`;
  }).join('');
  const next = amHost
    ? '<button class="btn primary big" data-action="again">Play again</button>'
    : `<p class="waiting-note">Waiting for ${esc(hostName(v))} to start a new game<span class="dots"></span></p>`;
  return `
    <section class="winner">
      <div class="trophy">🏆</div>
      <p class="eyebrow">Game over after ${v.round} questions</p>
      <h1>${esc(title)}</h1>
    </section>
    <section class="tagcards">
      <h2 class="section-title">Everyone’s tag</h2>
      ${cards}
    </section>
    <div class="next-area">${next}</div>`;
}

function roomQuip(v) {
  const { counts, answers, prompt } = v.last;
  const total = counts.a + counts.b;
  if (!total) return 'Nobody answered! 😴';
  if (total === 1) return 'A room of one. Bold. 😅';
  if (!counts.a || !counts.b) return 'Unanimous! The whole room agrees. 🤝';
  if (counts.a === counts.b) return 'A perfect split. Fight it out! ⚖️';
  const loneSide = counts.a === 1 ? 'a' : counts.b === 1 ? 'b' : null;
  if (loneSide && total >= 3) {
    const lone = v.players.find((p) => answers[p.id] && answers[p.id].side === loneSide);
    if (lone && lone.id === me.id) return 'You stand alone. Explain yourself! 🦄';
    return `${lone ? lone.name : 'Someone'} stands alone. Explain yourself! 🦄`;
  }
  return `The room has spoken: ${counts.a > counts.b ? prompt.a.t : prompt.b.t}.`;
}

function myResult(v) {
  const L = v.last;
  if (!L || !has(L.points, me.id)) return { mood: 'miss', title: 'Welcome!', sub: 'You’ll play from the next question.' };
  const a = L.answers[me.id];
  if (!a) return { mood: 'miss', title: 'You missed this one', sub: `You have ${CONFIG.answerSeconds} seconds to answer each question.` };
  const same = L.counts[a.side];
  const who = same === 1 ? 'just you' : `${same} of you`;
  if (!a.guess) return { mood: 'miss', title: 'No guess, no points', sub: `You picked a side but didn’t guess. It was ${who}.` };
  const pts = L.points[me.id] || 0;
  if (pts === POINTS.exact) return { mood: 'exact', title: `🎯 Nailed it! +${pts}`, sub: `You guessed ${a.guess}, and it was ${same === 1 ? 'just you' : `exactly ${same} of you`}.` };
  if (pts === POINTS.close) return { mood: 'close', title: `So close! +${pts}`, sub: `You guessed ${a.guess}. It was ${who}.` };
  return { mood: 'miss', title: 'You misread the room!', sub: `You guessed ${a.guess}. It was ${who}.` };
}

// Parts of the screen that change without a phase change: only touched when their content differs.
function updateRegions(v, amHost) {
  if (v.phase === 'lobby') {
    const n = v.players.filter((p) => p.connected).length;
    setText('player-count', `${n}/${CONFIG.maxPlayers}`);
    setHTML('lobby-players', v.players.map((p) => `
      <li class="player" style="--c:${p.color}">
        <span class="avatar">${esc(initial(p.name))}</span>
        <span class="pname">${esc(p.name)}</span>
        ${p.id === v.hostId ? '<span class="tag">host</span>' : p.id === me.id ? '<span class="tag">you</span>' : ''}
      </li>`).join(''));
    setHTML('settings', settingsHTML(v, amHost));
    setHTML('start-area', amHost
      ? `<button class="btn primary big" data-action="start" ${n < 2 ? 'disabled' : ''}>Start game</button>
         <p class="muted small center" style="margin-top:8px">${n < 2 ? 'Waiting for at least one more player… (best with 4 or more)' : `${n} players ready. Late arrivals can join mid-game.`}</p>`
      : `<p class="waiting-note">Waiting for ${esc(hostName(v))} to start the game<span class="dots"></span></p>`);
  }
  if (v.phase === 'answer') {
    updateAnswerUI(v);
    const active = v.players.filter((p) => p.connected);
    const done = active.filter((p) => p.done).length;
    setHTML('answer-status', `
      <p class="status-line"><b>${done}/${active.length}</b> locked in</p>
      <div class="chips">${active.map((p) => chip(p, p.done ? '' : 'waiting', p.done ? '✓ ' : '')).join('')}</div>`);
  }
  setHTML('scores', scoresHTML(v));
}

function currentAnswer(v) {
  const ans = { ...(v.myAnswer || {}) };
  const p = ui.pending;
  if (p && p.round === v.round && Date.now() - p.at < 3000) Object.assign(ans, p.ans);
  return ans;
}

function updateAnswerUI(v) {
  const n = Math.max(2, v.players.filter((p) => p.connected).length);
  const row = document.getElementById('guess-row');
  if (row && row.dataset.n !== String(n)) {
    row.dataset.n = String(n);
    row.style.setProperty('--n', String(Math.min(n, 6)));
    row.innerHTML = Array.from({ length: n }, (_, i) => i + 1)
      .map((k) => `<button class="g" data-action="guess" data-guess="${k}" aria-pressed="false">${k}</button>`).join('');
    setText('guess-legend', `1 = just you · ${n} = everyone`);
  }
  const ans = currentAnswer(v);
  document.querySelectorAll('.option').forEach((b) => {
    const on = b.dataset.side === ans.side;
    b.classList.toggle('selected', on);
    b.classList.toggle('dim', !!ans.side && !on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll('.g').forEach((b) => {
    const on = Number(b.dataset.guess) === ans.guess;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const guess = document.getElementById('guess');
  if (guess) {
    guess.classList.toggle('side-a', ans.side === 'a');
    guess.classList.toggle('side-b', ans.side === 'b');
  }
  const note = document.getElementById('lock-note');
  if (note) {
    const done = !!(ans.side && ans.guess);
    note.classList.toggle('done', done);
    note.textContent = done ? '✓ Locked in. You can still change your mind until time runs out.'
      : ans.side ? 'Now guess how many will pick the same as you.'
        : ans.guess ? 'Now pick a side.'
          : 'Pick a side, then make your guess.';
  }
}

function scoresHTML(v) {
  const showGain = v.phase === 'reveal' && v.last;
  const top = Math.max(1, ...v.players.map((p) => p.score));
  const rows = [...v.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows.map((p) => {
    const gain = showGain ? (v.last.points[p.id] || 0) : 0;
    const to = p.score / top;
    const from = (p.score - gain) / top;
    const extra = (p.id === me.id ? ' <em>you</em>' : '') + (p.connected ? '' : ' <em>💤 away</em>');
    return `
      <div class="score-row ${p.connected ? '' : 'offline'}">
        <span class="dot" style="--c:${p.color}"></span>
        <span class="score-name"><span class="nm">${esc(p.name)}${extra}</span>${p.tag ? `<span class="ptag">${esc(p.tag)}</span>` : ''}</span>
        <span class="bar"><span class="bar-fill" style="--c:${p.color};--from:${from};--to:${to}"></span></span>
        <span class="score-num">${p.score}${gain ? `<small>+${gain}</small>` : ''}</span>
      </div>`;
  }).join('');
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el && el._html !== html) { el._html = html; el.innerHTML = html; }
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

// Countdown bar and ticking, driven by the local clock between host updates.
function frame() {
  const v = ui.view;
  if (ui.screen === 'game' && v && (v.phase === 'answer' || v.phase === 'reveal')) {
    const left = Math.max(0, ui.endsAt - Date.now());
    const secs = Math.ceil(left / 1000);
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      const t = v.phase === 'answer' ? `${secs}s` : `${secs}`;
      if (el.textContent !== t) el.textContent = t;
    });
    if (v.phase === 'answer') {
      const fill = document.getElementById('timer-fill');
      if (fill) fill.style.transform = `scaleX(${left / (CONFIG.answerSeconds * 1000)})`;
      const timer = document.getElementById('timer');
      if (timer) timer.classList.toggle('hurry', secs <= 5);
      if (secs <= 5 && secs >= 1 && secs !== ui.lastTick) { ui.lastTick = secs; sfx.tick(); }
    }
  }
  requestAnimationFrame(frame);
}

// ---------- non-game screens ----------
function renderHome() {
  setScreen('home');
  const invited = normalizeCode(new URLSearchParams(location.search).get('room'));
  const nameField = `
    <label class="field" id="name-field"><span>Your name</span>
      <input id="name" name="name" maxlength="14" autocomplete="nickname" placeholder="e.g. Golu" value="${esc(me.name)}" enterkeyhint="go">
    </label>`;
  const actions = invited
    ? `<form class="stack" data-form="join">
         <p class="eyebrow center">You’re invited to room</p>
         <div class="big-code center" style="font-size:48px">${esc(invited)}</div>
         <input type="hidden" name="code" value="${esc(invited)}">
         ${nameField}
         <button class="btn primary big">Join the game</button>
       </form>
       <button class="btn link" data-action="clear-invite">Create my own room instead</button>`
    : `<form class="stack" data-form="create">
         ${nameField}
         <button class="btn primary big">Create a room</button>
       </form>
       <div class="divider">or join friends</div>
       <form class="join-row" data-form="join">
         <label class="field" id="code-field"><span>Room code</span>
           <input name="code" class="code-input" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" enterkeyhint="go">
         </label>
         <button class="btn">Join</button>
       </form>`;
  app.innerHTML = `
    <section class="hero">
      <h1 class="title">Mind<em>mela</em></h1>
      <p class="tagline">The desi party game: pick a side, guess who’s with you.</p>
      <div class="demo" aria-hidden="true"><span class="da">🍬 Meerut ki gajak</span><span class="dor">or</span><span class="db">🍮 Khurja ki khurchan</span></div>
    </section>
    <div id="install" class="install-area">${installHTML()}</div>
    <section class="card stack">${actions}</section>
    <section class="how">
      <div><b>🤔</b>Pick your side on a desi dilemma</div>
      <div><b>🔮</b>Guess how many agree with you</div>
      <div><b>😱</b>See who picked what</div>
    </section>
    <p class="muted small center">2–${CONFIG.maxPlayers} players · 11 sections · any phone · no sign-up</p>`;
}

function showBusy(message) {
  setScreen('busy');
  app.innerHTML = `
    <div class="screen-msg">
      <div class="spinner" role="progressbar" aria-label="Loading"></div>
      <p>${esc(message)}</p>
      <button class="btn link" data-action="home">Cancel</button>
    </div>`;
}

function showError(message, emoji = '🫣') {
  setScreen('error');
  app.innerHTML = `
    <div class="screen-msg">
      <div class="emoji">${emoji}</div>
      <p>${esc(message)}</p>
      <button class="btn primary" data-action="home">Back to start</button>
    </div>`;
}

function enterGame() {
  setScreen('game');
  keepAwake();
}

// ---------- invites ----------
// When the host runs the game on their own computer, "localhost" in a link would point at each
// friend's own phone. Rooms meet on the PeerJS server whichever copy of the game people open,
// so local hosts send friends to the public site instead.
const PUBLIC_URL = 'https://lalitbhardwaj2002.github.io/mindmela/';
const isLocalHost = () => location.protocol === 'file:'
  || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.hostname.endsWith('.localhost');
const joinBase = () => (isLocalHost() ? PUBLIC_URL : `${location.origin}${location.pathname}`);
const inviteUrl = (code) => `${joinBase()}?room=${code}`;
const prettyUrl = () => joinBase().replace(/^https?:\/\//, '').replace(/index\.html$/, '').replace(/\/$/, '');
function setRoomInUrl(code) { history.replaceState(null, '', `${location.pathname}?room=${code}`); }

function drawQr(code) {
  const el = document.getElementById('qr');
  if (!el || typeof qrcode !== 'function') return;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(inviteUrl(code));
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: `QR code to join room ${code}` });
    el.hidden = false;
  } catch (e) { console.warn('QR failed', e); }
}

async function copyInvite() {
  const url = inviteUrl(ui.view.code);
  try {
    await navigator.clipboard.writeText(url);
    toast('Invite link copied!');
  } catch {
    window.prompt('Copy this invite link:', url);
  }
}

// ---------- install as an app ----------
// Chrome and Edge on Android/desktop offer a one-tap install; iPhones install from Safari's Share menu.
let installPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function installHTML() {
  if (isStandalone()) return '';
  if (installPrompt) return '<button class="btn install" data-action="install">📲 Install the app</button>';
  if (isIos()) return '<p class="install-hint">📲 Use it like an app: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</p>';
  return '';
}
function renderInstall() {
  const el = document.getElementById('install');
  if (el) el.innerHTML = installHTML();
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  renderInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  renderInstall();
  toast('App installed! 🎉');
});

if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e)));
}

// ---------- events ----------
function answer(part) {
  const v = ui.view;
  if (!v || v.phase !== 'answer') return;
  const prev = ui.pending && ui.pending.round === v.round ? ui.pending.ans : {};
  ui.pending = { round: v.round, at: Date.now(), ans: { ...prev, ...part } };
  sfx.pick();
  buzz(15);
  updateAnswerUI(v);
  act({ type: 'answer', ...part });
}

const actions = {
  side: (btn) => answer({ side: btn.dataset.side }),
  guess: (btn) => answer({ guess: Number(btn.dataset.guess) }),
  pack: (btn) => act({ type: 'settings', pack: btn.dataset.pack }),
  length: (btn) => act({ type: 'settings', length: btn.dataset.length }),
  start: () => act({ type: 'start' }),
  next: () => act({ type: 'next' }),
  again: () => act({ type: 'again' }),
  copy: copyInvite,
  share() {
    const code = ui.view.code;
    navigator.share({ title: 'Mindmela', text: `Join my Mindmela game! Room code ${code}`, url: inviteUrl(code) }).catch(() => {});
  },
  async install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    renderInstall();
  },
  help: () => $('#help').showModal(),
  mute(btn) { btn.textContent = sfx.toggle() ? '🔇' : '🔊'; },
  leave() {
    const amHost = net && net.role === 'host';
    if (window.confirm(amHost ? 'Leave and end the game for everyone?' : 'Leave this game?')) leaveGame();
  },
  home: () => leaveGame(),
  'clear-invite'() { history.replaceState(null, '', location.pathname); renderHome(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const nameInput = $('#name');
  const name = cleanName(nameInput && nameInput.value);
  if (!name) { flagInvalid('name-field', nameInput); return; }
  me.name = name;
  store.set('localStorage', 'mm-name', name);
  sfx.unlock();
  if (form.dataset.form === 'create') {
    openRoom(randomCode());
  } else {
    const codeInput = form.querySelector('[name="code"]');
    const code = normalizeCode(codeInput.value);
    if (code.length !== 4) { flagInvalid('code-field', codeInput); return; }
    joinRoom(code);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.classList.contains('code-input')) e.target.value = normalizeCode(e.target.value);
});

function flagInvalid(fieldId, input) {
  const field = document.getElementById(fieldId);
  if (field) { field.classList.remove('invalid'); void field.offsetWidth; field.classList.add('invalid'); }
  if (input) input.focus();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (ui.screen === 'game') keepAwake();
  // Phones pause background tabs; when we come back, check the host is still there.
  const g = net;
  if (g && g.role === 'guest' && g.connected && !g.reconnectingSince && Date.now() - g.lastHeard > 4000) lostHost(g);
});

// ---------- banner / toast / confetti / vibration ----------
function setBanner(text) {
  const b = $('#banner');
  b.textContent = text;
  b.hidden = !text;
}

let toastTimer = null;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('#confetti');
  const colors = ['#ff5e7e', '#2fd9c2', '#ffcf5a', '#c39bff', '#ffffff'];
  box.innerHTML = Array.from({ length: 80 }, () => {
    const c = colors[Math.floor(Math.random() * colors.length)];
    return `<i style="left:${Math.random() * 100}%;background:${c};animation-duration:${2.2 + Math.random() * 2}s;animation-delay:${Math.random() * 0.6}s;transform:rotate(${Math.random() * 360}deg)"></i>`;
  }).join('');
  setTimeout(() => { box.innerHTML = ''; }, 5000);
}

function buzz(pattern) {
  const tapped = !navigator.userActivation || navigator.userActivation.hasBeenActive; // browsers block vibration before the first tap
  try { if (navigator.vibrate && tapped) navigator.vibrate(pattern); } catch { /* not supported */ }
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* not allowed: the game still works */ }
}
function releaseWakeLock() { if (wakeLock) wakeLock.release().catch(() => {}); wakeLock = null; }

// ---------- sound (synthesised, no audio files) ----------
const sfx = (() => {
  let ctx = null;
  let muted = store.get('localStorage', 'mm-muted') === '1';
  const ready = () => ctx && !muted;
  function tone(freq, start, dur, type = 'triangle', vol = 0.12, slideTo = 0) {
    if (!ready()) return;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  return {
    get muted() { return muted; },
    unlock() {
      try {
        if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
        if (ctx && ctx.state === 'suspended') ctx.resume();
      } catch { /* no audio */ }
    },
    toggle() { muted = !muted; store.set('localStorage', 'mm-muted', muted ? '1' : '0'); return muted; },
    tick: () => tone(1250, 0, 0.05, 'square', 0.035),
    pick: () => tone(620, 0, 0.08),
    start() { tone(392, 0, 0.14); tone(587, 0.12, 0.22); },
    whoosh: () => tone(200, 0, 0.9, 'sine', 0.07, 900),
    win: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.08, 0.22)),
    cheer: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.18, 'triangle', 0.08)),
    close: () => { tone(587, 0, 0.15); tone(740, 0.12, 0.22); },
    miss: () => tone(330, 0, 0.45, 'sine', 0.08, 180),
    fanfare: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.28)),
  };
})();
document.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });

// ---------- start ----------
// A saved game from an older version may point at questions that no longer exist.
const savedGameUsable = (saved) => !!(saved && saved.state && Array.isArray(saved.state.used) && Array.isArray(saved.state.recent))
  && [saved.state.prompt, saved.state.last && saved.state.last.prompt].every((id) => !id || getPrompt(id));

function boot() {
  requestAnimationFrame(frame);
  if (typeof Peer === 'undefined' || typeof PACKS === 'undefined' || typeof GEN === 'undefined') {
    showError('The game didn’t load properly. Check your internet connection and refresh the page.');
    return;
  }
  const code = normalizeCode(new URLSearchParams(location.search).get('room'));
  const role = store.get('sessionStorage', 'mm-role');
  if (code && role === 'host') {
    let saved = null;
    try { saved = JSON.parse(store.get('sessionStorage', 'mm-host') || 'null'); } catch { /* corrupt: start fresh */ }
    if (savedGameUsable(saved) && saved.state.code === code) { openRoom(code, saved); return; }
  }
  if (code && role === 'guest' && me.name) { joinRoom(code); return; }
  renderHome();
}

boot();
