// Numeria teacher dashboard
import { SKILLS, skillName, skillGrade } from '../js/math.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let players = [];
let sortKey = 'username';
let sortDir = 1;
const expanded = new Set();

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'numeria' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(data?.error || `Server error (${res.status})`);
  return data;
}

const accuracy = (p) => (p.answered ? Math.round((100 * p.correct) / p.answered) : null);
const ago = (ts) => {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return new Date(ts * 1000).toLocaleDateString();
};
function weakSkills(p, n = 3) {
  return Object.entries(p.skills)
    .filter(([, s]) => s.n >= 3)
    .sort((a, b) => a[1].m - b[1].m)
    .filter(([, s]) => s.m < 0.6)
    .slice(0, n)
    .map(([id]) => id);
}

async function load() {
  try {
    const data = await api('GET', 'api/players');
    players = data.players;
    $('#who').textContent = `👩‍🏫 ${data.teacher}`;
    render();
  } catch (e) {
    $('#rows').innerHTML = `<tr><td colspan="8" class="t-error">${esc(e.message)}</td></tr>`;
  }
}

function render() {
  const started = players.filter((p) => p.started);
  const answered = players.reduce((a, p) => a + p.answered, 0);
  const correct = players.reduce((a, p) => a + p.correct, 0);
  const weekAgo = Date.now() / 1000 - 7 * 86400;
  $('#summary').innerHTML = `
    <div><b>${players.length}</b><small>Players</small></div>
    <div><b>${players.filter((p) => p.lastSeen > weekAgo).length}</b><small>Active this week</small></div>
    <div><b>${answered.toLocaleString()}</b><small>Questions answered</small></div>
    <div><b>${answered ? Math.round((100 * correct) / answered) : 0}%</b><small>Overall accuracy</small></div>
    <div><b>${started.length ? Math.round(started.reduce((a, p) => a + p.level, 0) / started.length) : 0}</b><small>Average level</small></div>`;

  const q = $('#filter').value.trim().toLowerCase();
  const list = players.filter((p) => !q || p.username.toLowerCase().includes(q)).sort((a, b) => {
    const va = sortKey === 'accuracy' ? accuracy(a) ?? -1 : a[sortKey];
    const vb = sortKey === 'accuracy' ? accuracy(b) ?? -1 : b[sortKey];
    return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sortDir;
  });
  if (!list.length) {
    $('#rows').innerHTML = `<tr><td colspan="8" class="muted">${players.length ? 'No match.' : 'No players yet. Share the game link with your class!'}</td></tr>`;
    return;
  }
  $('#rows').innerHTML = list.map((p) => {
    const acc = accuracy(p);
    const accCls = acc === null ? '' : acc < 60 ? 'low' : acc < 80 ? 'mid' : 'high';
    const name = esc(p.username);
    const grades = `<option value="">Player chooses${p.gradeLocked ? '' : ` (${p.grade ?? '–'})`}</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((g) => `<option value="${g}" ${p.gradeLocked && p.grade === g ? 'selected' : ''}>Grade ${g}</option>`).join('')}`;
    const row = `<tr class="${expanded.has(p.username) ? 'expanded' : ''}">
      <td class="t-name">${name}${p.started ? '' : ' <span class="lock">(no wizard yet)</span>'}</td>
      <td class="t-grade"><select data-grade="${name}" aria-label="Math grade for ${name}">${grades}</select>${p.gradeLocked ? ' <span class="lock" title="Set by teacher">🔒</span>' : ''}</td>
      <td>${p.level}</td>
      <td>${p.answered}</td>
      <td class="t-acc ${accCls}">${acc === null ? '–' : `${acc}%`}</td>
      <td><div class="t-weak">${weakSkills(p).map((id) => `<span>${esc(skillName(id))}</span>`).join('') || '<span class="muted small">—</span>'}</div></td>
      <td>${ago(p.lastSeen)}</td>
      <td class="t-actions">
        <button class="btn small" data-detail="${name}">${expanded.has(p.username) ? 'Hide' : 'Skills'}</button>
        <button class="btn small" data-reset="${name}">Reset password</button>
        <button class="btn small ghost" data-delete="${name}" title="Delete player">🗑</button>
      </td></tr>`;
    if (!expanded.has(p.username)) return row;
    const skills = SKILLS.filter((s) => p.skills[s.id]?.n).map((s) => ({ ...s, st: p.skills[s.id] }));
    return `${row}<tr class="expanded"><td colspan="8">${skills.length ? `<div class="t-detail">${skills.map((s) => `<div class="skill-row"><span>${esc(s.name)} <small class="muted">G${skillGrade(s.id)}</small></span><div class="mastery"><i style="width:${Math.round(s.st.m * 100)}%" class="${s.st.m >= 0.85 ? 'mastered' : s.st.m >= 0.5 ? 'ok' : 'learning'}"></i></div><small>${s.st.c}/${s.st.n}</small></div>`).join('')}</div>` : '<span class="muted">No questions answered yet.</span>'}</td></tr>`;
  }).join('');
}

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-grade]');
  if (!sel) return;
  const username = players.find((p) => p.username === sel.dataset.grade)?.username;
  try {
    await api('POST', 'api/set-grade', { username, grade: sel.value ? Number(sel.value) : null });
    await load();
  } catch (err) { alert(err.message); }
});

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, th[data-sort]');
  if (!t) return;
  const find = (v) => players.find((p) => p.username === v)?.username;
  if (t.dataset.sort) {
    sortDir = sortKey === t.dataset.sort ? -sortDir : 1;
    sortKey = t.dataset.sort;
    render();
  } else if (t.dataset.detail) {
    const u = find(t.dataset.detail);
    expanded.has(u) ? expanded.delete(u) : expanded.add(u);
    render();
  } else if (t.dataset.reset) {
    const u = find(t.dataset.reset);
    const pw = prompt(`New password for ${u} (at least 4 characters):`);
    if (pw === null) return;
    try { await api('POST', 'api/reset-password', { username: u, password: pw }); alert(`Password for ${u} changed.`); } catch (err) { alert(err.message); }
  } else if (t.dataset.delete) {
    const u = find(t.dataset.delete);
    if (!confirm(`Delete ${u} and all of their progress? This cannot be undone.`)) return;
    try { await api('POST', 'api/delete-player', { username: u }); await load(); } catch (err) { alert(err.message); }
  } else if (t.id === 'refresh') {
    load();
  } else if (t.id === 'csv') {
    const head = ['player', 'grade', 'grade_locked', 'level', 'questions', 'correct', 'accuracy_pct', 'needs_practice', 'last_played'];
    const lines = players.map((p) => [p.username, p.grade ?? '', p.gradeLocked, p.level, p.answered, p.correct, accuracy(p) ?? '', weakSkills(p).map(skillName).join('; '), new Date(p.lastSeen * 1000).toISOString()]);
    const csv = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `numeria-progress-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
});
$('#filter').addEventListener('input', render);
load();
