# SANGLUNE — plan de développement

Un hommage 3D à **Bloodwych** (Mirrorsoft, 1989) : monde ouvert médiéval-fantastique,
jouable dans le navigateur, finissable en ~2 à 3 heures, raisonnablement difficile.

## 1. Concept

Vous êtes un champion de l'ordre des **Bloodwych**, seul rescapé pouvant contacter les
derniers héros du royaume de **Trazère**, dévasté par le sorcier traître **Zendrick**.
Quatre cristaux de pouvoir ont été cachés dans quatre zones dangereuses. Retrouvez-les,
portez-les à l'autel du château central, puis affrontez Zendrick dans sa salle du trône.

## 2. Règles conservées de Bloodwych

| Règle originale (1989) | Implémentation dans Sanglune |
|---|---|
| Choisir un champion parmi des portraits (classe + couleur de magie) | Écran de titre : 4 champions (Guerrier/Mage/Aventurier), chacun affilié à une école |
| 4 écoles de magie colorées : Dragon (feu/énergie), Lune (esprit/illusion), Serpent (physique), Chaos (entropie) | 4 écoles, 3 sorts chacune (12 sorts), couleurs identiques |
| Grimoire de sorts payant en points de magie, avec % de réussite qui monte avec la pratique | Barre de mana, coût par sort, réussite = f(Intelligence + pratique), un sort « préparé » à la fois |
| Gemmes / bâtons colorés = sorts « gratuits » ou garantis | Gemmes colorées ramassées : si le sort échoue, une gemme de la bonne école force la réussite |
| Groupe de jusqu'à 4 champions recrutables | Vous + jusqu'à 2 compagnons recrutés au village (IA : ils suivent, combattent, lancent leurs sorts) |
| 4 cristaux cachés dans 4 tours, puis la 5ᵉ tour = boss final | 4 cristaux dans 4 zones (ruine, crypte, tour de guet, caverne), château central = 5ᵉ « tour » avec Zendrick |
| Portes colorées + leviers de la bonne couleur | Chaque zone : levier coloré ouvrant la porte de la chambre du cristal |
| Clés | Clé rouillée (crypte), Clé du Château (drop du Nécromancien) |
| Téléporteurs | 2 paires de pierres de téléportation (village↔château, crypte↔caverne) |
| Inventaire : armes, armure, bouclier, objets, clés, pièces d'or | Arme / armure / bouclier + consommables + clés + or |
| Stats STR/AGI/INT/CHA, HP, niveaux, XP | Idem, + barre de mana à la place des « spell points » |
| Combats en temps réel, monstres agressifs à vue | Idem, en 3D temps réel |
| Commerce avec les PNJ | Marchand : potions et gemmes contre de l'or |
| Mort du groupe = game over | Mort du joueur = respawn au village (perte d'XP), compagnons K.O. se relèvent |

## 3. Innovations (monde ouvert 3D)

- **Monde ouvert 3D** (~1,5 km²) : vallée avec village, forêt, lac, château fort,
  crypte, tour de guet, caverne — au lieu des niveaux en grille.
- **Caméra 3ᵉ personne**, cycle jour/nuit, brouillard, torches, particules de sorts,
  ombres dynamiques, ciel étoilé la nuit.
- **Quêtes avec PNJ et dialogues** : quête principale scénarisée (l'Aîné, le marchand,
  recruter des compagnons) + quête secondaire (herbes médicinales).
- **Boss en phases** : Zendrick lance des boules de feu, invoque des sbires à 66 %/33 %
  de PV, et une nova d'entropie télégraphiée sous 50 % ; enrage après 4 minutes.
- **Progression** : XP, niveaux, déblocage de sorts par niveau, équipement meilleur
  caché dans les zones, forges de la difficulté par zone.

## 4. Architecture technique

- **Three.js r160** via import map CDN (mode hors-ligne possible : `vendor.sh`).
- Aucune étape de build : ES modules statiques, servi par n'importe quel serveur HTTP
  (`python3 -m http.server`).
- Fichiers :
  - `index.html` — import map, HUD DOM, écrans (titre/mort/victoire)
  - `css/style.css` — interface parchemin/sombre
  - `js/util.js` — RNG, bruit simplex, particules, synthétiseur audio WebAudio
  - `js/data.js` — champions, écoles, sorts, ennemis, objets, dialogues (données pures)
  - `js/world.js` — terrain procédural, zones, bâtiments, colliders, portes/leviers,
    téléporteurs, cristaux, butin, cycle jour/nuit
  - `js/actors.js` — Champion (joueur & compagnons), Ennemis & IA, PNJ, projectiles
  - `js/game.js` — boucle de jeu, entrées, caméra, combat, sorts, quêtes, événements
  - `js/ui.js` — HUD, grimoire, inventaire, journal, dialogues, dégâts flottants
  - `js/main.js` — amorçage

## 5. Contenu (prototype livrable)

- **Village de Sanglune** : Aîné (donne la quête), marchand, 2 compagnons recrutables.
- **Ruine de la forêt (Ouest)** — Cristal du Dragon, levier rouge, chef gobelin.
- **Crypte (Est)** — clé rouillée, levier bleu, Nécromancien → Cristal de la Lune + Clé du Château.
- **Tour de guet (Sud-Ouest)** — levier vert, brutes → Cristal du Serpent + hache + armure.
- **Caverne (Nord-Est)** — levier jaune, spectres + Spawn du Chaos → Cristal du Chaos.
- **Château (Nord)** — cultistes, autel des 4 cristaux, salle du trône de Zendrick.
- **12 sorts** (3/école), 10 types d'ennemis + 3 mini-boss + boss, 2 paires de
  téléporteurs, ~25 gemmes, coffres, herbes, pièces d'or.

## 6. Boucle de jeu et durée

Explorer → combattre (mêlée/blocage/sorts) → récupérer gemmes/or/équipement →
résoudre le levier coloré de la zone → prendre le cristal → répéter ×4 →
château → autel → boss. **Durée visée : 2–3 h**, difficulté : ennemis scaled par
zone, mana limité (gestion des gemmes), boss à mécaniques, mort = perte d'XP.

## 7. Phases

1. **Prototype** (ce lot) : monde ouvert navigable, 1 champion + 2 compagnons,
   12 sorts, 4 zones + cristaux + leviers, quêtes, marchand, boss, HUD complet.
2. **Alpha** : équilibrage, sauvegarde localStorage, 4ᵉ compagnon, phrases de
   « smalltalk » du marchand, traps, météo.
3. **Polish** : musique procédurale, succès, options (qualité, son), manette.

## 8. Contrôles

ZQSD/WASD : déplacer · Souris (clic pour verrouiller) : caméra · Clic G : attaquer ·
Clic D (maintenu) : bloquer · Espace : sauter · Maj : sprint · **F** : lancer le sort
préparé · **Tab** : grimoire (cliquer un sort = préparer, double-clic = lancer) ·
**E** : parler/interagir · **I** : inventaire · **J** : journal · **H** : potion de soin ·
**M** : son on/off · Échap : pause.

## 9. Risques

- Perf sur machines faibles → pixelRatio capé, ombres limitées, brouillard.
- CDN inaccessible → `vendor.sh` pour embarquer Three.js localement.
- Complexité des quêtes → journal linéaire explicite + marqueurs de zone.
