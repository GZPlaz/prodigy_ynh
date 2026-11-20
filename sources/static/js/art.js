// Numeria art: every character and scene is drawn as inline SVG.
import { ELEMENTS, WANDS, ZONES } from './data.js';

let uid = 0;
const nextId = (p) => `${p}${++uid}`;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ------------------------------------------------------------------ wizard

const HAT_DRAW = {
  pointy: (c) => `
    <path d="M30 44 C40 32 48 16 60 4 C64 1 71 4 69 9 C66 16 72 30 88 44 Z" fill="${c}"/>
    <path d="M36 40 Q60 46 84 40 L86 45 Q60 52 34 45 Z" fill="${shade(c, -0.18)}"/>
    <ellipse cx="60" cy="46" rx="34" ry="7" fill="${shade(c, -0.08)}"/>`,
  star: (c) => `${HAT_DRAW.pointy(c)}
    <path d="M60 20 l3.5 7 7.7 1.1 -5.6 5.4 1.3 7.6 -6.9-3.6 -6.9 3.6 1.3-7.6 -5.6-5.4 7.7-1.1z" fill="#ffd60a" stroke="#fff3b0" stroke-width="1"/>`,
  wide: (c) => `
    <ellipse cx="60" cy="44" rx="44" ry="10" fill="${shade(c, -0.08)}"/>
    <path d="M38 42 Q38 16 60 14 Q82 16 82 42 Z" fill="${c}"/>
    <path d="M38 36 Q60 42 82 36 L82 42 Q60 48 38 42 Z" fill="${shade(c, -0.25)}"/>
    <circle cx="74" cy="34" r="4" fill="#ffd60a"/>`,
  crown: () => `
    <path d="M36 46 L38 24 L48 34 L60 18 L72 34 L82 24 L84 46 Z" fill="#ffc300" stroke="#e09f00" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="60" cy="36" r="3.5" fill="#e63946"/><circle cx="46" cy="40" r="2.5" fill="#4cc9f0"/><circle cx="74" cy="40" r="2.5" fill="#4cc9f0"/>`,
  hood: () => '',
};

const PATTERN_DRAW = {
  plain: () => '',
  stripes: () => [100, 116, 132, 148].map((y) => `<rect x="0" y="${y}" width="120" height="6" fill="rgba(255,255,255,.22)"/>`).join(''),
  trim: () => `<rect x="0" y="150" width="120" height="12" fill="#ffd166"/><rect x="0" y="146" width="120" height="3" fill="#ffd166" opacity=".6"/>`,
  stars: () => [[44, 100], [70, 112], [52, 132], [80, 140], [38, 150], [64, 152]]
    .map(([x, y]) => `<path transform="translate(${x} ${y}) scale(.55)" d="M0 -8 l2.4 5 5.4 .8 -3.9 3.8 .9 5.4 -4.8-2.5 -4.8 2.5 .9-5.4 -3.9-3.8 5.4-.8z" fill="#fff6c9"/>`).join(''),
};

export function avatarSVG(look, element = 'fire', { wand = 'twig', cls = '' } = {}) {
  const robe = look.robe || '#5b5fc7';
  const skin = look.skin || '#f8c9a0';
  const hair = look.hair || '#5a3825';
  const hat = look.hat || 'pointy';
  const clip = nextId('robe');
  const w = WANDS[wand] || WANDS.twig;
  const glow = ELEMENTS[element]?.color || '#ffd166';
  const hood = hat === 'hood';
  return `<svg class="avatar ${cls}" viewBox="0 0 120 170" aria-hidden="true">
  <defs><clipPath id="${clip}"><path d="M60 78 C42 80 34 112 26 162 Q60 170 94 162 C86 112 78 80 60 78Z"/></clipPath></defs>
  <ellipse cx="60" cy="164" rx="34" ry="5" fill="rgba(0,0,0,.18)"/>
  ${hood ? `<path d="M30 74 Q26 30 60 28 Q94 30 90 74 Q84 88 60 88 Q36 88 30 74Z" fill="${shade(robe, -0.15)}"/>` : ''}
  <path d="M60 78 C42 80 34 112 26 162 Q60 170 94 162 C86 112 78 80 60 78Z" fill="${robe}"/>
  <g clip-path="url(#${clip})">${(PATTERN_DRAW[look.pattern] || PATTERN_DRAW.plain)()}
    <path d="M60 78 L60 168" stroke="${shade(robe, -0.15)}" stroke-width="2"/></g>
  <path d="M40 112 Q60 118 80 112 L81 119 Q60 125 39 119Z" fill="${shade(robe, -0.28)}"/>
  <circle cx="60" cy="118" r="3.5" fill="#ffd166"/>
  <path d="M44 86 Q30 100 30 120 L40 122 Q42 104 52 92Z" fill="${shade(robe, -0.06)}"/>
  <circle cx="35" cy="122" r="5.5" fill="${skin}"/>
  <g class="wand-arm">
    <path d="M76 86 Q90 96 92 114 L82 116 Q80 102 68 92Z" fill="${shade(robe, -0.06)}"/>
    <line x1="86" y1="126" x2="104" y2="88" stroke="${w.color}" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="87" cy="115" r="5.5" fill="${skin}"/>
    <circle class="wand-tip" cx="104" cy="87" r="5" fill="${w.tip}" stroke="${glow}" stroke-width="2.5"/>
  </g>
  <circle cx="60" cy="58" r="22" fill="${skin}"/>
  ${hood ? '' : `<path d="M37 60 Q36 34 60 34 Q84 34 83 60 Q80 50 72 46 Q62 52 48 48 Q40 52 37 60Z" fill="${hair}"/>
  <path d="M37 58 Q34 72 40 78 L42 62Z M83 58 Q86 72 80 78 L78 62Z" fill="${hair}"/>`}
  ${hood ? `<path d="M40 52 Q48 44 60 46 Q72 44 80 52 Q72 48 60 50 Q48 48 40 52Z" fill="${hair}"/>` : ''}
  <ellipse cx="52" cy="61" rx="3.2" ry="4.2" fill="#2b2d42"/><circle cx="53.2" cy="59.5" r="1.2" fill="#fff"/>
  <ellipse cx="68" cy="61" rx="3.2" ry="4.2" fill="#2b2d42"/><circle cx="69.2" cy="59.5" r="1.2" fill="#fff"/>
  <circle cx="46" cy="69" r="4" fill="#ff8fa3" opacity=".45"/><circle cx="74" cy="69" r="4" fill="#ff8fa3" opacity=".45"/>
  <path d="M54 70 Q60 76 66 70" stroke="#7a3b2e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  ${hood ? `<path d="M36 66 Q34 34 60 32 Q86 34 84 66" stroke="${shade(robe, -0.05)}" stroke-width="7" fill="none" stroke-linecap="round"/>` : ''}
  ${(HAT_DRAW[hat] || HAT_DRAW.pointy)(robe === look.hatColor ? robe : (look.hatColor || shade(robe, -0.1)))}
</svg>`;
}

// ------------------------------------------------------------------ monsters

function eye(cx, cy, r, look = -1) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>
    <circle cx="${cx + look * r * 0.3}" cy="${cy + r * 0.1}" r="${r * 0.58}" fill="#1d1d2c"/>
    <circle cx="${cx + look * r * 0.3 - r * 0.2}" cy="${cy - r * 0.2}" r="${r * 0.2}" fill="#fff"/>`;
}

function accessory(element, x, y, s = 1) {
  const t = `transform="translate(${x} ${y}) scale(${s})"`;
  switch (element) {
    case 'nature': return `<g ${t}><path d="M0 0 L0 -10" stroke="#3a7d44" stroke-width="3"/><path d="M0 -8 C-14 -16 -10 -30 6 -32 C8 -20 6 -12 0 -8Z" fill="#6ccf5f"/><path d="M0 -9 Q2 -20 5 -30" stroke="#3a7d44" stroke-width="1.5" fill="none"/></g>`;
    case 'fire': return `<g ${t}><path d="M0 0 C-12 -8 -8 -22 0 -32 C2 -22 12 -20 10 -8 C9 -3 5 0 0 0Z" fill="#ff7a00"/><path d="M0 -2 C-5 -6 -4 -14 0 -20 C2 -14 6 -12 5 -6 C4 -3 2 -2 0 -2Z" fill="#ffd60a"/></g>`;
    case 'water': return `<g ${t}><path d="M0 -30 C6 -20 11 -13 11 -7 A11 11 0 0 1 -11 -7 C-11 -13 -6 -20 0 -30Z" fill="#48cae4" stroke="#0096c7" stroke-width="1.5"/><ellipse cx="-4" cy="-10" rx="2.5" ry="4" fill="#fff" opacity=".7"/></g>`;
    case 'storm': return `<g ${t}><path d="M4 -32 L-9 -12 L0 -12 L-5 2 L10 -18 L1 -18Z" fill="#ffe066" stroke="#f59f00" stroke-width="1.5" stroke-linejoin="round"/></g>`;
    default: return `<g ${t}><path d="M0 -26 L3 -15 L14 -12 L3 -9 L0 2 L-3 -9 L-14 -12 L-3 -15Z" fill="#ffd166"/></g>`;
  }
}

const mouthSmile = (cx, cy, w = 8) => `<path d="M${cx - w} ${cy} Q${cx} ${cy + w * 0.9} ${cx + w} ${cy}" stroke="#1d1d2c" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
const fangs = (cx, cy) => `<path d="M${cx - 9} ${cy} Q${cx} ${cy + 7} ${cx + 9} ${cy}" stroke="#1d1d2c" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M${cx - 5} ${cy + 2} l2 5 2 -4Z M${cx + 5} ${cy + 2} l-2 5 -2 -4Z" fill="#fff"/>`;

const BODIES = {
  slime: (c, a, el) => `
    <path d="M22 124 C18 92 36 50 70 48 C104 50 122 92 118 124 Q70 134 22 124Z" fill="${c}"/>
    <path d="M30 118 C28 96 40 66 62 58" stroke="${shade(c, 0.18)}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".6"/>
    <ellipse cx="48" cy="72" rx="9" ry="6" fill="#fff" opacity=".5" transform="rotate(-30 48 72)"/>
    ${eye(56, 90, 9)}${eye(84, 90, 9)}${mouthSmile(70, 104, 9)}
    <circle cx="44" cy="102" r="5" fill="#ff8fa3" opacity=".35"/><circle cx="96" cy="102" r="5" fill="#ff8fa3" opacity=".35"/>
    ${accessory(el, 70, 50)}`,
  bat: (c, a, el) => `
    <path d="M54 84 C40 56 14 54 4 70 C14 70 18 78 16 88 C24 82 32 86 34 96 C40 88 48 90 56 94Z" fill="${shade(c, -0.12)}"/>
    <path d="M86 84 C100 56 126 54 136 70 C126 70 122 78 124 88 C116 82 108 86 106 96 C100 88 92 90 84 94Z" fill="${shade(c, -0.12)}"/>
    <path d="M50 66 L46 44 L60 58Z M90 66 L94 44 L80 58Z" fill="${c}"/>
    <circle cx="70" cy="84" r="26" fill="${c}"/>
    <ellipse cx="70" cy="96" rx="14" ry="10" fill="${a}" opacity=".9"/>
    ${eye(61, 80, 7.5)}${eye(80, 80, 7.5)}${fangs(70, 93)}
    <path d="M62 110 l-3 8 M78 110 l3 8" stroke="${shade(c, -0.3)}" stroke-width="3" stroke-linecap="round"/>
    ${accessory(el, 70, 60, 0.7)}`,
  mushroom: (c, a, el) => `
    <path d="M50 78 Q48 118 54 126 Q70 132 86 126 Q92 118 90 78Z" fill="${a}"/>
    <path d="M20 84 C18 46 48 24 70 24 C92 24 122 46 120 84 Q70 96 20 84Z" fill="${c}"/>
    <circle cx="48" cy="56" r="7" fill="#fff" opacity=".85"/><circle cx="78" cy="42" r="6" fill="#fff" opacity=".85"/><circle cx="98" cy="66" r="8" fill="#fff" opacity=".85"/><circle cx="66" cy="64" r="4" fill="#fff" opacity=".85"/>
    ${eye(61, 100, 6.5)}${eye(80, 100, 6.5)}${mouthSmile(70, 113, 6)}
    ${accessory(el, 92, 32, 0.6)}`,
  golem: (c, a, el) => `
    <rect x="16" y="66" width="22" height="44" rx="10" fill="${shade(c, -0.1)}"/>
    <rect x="102" y="66" width="22" height="44" rx="10" fill="${shade(c, -0.1)}"/>
    <rect x="34" y="44" width="72" height="80" rx="16" fill="${c}"/>
    <path d="M40 92 L58 98 L52 112 M84 54 L96 64 L90 76" stroke="${shade(c, -0.25)}" stroke-width="3" fill="none"/>
    <rect x="46" y="66" width="18" height="10" rx="4" fill="${a}"/><rect x="76" y="66" width="18" height="10" rx="4" fill="${a}"/>
    <rect x="49" y="68" width="6" height="6" rx="2" fill="#1d1d2c"/><rect x="79" y="68" width="6" height="6" rx="2" fill="#1d1d2c"/>
    <rect x="56" y="86" width="28" height="5" rx="2.5" fill="${shade(c, -0.35)}"/>
    <rect x="40" y="120" width="22" height="10" rx="4" fill="${shade(c, -0.2)}"/><rect x="78" y="120" width="22" height="10" rx="4" fill="${shade(c, -0.2)}"/>
    <path d="M36 52 Q50 36 70 42 Q92 36 104 52" stroke="${a}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"/>
    ${accessory(el, 70, 44)}`,
  imp: (c, a, el, crown) => `
    <path d="M94 104 Q124 108 122 82 Q120 74 128 70" stroke="${shade(c, -0.15)}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M124 64 l8 4 -6 6Z" fill="${shade(c, -0.15)}"/>
    <path d="M46 72 C30 60 22 74 18 86 C30 82 36 86 44 90Z M94 72 C110 60 118 74 122 86 C110 82 104 86 96 90Z" fill="${a}" opacity=".85"/>
    <circle cx="70" cy="86" r="30" fill="${c}"/>
    <path d="M52 62 Q46 46 40 40 Q54 46 60 58Z M88 62 Q94 46 100 40 Q86 46 80 58Z" fill="${a}"/>
    <ellipse cx="70" cy="100" rx="16" ry="11" fill="${shade(c, 0.12)}"/>
    ${eye(59, 82, 8.5)}${eye(81, 82, 8.5)}
    <path d="M58 99 Q70 110 82 99" stroke="#1d1d2c" stroke-width="2.5" fill="#fff" stroke-linejoin="round"/>
    <path d="M60 116 l-2 12 M80 116 l2 12" stroke="${shade(c, -0.2)}" stroke-width="5" stroke-linecap="round"/>
    ${crown ? `<path d="M50 60 L52 40 L61 50 L70 34 L79 50 L88 40 L90 60Z" fill="#ffc300" stroke="#e09f00" stroke-width="2" stroke-linejoin="round"/><circle cx="70" cy="51" r="3" fill="#e63946"/>` : accessory(el, 70, 56, 0.75)}`,
  ghost: (c, a, el) => `
    <path d="M30 122 L30 72 C30 42 50 28 70 28 C90 28 110 42 110 72 L110 122 Q100 112 90 122 Q80 112 70 122 Q60 112 50 122 Q40 112 30 122Z" fill="${c}" opacity=".93"/>
    <path d="M40 70 C40 52 52 40 66 38" stroke="#fff" stroke-width="5" fill="none" opacity=".5" stroke-linecap="round"/>
    <ellipse cx="58" cy="74" rx="7" ry="10" fill="#1d1d2c"/><ellipse cx="82" cy="74" rx="7" ry="10" fill="#1d1d2c"/>
    <circle cx="56" cy="70" r="2.5" fill="#fff"/><circle cx="80" cy="70" r="2.5" fill="#fff"/>
    <ellipse cx="70" cy="96" rx="6" ry="7" fill="#1d1d2c"/>
    <circle cx="48" cy="88" r="5" fill="${a}" opacity=".5"/><circle cx="92" cy="88" r="5" fill="${a}" opacity=".5"/>
    ${accessory(el, 98, 38, 0.6)}`,
  crab: (c, a, el) => `
    <path d="M40 100 l-18 18 M44 108 l-12 18 M100 100 l18 18 M96 108 l12 18" stroke="${shade(c, -0.2)}" stroke-width="5" stroke-linecap="round"/>
    <path d="M44 88 Q30 82 28 70 M96 88 Q110 82 112 70" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M14 66 C10 50 26 42 36 50 L28 60 L38 64 C36 74 18 78 14 66Z" fill="${c}"/>
    <path d="M126 66 C130 50 114 42 104 50 L112 60 L102 64 C104 74 122 78 126 66Z" fill="${c}"/>
    <ellipse cx="70" cy="96" rx="38" ry="26" fill="${c}"/>
    <ellipse cx="70" cy="104" rx="24" ry="12" fill="${a}" opacity=".8"/>
    <path d="M58 72 L56 58 M82 72 L84 58" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
    ${eye(56, 54, 8)}${eye(84, 54, 8)}${mouthSmile(70, 92, 8)}
    ${accessory(el, 70, 74, 0.55)}`,
  dragon: (c, a, el) => `
    <path d="M98 70 C112 36 136 36 138 44 C128 48 128 56 134 62 C124 62 120 70 124 78 C114 74 106 80 100 88Z" fill="${shade(c, -0.15)}"/>
    <path d="M104 112 Q132 118 134 98 Q136 90 128 84" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M126 80 l12 -2 -6 10Z" fill="${a}"/>
    <ellipse cx="82" cy="98" rx="36" ry="28" fill="${c}"/>
    <ellipse cx="78" cy="106" rx="22" ry="16" fill="${a}" opacity=".85"/>
    <path d="M60 86 Q52 64 46 58" stroke="${c}" stroke-width="22" fill="none" stroke-linecap="round"/>
    <circle cx="44" cy="52" r="22" fill="${c}"/>
    <ellipse cx="28" cy="60" rx="14" ry="10" fill="${shade(c, 0.08)}"/>
    <circle cx="22" cy="57" r="2" fill="#1d1d2c"/><circle cx="29" cy="56" r="2" fill="#1d1d2c"/>
    <path d="M50 34 L58 14 L60 36Z M36 34 L36 14 L46 32Z" fill="${a}"/>
    ${eye(44, 46, 7.5)}
    <path d="M18 66 Q28 72 38 66" stroke="#1d1d2c" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M70 70 l6 -10 6 10 M86 72 l6 -10 6 10" fill="${a}"/>
    <path d="M62 124 l-2 8 M98 124 l2 8" stroke="${shade(c, -0.2)}" stroke-width="8" stroke-linecap="round"/>
    ${accessory(el, 100, 70, 0.6)}`,
};

export function monsterSVG(sp, { cls = '', element } = {}) {
  const el = element || sp.element;
  const body = BODIES[sp.body] || BODIES.slime;
  return `<svg class="monster ${cls}" viewBox="0 0 140 140" aria-hidden="true">
    <ellipse cx="70" cy="131" rx="44" ry="6" fill="rgba(0,0,0,.18)"/>
    ${body(sp.color, sp.accent, el, sp.crown)}
  </svg>`;
}

// ------------------------------------------------------------------ scenes

const SCENES = {
  forest: `
    <path d="M0 210 Q120 150 260 190 T520 180 T800 190 V300 H0Z" fill="#7cc576"/>
    ${[40, 150, 330, 470, 640, 740].map((x, i) => `<g transform="translate(${x} ${150 + (i % 2) * 18})"><rect x="-6" y="30" width="12" height="40" fill="#7a5230"/><circle cx="0" cy="20" r="${28 + (i % 3) * 6}" fill="${['#3f8f4a', '#4fa65a', '#2f7a3d'][i % 3]}"/><circle cx="-12" cy="8" r="14" fill="#5cb767" opacity=".7"/></g>`).join('')}
    <path d="M0 240 Q200 220 400 236 T800 232 V300 H0Z" fill="#5fae5a"/>
    ${[90, 260, 420, 580, 700].map((x) => `<g transform="translate(${x} 250)"><rect x="-2" y="0" width="4" height="10" fill="#fff4dc"/><ellipse cx="0" cy="0" rx="8" ry="5" fill="#e86f68"/></g>`).join('')}`,
  lava: `
    <path d="M0 170 L80 110 L150 160 L240 90 L330 150 L420 100 L520 160 L620 80 L720 150 L800 120 V300 H0Z" fill="#4a2c2a"/>
    <path d="M0 220 Q150 200 300 222 T600 214 T800 220 V300 H0Z" fill="#3a2220"/>
    <path d="M0 262 Q160 246 330 262 T640 258 T800 262 V280 Q600 270 400 282 T0 280Z" fill="#ff7b00" opacity=".9"/>
    <path d="M0 268 Q200 258 400 270 T800 268" stroke="#ffd60a" stroke-width="3" fill="none" opacity=".8"/>
    ${[60, 200, 360, 520, 690].map((x, i) => `<circle class="ember" cx="${x}" cy="${200 - i * 6}" r="3" fill="#ffb703" style="animation-delay:${i * 0.6}s"/>`).join('')}`,
  shore: `
    <rect x="0" y="120" width="800" height="90" fill="#48cae4"/>
    <path d="M0 130 Q40 122 80 130 T160 130 T240 130 T320 130 T400 130 T480 130 T560 130 T640 130 T720 130 T800 130" stroke="#fff" stroke-width="3" fill="none" opacity=".6"/>
    <path d="M0 170 Q40 162 80 170 T160 170 T240 170 T320 170 T400 170 T480 170 T560 170 T640 170 T720 170 T800 170" stroke="#fff" stroke-width="3" fill="none" opacity=".4"/>
    <path d="M0 200 Q200 186 400 200 T800 196 V300 H0Z" fill="#f6dfa4"/>
    <path d="M0 214 Q200 204 400 216 T800 212" stroke="#fff" stroke-width="5" fill="none" opacity=".7"/>
    ${[120, 380, 610].map((x) => `<path transform="translate(${x} 262)" d="M-10 0 Q0 -16 10 0Z" fill="#ffafcc"/>`).join('')}
    <g transform="translate(720 120)"><rect x="-5" y="0" width="10" height="90" fill="#a0723f" transform="rotate(8)"/><path d="M0 0 Q-40 -10 -60 14 M0 0 Q40 -12 60 12 M0 0 Q-20 -30 -40 -30 M0 0 Q24 -30 44 -28" stroke="#2d9d5a" stroke-width="10" fill="none" stroke-linecap="round"/></g>`,
  storm: `
    <path d="M0 200 L90 90 L170 170 L260 60 L360 160 L450 80 L560 170 L660 70 L800 180 V300 H0Z" fill="#4b4e8a"/>
    <path d="M260 60 L240 84 L280 84Z M660 70 L642 92 L680 92Z" fill="#e7ecff"/>
    <g class="cloud" fill="#3c3f6e" opacity=".9"><ellipse cx="140" cy="40" rx="70" ry="24"/><ellipse cx="190" cy="30" rx="50" ry="22"/><ellipse cx="560" cy="44" rx="80" ry="24"/><ellipse cx="620" cy="34" rx="44" ry="20"/></g>
    <path class="bolt" d="M190 50 L170 90 L186 90 L168 130 L204 80 L188 80 L204 50Z" fill="#ffe066"/>
    <path d="M0 230 Q200 214 400 232 T800 226 V300 H0Z" fill="#383a63"/>`,
  citadel: `
    ${[60, 200, 600, 740].map((x) => `<g transform="translate(${x} 60)"><rect x="-18" y="0" width="36" height="200" fill="#5b4b9a"/><rect x="-24" y="-10" width="48" height="14" fill="#7b6bc0"/><rect x="-24" y="196" width="48" height="12" fill="#7b6bc0"/></g>`).join('')}
    ${['7+3', '½', 'π', '×', '√', '%', '∑', '9²'].map((t, i) => `<text class="float-num" x="${110 + i * 85}" y="${60 + (i % 3) * 40}" font-size="${22 + (i % 2) * 8}" fill="#e0d4ff" opacity=".55" style="animation-delay:${i * 0.4}s">${t}</text>`).join('')}
    <path d="M0 230 L800 230 V300 H0Z" fill="#3b2f6b"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${i * 100}" y="230" width="50" height="70" fill="#4a3b82"/>`).join('')}`,
};

export function sceneSVG(theme) {
  return `<svg class="scene-svg" viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${SCENES[theme] || SCENES.forest}</svg>`;
}

// ------------------------------------------------------------------ world map

export function mapSVG(save, unlocked) {
  const nodes = ZONES.map((z, i) => {
    const st = save.zones[z.id] || {};
    const open = unlocked(i);
    return `<g class="map-node ${open ? 'open' : 'locked'} ${st.boss ? 'cleared' : ''}" data-zone="${z.id}" tabindex="0" role="button" aria-label="${z.name}${open ? '' : ' (locked)'}" transform="translate(${z.x} ${z.y})">
      <circle class="node-ring" r="46"/>
      <circle class="node-bg" r="38"/>
      <text class="node-icon" y="13" text-anchor="middle">${open ? z.icon : '🔒'}</text>
      <g transform="translate(0 64)"><rect x="-78" y="-17" width="156" height="30" rx="15" class="node-label-bg"/>
      <text class="node-label" y="4" text-anchor="middle">${z.name}</text></g>
      ${st.boss ? '<text class="node-star" x="30" y="-28" text-anchor="middle">⭐</text>' : ''}
    </g>`;
  }).join('');
  const paths = ZONES.slice(1).map((z, i) => {
    const a = ZONES[i];
    const mx = (a.x + z.x) / 2 + (i % 2 ? 40 : -40), my = (a.y + z.y) / 2 - 30;
    return `<path class="map-path ${unlocked(i + 1) ? 'open' : ''}" d="M${a.x} ${a.y} Q${mx} ${my} ${z.x} ${z.y}"/>`;
  }).join('');
  return `<svg class="world-map" viewBox="0 0 1000 600" aria-label="World map of Numeria">
    <defs>
      <radialGradient id="sea" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#7fd3f7"/><stop offset="1" stop-color="#3a8fd8"/></radialGradient>
    </defs>
    <rect width="1000" height="600" fill="url(#sea)"/>
    ${[[120, 80], [880, 520], [60, 300], [940, 120]].map(([x, y]) => `<path class="wave" d="M${x - 20} ${y} q10 -8 20 0 t20 0" stroke="#fff" stroke-width="3" fill="none" opacity=".6"/>`).join('')}
    <path d="M110 470 C60 360 160 250 280 250 C330 160 460 70 600 70 C760 70 900 130 900 260 C960 330 900 470 780 500 C680 560 520 540 420 540 C300 560 150 560 110 470Z" fill="#f2dfa7"/>
    <path d="M130 462 C90 370 180 270 290 268 C340 180 470 92 600 92 C750 92 880 150 878 262 C930 330 880 450 770 480 C670 532 520 520 420 520 C300 540 170 540 130 462Z" fill="#8fd18a"/>
    <path d="M300 300 Q420 230 470 310 T560 400" fill="none" stroke="#7fc3f0" stroke-width="10" stroke-linecap="round" opacity=".8"/>
    ${[[250, 380], [300, 470], [470, 450], [700, 340], [760, 400], [680, 160], [420, 190], [880, 300]].map(([x, y], i) => i < 5
      ? `<g transform="translate(${x} ${y})"><rect x="-3" y="4" width="6" height="12" fill="#7a5230"/><circle r="12" fill="#4fa65a"/></g>`
      : `<path transform="translate(${x} ${y})" d="M-22 14 L0 -20 L22 14Z" fill="#8c7aa9"/>`).join('')}
    <g transform="translate(225 318)"><rect x="-30" y="-10" width="60" height="34" fill="#f4a261"/><path d="M-36 -8 L0 -34 L36 -8Z" fill="#e76f51"/><rect x="-7" y="6" width="14" height="18" fill="#6b4226"/><text y="46" text-anchor="middle" class="node-label small">Numeria Town</text></g>
    ${paths}
    ${nodes}
  </svg>`;
}
