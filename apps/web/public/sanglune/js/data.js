// Données pures du jeu (pas de dépendance three.js) : champions, écoles, sorts, ennemis, objets, quêtes.

export const SCHOOLS = {
  dragon:  { name: 'Dragon',  color: 0xd8402a, css: '#ff6a55', gem: '🔴', desc: 'Feu & énergie' },
  lune:    { name: 'Lune',    color: 0x3a6fd4, css: '#6aa5ff', gem: '🔵', desc: 'Esprit & illusion' },
  serpent: { name: 'Serpent', color: 0x3f9e4d, css: '#6fe08a', gem: '🟢', desc: 'Physique & nature' },
  chaos:   { name: 'Chaos',   color: 0xd9b52f, css: '#ffe066', gem: '🟡', desc: 'Entropie & téléportation' },
};

export const CHAMPIONS = [
  {
    id: 'blodwyn', name: 'Blodwyn Stonemaiden', cls: 'Guerrier', icon: '🛡️', school: 'serpent',
    str: 16, agi: 10, int: 8, cha: 8, hp: 60,
    desc: 'Une guerrière d’acier. Grande vie, bonne armure, magie limitée.',
  },
  {
    id: 'zastaph', name: 'Zastaph Mantric', cls: 'Mage', icon: '🔥', school: 'dragon',
    str: 8, agi: 10, int: 18, cha: 10, hp: 40,
    desc: 'Un mage du Dragon. Énorme mana, sorts de feu dévastateurs, fragile.',
  },
  {
    id: 'megrim', name: 'Megrim of Moonwych', cls: 'Mage', icon: '🌙', school: 'lune',
    str: 8, agi: 12, int: 16, cha: 14, hp: 42,
    desc: 'Mage de la Lune : soins, boucliers et charisme (marchandages).',
  },
  {
    id: 'hengist', name: 'Hengist Meldanash', cls: 'Aventurier', icon: '🌀', school: 'chaos',
    str: 12, agi: 12, int: 12, cha: 16, hp: 50,
    desc: 'Aventurier équilibré, maître du Chaos : drains et téléportations.',
  },
];

// Sorts : type = projectile | bolt | self | aoe | buff | dash
export const SPELLS = [
  { id: 'boule',     school: 'dragon',  name: 'Boule de feu',      cost: 12, power: 34, type: 'projectile', speed: 24, radius: 2.4, color: 0xff5a22, level: 1, desc: 'Projectile de feu, dégâts de zone à l’impact.' },
  { id: 'eclair',    school: 'dragon',  name: 'Éclair fulgurant',  cost: 20, power: 52, type: 'bolt',                                    color: 0xffe066, level: 3, desc: 'Frappe instantanée l’ennemi le plus proche devant vous.' },
  { id: 'brasier',   school: 'dragon',  name: 'Brasier',           cost: 26, power: 16, type: 'aoe', radius: 5, duration: 6,            color: 0xff8833, level: 6, desc: 'Zone de feu au sol qui brûle les ennemis.' },
  { id: 'soin',      school: 'lune',    name: 'Soin mineur',       cost: 14, power: 48, type: 'self',                                    color: 0x7fd4ff, level: 1, desc: 'Restaure des points de vie.' },
  { id: 'bouclier',  school: 'lune',    name: 'Bouclier astral',   cost: 18, power: 60, type: 'buff', buff: 'shield', duration: 20,    color: 0x88aaff, level: 3, desc: 'Absorbe 60 dégâts pendant 20 s.' },
  { id: 'pas',       school: 'lune',    name: 'Pas de lune',       cost: 10, power: 0,  type: 'dash', duration: 4,                      color: 0xbdd8ff, level: 6, desc: 'Vitesse de déplacement doublée 4 s.' },
  { id: 'armure',    school: 'serpent', name: 'Armure de pierre',  cost: 16, power: 8,  type: 'buff', buff: 'armor', duration: 30,     color: 0x8fd98a, level: 2, desc: '+8 armure pendant 30 s.' },
  { id: 'frappe',    school: 'serpent', name: 'Frappe du serpent', cost: 14, power: 2,  type: 'buff', buff: 'power', duration: 15,     color: 0x5cc95f, level: 4, desc: 'Dégâts de mêlée ×2 pendant 15 s.' },
  { id: 'paralysie', school: 'serpent', name: 'Morsure de givre',  cost: 15, power: 14, type: 'projectile', speed: 20, radius: 1.6, slow: 0.45, slowDur: 5, color: 0xa8e6c8, level: 7, desc: 'Projectile qui ralentit fortement la cible.' },
  { id: 'drain',     school: 'chaos',   name: 'Drain de vie',      cost: 16, power: 26, type: 'projectile', speed: 22, radius: 1.8, drain: true, color: 0xc86ae0, level: 2, desc: 'Projectile vampirique : vous soignez la moitié des dégâts.' },
  { id: 'tp',        school: 'chaos',   name: 'Téléportation',     cost: 22, power: 0,  type: 'dash', dist: 14,                    color: 0xe8d44a, level: 5, desc: 'Vous téléporte devant vous.' },
  { id: 'nova',      school: 'chaos',   name: 'Nova entropique',   cost: 30, power: 55, type: 'aoe', radius: 6.5, self: true,        color: 0xe0a040, level: 8, desc: 'Explosion autour de vous.' },
];

export function spellsKnown(level) {
  return SPELLS.filter(s => s.level <= level);
}

// Chance de réussite d'un sort
export function castChance(champion, spell) {
  const practice = champion.practice[spell.id] || 0;
  const affinity = champion.def.school === spell.school ? 0.10 : 0;
  return Math.min(0.95, Math.max(0.20, 0.50 + champion.int * 0.02 + practice * 0.03 + affinity));
}

// Coût en mana (réduit si le sort est de l'école du champion)
export function manaCost(champion, spell) {
  const base = spell.cost * (champion.def.school === spell.school ? 0.7 : 1);
  return Math.max(4, Math.round(base));
}

export const ENEMY_TYPES = {
  gobelin:     { name: 'Gobelin',          hp: 32,  dmg: 7,  speed: 4.6, xp: 16,  aggro: 16, gold: [1, 4],   scale: 0.85, body: 0x4d8f3a, ranged: false },
  loup:        { name: 'Loup des bois',    hp: 26,  dmg: 9,  speed: 6.8, xp: 20,  aggro: 20, gold: [0, 3],   scale: 1.0,  body: 0x6a6f78, ranged: false },
  gobelinchef: { name: 'Chef gobelin',     hp: 130, dmg: 13, speed: 4.4, xp: 120, aggro: 20, gold: [8, 18],  scale: 1.25, body: 0x6aa832, ranged: false, boss: true },
  squelette:   { name: 'Squelette',        hp: 46,  dmg: 11, speed: 4.2, xp: 26,  aggro: 18, gold: [2, 6],   scale: 0.95, body: 0xd8d4c4, ranged: false },
  necromancien:{ name: 'Nécromancien',     hp: 230, dmg: 16, speed: 3.8, xp: 260, aggro: 24, gold: [15, 30], scale: 1.3,  body: 0x4a3a6a, ranged: true,  boss: true, summon: 'squelette' },
  brute:       { name: 'Brute des cultistes', hp: 95, dmg: 16, speed: 4.0, xp: 38, aggro: 18, gold: [4, 9],   scale: 1.35, body: 0x8a5a3a, ranged: false },
  cultiste:    { name: 'Cultiste',         hp: 70,  dmg: 12, speed: 4.0, xp: 46,  aggro: 22, gold: [5, 12],  scale: 1.0,  body: 0x5a2a3a, ranged: true },
  spectre:     { name: 'Spectre',          hp: 55,  dmg: 13, speed: 6.2, xp: 38,  aggro: 22, gold: [3, 8],   scale: 1.0,  body: 0x9ab8d8, ranged: false, ethereal: true },
  chaosspawn:  { name: 'Spawn du Chaos',   hp: 170, dmg: 18, speed: 5.0, xp: 210, aggro: 24, gold: [12, 24], scale: 1.4,  body: 0xb04ad8, ranged: true,  boss: true },
  zandrick:    { name: 'Zendrick le Traître', hp: 650, dmg: 22, speed: 4.2, xp: 1000, aggro: 60, gold: [100, 200], scale: 1.7, body: 0x2a1038, ranged: true, boss: true, final: true },
};

export const ITEMS = {
  baton:        { name: 'Bâton de voyage',   slot: 'weapon', dmg: 8,  desc: 'Un bon bâton noueux.' },
  epee_courte:  { name: 'Épée courte',       slot: 'weapon', dmg: 16, desc: 'Légère et rapide.' },
  hache:        { name: 'Hache de guerre',   slot: 'weapon', dmg: 24, desc: 'Lourde, brutale.' },
  epee_longue:  { name: 'Épée longue runique', slot: 'weapon', dmg: 32, desc: 'Forgée pour un Bloodwych.' },
  tunique:      { name: 'Tunique',           slot: 'armor',  armor: 0 },
  cottes:       { name: 'Cotte de mailles',  slot: 'armor',  armor: 6 },
  plaques:      { name: 'Armure de plaques',  slot: 'armor',  armor: 12 },
  bouclier_bois:{ name: 'Bouclier de bois',  slot: 'shield', armor: 4 },
  ecu:          { name: 'Écu du château',    slot: 'shield', armor: 8 },
};

export const GEM_ORDER = ['dragon', 'lune', 'serpent', 'chaos'];

// Quête principale (linéaire, avec objectifs affichés)
export const MAIN_QUEST = [
  { id: 'intro',   title: 'L’appel de l’Aîné',        text: 'Parlez à l’Aîné Boric au village de Sanglune.' },
  { id: 'ruin',    title: 'Le Cristal du Dragon',     text: 'Forêt ouest : activez le levier ROUGE de la ruine et prenez le Cristal du Dragon.' },
  { id: 'key',     title: 'La Clé rouillée',          text: 'Trouvez la Clé rouillée dans un coffre de la forêt (ouest).' },
  { id: 'crypt',   title: 'Le Cristal de la Lune',    text: 'Crypte (est) : entrez avec la clé, levier BLEU, terrassez le Nécromancien. Récupérez le Cristal de la Lune et la Clé du Château.' },
  { id: 'tower',   title: 'Le Cristal du Serpent',    text: 'Tour de guet (sud-ouest) : levier VERT, prenez le Cristal du Serpent.' },
  { id: 'cave',    title: 'Le Cristal du Chaos',      text: 'Caverne (nord-est) : levier JAUNE, prenez le Cristal du Chaos.' },
  { id: 'castle',  title: 'Le Château de Treihadwyl', text: 'Ouvrez la grande porte du château (nord) avec la Clé du Château.' },
  { id: 'altar',   title: 'L’Autel des cristaux',     text: 'Déposez les 4 cristaux sur l’autel du donjon.' },
  { id: 'boss',    title: 'Zendrick le Traître',      text: 'Entrez dans la salle du trône et vainquez Zendrick !' },
];

export const SIDE_QUEST = { id: 'herbes', title: 'Herbes médicinales', text: 'Apportez 3 herbes lumineuses de la forêt au marchand Odo (0/3).' };
