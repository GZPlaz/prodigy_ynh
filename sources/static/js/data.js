// Numeria game data: elements, spells, monsters, zones, shop and achievements.

export const ELEMENTS = {
  fire: { name: 'Fire', icon: '🔥', color: '#ff7a3d', beats: 'nature' },
  nature: { name: 'Nature', icon: '🌿', color: '#3fbf63', beats: 'storm' },
  storm: { name: 'Storm', icon: '⚡', color: '#a974ff', beats: 'water' },
  water: { name: 'Water', icon: '💧', color: '#36a3ff', beats: 'fire' },
  arcane: { name: 'Arcane', icon: '✨', color: '#f5b82e', beats: null },
};
export const PRIMARY = ['fire', 'water', 'nature', 'storm'];
export const ELEMENT_BLURB = {
  fire: 'Bold and fierce. Burns through Nature.',
  water: 'Calm and clever. Washes out Fire.',
  nature: 'Patient and strong. Grounds Storm.',
  storm: 'Quick and bright. Zaps Water.',
};

export function elementMult(attacker, defender) {
  const a = ELEMENTS[attacker], d = ELEMENTS[defender];
  if (!a || !d) return 1;
  if (a.beats === defender) return 1.5;
  if (d.beats === attacker) return 0.7;
  return 1;
}

const SCHOOL = {
  fire: [['Ember Flick', 12, 1], ['Flame Spiral', 16, 6], ['Phoenix Burst', 21, 12]],
  water: [['Bubble Pop', 12, 1], ['Tidal Lash', 16, 6], ['Maelstrom', 21, 12]],
  nature: [['Thorn Dart', 12, 1], ['Vine Whip', 16, 6], ['Elder Grove', 21, 12]],
  storm: [['Static Zap', 12, 1], ['Thunder Clap', 16, 6], ['Sky Fury', 21, 12]],
};
const CANTRIP = { fire: 'Spark', water: 'Splash', nature: 'Seed Shot', storm: 'Zap' };

export const UTILITY = [
  { id: 'mend', name: 'Mend', kind: 'heal', element: 'nature', icon: '💚', level: 3, desc: 'Heal 40% of your health' },
  { id: 'ward', name: 'Ward', kind: 'ward', element: 'arcane', icon: '🛡️', level: 8, desc: 'Block most damage from the next 2 attacks' },
];

export function allSpells() {
  const list = [];
  for (const el of PRIMARY) {
    SCHOOL[el].forEach(([name, power, level], i) =>
      list.push({ id: `${el}${i + 1}`, name, kind: 'attack', element: el, power, level, school: el, tier: i + 1 }));
    list.push({ id: `${el}0`, name: CANTRIP[el], kind: 'attack', element: el, power: 8, level: 1, cantrip: true });
  }
  return list.concat(UTILITY);
}
const SPELLS = allSpells();

// Spells a wizard can cast: their school's spells, other elements' cantrips, utilities.
export function knownSpells(save) {
  return SPELLS.filter((s) => s.level <= save.level && (
    (s.school === save.element) ||
    (s.cantrip && s.element !== save.element) ||
    (s.kind !== 'attack')
  )).sort((a, b) => (a.kind === 'attack' ? 0 : 1) - (b.kind === 'attack' ? 0 : 1) || (a.cantrip ? 1 : 0) - (b.cantrip ? 1 : 0) || b.power - a.power);
}
export const spellsUnlockedAt = (save, level) =>
  SPELLS.filter((s) => s.level === level && (s.school === save.element || s.kind !== 'attack'));

// ------------------------------------------------------------------ monsters

export const SPECIES = {
  sproutling: { name: 'Sproutling', body: 'mushroom', element: 'nature', color: '#e86f68', accent: '#fff4dc', lore: 'Gossips with the other mushrooms all night long.' },
  mossbat: { name: 'Mossbat', body: 'bat', element: 'nature', color: '#5aa469', accent: '#c5e8b7', lore: 'Sleeps upside-down in the oldest oak trees.' },
  bramblebun: { name: 'Bramblebun', body: 'slime', element: 'nature', color: '#8fd16a', accent: '#f6ffe0', lore: 'A bouncy blob that smells like fresh rain.' },
  thornroot: { name: 'Old Thornroot', body: 'golem', element: 'nature', color: '#8a6a4a', accent: '#7ccf62', boss: true, lore: 'The grumpy guardian of Whisperwood.' },

  emberslime: { name: 'Emberslime', body: 'slime', element: 'fire', color: '#ff8a4c', accent: '#ffd36b', lore: 'Warm to the touch. Great for chilly nights.' },
  flickerimp: { name: 'Flickerimp', body: 'imp', element: 'fire', color: '#e5533d', accent: '#ffb347', lore: 'Plays tricks, then giggles in a puff of smoke.' },
  cinderbat: { name: 'Cinderbat', body: 'bat', element: 'fire', color: '#5c3d52', accent: '#ff9f43', lore: 'Its wings glow like coals at night.' },
  magmaw: { name: 'Magmaw', body: 'dragon', element: 'fire', color: '#d94f2b', accent: '#ffcf5c', boss: true, lore: 'Guards the hottest cave in Cinder Hollow.' },

  bubbloon: { name: 'Bubbloon', body: 'slime', element: 'water', color: '#5ec8ff', accent: '#e0f7ff', lore: 'Floats away whenever it gets excited.' },
  shellsnap: { name: 'Shellsnap', body: 'crab', element: 'water', color: '#f07167', accent: '#ffe5d9', lore: 'Snaps its claws to the rhythm of the waves.' },
  driftghost: { name: 'Driftghost', body: 'ghost', element: 'water', color: '#a8dcff', accent: '#ffffff', lore: 'A shy spirit made of sea mist.' },
  coralia: { name: 'Queen Coralia', body: 'dragon', element: 'water', color: '#2fb6c9', accent: '#ff9fb2', boss: true, lore: 'Ruler of the tides beneath Tidecrest.' },

  sparkbat: { name: 'Sparkbat', body: 'bat', element: 'storm', color: '#6c63ff', accent: '#ffe66d', lore: 'Leaves a trail of tiny sparks when it flies.' },
  voltwisp: { name: 'Voltwisp', body: 'ghost', element: 'storm', color: '#c3a6ff', accent: '#fff3b0', lore: 'Hums softly before a thunderstorm.' },
  stormshroom: { name: 'Stormshroom', body: 'mushroom', element: 'storm', color: '#8e7dff', accent: '#fff6c9', lore: 'Grows only where lightning has struck.' },
  thundrake: { name: 'Thundrake', body: 'dragon', element: 'storm', color: '#5b4bdb', accent: '#ffe66d', boss: true, lore: 'Its roar is the thunder of Thunderspire.' },

  numbot: { name: 'Numbot', body: 'golem', element: 'arcane', color: '#8d99ae', accent: '#ffd166', lore: 'A clockwork guard that counts everything twice.' },
  fractimp: { name: 'Fractimp', body: 'imp', element: 'arcane', color: '#ef476f', accent: '#ffd166', lore: 'Splits into halves, then quarters, then eighths...' },
  glitchghost: { name: 'Glitchghost', body: 'ghost', element: 'arcane', color: '#06d6a0', accent: '#ffffff', lore: 'Flickers between here and there.' },
  countzero: { name: 'The Count Zero', body: 'imp', element: 'fire', color: '#3d2c6b', accent: '#ffd166', boss: true, crown: true, shifting: true, lore: 'Wants to erase every number in Numeria.' },
};

export const ZONES = [
  { id: 'whisperwood', name: 'Whisperwood', icon: '🌳', theme: 'forest', min: 1, max: 4, bossLevel: 5, monsters: ['sproutling', 'mossbat', 'bramblebun'], boss: 'thornroot', x: 190, y: 430, desc: 'A sleepy forest full of chatty mushrooms and bouncy blobs.' },
  { id: 'cinder', name: 'Cinder Hollow', icon: '🌋', theme: 'lava', min: 4, max: 8, bossLevel: 9, monsters: ['emberslime', 'flickerimp', 'cinderbat'], boss: 'magmaw', x: 395, y: 300, desc: 'Warm caves where rivers of lava glow in the dark.' },
  { id: 'tidecrest', name: 'Tidecrest Shore', icon: '🌊', theme: 'shore', min: 8, max: 12, bossLevel: 13, monsters: ['bubbloon', 'shellsnap', 'driftghost'], boss: 'coralia', x: 640, y: 455, desc: 'Sparkling beaches and misty tide pools.' },
  { id: 'thunderspire', name: 'Thunderspire', icon: '⛰️', theme: 'storm', min: 12, max: 16, bossLevel: 17, monsters: ['sparkbat', 'voltwisp', 'stormshroom'], boss: 'thundrake', x: 820, y: 250, desc: 'Mountain peaks where the sky crackles with lightning.' },
  { id: 'citadel', name: 'Abacus Citadel', icon: '🏰', theme: 'citadel', min: 16, max: 20, bossLevel: 22, monsters: ['numbot', 'fractimp', 'glitchghost'], boss: 'countzero', x: 545, y: 120, desc: 'The floating fortress of The Count Zero. Numbers swirl in the air.' },
];
export const WINS_FOR_BOSS = 4;
export const zoneById = (id) => ZONES.find((z) => z.id === id);
export const zoneUnlocked = (save, i) => i === 0 || !!save.zones[ZONES[i - 1].id]?.boss;

// ------------------------------------------------------------------ formulas

export const MAX_LEVEL = 60;
export const xpToNext = (level) => 25 + 15 * level;
export const playerMaxHp = (level) => Math.round(60 * (1 + 0.2 * (level - 1)));
export const powerScale = (level) => 1 + 0.25 * (level - 1);

export function monsterStats(sp, level, boss) {
  return {
    maxHp: Math.round(34 * powerScale(level) * (boss ? 2.2 : 1)),
    atk: 8 * (1 + 0.2 * (level - 1)),
  };
}
export const rewardXp = (level, boss) => Math.round((10 + 5 * level) * (boss ? 4 : 1));
export const rewardGold = (level, boss) => Math.round((6 + 2 * level) * (boss ? 5 : 1) * (0.85 + Math.random() * 0.3));

// ------------------------------------------------------------------ shop

export const ITEMS = {
  potion: { name: 'Berry Tonic', icon: '🧃', price: 20, desc: 'Restores 40% of your health in battle.', heal: 0.4 },
  elixir: { name: 'Moonwater Flask', icon: '🌙', price: 60, desc: 'Fully restores your health in battle.', heal: 1 },
  focus: { name: 'Focus Charm', icon: '🔮', price: 35, desc: 'Your next correct spell deals double damage.' },
};
export const WANDS = {
  twig: { name: 'Twig Wand', price: 0, bonus: 0, color: '#8b5a2b', tip: '#ffe9a8' },
  oak: { name: 'Oak Wand', price: 120, bonus: 0.1, color: '#6b4226', tip: '#9ef01a' },
  crystal: { name: 'Crystal Wand', price: 350, bonus: 0.2, color: '#4cc9f0', tip: '#e0fbfc' },
  comet: { name: 'Comet Wand', price: 900, bonus: 0.35, color: '#3a0ca3', tip: '#ffd60a' },
};
export const HATS = {
  pointy: { name: 'Pointy Hat', price: 0 },
  wide: { name: 'Wide Brim', price: 0 },
  hood: { name: 'Cozy Hood', price: 0 },
  star: { name: 'Star Hat', price: 200 },
  crown: { name: 'Golden Crown', price: 450 },
};
export const PATTERNS = {
  plain: { name: 'Plain Robe', price: 0 },
  stripes: { name: 'Striped Robe', price: 100 },
  trim: { name: 'Gold Trim Robe', price: 160 },
  stars: { name: 'Starry Robe', price: 220 },
};
export const ROBE_COLORS = ['#5b5fc7', '#e85d75', '#2a9d8f', '#f4a261', '#7b2cbf', '#3a86ff', '#ef476f', '#588157', '#264653', '#ffb703'];
export const SKIN_TONES = ['#ffe0c7', '#f8c9a0', '#e0a77a', '#c68654', '#9a5f3a', '#6b3f24'];
export const HAIR_COLORS = ['#2b1d14', '#5a3825', '#a0522d', '#e8b04a', '#f2e6c9', '#c0392b', '#3d3d3d', '#7e57c2'];

// ------------------------------------------------------------------ achievements

export const ACHIEVEMENTS = [
  { id: 'first_win', icon: '⚔️', name: 'First Victory', desc: 'Win your first battle', test: (s) => s.stats.wins >= 1 },
  { id: 'streak5', icon: '🔥', name: 'On a Roll', desc: 'Answer 5 questions in a row correctly', test: (s) => s.stats.bestStreak >= 5 },
  { id: 'streak15', icon: '🌟', name: 'Unstoppable', desc: 'Answer 15 in a row correctly', test: (s) => s.stats.bestStreak >= 15 },
  { id: 'q100', icon: '📘', name: 'Century', desc: 'Answer 100 questions', test: (s) => s.stats.answered >= 100 },
  { id: 'q500', icon: '📚', name: 'Scholar', desc: 'Answer 500 questions', test: (s) => s.stats.answered >= 500 },
  { id: 'friend1', icon: '🐾', name: 'New Friend', desc: 'Befriend a familiar', test: (s) => s.familiars.length >= 1 },
  { id: 'friend6', icon: '🦄', name: 'Beast Tamer', desc: 'Befriend 6 familiars', test: (s) => s.familiars.length >= 6 },
  { id: 'lvl10', icon: '🎓', name: 'Adept', desc: 'Reach level 10', test: (s) => s.level >= 10 },
  { id: 'rich', icon: '💰', name: 'Treasure Keeper', desc: 'Hold 1000 gold at once', test: (s) => s.gold >= 1000 },
  { id: 'master5', icon: '🧠', name: 'Skill Master', desc: 'Master 5 math skills', test: (s) => Object.values(s.stats.skills).filter((k) => k.m >= 0.85 && k.n >= 10).length >= 5 },
  { id: 'boss_forest', icon: '🌳', name: 'Forest Guardian', desc: 'Defeat Old Thornroot', test: (s) => !!s.zones.whisperwood?.boss },
  { id: 'boss_lava', icon: '🌋', name: 'Fire Tamer', desc: 'Defeat Magmaw', test: (s) => !!s.zones.cinder?.boss },
  { id: 'boss_sea', icon: '🌊', name: 'Tide Turner', desc: 'Defeat Queen Coralia', test: (s) => !!s.zones.tidecrest?.boss },
  { id: 'boss_storm', icon: '⛈️', name: 'Storm Chaser', desc: 'Defeat Thundrake', test: (s) => !!s.zones.thunderspire?.boss },
  { id: 'champion', icon: '👑', name: 'Champion of Numeria', desc: 'Defeat The Count Zero', test: (s) => !!s.zones.citadel?.boss },
];
