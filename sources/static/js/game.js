// Numeria: main game client.
import {
  ELEMENTS, PRIMARY, ELEMENT_BLURB, elementMult, knownSpells, spellsUnlockedAt, SPECIES, ZONES,
  WINS_FOR_BOSS, zoneById, zoneUnlocked, MAX_LEVEL, xpToNext, playerMaxHp, powerScale, monsterStats,
  rewardXp, rewardGold, ITEMS, WANDS, HATS, PATTERNS, ROBE_COLORS, SKIN_TONES, HAIR_COLORS, ACHIEVEMENTS,
} from './data.js';
import { makeQuestion, recordAnswer, fmtMath, fmtChoice, SKILLS, skillName } from './math.js';
import { avatarSVG, monsterSVG, sceneSVG, mapSVG } from './art.js';
import { sfx, isMuted, toggleMute } from './audio.js';

// ------------------------------------------------------------------ helpers

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? Math.min(ms, 120) : ms));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const GUEST_KEY = `numeria:guest:${location.pathname}`;

const S = { mode: null, user: null, save: null, gradeLocked: false, offline: false, battle: null, lastSkill: null };

// ------------------------------------------------------------------ server

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'numeria' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Server error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let saveTimer = null;
let saving = Promise.resolve();
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!S.save) return saving;
  const snapshot = JSON.parse(JSON.stringify(S.save));
  saving = saving.then(async () => {
    if (S.mode === 'guest') {
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(snapshot)); } catch { toast('Could not save on this device.', 'warn'); }
      return;
    }
    try {
      const res = await api('PUT', 'api/save', { save: snapshot });
      if (S.save && res.grade && res.grade !== S.save.grade) {
        S.save.grade = res.grade;
        toast(`Your teacher set your math level to grade ${res.grade}.`);
      }
      S.gradeLocked = !!res.gradeLocked;
    } catch (e) {
      if (e.status === 401) toast('You were logged out. Please log in again to keep saving.', 'warn');
      else toast('Could not save your progress. Check your connection.', 'warn');
    }
  });
  return saving;
}
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

// ------------------------------------------------------------------ save data

const defaultLook = () => ({ robe: pick(ROBE_COLORS), hat: 'pointy', pattern: 'plain', skin: pick(SKIN_TONES), hair: pick(HAIR_COLORS) });

function newSave(name, grade, look, element) {
  return {
    v: 1, name, grade, look, element,
    level: 1, xp: 0, gold: 40,
    items: { potion: 2, elixir: 0, focus: 0 },
    wands: ['twig'], wand: 'twig',
    hats: ['pointy', 'wide', 'hood'], patterns: ['plain'],
    familiars: [], familiar: null,
    zones: {},
    stats: { answered: 0, correct: 0, streak: 0, bestStreak: 0, wins: 0, bosses: 0, skills: {} },
    achievements: [],
    seenIntro: false,
    created: Date.now(),
  };
}

function migrate(raw) {
  const base = newSave(raw.name || 'Wizard', raw.grade || 3, defaultLook(), raw.element || 'fire');
  const s = { ...base, ...raw };
  s.look = { ...base.look, ...(raw.look || {}) };
  s.items = { ...base.items, ...(raw.items || {}) };
  s.stats = { ...base.stats, ...(raw.stats || {}) };
  s.stats.skills = { ...(raw.stats?.skills || {}) };
  for (const k of ['wands', 'hats', 'patterns', 'familiars', 'achievements']) if (!Array.isArray(s[k])) s[k] = base[k];
  if (!PRIMARY.includes(s.element)) s.element = 'fire';
  s.level = clamp(Math.floor(s.level) || 1, 1, MAX_LEVEL);
  s.grade = clamp(Math.floor(s.grade) || 3, 1, 8);
  if (typeof s.zones !== 'object' || !s.zones) s.zones = {};
  return s;
}

// ------------------------------------------------------------------ UI bits

function toast(msg, kind = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = msg;
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4300);
}

function openModal(html, { cls = '', dismiss = true } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal card ${cls}" role="dialog" aria-modal="true">${dismiss ? '<button class="modal-x icon-btn" data-close aria-label="Close">✕</button>' : ''}${html}</div>`;
  document.body.append(wrap);
  if (dismiss) {
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) closeModal(); });
  }
  const focusable = wrap.querySelector('button.primary, button:not(.modal-x), input');
  focusable?.focus();
  return wrap.firstElementChild;
}
function closeModal() { $('.modal-backdrop')?.remove(); }

function hpBar(hp, max, cls = '') {
  const pct = clamp((hp / max) * 100, 0, 100);
  const tone = pct > 50 ? 'good' : pct > 25 ? 'mid' : 'low';
  return `<div class="hpbar ${cls}"><i class="${tone}" style="width:${pct}%"></i><span>${Math.max(0, Math.ceil(hp))} / ${max}</span></div>`;
}

const elIcon = (el) => `<span class="el-badge el-${el}" title="${ELEMENTS[el]?.name || ''}">${ELEMENTS[el]?.icon || ''}</span>`;

function topbar(active) {
  const s = S.save;
  const need = xpToNext(s.level);
  const pct = s.level >= MAX_LEVEL ? 100 : clamp((s.xp / need) * 100, 0, 100);
  const nav = [['map', '🗺️', 'Map'], ['shop', '🛒', 'Shop'], ['wizard', '🧙', 'Wizard'], ['familiars', '🐾', 'Familiars'], ['leaders', '🏆', 'Leaders']];
  return `<header class="topbar">
    <div class="tb-brand"><span class="logo-sm">Numeria</span></div>
    <nav class="tb-nav">${nav.map(([id, ic, label]) => `<button class="nav-btn ${active === id ? 'active' : ''}" data-nav="${id}"><span>${ic}</span><b>${label}</b></button>`).join('')}</nav>
    <div class="tb-stats">
      <div class="tb-level" title="${s.xp} / ${need} XP"><span>Lv ${s.level}</span><div class="xpbar"><i style="width:${pct}%"></i></div></div>
      <span class="tb-gold" title="Gold">🪙 <b>${s.gold}</b></span>
      <button class="icon-btn" data-act="mute" title="Sound on/off" aria-label="Toggle sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="logout" title="${S.mode === 'guest' ? 'Leave guest game' : 'Log out'}" aria-label="Log out">🚪</button>
    </div>
  </header>`;
}

function bindTopbar() {
  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => { sfx('click'); go(b.dataset.nav); }));
  $('[data-act="mute"]')?.addEventListener('click', (e) => { toggleMute(); e.currentTarget.textContent = isMuted() ? '🔇' : '🔊'; sfx('click'); });
  $('[data-act="logout"]')?.addEventListener('click', logout);
}

async function logout() {
  await saveNow();
  if (S.mode === 'server') {
    try { await api('POST', 'api/logout'); } catch { /* ignore */ }
  }
  S.mode = null; S.user = null; S.save = null;
  renderAuth();
}

function go(screen, ...args) {
  closeModal();
  window.scrollTo(0, 0);
  ({ map: renderMap, shop: renderShop, wizard: renderWizard, familiars: renderFamiliars, leaders: renderLeaders }[screen] || renderMap)(...args);
}

// ------------------------------------------------------------------ auth

function renderAuth(tab = 'login') {
  const look = { robe: '#7b2cbf', hat: 'star', pattern: 'stars', skin: '#f8c9a0', hair: '#5a3825' };
  app.innerHTML = `<div class="auth-screen">
    <div class="auth-hero">
      <h1 class="logo">Numeria</h1>
      <p class="tagline">Solve math. Cast spells. Befriend monsters.</p>
      <div class="hero-art"><div class="hero-wizard bob">${avatarSVG(look, 'storm')}</div><div class="hero-monster bob delay">${monsterSVG(SPECIES.bramblebun)}</div></div>
    </div>
    <div class="card auth-card">
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="login" class="${tab === 'login' ? 'active' : ''}">Log in</button>
        <button role="tab" data-tab="register" class="${tab === 'register' ? 'active' : ''}">New wizard</button>
      </div>
      <form id="auth-form" class="${tab}" autocomplete="on" ${S.offline ? 'hidden' : ''}>
        <label>Wizard name<input name="username" autocomplete="username" required minlength="3" maxlength="20" placeholder="e.g. Starlight"></label>
        <label>Password<input type="password" name="password" autocomplete="${tab === 'login' ? 'current-password' : 'new-password'}" required minlength="4" maxlength="200"></label>
        <label class="reg-only">Type the password again<input type="password" name="password2" autocomplete="new-password" minlength="4" maxlength="200"></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary big" type="submit">${tab === 'login' ? 'Enter Numeria' : 'Create my wizard'}</button>
        ${tab === 'login' ? '<p class="muted small">Forgot your password? Ask your teacher or parent to reset it.</p>' : '<p class="muted small">Pick a password you can remember. Don\'t use your real full name.</p>'}
      </form>
      ${S.offline ? '<p class="notice">The game server can\'t be reached right now, but you can still play as a guest.</p>' : '<div class="divider"><span>or</span></div>'}
      <button class="btn ghost" id="guest-btn">Play as guest <small>(saves on this device only)</small></button>
    </div>
  </div>`;
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => renderAuth(b.dataset.tab)));
  $('#guest-btn').addEventListener('click', startGuest);
  const form = $('#auth-form');
  form.querySelector('input').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const err = $('.form-error');
    err.textContent = '';
    if (tab === 'register' && f.get('password') !== f.get('password2')) { err.textContent = 'The two passwords are different.'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const res = await api('POST', tab === 'login' ? 'api/login' : 'api/register', { username: f.get('username'), password: f.get('password') });
      S.mode = 'server'; S.user = res.user; S.gradeLocked = !!res.gradeLocked;
      if (res.save) { S.save = migrate(res.save); sfx('win'); go('map'); }
      else renderCreator();
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });
}

function startGuest() {
  S.mode = 'guest'; S.user = null;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); } catch { /* ignore */ }
  if (saved) { S.save = migrate(saved); go('map'); } else renderCreator();
}

// ------------------------------------------------------------------ creator

function renderCreator() {
  const draft = { name: S.user?.username || '', grade: 3, element: 'fire', look: defaultLook() };
  const gradeLabel = (g) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][g - 1];
  const swatches = (key, list) => list.map((c) => `<button type="button" class="swatch ${draft.look[key] === c ? 'active' : ''}" data-look="${key}" data-val="${c}" style="background:${c}" aria-label="${key} ${c}"></button>`).join('');
  const draw = () => {
    app.innerHTML = `<div class="creator">
      <h1 class="logo small">Create your wizard</h1>
      <div class="creator-grid">
        <div class="card preview-card">
          <div class="preview bob">${avatarSVG(draft.look, draft.element)}</div>
          <div class="preview-name">${esc(draft.name || 'Your wizard')}</div>
          <div class="muted">${ELEMENTS[draft.element].icon} ${ELEMENTS[draft.element].name} wizard</div>
        </div>
        <div class="card options">
          ${S.mode === 'guest' ? `<label class="field">Wizard name<input id="c-name" maxlength="20" value="${esc(draft.name)}" placeholder="Your wizard's name"></label>` : ''}
          <div class="field"><span class="field-label">Which grade are you in? <small>(math questions will match it)</small></span>
            <div class="grade-row">${[1, 2, 3, 4, 5, 6, 7, 8].map((g) => `<button type="button" class="chip ${draft.grade === g ? 'active' : ''}" data-grade="${g}">${gradeLabel(g)}</button>`).join('')}</div></div>
          <div class="field"><span class="field-label">Choose your element</span>
            <div class="element-row">${PRIMARY.map((el) => `<button type="button" class="element-card el-${el} ${draft.element === el ? 'active' : ''}" data-el="${el}"><span class="big-icon">${ELEMENTS[el].icon}</span><b>${ELEMENTS[el].name}</b><small>${ELEMENT_BLURB[el]}</small></button>`).join('')}</div></div>
          <div class="field"><span class="field-label">Robe color</span><div class="swatches">${swatches('robe', ROBE_COLORS)}</div></div>
          <div class="field"><span class="field-label">Hat</span><div class="grade-row">${['pointy', 'wide', 'hood'].map((h) => `<button type="button" class="chip ${draft.look.hat === h ? 'active' : ''}" data-hat="${h}">${HATS[h].name}</button>`).join('')}</div></div>
          <div class="field two-col"><div><span class="field-label">Skin</span><div class="swatches">${swatches('skin', SKIN_TONES)}</div></div>
            <div><span class="field-label">Hair</span><div class="swatches">${swatches('hair', HAIR_COLORS)}</div></div></div>
          <p class="form-error" role="alert"></p>
          <button class="btn primary big" id="c-go">Begin the adventure ✨</button>
        </div>
      </div>
    </div>`;
    $('#c-name')?.addEventListener('input', (e) => { draft.name = e.target.value; $('.preview-name').textContent = draft.name || 'Your wizard'; });
    $$('[data-grade]').forEach((b) => b.addEventListener('click', () => { draft.grade = Number(b.dataset.grade); sfx('click'); draw(); }));
    $$('[data-el]').forEach((b) => b.addEventListener('click', () => { draft.element = b.dataset.el; sfx('click'); draw(); }));
    $$('[data-look]').forEach((b) => b.addEventListener('click', () => { draft.look[b.dataset.look] = b.dataset.val; sfx('click'); draw(); }));
    $$('[data-hat]').forEach((b) => b.addEventListener('click', () => { draft.look.hat = b.dataset.hat; sfx('click'); draw(); }));
    $('#c-go').addEventListener('click', async () => {
      const name = (S.user?.username || draft.name || '').trim();
      if (name.length < 2) { $('.form-error').textContent = 'Give your wizard a name first!'; return; }
      S.save = newSave(name.slice(0, 20), draft.grade, draft.look, draft.element);
      sfx('levelup');
      await saveNow();
      go('map');
    });
  };
  draw();
}

// ------------------------------------------------------------------ map

function renderMap() {
  const s = S.save;
  const fam = s.familiar ? SPECIES[s.familiar] : null;
  const nextZone = ZONES.find((z, i) => zoneUnlocked(s, i) && !s.zones[z.id]?.boss);
  app.innerHTML = `${topbar('map')}
  <main class="map-screen">
    <div class="map-wrap card">${mapSVG(s, (i) => zoneUnlocked(s, i))}</div>
    <aside class="map-side">
      <div class="card hero-card">
        <div class="hero-row">
          <div class="mini-avatar">${avatarSVG(s.look, s.element, { wand: s.wand })}</div>
          ${fam ? `<div class="mini-fam bob">${monsterSVG(fam)}</div>` : ''}
        </div>
        <h2>${esc(s.name)}</h2>
        <p class="muted">${ELEMENTS[s.element].icon} ${ELEMENTS[s.element].name} wizard · Level ${s.level}</p>
        <p class="muted small">Math level: grade ${s.grade}${S.mode === 'guest' ? ' · Guest' : ''}</p>
      </div>
      <div class="card quest-card">
        <h3>📜 Current quest</h3>
        ${nextZone
          ? `<p>${(s.zones[nextZone.id]?.wins || 0) >= WINS_FOR_BOSS ? `Challenge <b>${SPECIES[nextZone.boss].name}</b> in ${nextZone.name}!` : `Win battles in <b>${nextZone.name}</b> (${Math.min(s.zones[nextZone.id]?.wins || 0, WINS_FOR_BOSS)}/${WINS_FOR_BOSS}) to find its guardian.`}</p>
             <button class="btn primary" data-zone-open="${nextZone.id}">Go to ${nextZone.name}</button>`
          : '<p>You saved Numeria! 🎉 Keep exploring — monsters grow stronger as you do.</p>'}
      </div>
      <div class="card tip-card"><h3>💡 Tip</h3><p>${pick(TIPS)}</p></div>
    </aside>
  </main>`;
  bindTopbar();
  $$('.map-node').forEach((n) => {
    n.addEventListener('click', () => openZone(n.dataset.zone));
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openZone(n.dataset.zone); } });
  });
  $('[data-zone-open]')?.addEventListener('click', (e) => openZone(e.currentTarget.dataset.zoneOpen));
  if (!s.seenIntro) showIntro();
}

const TIPS = [
  'Spells are stronger against the element they beat: 🔥 beats 🌿, 🌿 beats ⚡, ⚡ beats 💧, 💧 beats 🔥.',
  'Answer several questions in a row correctly to build a streak — streaks make critical hits more likely!',
  'Got one wrong? Read the hint. It shows a trick for next time.',
  'Befriended familiars fight beside you and add extra damage every time you answer correctly.',
  'Bosses gather power before a big attack. That is a great moment to cast Ward or heal.',
  'Visit the shop to buy Berry Tonics and better wands with the gold you win.',
  'Your math level adapts: skills you find tricky come up more often until you master them.',
];

function showIntro() {
  openModal(`<h2>Welcome to Numeria, ${esc(S.save.name)}! ✨</h2>
    <ol class="intro-list">
      <li><b>Pick a land</b> on the map to find monsters.</li>
      <li><b>Choose a spell</b> in battle, then <b>answer the math question</b> to cast it.</li>
      <li>Right answer = your spell hits! Wrong answer = it fizzles, and you'll see how to solve it.</li>
      <li>Win <b>${WINS_FOR_BOSS} battles</b> in a land to face its guardian and unlock the next land.</li>
      <li>Some defeated monsters want to become your <b>familiar</b> and fight by your side.</li>
    </ol>
    <div class="element-wheel">${PRIMARY.map((el) => `<span>${ELEMENTS[el].icon} beats ${ELEMENTS[ELEMENTS[el].beats].icon}</span>`).join('')}</div>
    <button class="btn primary big" data-close>Let's go!</button>`);
  S.save.seenIntro = true;
  queueSave();
}

function openZone(id) {
  const s = S.save;
  const idx = ZONES.findIndex((z) => z.id === id);
  const z = ZONES[idx];
  sfx('click');
  if (!zoneUnlocked(s, idx)) {
    openModal(`<h2>🔒 ${z.name}</h2><p>${z.desc}</p><p>Defeat <b>${SPECIES[ZONES[idx - 1].boss].name}</b> in ${ZONES[idx - 1].name} to open the way here.</p><button class="btn" data-close>OK</button>`);
    return;
  }
  const st = s.zones[z.id] || { wins: 0, boss: false };
  const bossReady = st.wins >= WINS_FOR_BOSS || st.boss;
  const range = st.boss ? `${z.min}+` : `${z.min}–${z.max}`;
  openModal(`<div class="zone-modal theme-${z.theme}">
    <div class="zone-banner">${sceneSVG(z.theme)}<h2>${z.icon} ${z.name}</h2></div>
    <p>${z.desc}</p>
    <p class="muted small">Monster levels ${range}</p>
    <div class="zone-monsters">${z.monsters.map((m) => `<figure>${monsterSVG(SPECIES[m])}<figcaption>${SPECIES[m].name} ${elIcon(SPECIES[m].element)}</figcaption></figure>`).join('')}
      <figure class="boss ${bossReady ? '' : 'hidden-boss'}">${monsterSVG(SPECIES[z.boss])}<figcaption>${bossReady ? SPECIES[z.boss].name : '???'} 👑</figcaption></figure></div>
    <div class="progress-line"><span>Battles won here</span><div class="xpbar wide"><i style="width:${clamp((st.wins / WINS_FOR_BOSS) * 100, 0, 100)}%"></i></div><b>${Math.min(st.wins, WINS_FOR_BOSS)}/${WINS_FOR_BOSS}</b></div>
    <div class="btn-row">
      <button class="btn primary big" id="z-explore">⚔️ Explore</button>
      <button class="btn big boss-btn" id="z-boss" ${bossReady ? '' : 'disabled'}>👑 ${st.boss ? 'Rematch' : 'Challenge'} ${bossReady ? SPECIES[z.boss].name : 'guardian'}</button>
    </div>
  </div>`, { cls: 'wide' });
  $('#z-explore').addEventListener('click', () => startBattle(z.id, false));
  $('#z-boss').addEventListener('click', () => startBattle(z.id, true));
}

// ------------------------------------------------------------------ battle

function startBattle(zoneId, isBoss) {
  closeModal();
  const s = S.save;
  const z = zoneById(zoneId);
  const cleared = !!s.zones[z.id]?.boss;
  let speciesId, level;
  if (isBoss) {
    speciesId = z.boss;
    level = cleared ? Math.max(z.bossLevel, s.level + 1) : z.bossLevel;
  } else {
    speciesId = pick(z.monsters);
    level = clamp(s.level + rnd(-1, 1), z.min, cleared ? MAX_LEVEL : z.max);
  }
  const sp = SPECIES[speciesId];
  const ms = monsterStats(sp, level, isBoss);
  const maxHp = playerMaxHp(s.level);
  S.battle = {
    zone: z, isBoss, turn: 0, busy: false,
    enemy: { id: speciesId, sp, level, hp: ms.maxHp, maxHp: ms.maxHp, atk: ms.atk, element: sp.element, charging: false },
    player: { hp: maxHp, maxHp, ward: 0, focus: false },
    answered: 0, correct: 0,
  };
  renderBattle();
  log(isBoss ? `👑 ${sp.name} blocks your path!` : `A wild ${sp.name} appears!`);
  showChoose();
}

function renderBattle() {
  const B = S.battle, s = S.save;
  const fam = s.familiar ? SPECIES[s.familiar] : null;
  app.innerHTML = `<div class="battle theme-${B.zone.theme}">
    <div class="stage">
      <div class="scene">${sceneSVG(B.zone.theme)}</div>
      <div class="hpcard player-card">
        <div class="hp-name">${esc(s.name)} <small>Lv ${s.level}</small> ${elIcon(s.element)} <span id="p-status"></span></div>
        <div id="p-hp">${hpBar(B.player.hp, B.player.maxHp)}</div>
      </div>
      <div class="hpcard enemy-card ${B.isBoss ? 'boss' : ''}">
        <div class="hp-name">${B.isBoss ? '👑 ' : ''}${B.enemy.sp.name} <small>Lv ${B.enemy.level}</small> <span id="e-el">${elIcon(B.enemy.element)}</span> <span id="e-status"></span></div>
        <div id="e-hp">${hpBar(B.enemy.hp, B.enemy.maxHp, 'enemy')}</div>
      </div>
      <div class="fighter player" id="pl"><div class="sprite bob">${avatarSVG(s.look, s.element, { wand: s.wand })}</div></div>
      ${fam ? `<div class="fighter familiar" id="fam"><div class="sprite bob delay">${monsterSVG(fam, { cls: 'flip' })}</div></div>` : ''}
      <div class="fighter enemy ${B.isBoss ? 'boss' : ''}" id="en"><div class="sprite bob delay">${monsterSVG(B.enemy.sp, { element: B.enemy.element })}</div></div>
      <div class="fx-layer" id="fx"></div>
      <div class="streak-badge" id="streak" hidden></div>
    </div>
    <div class="battle-log" id="log" aria-live="polite"></div>
    <div class="panel card" id="panel"></div>
  </div>`;
  updateStreak();
}

function log(msg) { const l = $('#log'); if (l) l.innerHTML = msg; }
function setPanel(html) { const p = $('#panel'); p.innerHTML = html; return p; }

function updateBars() {
  const B = S.battle;
  $('#p-hp').innerHTML = hpBar(B.player.hp, B.player.maxHp);
  $('#e-hp').innerHTML = hpBar(B.enemy.hp, B.enemy.maxHp, 'enemy');
  $('#p-status').innerHTML = `${B.player.ward ? `<span class="status" title="Ward">🛡️${B.player.ward}</span>` : ''}${B.player.focus ? '<span class="status" title="Focus Charm">🔮</span>' : ''}`;
  $('#e-status').innerHTML = B.enemy.charging ? '<span class="status warn" title="Charging a big attack">💢</span>' : '';
  $('#e-el').innerHTML = elIcon(B.enemy.element);
}

function updateStreak() {
  const el = $('#streak');
  if (!el) return;
  const n = S.save.stats.streak;
  el.hidden = n < 2;
  el.innerHTML = `🔥 ${n} streak`;
}

function showChoose() {
  const B = S.battle, s = S.save;
  B.busy = false;
  const spells = knownSpells(s);
  const itemCount = Object.values(s.items).reduce((a, b) => a + b, 0);
  const panel = setPanel(`<div class="panel-title">What will you do?</div>
    <div class="spell-grid">${spells.map((sp) => {
      let badge = '';
      if (sp.kind === 'attack') {
        const m = elementMult(sp.element, B.enemy.element);
        badge = m > 1 ? '<em class="eff good">▲ strong</em>' : m < 1 ? '<em class="eff bad">▼ weak</em>' : '';
      }
      const detail = sp.kind === 'attack' ? `Power ${sp.power}` : sp.kind === 'heal' ? 'Heal 40%' : 'Shield ×2';
      return `<button class="spell-btn el-${sp.element} ${sp.cantrip ? 'cantrip' : ''}" data-spell="${sp.id}">
        <span class="sp-icon">${sp.icon || ELEMENTS[sp.element].icon}</span><span class="sp-name">${sp.name}</span><small>${detail}</small>${badge}</button>`;
    }).join('')}</div>
    <div class="btn-row small-row">
      <button class="btn" id="b-items" ${itemCount ? '' : 'disabled'}>🎒 Items (${itemCount})</button>
      <button class="btn ghost" id="b-run">🏃 Run away</button>
    </div>`);
  $$('[data-spell]', panel).forEach((b) => b.addEventListener('click', () => {
    if (B.busy) return;
    sfx('click');
    askQuestion(spells.find((x) => x.id === b.dataset.spell));
  }));
  $('#b-items').addEventListener('click', showItems);
  $('#b-run').addEventListener('click', () => {
    sfx('click');
    log('You slipped away safely.');
    S.battle = null;
    saveNow();
    go('map');
  });
}

function showItems() {
  const s = S.save, B = S.battle;
  const owned = Object.entries(s.items).filter(([, n]) => n > 0);
  const panel = setPanel(`<div class="panel-title">Your bag</div>
    <div class="item-list">${owned.map(([id, n]) => `<button class="item-btn" data-item="${id}"><span class="sp-icon">${ITEMS[id].icon}</span><span><b>${ITEMS[id].name}</b> ×${n}<small>${ITEMS[id].desc}</small></span></button>`).join('')}</div>
    <div class="btn-row small-row"><button class="btn ghost" id="b-back">← Back</button></div>`);
  $('#b-back').addEventListener('click', showChoose);
  $$('[data-item]', panel).forEach((b) => b.addEventListener('click', async () => {
    if (B.busy) return;
    B.busy = true;
    const id = b.dataset.item, item = ITEMS[id];
    s.items[id] -= 1;
    setPanel('<div class="panel-title">…</div>');
    if (item.heal) {
      const amt = Math.min(B.player.maxHp - B.player.hp, Math.round(B.player.maxHp * item.heal));
      B.player.hp += amt;
      sfx('heal');
      sparkle($('#pl'), '#5fd068');
      floatText($('#pl'), `+${amt}`, 'heal');
      log(`You drank a ${item.name} and recovered ${amt} health.`);
    } else if (id === 'focus') {
      B.player.focus = true;
      sfx('cast');
      sparkle($('#pl'), '#b07cff');
      log('🔮 You feel focused! Your next correct spell deals double damage.');
    }
    updateBars();
    queueSave();
    await sleep(900);
    await enemyTurn();
  }));
}

function askQuestion(spell) {
  const B = S.battle, s = S.save;
  const q = makeQuestion(s, S.lastSkill);
  S.lastSkill = q.skill;
  B.question = q;
  B.spell = spell;
  const panel = setPanel(`<div class="q-card">
    <div class="q-head"><span class="q-skill">${skillName(q.skill)}</span><span class="q-spell">${spell.icon || ELEMENTS[spell.element].icon} ${spell.name}</span></div>
    <div class="q-text">${fmtMath(q.text)}</div>
    <div class="answers">${q.choices.map((c, i) => `<button class="answer-btn" data-i="${i}"><kbd>${i + 1}</kbd><span>${fmtChoice(c)}</span></button>`).join('')}</div>
    <div class="btn-row small-row"><button class="btn ghost small" id="q-back">← Pick another spell</button></div>
  </div>`);
  $$('.answer-btn', panel).forEach((b) => b.addEventListener('click', () => onAnswer(Number(b.dataset.i))));
  $('#q-back').addEventListener('click', () => { sfx('click'); showChoose(); });
  log(`Answer correctly to cast <b>${spell.name}</b>!`);
}

async function onAnswer(i) {
  const B = S.battle, s = S.save;
  if (!B || B.busy || !B.question) return;
  B.busy = true;
  const q = B.question;
  B.question = null;
  const choice = q.choices[i];
  const correct = choice === q.answer;
  $$('.answer-btn').forEach((b) => {
    b.disabled = true;
    const c = q.choices[Number(b.dataset.i)];
    if (c === q.answer) b.classList.add('correct');
    else if (Number(b.dataset.i) === i) b.classList.add('wrong');
  });
  $('#q-back')?.remove();
  recordAnswer(s, q.skill, correct);
  s.stats.answered += 1;
  B.answered += 1;
  if (correct) {
    s.stats.correct += 1;
    B.correct += 1;
    s.stats.streak += 1;
    s.stats.bestStreak = Math.max(s.stats.bestStreak, s.stats.streak);
    sfx('correct');
    updateStreak();
    await sleep(500);
    await castSpell(B.spell);
  } else {
    s.stats.streak = 0;
    updateStreak();
    sfx('wrong');
    await sleep(350);
    await new Promise((resolve) => {
      const panel = setPanel(`<div class="feedback">
        <div class="fb-title">Not quite! The answer is <b class="fb-answer">${fmtChoice(q.answer)}</b></div>
        <div class="q-text small">${fmtMath(q.text)}</div>
        <div class="hint">💡 ${fmtMath(q.hint)}</div>
        <button class="btn primary" id="fb-ok">Got it <kbd>Enter</kbd></button>
      </div>`);
      const btn = $('#fb-ok', panel);
      btn.focus();
      btn.addEventListener('click', resolve, { once: true });
    });
    setPanel('<div class="panel-title">…</div>');
    log(`Your ${B.spell.name} fizzled…`);
    fizzle($('#pl'));
    await sleep(700);
  }
  queueSave();
  if (B.enemy.hp <= 0) return victory();
  await enemyTurn();
}

async function castSpell(spell) {
  const B = S.battle, s = S.save;
  setPanel('<div class="panel-title">✨ Casting…</div>');
  const pl = $('#pl'), en = $('#en');
  sfx('cast');
  pl.classList.add('casting');
  setTimeout(() => pl.classList.remove('casting'), 500);
  if (spell.kind === 'heal') {
    const amt = Math.min(B.player.maxHp - B.player.hp, Math.round(B.player.maxHp * 0.4));
    B.player.hp += amt;
    sfx('heal');
    sparkle(pl, '#5fd068');
    floatText(pl, `+${amt}`, 'heal');
    log(`💚 Mend restores ${amt} health!`);
    updateBars();
    await sleep(800);
    return;
  }
  if (spell.kind === 'ward') {
    B.player.ward = 2;
    sparkle(pl, '#ffd166');
    log('🛡️ A shimmering ward surrounds you!');
    updateBars();
    await sleep(800);
    return;
  }
  const mult = elementMult(spell.element, B.enemy.element);
  const critChance = Math.min(0.1 + 0.04 * s.stats.streak, 0.4);
  const crit = Math.random() < critChance;
  let dmg = spell.power * powerScale(s.level) * (1 + (WANDS[s.wand]?.bonus || 0)) * mult * (crit ? 1.5 : 1);
  if (B.player.focus) { dmg *= 2; B.player.focus = false; }
  dmg = Math.max(1, Math.round(dmg * (0.9 + Math.random() * 0.2)));
  await projectile(pl, en, spell.element);
  B.enemy.hp = Math.max(0, B.enemy.hp - dmg);
  sfx('hit');
  shake(en);
  floatText(en, `${crit ? 'CRIT! ' : ''}−${dmg}`, crit ? 'crit' : 'dmg');
  log(`${spell.name} hits for <b>${dmg}</b>!${mult > 1 ? ' It\'s super effective! ✨' : mult < 1 ? ' It\'s not very effective…' : ''}${crit ? ' Critical hit!' : ''}`);
  updateBars();
  await sleep(650);
  const fam = s.familiar && SPECIES[s.familiar];
  if (fam && B.enemy.hp > 0) {
    const fm = elementMult(fam.element, B.enemy.element);
    const fdmg = Math.max(1, Math.round(5 * powerScale(s.level) * fm * (0.9 + Math.random() * 0.2)));
    const famEl = $('#fam');
    famEl?.classList.add('hop');
    await projectile(famEl || pl, en, fam.element, true);
    famEl?.classList.remove('hop');
    B.enemy.hp = Math.max(0, B.enemy.hp - fdmg);
    sfx('hit');
    shake(en);
    floatText(en, `−${fdmg}`, 'dmg small');
    log(`${fam.name} joins in for <b>${fdmg}</b>!`);
    updateBars();
    await sleep(550);
  }
}

async function enemyTurn() {
  const B = S.battle;
  if (!B) return;
  const e = B.enemy, pl = $('#pl'), en = $('#en');
  setPanel(`<div class="panel-title">${e.sp.name}'s turn…</div>`);
  await sleep(350);
  if (e.sp.shifting && B.turn > 0) {
    const options = PRIMARY.filter((x) => x !== e.element);
    e.element = pick(options);
    $('#en .sprite').innerHTML = monsterSVG(e.sp, { element: e.element });
    sparkle(en, ELEMENTS[e.element].color);
    log(`${e.sp.name} shifts to ${ELEMENTS[e.element].icon} ${ELEMENTS[e.element].name}!`);
    updateBars();
    await sleep(900);
  }
  let mult = 1;
  const big = e.charging;
  if (big) { mult = 1.6; e.charging = false; }
  en.classList.add('lunge');
  await sleep(300);
  en.classList.remove('lunge');
  const hit = big || Math.random() < 0.88;
  if (!hit) {
    floatText(pl, 'Miss!', 'miss');
    log(`${e.sp.name} attacks… and misses!`);
  } else {
    let dmg = Math.round(e.atk * mult * (0.85 + Math.random() * 0.3));
    let warded = false;
    if (B.player.ward > 0) { dmg = Math.max(1, Math.round(dmg * 0.35)); B.player.ward -= 1; warded = true; }
    B.player.hp = Math.max(0, B.player.hp - dmg);
    sfx('hurt');
    shake(pl);
    floatText(pl, `−${dmg}`, 'hurt');
    log(`${big ? `💥 ${e.sp.name} unleashes a huge attack` : `${e.sp.name} attacks`} for <b>${dmg}</b>${warded ? ' (your ward blocked most of it!)' : ''}.`);
  }
  updateBars();
  await sleep(700);
  if (B.player.hp <= 0) return defeat();
  B.turn += 1;
  if (B.isBoss && B.turn % 3 === 2) {
    e.charging = true;
    updateBars();
    log(`⚠️ ${e.sp.name} is gathering power for a big attack! Maybe cast Ward or heal up.`);
  }
  showChoose();
}

// ------------------------------------------------------------------ effects

function centerOf(el) {
  const fx = $('#fx').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - fx.left, y: r.top + r.height * 0.45 - fx.top };
}

async function projectile(from, to, element, small = false) {
  const a = centerOf(from), b = centerOf(to);
  const p = document.createElement('div');
  p.className = `projectile el-${element} ${small ? 'small' : ''}`;
  p.textContent = ELEMENTS[element]?.icon || '✨';
  $('#fx').append(p);
  const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 70 };
  const anim = p.animate([
    { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) scale(.5) rotate(0deg)` },
    { transform: `translate(${mid.x}px, ${mid.y}px) translate(-50%, -50%) scale(1.3) rotate(180deg)`, offset: 0.5 },
    { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(1) rotate(360deg)` },
  ], { duration: reduceMotion() ? 150 : 560, easing: 'ease-in' });
  await anim.finished.catch(() => {});
  p.remove();
  burst(b, ELEMENTS[element]?.color || '#fff');
}

function burst(pt, color) {
  const fx = $('#fx');
  for (let i = 0; i < 14; i++) {
    const d = document.createElement('div');
    d.className = 'particle';
    d.style.background = color;
    fx.append(d);
    const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const dist = 40 + Math.random() * 50;
    d.animate([
      { transform: `translate(${pt.x}px, ${pt.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${pt.x + Math.cos(ang) * dist}px, ${pt.y + Math.sin(ang) * dist}px) scale(.2)`, opacity: 0 },
    ], { duration: 600, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.then(() => d.remove(), () => d.remove());
  }
}

function sparkle(el, color) {
  const c = centerOf(el);
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('div');
    d.className = 'particle star';
    d.style.background = color;
    $('#fx').append(d);
    const x = c.x + rnd(-45, 45);
    d.animate([
      { transform: `translate(${x}px, ${c.y + 40}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${x}px, ${c.y}px) scale(1)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${x}px, ${c.y - 60}px) scale(.3)`, opacity: 0 },
    ], { duration: 900, delay: i * 50 }).finished.then(() => d.remove(), () => d.remove());
  }
}

function fizzle(el) {
  const c = centerOf(el);
  const d = document.createElement('div');
  d.className = 'fizzle';
  d.textContent = '💨';
  $('#fx').append(d);
  d.animate([
    { transform: `translate(${c.x + 30}px, ${c.y - 40}px) scale(.5)`, opacity: 1 },
    { transform: `translate(${c.x + 50}px, ${c.y - 90}px) scale(1.4)`, opacity: 0 },
  ], { duration: 800 }).finished.then(() => d.remove(), () => d.remove());
}

function floatText(el, text, cls) {
  const c = centerOf(el);
  const d = document.createElement('div');
  d.className = `float-text ${cls}`;
  d.textContent = text;
  $('#fx').append(d);
  d.animate([
    { transform: `translate(${c.x}px, ${c.y - 30}px) translate(-50%, 0) scale(.6)`, opacity: 0 },
    { transform: `translate(${c.x}px, ${c.y - 60}px) translate(-50%, 0) scale(1.15)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${c.x}px, ${c.y - 110}px) translate(-50%, 0) scale(1)`, opacity: 0 },
  ], { duration: 1200, easing: 'ease-out' }).finished.then(() => d.remove(), () => d.remove());
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// ------------------------------------------------------------------ results

function checkAchievements() {
  const s = S.save;
  const fresh = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.test(s));
  fresh.forEach((a) => s.achievements.push(a.id));
  return fresh;
}

async function victory() {
  const B = S.battle, s = S.save, e = B.enemy;
  $('#en')?.classList.add('defeated');
  sfx('win');
  log(`${e.sp.name} was defeated!`);
  await sleep(900);

  const xp = rewardXp(e.level, B.isBoss) + 2 * B.correct;
  const gold = rewardGold(e.level, B.isBoss);
  s.gold += gold;
  s.stats.wins += 1;
  const zs = (s.zones[B.zone.id] ||= { wins: 0, boss: false });
  zs.wins += 1;
  let firstBossWin = false;
  if (B.isBoss) {
    s.stats.bosses += 1;
    firstBossWin = !zs.boss;
    zs.boss = true;
  }
  const oldLevel = s.level;
  if (s.level < MAX_LEVEL) {
    s.xp += xp;
    while (s.level < MAX_LEVEL && s.xp >= xpToNext(s.level)) { s.xp -= xpToNext(s.level); s.level += 1; }
    if (s.level >= MAX_LEVEL) s.xp = 0;
  }
  const newSpells = [];
  for (let l = oldLevel + 1; l <= s.level; l++) newSpells.push(...spellsUnlockedAt(s, l));

  let drop = null;
  if (Math.random() < (B.isBoss ? 1 : 0.15)) {
    drop = B.isBoss ? 'elixir' : 'potion';
    s.items[drop] = (s.items[drop] || 0) + 1;
  }
  const canBefriend = !e.sp.boss && !s.familiars.includes(e.id);
  const offer = canBefriend && Math.random() < (s.familiars.length === 0 ? 0.65 : 0.3);
  const achievements = checkAchievements();
  await saveNow();

  const nextZone = ZONES[ZONES.indexOf(B.zone) + 1];
  const acc = B.answered ? Math.round((100 * B.correct) / B.answered) : 0;
  const modal = openModal(`<div class="results">
    <h2 class="win-title">${B.isBoss ? '👑 Guardian defeated!' : '🎉 Victory!'}</h2>
    <div class="defeated-art">${monsterSVG(e.sp, { element: e.element })}</div>
    <div class="reward-row">
      <div class="reward"><span>⭐</span><b>+${xp}</b><small>XP</small></div>
      <div class="reward"><span>🪙</span><b>+${gold}</b><small>Gold</small></div>
      <div class="reward"><span>🎯</span><b>${B.correct}/${B.answered}</b><small>Correct (${acc}%)</small></div>
    </div>
    ${s.level > oldLevel ? `<div class="levelup">⬆️ Level up! You are now <b>level ${s.level}</b>! Max health ${playerMaxHp(s.level)}.</div>` : ''}
    ${newSpells.map((sp) => `<div class="unlock">📖 New spell learned: <b>${sp.icon || ELEMENTS[sp.element].icon} ${sp.name}</b></div>`).join('')}
    ${drop ? `<div class="unlock">🎁 Found a <b>${ITEMS[drop].icon} ${ITEMS[drop].name}</b>!</div>` : ''}
    ${firstBossWin && nextZone ? `<div class="unlock big">🗺️ A new land is open: <b>${nextZone.icon} ${nextZone.name}</b>!</div>` : ''}
    ${firstBossWin && !nextZone ? '<div class="unlock big">🏆 You defeated The Count Zero and saved every number in Numeria! You are a true Champion!</div>' : ''}
    ${achievements.map((a) => `<div class="unlock ach">${a.icon} Achievement: <b>${a.name}</b> — ${a.desc}</div>`).join('')}
    ${offer ? `<div class="befriend card">
        <div class="bf-art bob">${monsterSVG(e.sp)}</div>
        <div><b>${e.sp.name} looks at you hopefully…</b><p class="small">It wants to become your familiar and fight by your side!</p>
        <div class="btn-row"><button class="btn primary" id="bf-yes">💖 Befriend</button><button class="btn ghost" id="bf-no">Let it go</button></div></div>
      </div>` : ''}
    <div class="btn-row">
      <button class="btn primary big" id="r-again">⚔️ Battle again</button>
      <button class="btn big" id="r-map">🗺️ Map</button>
    </div>
  </div>`, { dismiss: false, cls: 'wide' });
  if (s.level > oldLevel) setTimeout(() => sfx('levelup'), 500);
  if (achievements.length) setTimeout(() => sfx('coin'), 900);
  const zoneId = B.zone.id;
  S.battle = null;
  $('#bf-yes', modal)?.addEventListener('click', () => {
    s.familiars.push(e.id);
    if (!s.familiar) s.familiar = e.id;
    const more = checkAchievements();
    sfx('heal');
    $('.befriend', modal).innerHTML = `<div class="bf-art bob">${monsterSVG(e.sp)}</div><div><b>${e.sp.name} joined you! 💖</b><p class="small">${s.familiar === e.id ? 'It is now your active familiar.' : 'Visit the Familiars page to bring it into battle.'}</p>${more.map((a) => `<p class="small">${a.icon} Achievement: <b>${a.name}</b></p>`).join('')}</div>`;
    saveNow();
  });
  $('#bf-no', modal)?.addEventListener('click', () => { $('.befriend', modal).innerHTML = `<p>${e.sp.name} waves goodbye and hops back into the wild. 👋</p>`; });
  $('#r-again', modal).addEventListener('click', () => startBattle(zoneId, false));
  $('#r-map', modal).addEventListener('click', () => go('map'));
}

async function defeat() {
  const B = S.battle;
  sfx('lose');
  $('#pl')?.classList.add('knocked');
  log('You were knocked out!');
  await saveNow();
  await sleep(800);
  const zoneId = B.zone.id, isBoss = B.isBoss;
  const acc = B.answered ? Math.round((100 * B.correct) / B.answered) : 0;
  S.battle = null;
  const modal = openModal(`<div class="results">
    <h2>💫 Knocked out!</h2>
    <p>Don't worry — every wizard needs practice. The healers of Numeria patched you up.</p>
    <div class="reward-row"><div class="reward"><span>🎯</span><b>${B.correct}/${B.answered}</b><small>Correct (${acc}%)</small></div></div>
    <p class="muted small">Tips: win more battles to level up, use the element that beats your foe, and keep Berry Tonics in your bag.</p>
    <div class="btn-row">
      <button class="btn primary big" id="d-again">🔁 Try again</button>
      <button class="btn big" id="d-map">🗺️ Map</button>
    </div>
  </div>`, { dismiss: false });
  $('#d-again', modal).addEventListener('click', () => startBattle(zoneId, isBoss));
  $('#d-map', modal).addEventListener('click', () => go('map'));
}

// ------------------------------------------------------------------ shop

function renderShop() {
  const s = S.save;
  const card = ({ id, kind, name, desc, price, art, owned, equipped }) => `
    <div class="shop-card ${owned ? 'owned' : ''}">
      <div class="shop-art">${art}</div>
      <b>${name}</b><small>${desc}</small>
      ${kind === 'item'
        ? `<button class="btn primary small" data-buy="${kind}:${id}" ${s.gold < price ? 'disabled' : ''}>🪙 ${price}</button>`
        : owned
          ? `<button class="btn small" data-equip="${kind}:${id}" ${equipped ? 'disabled' : ''}>${equipped ? '✓ Equipped' : 'Equip'}</button>`
          : `<button class="btn primary small" data-buy="${kind}:${id}" ${s.gold < price ? 'disabled' : ''}>🪙 ${price}</button>`}
    </div>`;
  const items = Object.entries(ITEMS).map(([id, it]) => card({ id, kind: 'item', name: `${it.name} <span class="count">×${s.items[id] || 0}</span>`, desc: it.desc, price: it.price, art: `<span class="emoji-art">${it.icon}</span>` }));
  const wands = Object.entries(WANDS).map(([id, w]) => card({ id, kind: 'wand', name: w.name, desc: w.bonus ? `+${Math.round(w.bonus * 100)}% spell damage` : 'A trusty starter wand', price: w.price, owned: s.wands.includes(id), equipped: s.wand === id, art: `<svg viewBox="0 0 60 60"><line x1="14" y1="50" x2="46" y2="12" stroke="${w.color}" stroke-width="6" stroke-linecap="round"/><circle cx="46" cy="12" r="7" fill="${w.tip}" stroke="${ELEMENTS[s.element].color}" stroke-width="3"/></svg>` }));
  const hats = Object.entries(HATS).map(([id, h]) => card({ id, kind: 'hat', name: h.name, desc: h.price ? 'Fancy headwear' : 'Free style', price: h.price, owned: s.hats.includes(id), equipped: s.look.hat === id, art: avatarSVG({ ...s.look, hat: id }, s.element, { cls: 'head-crop' }) }));
  const pats = Object.entries(PATTERNS).map(([id, p]) => card({ id, kind: 'pattern', name: p.name, desc: p.price ? 'Stylish robe' : 'Simple and classic', price: p.price, owned: s.patterns.includes(id), equipped: s.look.pattern === id, art: avatarSVG({ ...s.look, pattern: id }, s.element) }));
  app.innerHTML = `${topbar('shop')}
  <main class="page">
    <div class="page-head"><h1>🛒 The Wandering Shop</h1><p class="muted">"Gold well spent is magic well earned!" — Bibble the shopkeeper</p></div>
    <section><h2>Potions & charms</h2><div class="shop-grid">${items.join('')}</div></section>
    <section><h2>Wands</h2><div class="shop-grid">${wands.join('')}</div></section>
    <section><h2>Hats</h2><div class="shop-grid">${hats.join('')}</div></section>
    <section><h2>Robes</h2><div class="shop-grid">${pats.join('')}</div></section>
  </main>`;
  bindTopbar();
  $$('[data-buy]').forEach((b) => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.buy.split(':');
    const price = { item: ITEMS, wand: WANDS, hat: HATS, pattern: PATTERNS }[kind][id].price;
    if (s.gold < price) return;
    s.gold -= price;
    if (kind === 'item') s.items[id] = (s.items[id] || 0) + 1;
    if (kind === 'wand') { s.wands.push(id); s.wand = id; }
    if (kind === 'hat') { s.hats.push(id); s.look.hat = id; }
    if (kind === 'pattern') { s.patterns.push(id); s.look.pattern = id; }
    sfx('coin');
    checkAchievements().forEach((a) => toast(`${a.icon} Achievement: <b>${a.name}</b>`));
    queueSave();
    renderShop();
  }));
  $$('[data-equip]').forEach((b) => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.equip.split(':');
    if (kind === 'wand') s.wand = id;
    if (kind === 'hat') s.look.hat = id;
    if (kind === 'pattern') s.look.pattern = id;
    sfx('click');
    queueSave();
    renderShop();
  }));
}

// ------------------------------------------------------------------ wizard

function renderWizard() {
  const s = S.save;
  const acc = s.stats.answered ? Math.round((100 * s.stats.correct) / s.stats.answered) : 0;
  const skills = SKILLS.filter((k) => s.stats.skills[k.id]?.n).map((k) => ({ ...k, st: s.stats.skills[k.id] }))
    .sort((a, b) => a.grade - b.grade || a.st.m - b.st.m);
  const swatches = (key, list) => list.map((c) => `<button class="swatch ${s.look[key] === c ? 'active' : ''}" data-look="${key}" data-val="${c}" style="background:${c}" aria-label="${key}"></button>`).join('');
  app.innerHTML = `${topbar('wizard')}
  <main class="page wizard-page">
    <div class="wizard-grid">
      <section class="card">
        <div class="wiz-avatar bob">${avatarSVG(s.look, s.element, { wand: s.wand })}</div>
        <h2 class="center">${esc(s.name)}</h2>
        <p class="center muted">${ELEMENTS[s.element].icon} ${ELEMENTS[s.element].name} wizard · Level ${s.level} · ${s.level >= MAX_LEVEL ? 'Max level!' : `${s.xp}/${xpToNext(s.level)} XP`}</p>
        <h3>Wardrobe</h3>
        <div class="field"><span class="field-label">Robe color</span><div class="swatches">${swatches('robe', ROBE_COLORS)}</div></div>
        <div class="field"><span class="field-label">Hair</span><div class="swatches">${swatches('hair', HAIR_COLORS)}</div></div>
        <div class="field"><span class="field-label">Skin</span><div class="swatches">${swatches('skin', SKIN_TONES)}</div></div>
        <div class="field"><span class="field-label">Hat</span><div class="grade-row">${s.hats.map((h) => `<button class="chip ${s.look.hat === h ? 'active' : ''}" data-hat="${h}">${HATS[h].name}</button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Robe style</span><div class="grade-row">${s.patterns.map((p) => `<button class="chip ${s.look.pattern === p ? 'active' : ''}" data-pattern="${p}">${PATTERNS[p].name}</button>`).join('')}</div></div>
      </section>
      <section class="card">
        <h3>📐 Math level</h3>
        ${S.gradeLocked
          ? `<p>Grade <b>${s.grade}</b> <span class="muted small">(set by your teacher)</span></p>`
          : `<div class="grade-row">${[1, 2, 3, 4, 5, 6, 7, 8].map((g) => `<button class="chip ${s.grade === g ? 'active' : ''}" data-grade="${g}">Grade ${g}</button>`).join('')}</div>
             <p class="muted small">Questions mix your grade with review from earlier grades, and peek ahead once you've mastered everything.</p>`}
        <h3>📊 Stats</h3>
        <div class="stat-grid">
          <div><b>${s.stats.answered}</b><small>Questions</small></div>
          <div><b>${acc}%</b><small>Accuracy</small></div>
          <div><b>${s.stats.bestStreak}</b><small>Best streak</small></div>
          <div><b>${s.stats.wins}</b><small>Battles won</small></div>
          <div><b>${s.stats.bosses}</b><small>Guardians beaten</small></div>
          <div><b>${s.familiars.length}</b><small>Familiars</small></div>
        </div>
        <h3>🧠 Skills</h3>
        ${skills.length ? `<div class="skill-list">${skills.map((k) => `<div class="skill-row"><span>${k.name} <small class="muted">G${k.grade}</small></span>
          <div class="mastery"><i style="width:${Math.round(k.st.m * 100)}%" class="${k.st.m >= 0.85 ? 'mastered' : k.st.m >= 0.5 ? 'ok' : 'learning'}"></i></div>
          <small>${k.st.c}/${k.st.n}${k.st.m >= 0.85 && k.st.n >= 10 ? ' ⭐' : ''}</small></div>`).join('')}</div>`
          : '<p class="muted">Battle some monsters to see your skills grow!</p>'}
      </section>
      <section class="card">
        <h3>🏅 Achievements <small class="muted">${s.achievements.length}/${ACHIEVEMENTS.length}</small></h3>
        <div class="ach-grid">${ACHIEVEMENTS.map((a) => `<div class="ach ${s.achievements.includes(a.id) ? 'got' : ''}" title="${a.desc}"><span>${a.icon}</span><b>${a.name}</b><small>${a.desc}</small></div>`).join('')}</div>
        <h3>🌀 Elements</h3>
        <div class="element-wheel">${PRIMARY.map((el) => `<span>${ELEMENTS[el].icon} beats ${ELEMENTS[ELEMENTS[el].beats].icon}</span>`).join('')}</div>
        <button class="btn ghost small" id="w-intro">How to play</button>
      </section>
    </div>
  </main>`;
  bindTopbar();
  $$('[data-look]').forEach((b) => b.addEventListener('click', () => { s.look[b.dataset.look] = b.dataset.val; sfx('click'); queueSave(); renderWizard(); }));
  $$('[data-hat]').forEach((b) => b.addEventListener('click', () => { s.look.hat = b.dataset.hat; sfx('click'); queueSave(); renderWizard(); }));
  $$('[data-pattern]').forEach((b) => b.addEventListener('click', () => { s.look.pattern = b.dataset.pattern; sfx('click'); queueSave(); renderWizard(); }));
  $$('[data-grade]').forEach((b) => b.addEventListener('click', () => { s.grade = Number(b.dataset.grade); sfx('click'); queueSave(); renderWizard(); }));
  $('#w-intro').addEventListener('click', showIntro);
}

// ------------------------------------------------------------------ familiars

function renderFamiliars() {
  const s = S.save;
  const all = Object.entries(SPECIES).filter(([, sp]) => !sp.boss);
  app.innerHTML = `${topbar('familiars')}
  <main class="page">
    <div class="page-head"><h1>🐾 Familiars <small class="muted">${s.familiars.length}/${all.length}</small></h1>
    <p class="muted">Defeated monsters sometimes ask to join you. Your active familiar adds an extra attack whenever you answer correctly.</p></div>
    <div class="fam-grid">${all.map(([id, sp]) => {
      const owned = s.familiars.includes(id);
      return `<div class="fam-card card ${owned ? '' : 'unknown'} ${s.familiar === id ? 'active' : ''}">
        <div class="fam-art ${owned ? 'bob' : ''}">${monsterSVG(sp)}</div>
        <b>${owned ? sp.name : '???'}</b>
        <small>${owned ? `${elIcon(sp.element)} ${sp.lore}` : 'Not yet befriended'}</small>
        ${owned ? `<button class="btn small ${s.familiar === id ? '' : 'primary'}" data-fam="${id}">${s.familiar === id ? 'Rest' : 'Bring along'}</button>` : ''}
      </div>`;
    }).join('')}</div>
  </main>`;
  bindTopbar();
  $$('[data-fam]').forEach((b) => b.addEventListener('click', () => {
    s.familiar = s.familiar === b.dataset.fam ? null : b.dataset.fam;
    sfx('click');
    queueSave();
    renderFamiliars();
  }));
}

// ------------------------------------------------------------------ leaderboard

async function renderLeaders() {
  app.innerHTML = `${topbar('leaders')}<main class="page"><div class="page-head"><h1>🏆 Hall of Wizards</h1></div><div class="card" id="lb">Loading…</div></main>`;
  bindTopbar();
  const box = $('#lb');
  try {
    const { players } = await api('GET', 'api/leaderboard');
    if (!$('#lb')) return;
    box.innerHTML = players.length
      ? `<table class="lb-table"><thead><tr><th>#</th><th>Wizard</th><th>Level</th><th>🐾</th><th>👑</th></tr></thead><tbody>
        ${players.map((p, i) => `<tr class="${S.user && p.username.toLowerCase() === S.user.username.toLowerCase() ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(p.username)}</td><td>${p.level}</td><td>${p.familiars}</td><td>${p.bosses}</td></tr>`).join('')}
        </tbody></table>`
      : '<p class="muted">No wizards yet. Be the first!</p>';
    if (S.mode === 'guest') box.insertAdjacentHTML('beforeend', '<p class="muted small">Guest wizards don\'t appear here. Create an account to join the Hall!</p>');
  } catch {
    box.innerHTML = '<p class="muted">The Hall of Wizards can\'t be reached right now.</p>';
  }
}

// ------------------------------------------------------------------ keyboard

document.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea')) return;
  const B = S.battle;
  if (B && B.question && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    onAnswer(Number(e.key) - 1);
  } else if (e.key === 'Escape' && $('.modal-backdrop .modal-x')) {
    closeModal();
  }
});

// ------------------------------------------------------------------ boot

async function boot() {
  try {
    const me = await api('GET', 'api/me');
    if (me.user) {
      S.mode = 'server';
      S.user = me.user;
      S.gradeLocked = !!me.gradeLocked;
      if (me.save) { S.save = migrate(me.save); go('map'); } else renderCreator();
      return;
    }
  } catch {
    S.offline = true;
  }
  renderAuth();
}

boot();
