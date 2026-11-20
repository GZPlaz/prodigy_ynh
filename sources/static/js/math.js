// Numeria math engine: adaptive question generation for grades 1-8.
// Every generator takes a difficulty tier (0, 1, 2) and returns
// { text, answer, choices, hint }. Text may contain [[a/b]] fraction markup.

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a, b) => (a / gcd(a, b)) * b;
const MINUS = '−';

export const fmtNum = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return r < 0 ? MINUS + String(Math.abs(r)) : String(r);
};
// Parenthesise negatives inside expressions: (−3)
const p = (n) => (n < 0 ? `(${fmtNum(n)})` : fmtNum(n));

function fracStr(n, d) {
  const g = gcd(n, d) || 1;
  n /= g; d /= g;
  if (d < 0) { n = -n; d = -d; }
  return d === 1 ? fmtNum(n) : `${n}/${d}`;
}
const fracVal = (s) => {
  const m = /^(-?\d+)\/(\d+)$/.exec(s.replace(MINUS, '-'));
  return m ? Number(m[1]) / Number(m[2]) : Number(s.replace(MINUS, '-'));
};

// Build 4 unique numeric choices. `extra` holds likely mistakes (tried first).
function numChoices(answer, extra = [], { min = 0, decimals = 0 } = {}) {
  const round = (v) => Math.round(v * 10 ** decimals) / 10 ** decimals;
  const ans = round(answer);
  const out = [ans];
  const add = (v) => {
    if (out.length >= 4 || !Number.isFinite(v)) return;
    v = round(v);
    if (v < min || out.includes(v)) return;
    out.push(v);
  };
  shuffle(extra).forEach(add);
  const unit = decimals ? 10 ** -decimals : 1;
  const big = Math.abs(ans) >= 20 ? 10 : 2;
  shuffle([ans + unit, ans - unit, ans + 2 * unit, ans - 2 * unit, ans + big, ans - big]).forEach(add);
  for (let k = 3; out.length < 4 && k < 200; k++) add(ans + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * unit * 3);
  return { answer: fmtNum(ans), choices: shuffle(out).map(fmtNum) };
}

// Choices that are strings (fractions etc). `valueOf` dedupes equal values.
function strChoices(answer, extra, filler) {
  const out = [answer];
  const seen = new Set([fracVal(answer)]);
  for (const c of [...shuffle(extra), ...filler()]) {
    if (out.length >= 4) break;
    const v = fracVal(c);
    if (!Number.isFinite(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(c);
  }
  return { answer, choices: shuffle(out) };
}

const NAMES = ['Mira', 'Tobin', 'Ada', 'Kofi', 'Lena', 'Ravi', 'Sami', 'Juno', 'Iris', 'Theo', 'Noor', 'Pip', 'Wren', 'Zara'];
const THINGS = ['acorns', 'gems', 'scrolls', 'feathers', 'shells', 'stars', 'coins', 'crystals', 'berries'];

// ---------------------------------------------------------------- grade 1

function add10(t) {
  const max = [10, 10, 20][t];
  const a = rnd(t === 0 ? 1 : 2, t === 0 ? 5 : max - 2);
  const b = rnd(1, Math.max(1, Math.min(t === 0 ? 5 : 9, max - a)));
  return {
    text: `${a} + ${b} = ?`,
    ...numChoices(a + b, [a + b + 1, a + b - 1, Math.abs(a - b)]),
    hint: `Start at ${a} and count up ${b}: ${a + b}.`,
  };
}

function sub10(t) {
  const a = rnd(t === 0 ? 3 : 6, [10, 15, 20][t]);
  const b = rnd(1, t === 0 ? Math.min(5, a) : a - 1);
  return {
    text: `${a} − ${b} = ?`,
    ...numChoices(a - b, [a + b, a - b + 1, a - b - 1]),
    hint: `Start at ${a} and count back ${b}: ${a - b}. Check: ${a - b} + ${b} = ${a}.`,
  };
}

function compare(t) {
  const max = [20, 100, 1000][t];
  const greatest = Math.random() < 0.6;
  const base = rnd(Math.floor(max / 4), max - 10);
  const nums = new Set();
  while (nums.size < 4) {
    const spread = t === 2 ? pick([1, 10, 100]) * rnd(-5, 5) : rnd(-9, 9);
    const v = Math.max(0, Math.min(max, base + spread));
    nums.add(v);
  }
  const list = [...nums];
  const ans = greatest ? Math.max(...list) : Math.min(...list);
  return {
    text: `Which number is the <b>${greatest ? 'greatest' : 'smallest'}</b>?`,
    answer: String(ans),
    choices: shuffle(list).map(String),
    hint: `Compare the biggest place value first (hundreds, then tens, then ones). The ${greatest ? 'greatest' : 'smallest'} is ${ans}.`,
  };
}

// ---------------------------------------------------------------- grade 2

function add100(t) {
  let a, b;
  if (t === 0) { a = rnd(1, 8) * 10 + rnd(0, 8); b = rnd(1, 9 - (a % 10)); }
  else if (t === 1) { a = rnd(11, 59); b = rnd(10, 39); if ((a % 10) + (b % 10) >= 10) b -= (b % 10); b = Math.max(b, 10); }
  else { a = rnd(15, 89); b = rnd(15, 89); if ((a % 10) + (b % 10) < 10) b += 9 - (b % 10); }
  const s = a + b;
  const noCarry = Math.floor(a / 10) * 10 + Math.floor(b / 10) * 10 + ((a + b) % 10);
  return {
    text: `${a} + ${b} = ?`,
    ...numChoices(s, [s - 10, s + 10, noCarry]),
    hint: `Add tens: ${Math.floor(a / 10) * 10} + ${Math.floor(b / 10) * 10} = ${Math.floor(a / 10) * 10 + Math.floor(b / 10) * 10}. Add ones: ${a % 10} + ${b % 10} = ${(a % 10) + (b % 10)}. Together: ${s}.`,
  };
}

function sub100(t) {
  let a, b;
  if (t === 0) { a = rnd(2, 9) * 10 + rnd(1, 9); b = rnd(1, a % 10); }
  else if (t === 1) { a = rnd(40, 99); b = rnd(10, a - 10); if (b % 10 > a % 10) b -= (b % 10) - (a % 10); }
  else { a = rnd(30, 99); b = rnd(11, a - 5); if (b % 10 <= a % 10) { b = Math.min(a - 1, b + (a % 10) - (b % 10) + 1); } }
  const d = a - b;
  // classic mistake: subtract smaller digit from bigger in each column
  const wrong = Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) * 10 + Math.abs((a % 10) - (b % 10));
  return {
    text: `${a} − ${b} = ?`,
    ...numChoices(d, [wrong, d + 10, d - 10]),
    hint: `${a} − ${b} = ${d}. Check by adding back: ${d} + ${b} = ${a}.`,
  };
}

function mulIntro(t) {
  const table = t === 0 ? pick([2, 10]) : t === 1 ? 5 : pick([2, 3, 4, 5, 10]);
  const n = rnd(1, 10);
  const [a, b] = Math.random() < 0.5 ? [n, table] : [table, n];
  return {
    text: `${a} × ${b} = ?`,
    ...numChoices(a * b, [a + b, a * (b + 1), a * (b - 1)]),
    hint: `${a} × ${b} means ${b} groups of ${a}: count by ${a}s ${b} times to get ${a * b}.`,
  };
}

function wordAddSub(t) {
  const n = pick(NAMES), m = pick(NAMES.filter((x) => x !== n)), th = pick(THINGS);
  const max = [20, 60, 100][t];
  const kind = rnd(0, 2);
  if (kind === 0) {
    const a = rnd(3, max / 2), b = rnd(2, max / 2);
    return { text: `${n} collected ${a} ${th}, then found ${b} more. How many ${th} does ${n} have now?`, ...numChoices(a + b, [a - b, a + b + 10]), hint: `"More" means add: ${a} + ${b} = ${a + b}.` };
  }
  if (kind === 1) {
    const a = rnd(8, max), b = rnd(2, a - 1);
    return { text: `${n} had ${a} ${th} and gave ${b} to ${m}. How many ${th} are left?`, ...numChoices(a - b, [a + b, a - b - 1]), hint: `"Gave away" means subtract: ${a} − ${b} = ${a - b}.` };
  }
  const a = rnd(8, max), b = rnd(2, a - 1);
  return { text: `${n} has ${a} ${th}. ${m} has ${b} ${th}. How many more ${th} does ${n} have?`, ...numChoices(a - b, [a + b, a - b + 1]), hint: `"How many more" means find the difference: ${a} − ${b} = ${a - b}.` };
}

// ---------------------------------------------------------------- grade 3

function mulTables(t) {
  const maxA = [5, 10, 12][t];
  const a = rnd(2, maxA), b = rnd(2, t === 0 ? 10 : maxA);
  return {
    text: `${a} × ${b} = ?`,
    ...numChoices(a * b, [a * (b + 1), a * (b - 1), (a + 1) * b, a + b]),
    hint: `${a} × ${b} = ${a * b}. Trick: ${a} × ${b - 1} = ${a * (b - 1)}, then add one more ${a}.`,
  };
}

function divFacts(t) {
  const d = rnd(2, [5, 10, 12][t]);
  const q = rnd(2, [10, 10, 12][t]);
  const a = d * q;
  return {
    text: `${a} ÷ ${d} = ?`,
    ...numChoices(q, [q + 1, q - 1, d, a - d]),
    hint: `Think: ${d} × ? = ${a}. Since ${d} × ${q} = ${a}, the answer is ${q}.`,
  };
}

function add1000(t) {
  if (t < 2) {
    let a = rnd(101, 699), b = rnd(101, 299);
    if (t === 0) { // no carrying
      b = Number(String(b).split('').map((d, i) => Math.min(Number(d), 9 - Number(String(a)[i]))).join('')) || 100;
    }
    const s = a + b;
    return { text: `${a} + ${b} = ?`, ...numChoices(s, [s + 10, s - 10, s + 100]), hint: `Line up hundreds, tens and ones and add each column, carrying when a column reaches 10. ${a} + ${b} = ${s}.` };
  }
  const a = rnd(400, 999), b = rnd(120, a - 100);
  const d = a - b;
  return { text: `${a} − ${b} = ?`, ...numChoices(d, [d + 10, d - 10, d + 100]), hint: `Subtract column by column, borrowing when the top digit is smaller. Check: ${d} + ${b} = ${a}.` };
}

function rounding(t) {
  let n, to;
  if (t === 0) { n = rnd(11, 99); to = 10; }
  else if (t === 1) { n = rnd(101, 999); to = pick([10, 100]); }
  else { n = rnd(1001, 9999); to = pick([100, 1000]); }
  if (n % to === 0) n += 3;
  const ans = Math.round(n / to) * to;
  const other = ans === Math.floor(n / to) * to ? ans + to : ans - to;
  const place = { 10: 'ten', 100: 'hundred', 1000: 'thousand' }[to];
  return {
    text: `Round <b>${n}</b> to the nearest ${place}.`,
    ...numChoices(ans, [other, Math.round(n / (to * 10)) * to * 10, Math.floor(n / to) * to === ans ? ans + 2 * to : ans - 2 * to]),
    hint: `Look at the digit right after the ${place}s place. 5 or more rounds up, 4 or less rounds down. ${n} → ${ans}.`,
  };
}

function fracOf(t) {
  const d = t === 0 ? pick([2, 4]) : rnd(t === 2 ? 3 : 2, 10);
  const n = t === 2 ? rnd(2, d - 1) : 1;
  const k = rnd(2, t === 0 ? 6 : 10);
  const whole = d * k;
  const ans = n * k;
  return {
    text: `What is [[${n}/${d}]] of ${whole}?`,
    ...numChoices(ans, [k, whole / n, whole - ans, ans + n]),
    hint: `Split ${whole} into ${d} equal parts: ${whole} ÷ ${d} = ${k}.${n > 1 ? ` Take ${n} parts: ${n} × ${k} = ${ans}.` : ''}`,
  };
}

function perimeter(t) {
  const w = rnd(2, [6, 12, 25][t]), h = rnd(2, [6, 12, 25][t]);
  const square = t === 0 && Math.random() < 0.3;
  const W = w, H = square ? w : h;
  const ans = 2 * (W + H);
  return {
    text: square
      ? `A square has sides of ${W} cm. What is its perimeter?`
      : `A rectangle is ${W} cm long and ${H} cm wide. What is its perimeter?`,
    ...numChoices(ans, [W * H, W + H, ans + 2]),
    hint: `Perimeter = distance all the way around: ${W} + ${H} + ${W} + ${H} = ${ans} cm.`,
  };
}

// ---------------------------------------------------------------- grade 4

function mul2x1(t) {
  const a = t === 2 ? rnd(102, 499) : rnd(12, t === 0 ? 40 : 99);
  const b = rnd(2, t === 0 ? 4 : 9);
  const ans = a * b;
  const tens = Math.floor(a / 10) * 10, ones = a % 10;
  return {
    text: `${a} × ${b} = ?`,
    ...numChoices(ans, [ans + b, ans - b, ans + 10, tens * b + ones]),
    hint: `Break it up: ${tens} × ${b} = ${tens * b}, and ${ones} × ${b} = ${ones * b}. Add: ${ans}.`,
  };
}

function area(t) {
  if (t < 2) {
    const w = rnd(2, t === 0 ? 9 : 15), h = rnd(2, t === 0 ? 9 : 15);
    return {
      text: `A rectangle is ${w} m by ${h} m. What is its area in square meters?`,
      ...numChoices(w * h, [2 * (w + h), w + h, w * h + w]),
      hint: `Area = length × width = ${w} × ${h} = ${w * h} m².`,
    };
  }
  const b = 2 * rnd(2, 10), h = rnd(3, 12);
  return {
    text: `A triangle has a base of ${b} cm and a height of ${h} cm. What is its area?`,
    ...numChoices((b * h) / 2, [b * h, b + h, (b * h) / 2 + h]),
    hint: `Triangle area = ½ × base × height = ½ × ${b} × ${h} = ${(b * h) / 2} cm².`,
  };
}

function fracEquiv(t) {
  const d = rnd(2, [5, 8, 12][t]);
  const n = rnd(1, d - 1);
  const k = rnd(2, [3, 5, 6][t]);
  const askTop = Math.random() < 0.7;
  return askTop
    ? { text: `[[${n}/${d}]] = [[?/${d * k}]]`, ...numChoices(n * k, [n + k, n * k + 1, d * k - n * k]), hint: `${d} × ${k} = ${d * k}, so multiply the top by ${k} too: ${n} × ${k} = ${n * k}.` }
    : { text: `[[${n}/${d}]] = [[${n * k}/?]]`, ...numChoices(d * k, [d + k, d * k + 1, n * k + d]), hint: `${n} × ${k} = ${n * k}, so multiply the bottom by ${k} too: ${d} × ${k} = ${d * k}.` };
}

function fracCompare(t) {
  let list;
  if (t === 0) {
    const d = rnd(5, 12);
    const tops = shuffle([...Array(d - 1).keys()].map((i) => i + 1)).slice(0, 4);
    list = tops.map((n) => [n, d]);
  } else if (t === 1) {
    const n = rnd(1, 3);
    const ds = shuffle([2, 3, 4, 5, 6, 8, 10, 12].filter((d) => d > n)).slice(0, 4);
    list = ds.map((d) => [n, d]);
  } else {
    const seen = new Set();
    list = [];
    while (list.length < 4) {
      const d = rnd(2, 12), n = rnd(1, d - 1);
      const v = n / d;
      if (!seen.has(v)) { seen.add(v); list.push([n, d]); }
    }
  }
  const greatest = Math.random() < 0.65;
  const sorted = list.slice().sort((x, y) => x[0] / x[1] - y[0] / y[1]);
  const best = greatest ? sorted[sorted.length - 1] : sorted[0];
  const ans = `${best[0]}/${best[1]}`;
  return {
    text: `Which fraction is the <b>${greatest ? 'greatest' : 'smallest'}</b>?`,
    answer: ans,
    choices: shuffle(list.map(([n, d]) => `${n}/${d}`)),
    hint: t === 0
      ? 'Same bottom number: the bigger top number means more pieces.'
      : t === 1
        ? 'Same top number: the bigger bottom number means smaller pieces.'
        : `Turn each fraction into a decimal (top ÷ bottom) and compare. [[${best[0]}/${best[1]}]] ≈ ${(best[0] / best[1]).toFixed(2)}.`,
  };
}

function longDiv(t) {
  const d = rnd(2, t === 0 ? 5 : 9);
  const q = t === 0 ? rnd(11, 30) : rnd(21, t === 1 ? 99 : 250);
  const a = d * q;
  return {
    text: `${a} ÷ ${d} = ?`,
    ...numChoices(q, [q + 1, q - 1, q + 10, q - 10]),
    hint: `Divide one place at a time, left to right. Check: ${q} × ${d} = ${a}.`,
  };
}

function wordMulDiv(t) {
  const n = pick(NAMES), th = pick(THINGS);
  const max = [6, 10, 12][t];
  const a = rnd(2, max), b = rnd(2, max);
  const kind = rnd(0, 2);
  if (kind === 0) return { text: `There are ${a} bags with ${b} ${th} in each bag. How many ${th} are there in all?`, ...numChoices(a * b, [a + b, a * b + a]), hint: `Equal groups means multiply: ${a} × ${b} = ${a * b}.` };
  if (kind === 1) return { text: `${n} shares ${a * b} ${th} equally among ${a} friends. How many ${th} does each friend get?`, ...numChoices(b, [a, a * b - a, b + 1]), hint: `Sharing equally means divide: ${a * b} ÷ ${a} = ${b}.` };
  const price = rnd(2, t === 2 ? 25 : 9);
  return { text: `A potion costs ${price} coins. How many coins do ${a} potions cost?`, ...numChoices(price * a, [price + a, price * a + price]), hint: `${a} potions × ${price} coins = ${price * a} coins.` };
}

// ---------------------------------------------------------------- grade 5

function decAdd(t) {
  const scale = t === 2 ? 100 : 10;
  const decimals = t === 2 ? 2 : 1;
  let A = rnd(5, 90) * (t === 2 ? rnd(1, 9) : 1), B = rnd(3, 60);
  if (t === 2) B = rnd(11, 499);
  const sub = t >= 1 && Math.random() < 0.4;
  if (sub && B > A) [A, B] = [B, A];
  const res = sub ? A - B : A + B;
  const a = A / scale, b = B / scale, ans = res / scale;
  const op = sub ? '−' : '+';
  return {
    text: `${fmtNum(a)} ${op} ${fmtNum(b)} = ?`,
    ...numChoices(ans, [ans + 1, ans - 1, ans + 1 / scale, ans * 10, sub ? a + b : Math.abs(a - b)], { decimals }),
    hint: `Line up the decimal points, then ${sub ? 'subtract' : 'add'} like whole numbers: ${fmtNum(a)} ${op} ${fmtNum(b)} = ${fmtNum(ans)}.`,
  };
}

function fracAdd(t) {
  let b, d;
  if (t === 0) { b = d = rnd(3, 12); }
  else if (t === 1) { b = rnd(2, 6); d = b * rnd(2, 3); }
  else { b = rnd(2, 7); d = rnd(2, 7); while (d === b) d = rnd(2, 8); }
  const a = rnd(1, b - 1);
  let c = rnd(1, d - 1);
  if (t === 0) c = rnd(1, Math.max(1, d - a - 1));
  const L = lcm(b, d);
  const top = a * (L / b) + c * (L / d);
  const ans = fracStr(top, L);
  const naive = fracStr(a + c, b + d);
  return {
    text: `[[${a}/${b}]] + [[${c}/${d}]] = ?`,
    ...strChoices(ans, [naive, fracStr(top + 1, L), fracStr(a * c, b * d), fracStr(top, L * 2)],
      () => [fracStr(top - 1, L), fracStr(top + 2, L), fracStr(top, L + 1), fracStr(top + L, L)]),
    hint: b === d
      ? `Same bottom number: add the tops. ${a} + ${c} = ${a + c}, so [[${a + c}/${b}]]${ans !== `${a + c}/${b}` ? ` = ${ans}` : ''}.`
      : `Make the bottoms match (${L}): [[${a * (L / b)}/${L}]] + [[${c * (L / d)}/${L}]] = [[${top}/${L}]]${ans !== `${top}/${L}` ? ` = ${ans}` : ''}. Never add the bottoms!`,
  };
}

function mul2x2(t) {
  const a = rnd(11, t === 0 ? 30 : t === 1 ? 45 : 99);
  const b = t === 0 ? pick([10, 11, 20]) : rnd(11, t === 1 ? 25 : 99);
  const ans = a * b;
  const bt = Math.floor(b / 10) * 10, bo = b % 10;
  return {
    text: `${a} × ${b} = ?`,
    ...numChoices(ans, [ans + 10, ans - 10, a * bo + a * Math.floor(b / 10), ans + a]),
    hint: `Split ${b} into ${bt} + ${bo}: ${a} × ${bt} = ${a * bt}, ${a} × ${bo} = ${a * bo}. Add them: ${ans}.`,
  };
}

function orderOps(t) {
  let text, ans, wrong, hint;
  const form = t === 0 ? rnd(0, 1) : t === 1 ? rnd(0, 3) : rnd(2, 5);
  const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9);
  switch (form) {
    case 0: text = `${a} + ${b} × ${c}`; ans = a + b * c; wrong = (a + b) * c; hint = `Multiply first: ${b} × ${c} = ${b * c}. Then add ${a}: ${ans}.`; break;
    case 1: { const big = b * c + rnd(1, 20); text = `${big} − ${b} × ${c}`; ans = big - b * c; wrong = (big - b) * c; hint = `Multiply first: ${b} × ${c} = ${b * c}. Then ${big} − ${b * c} = ${ans}.`; break; }
    case 2: text = `(${a} + ${b}) × ${c}`; ans = (a + b) * c; wrong = a + b * c; hint = `Brackets first: ${a} + ${b} = ${a + b}. Then × ${c} = ${ans}.`; break;
    case 3: { const q = b * c; text = `${a} + ${q} ÷ ${c}`; ans = a + b; wrong = (a + q) / c; hint = `Divide first: ${q} ÷ ${c} = ${b}. Then ${a} + ${b} = ${ans}.`; break; }
    case 4: { const d = rnd(2, 5); const [x, y] = a * b >= c * d ? [[a, b], [c, d]] : [[c, d], [a, b]]; text = `${x[0]} × ${x[1]} − ${y[0]} × ${y[1]}`; ans = x[0] * x[1] - y[0] * y[1]; wrong = (x[0] * x[1] - y[0]) * y[1]; hint = `Do both multiplications first: ${x[0] * x[1]} − ${y[0] * y[1]} = ${ans}.`; break; }
    default: { const e = rnd(2, 4); text = `${a} + ${b}² × ${e}`; ans = a + b * b * e; wrong = (a + b * b) * e; hint = `Exponents first: ${b}² = ${b * b}. Then × ${e} = ${b * b * e}. Then + ${a} = ${ans}.`; }
  }
  return { text: `${text} = ?`, ...numChoices(ans, [wrong, ans + 1, ans - 2], { min: -1000 }), hint };
}

// ---------------------------------------------------------------- grade 6

function percent(t) {
  const pct = pick([[10, 50, 25], [20, 75, 5, 30], [15, 35, 12.5, 40, 60]][t]);
  // smallest whole that gives a whole-number answer (12.5% = 1/8)
  const den = pct === 12.5 ? 8 : 100 / gcd(100, pct);
  const whole = den * rnd(Math.max(1, Math.ceil(10 / den)), Math.max(2, Math.ceil(10 / den)) + (t === 0 ? 7 : 11));
  const ans = (pct * whole) / 100;
  return {
    text: `What is ${pct}% of ${whole}?`,
    ...numChoices(ans, [whole / pct, ans * 10, whole - ans, pct + whole / 10], { min: 1, decimals: ans % 1 ? 1 : 0 }),
    hint: `${pct}% means ${pct} out of 100. 1% of ${whole} is ${fmtNum(whole / 100)}, so ${pct}% is ${fmtNum(whole / 100)} × ${pct} = ${fmtNum(ans)}.`,
  };
}

function negAdd(t) {
  let a, b, op;
  if (t === 0) { a = -rnd(1, 10); b = rnd(1, 15); op = '+'; }
  else if (t === 1) { a = rnd(1, 10); b = rnd(a + 1, 20); op = '−'; }
  else { a = -rnd(2, 15); b = (Math.random() < 0.5 ? -1 : 1) * rnd(2, 15); op = pick(['+', '−']); }
  const ans = op === '+' ? a + b : a - b;
  return {
    text: `${fmtNum(a)} ${op} ${p(b)} = ?`,
    ...numChoices(ans, [-ans, ans + 2, op === '+' ? a - b : a + b], { min: -100 }),
    hint: `Use a number line: start at ${fmtNum(a)} and move ${(op === '+') === (b >= 0) ? 'right' : 'left'} ${Math.abs(b)} to land on ${fmtNum(ans)}.`,
  };
}

function exponents(t) {
  let base, exp;
  if (t === 0) { base = rnd(2, 10); exp = 2; }
  else if (t === 1) { if (Math.random() < 0.5) { base = rnd(11, 15); exp = 2; } else { base = rnd(2, 5); exp = 3; } }
  else { base = pick([2, 3, 10]); exp = base === 2 ? rnd(4, 8) : base === 3 ? rnd(3, 4) : rnd(3, 5); }
  const ans = base ** exp;
  const sup = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸' }[exp];
  return {
    text: `${base}${sup} = ?`,
    ...numChoices(ans, [base * exp, base ** (exp - 1), base ** exp + base]),
    hint: `${base}${sup} means ${Array(exp).fill(base).join(' × ')} = ${ans}. (Not ${base} × ${exp}!)`,
  };
}

function ratios(t) {
  const a = rnd(1, 6), b = rnd(2, 9);
  const k = rnd(2, [3, 6, 12][t]);
  const askB = Math.random() < 0.5;
  return askB
    ? { text: `${a} : ${b} = ${a * k} : ?`, ...numChoices(b * k, [b + k, b * k + b, a * k + b]), hint: `${a} × ${k} = ${a * k}, so multiply ${b} by ${k} too: ${b * k}.` }
    : { text: `${a} : ${b} = ? : ${b * k}`, ...numChoices(a * k, [a + k, a * k + a, b * k - a]), hint: `${b} × ${k} = ${b * k}, so multiply ${a} by ${k} too: ${a * k}.` };
}

// ---------------------------------------------------------------- grade 7

function algOneStep(t) {
  const x = t === 2 ? rnd(-12, 15) || 4 : rnd(2, 15);
  const a = rnd(2, t === 0 ? 9 : 12);
  const form = rnd(0, t === 0 ? 1 : 3);
  let text, wrong, hint;
  if (form === 0) { text = `x + ${a} = ${fmtNum(x + a)}`; wrong = x + 2 * a; hint = `Undo the + ${a} by subtracting ${a} from both sides: x = ${fmtNum(x + a)} − ${a} = ${fmtNum(x)}.`; }
  else if (form === 1) { text = `x − ${a} = ${fmtNum(x - a)}`; wrong = x - 2 * a; hint = `Undo the − ${a} by adding ${a} to both sides: x = ${fmtNum(x - a)} + ${a} = ${fmtNum(x)}.`; }
  else if (form === 2) { text = `${a}x = ${fmtNum(a * x)}`; wrong = a * x - a; hint = `${a}x means ${a} × x. Divide both sides by ${a}: x = ${fmtNum(a * x)} ÷ ${a} = ${fmtNum(x)}.`; }
  else { text = `x ÷ ${a} = ${fmtNum(x)}`; wrong = x + a; hint = `Undo the ÷ ${a} by multiplying both sides by ${a}: x = ${fmtNum(x)} × ${a} = ${fmtNum(x * a)}.`; }
  const ans = form === 3 ? x * a : x;
  return { text: `Solve for x: &nbsp;<b>${text}</b>`, ...numChoices(ans, [wrong, -ans, ans + 1], { min: -200 }), hint };
}

function negMul(t) {
  let a = rnd(2, [6, 9, 12][t]), b = rnd(2, [6, 9, 12][t]);
  const signs = pick([[-1, 1], [1, -1], [-1, -1]]);
  a *= signs[0]; b *= signs[1];
  const div = t >= 1 && Math.random() < 0.4;
  if (div) {
    const prod = a * b;
    return {
      text: `${fmtNum(prod)} ÷ ${p(b)} = ?`,
      ...numChoices(a, [-a, a + 1, b], { min: -200 }),
      hint: `Same signs give a positive answer, different signs give a negative one. ${fmtNum(prod)} ÷ ${p(b)} = ${fmtNum(a)}.`,
    };
  }
  return {
    text: `${p(a)} × ${p(b)} = ?`,
    ...numChoices(a * b, [-(a * b), a + b, a * b + a], { min: -200 }),
    hint: `${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(a * b)}. ${(a < 0) === (b < 0) ? 'Two negatives (or two positives) make a positive.' : 'One negative makes the answer negative.'}`,
  };
}

function angles(t) {
  if (t === 0) {
    const a = rnd(30, 90), b = rnd(20, 150 - a);
    return { text: `Two angles of a triangle are ${a}° and ${b}°. What is the third angle?`, ...numChoices(180 - a - b, [360 - a - b, 90 - Math.min(a + b, 80), 180 - a]), hint: `A triangle's angles add up to 180°: 180 − ${a} − ${b} = ${180 - a - b}°.` };
  }
  if (t === 1) {
    const a = rnd(15, 165);
    return { text: `Two angles sit on a straight line. One is ${a}°. What is the other?`, ...numChoices(180 - a, [360 - a, Math.abs(90 - a), 180 - a + 10]), hint: `Angles on a straight line add up to 180°: 180 − ${a} = ${180 - a}°.` };
  }
  const a = rnd(60, 120), b = rnd(60, 120), c = rnd(60, 110);
  return { text: `A quadrilateral has angles of ${a}°, ${b}° and ${c}°. What is the fourth angle?`, ...numChoices(360 - a - b - c, [180 - (a + b + c) % 180, 360 - a - b, 360 - a - b - c + 10]), hint: `A quadrilateral's angles add up to 360°: 360 − ${a} − ${b} − ${c} = ${360 - a - b - c}°.` };
}

// ---------------------------------------------------------------- grade 8

function algTwoStep(t) {
  const x = t === 2 ? rnd(-9, 12) || 3 : rnd(1, 12);
  const a = rnd(2, t === 0 ? 5 : 9);
  const b = rnd(1, t === 0 ? 10 : 20);
  const minus = t >= 1 && Math.random() < 0.5;
  const c = minus ? a * x - b : a * x + b;
  const wrong = minus ? (c - b) / a : (c + b) / a;
  return {
    text: `Solve for x: &nbsp;<b>${a}x ${minus ? '−' : '+'} ${b} = ${fmtNum(c)}</b>`,
    ...numChoices(x, [Number.isInteger(wrong) ? wrong : x + 2, -x, x + 1], { min: -100 }),
    hint: `First ${minus ? 'add' : 'subtract'} ${b} on both sides: ${a}x = ${fmtNum(a * x)}. Then divide by ${a}: x = ${fmtNum(x)}.`,
  };
}

function roots(t) {
  if (t < 2) {
    const n = rnd(2, t === 0 ? 10 : 15);
    return { text: `√${n * n} = ?`, ...numChoices(n, [n * n / 2, n + 1, n - 1, 2 * n]), hint: `Which number times itself gives ${n * n}? ${n} × ${n} = ${n * n}, so √${n * n} = ${n}.` };
  }
  const n = rnd(2, 6);
  return { text: `∛${n ** 3} = ?`, ...numChoices(n, [n * n, n + 1, Math.round(n ** 3 / 3)]), hint: `Which number used three times gives ${n ** 3}? ${n} × ${n} × ${n} = ${n ** 3}.` };
}

function pythag(t) {
  const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];
  const [a0, b0, c0] = t === 0 ? triples[0] : pick(triples);
  const k = t === 0 ? rnd(1, 3) : rnd(1, 2);
  const [a, b, c] = [a0 * k, b0 * k, c0 * k];
  if (t < 2) {
    return { text: `A right triangle has legs of ${a} and ${b}. How long is the hypotenuse?`, ...numChoices(c, [a + b, c + 1, Math.abs(b - a)]), hint: `a² + b² = c²: ${a * a} + ${b * b} = ${c * c}, and √${c * c} = ${c}.` };
  }
  return { text: `A right triangle has a hypotenuse of ${c} and one leg of ${a}. How long is the other leg?`, ...numChoices(b, [c - a, c + a, b + 1]), hint: `b² = c² − a² = ${c * c} − ${a * a} = ${b * b}, so b = ${b}.` };
}

// ---------------------------------------------------------------- registry

export const SKILLS = [
  { id: 'add10', name: 'Addition to 20', grade: 1, gen: add10 },
  { id: 'sub10', name: 'Subtraction to 20', grade: 1, gen: sub10 },
  { id: 'compare', name: 'Comparing numbers', grade: 1, gen: compare },
  { id: 'add100', name: 'Two-digit addition', grade: 2, gen: add100 },
  { id: 'sub100', name: 'Two-digit subtraction', grade: 2, gen: sub100 },
  { id: 'mulintro', name: 'Times 2, 5 and 10', grade: 2, gen: mulIntro },
  { id: 'wordaddsub', name: 'Word problems (+ / −)', grade: 2, gen: wordAddSub },
  { id: 'multables', name: 'Times tables', grade: 3, gen: mulTables },
  { id: 'divfacts', name: 'Division facts', grade: 3, gen: divFacts },
  { id: 'add1000', name: 'Three-digit + and −', grade: 3, gen: add1000 },
  { id: 'rounding', name: 'Rounding', grade: 3, gen: rounding },
  { id: 'fracof', name: 'Fraction of a number', grade: 3, gen: fracOf },
  { id: 'perimeter', name: 'Perimeter', grade: 3, gen: perimeter },
  { id: 'mul2x1', name: 'Multi-digit × one digit', grade: 4, gen: mul2x1 },
  { id: 'area', name: 'Area', grade: 4, gen: area },
  { id: 'fracequiv', name: 'Equivalent fractions', grade: 4, gen: fracEquiv },
  { id: 'fraccompare', name: 'Comparing fractions', grade: 4, gen: fracCompare },
  { id: 'longdiv', name: 'Long division', grade: 4, gen: longDiv },
  { id: 'wordmuldiv', name: 'Word problems (× / ÷)', grade: 4, gen: wordMulDiv },
  { id: 'decadd', name: 'Decimals + and −', grade: 5, gen: decAdd },
  { id: 'fracadd', name: 'Adding fractions', grade: 5, gen: fracAdd },
  { id: 'mul2x2', name: 'Two-digit × two-digit', grade: 5, gen: mul2x2 },
  { id: 'orderops', name: 'Order of operations', grade: 5, gen: orderOps },
  { id: 'percent', name: 'Percentages', grade: 6, gen: percent },
  { id: 'negadd', name: 'Negative numbers + and −', grade: 6, gen: negAdd },
  { id: 'exponents', name: 'Exponents', grade: 6, gen: exponents },
  { id: 'ratios', name: 'Ratios', grade: 6, gen: ratios },
  { id: 'algonestep', name: 'One-step equations', grade: 7, gen: algOneStep },
  { id: 'negmul', name: 'Negative numbers × and ÷', grade: 7, gen: negMul },
  { id: 'angles', name: 'Angles', grade: 7, gen: angles },
  { id: 'algtwostep', name: 'Two-step equations', grade: 8, gen: algTwoStep },
  { id: 'roots', name: 'Square and cube roots', grade: 8, gen: roots },
  { id: 'pythag', name: 'Pythagorean theorem', grade: 8, gen: pythag },
];
const BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillName = (id) => BY_ID[id]?.name || id;
export const skillGrade = (id) => BY_ID[id]?.grade || 0;

const START_MASTERY = 0.35;
const mastery = (save, id) => save.stats.skills[id]?.m ?? START_MASTERY;
export const tierFor = (m) => (m < 0.5 ? 0 : m < 0.78 ? 1 : 2);

function weightedPick(items, weightOf) {
  const weights = items.map(weightOf);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Pick a skill: mostly the player's grade, some review of earlier grades,
// weaker skills more often, and a peek at the next grade once mastered.
export function pickSkill(save, lastSkill) {
  const g = Math.max(1, Math.min(8, save.grade || 3));
  let pool = SKILLS.filter((s) => s.grade <= g && s.grade >= g - 2);
  const current = SKILLS.filter((s) => s.grade === g);
  const avg = current.reduce((a, s) => a + mastery(save, s.id), 0) / current.length;
  if (g < 8 && avg > 0.8 && Math.random() < 0.2) pool = SKILLS.filter((s) => s.grade === g + 1);
  return weightedPick(pool, (s) => {
    const gradeW = s.grade === g ? 3 : s.grade === g - 1 ? 1.6 : s.grade > g ? 3 : 0.8;
    const needW = 1.35 - mastery(save, s.id);
    return gradeW * needW * (s.id === lastSkill ? 0.3 : 1);
  });
}

const recent = [];
export function makeQuestion(save, lastSkill) {
  const skill = pickSkill(save, lastSkill);
  const tier = tierFor(mastery(save, skill.id));
  let q;
  for (let i = 0; i < 6; i++) {
    q = skill.gen(tier);
    if (!recent.includes(q.text)) break;
  }
  recent.push(q.text);
  if (recent.length > 12) recent.shift();
  return { ...q, skill: skill.id, tier };
}

export function recordAnswer(save, skillId, correct) {
  const s = (save.stats.skills[skillId] ||= { n: 0, c: 0, m: START_MASTERY });
  s.n += 1;
  if (correct) s.c += 1;
  s.m = Math.round((s.m * 0.8 + (correct ? 0.2 : 0)) * 1000) / 1000;
  return s;
}

// Render [[a/b]] and a/b answers as stacked fractions. Input is generated
// internally (never user text), so returning HTML is safe.
const FRAC = (n, d) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;
export function fmtMath(text) {
  return String(text).replace(/\[\[(−?[\d?]+)\/([\d?]+)\]\]/g, (_, n, d) => FRAC(n, d));
}
export function fmtChoice(c) {
  const m = /^(−?\d+)\/(\d+)$/.exec(c);
  return m ? FRAC(m[1], m[2]) : c;
}
