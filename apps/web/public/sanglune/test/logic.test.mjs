// Tests rapides de la logique pure (sans navigateur ni WebGL).
import { Simplex, fbm, mulberry32, clamp, smoothstep } from '../js/noise.js';
import { SPELLS, spellsKnown, castChance, manaCost, CHAMPIONS, MAIN_QUEST, ENEMY_TYPES } from '../js/data.js';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

console.log('Bruit simplex :');
const s1 = new Simplex(42), s2 = new Simplex(42);
ok(s1.noise2D(3.7, 9.1) === s2.noise2D(3.7, 9.1), 'déterministe pour une même graine');
ok(Math.abs(fbm(s1, 1.5, 2.5, 4)) <= 1.0001, 'fbm borné dans [-1, 1]');
ok(clamp(5, 0, 3) === 3 && clamp(-2, 0, 3) === 0, 'clamp OK');
ok(smoothstep(0, 1, 0.5) === 0.5, 'smoothstep OK');

console.log('Données :');
ok(SPELLS.length === 12, '12 sorts (3 par école × 4 écoles)');
for (const school of ['dragon', 'lune', 'serpent', 'chaos']) {
  ok(SPELLS.filter(s => s.school === school).length === 3, `école ${school} : 3 sorts`);
}
ok(CHAMPIONS.length === 4, '4 champions jouables');
ok(MAIN_QUEST.length === 9, '9 étapes de quête principale');
ok(Object.keys(ENEMY_TYPES).length >= 10, 'au moins 10 types d’ennemis');

console.log('Magie :');
const mage = { def: CHAMPIONS.find(c => c.id === 'zastaph'), int: 18, practice: {} };
const boule = SPELLS.find(s => s.id === 'boule');
ok(manaCost(mage, boule) < boule.cost, 'coût réduit pour un sort de son école (affinité)');
ok(castChance(mage, boule) > 0.5, 'chance de base > 50% avec INT 18');
const faible = { def: CHAMPIONS.find(c => c.id === 'blodwyn'), int: 8, practice: {} };
const bouleF = SPELLS.find(s => s.id === 'boule');
faible.practice.boule = 3;
ok(castChance(faible, bouleF) > castChance({ ...faible, practice: {} }, bouleF), 'la pratique augmente la réussite');
ok(spellsKnown(1).length >= 2 && spellsKnown(8).length === 12, 'déblocage progressif des sorts jusqu’au niveau 8');

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
