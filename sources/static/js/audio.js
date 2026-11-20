// Tiny synthesized sound effects (no audio files needed).
const KEY = 'numeria:muted';
let ctx = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

function tone(freq, start, dur, { type = 'sine', vol = 0.15, slide = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

function noise(start, dur, vol = 0.12) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}

const SOUNDS = {
  click: () => tone(660, 0, 0.06, { type: 'triangle', vol: 0.06 }),
  correct: () => { tone(660, 0, 0.12, { type: 'triangle' }); tone(990, 0.1, 0.18, { type: 'triangle' }); },
  wrong: () => tone(220, 0, 0.3, { type: 'sawtooth', vol: 0.06, slide: -80 }),
  cast: () => tone(400, 0, 0.35, { type: 'sine', vol: 0.1, slide: 500 }),
  hit: () => { noise(0, 0.18, 0.15); tone(140, 0, 0.15, { type: 'square', vol: 0.05, slide: -60 }); },
  hurt: () => { noise(0, 0.22, 0.12); tone(180, 0, 0.2, { type: 'sawtooth', vol: 0.05, slide: -90 }); },
  heal: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.2, { vol: 0.08 })),
  coin: () => { tone(988, 0, 0.08, { type: 'square', vol: 0.05 }); tone(1319, 0.07, 0.15, { type: 'square', vol: 0.05 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.25, { type: 'triangle', vol: 0.12 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.3, { type: 'triangle', vol: 0.1 })),
  levelup: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: 'square', vol: 0.05 })),
};

export function sfx(name) {
  if (muted || !SOUNDS[name]) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name]();
  } catch { /* audio not available */ }
}
