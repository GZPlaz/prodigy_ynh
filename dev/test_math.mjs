// Fuzz test for the question generators: run with `node dev/test_math.mjs`
import { SKILLS, makeQuestion, recordAnswer, fmtMath } from '../sources/static/js/math.js';

const fails = [];
const N = 3000;
const toNum = (s) => {
  s = s.replace(/−/g, '-');
  const m = /^(-?\d+)\/(\d+)$/.exec(s);
  return m ? Number(m[1]) / Number(m[2]) : Number(s);
};
// Evaluate simple "a op b = ?" style questions to double-check the answer
function evalText(text) {
  const t = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  if (!/= \?$/.test(t)) return null;
  let expr = t.replace(/= \?$/, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/(\d+)²/g, '($1**2)').replace(/(\d+)³/g, '($1**3)').replace(/(\d+)⁴/g, '($1**4)')
    .replace(/(\d+)⁵/g, '($1**5)').replace(/(\d+)⁶/g, '($1**6)').replace(/(\d+)⁷/g, '($1**7)').replace(/(\d+)⁸/g, '($1**8)')
    .replace(/√(\d+)/g, 'Math.sqrt($1)').replace(/∛(\d+)/g, 'Math.cbrt($1)')
    .replace(/\[\[(-?\d+)\/(\d+)\]\]/g, '($1/$2)');
  if (/[^0-9+\-*/(). Mathsqrcb]/.test(expr)) return null;
  try { return Function(`return (${expr})`)(); } catch { return null; }
}

for (const skill of SKILLS) {
  for (const tier of [0, 1, 2]) {
    for (let i = 0; i < N; i++) {
      let q;
      try { q = skill.gen(tier); } catch (e) { fails.push(`${skill.id} t${tier} threw ${e.message}`); break; }
      const where = `${skill.id} t${tier}: ${q.text} -> ${q.answer} [${q.choices}]`;
      const blob = [q.text, q.answer, q.hint, ...(q.choices || [])].join(' ');
      if (/NaN|undefined|Infinity|null|\[object/.test(blob)) fails.push(`bad token ${where} | ${q.hint}`);
      if (!Array.isArray(q.choices) || q.choices.length !== 4) fails.push(`need 4 choices ${where}`);
      if (new Set(q.choices).size !== q.choices.length) fails.push(`duplicate choices ${where}`);
      if (!q.choices.includes(q.answer)) fails.push(`answer missing ${where}`);
      const vals = q.choices.map(toNum);
      if (new Set(vals).size !== vals.length) fails.push(`equal-valued choices ${where}`);
      const ev = evalText(q.text);
      if (ev !== null && Math.abs(ev - toNum(q.answer)) > 1e-9) fails.push(`wrong answer (expected ${ev}) ${where}`);
      if (/^\d/.test(q.answer) && skill.grade <= 5 && toNum(q.answer) < 0) fails.push(`negative answer at grade ${skill.grade} ${where}`);
      if (/\.\d{3,}/.test(blob)) fails.push(`float noise ${where}`);
    }
  }
}

// adaptive engine smoke test
const save = { grade: 4, stats: { skills: {} } };
let last;
for (let i = 0; i < 500; i++) {
  const q = makeQuestion(save, last);
  last = q.skill;
  recordAnswer(save, q.skill, Math.random() < 0.8);
}
const used = Object.keys(save.stats.skills);
if (used.length < 8) fails.push(`adaptive engine used too few skills: ${used}`);
if (!fmtMath('[[3/4]] + 1').includes('class="frac"')) fails.push('fmtMath fraction markup');

const uniq = [...new Set(fails)];
console.log(uniq.slice(0, 40).join('\n'));
console.log(`${SKILLS.length} skills x 3 tiers x ${N} questions: ${uniq.length ? uniq.length + ' distinct failures' : 'all OK'}`);
process.exit(uniq.length ? 1 : 0);
