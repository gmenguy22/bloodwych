# SANGLUNE

Hommage 3D jouable dans le navigateur au jeu **Bloodwych** (Mirrorsoft, 1989) :
un monde ouvert médiéval-fantastique où vous incarnez un champion de l’ordre des
Bloodwych. Récupérez les **4 cristaux** cachés (ruine, crypte, tour de guet, caverne),
déposez-les sur l’autel du château de Treihadwyl, puis affrontez **Zendrick le Traître**.

Durée visée : 2 à 3 heures. Voir [PLAN.md](PLAN.md) pour le design complet.

## Lancer le jeu

Le jeu utilise des modules ES + un import map : il faut un **serveur HTTP** (file:// ne marche pas).

```sh
cd sanglune
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Connexion Internet requise au premier chargement (Three.js via CDN jsdelivr).
Pour jouer **hors ligne** : `./vendor.sh` puis remplacez l’URL de l’import map dans
`index.html` par `"./vendor/three.module.js"` (voir commentaire dans le script).

## Contrôles

| Touche | Action |
|---|---|
| ZQSD / WASD | Se déplacer |
| Souris (clic sur le jeu) | Caméra (verrouillage du pointeur) |
| Clic gauche | Attaquer (mêlée) |
| Clic droit (maintenu) | Bloquer |
| Espace | Sauter · Maj : courir |
| **F** | Lancer le sort préparé |
| **Tab** | Grimoire (clic = préparer, double-clic = lancer) |
| **E** | Parler / interagir |
| **I** / **J** | Inventaire / Journal |
| **H** | Potion de soin · **M** : son · Échap : pause |

## Règles (héritées de Bloodwych)

- 4 écoles de magie colorées (Dragon 🔴, Lune 🔵, Serpent 🟢, Chaos 🟡) : chaque sort
  coûte des **points de mana** et a un **% de réussite** qui augmente avec la pratique.
- Un seul sort **préparé** à la fois. Les **gemmes colorées** forcent la réussite d’un sort raté.
- Portes et **leviers colorés**, clés, téléporteurs, coffres, commerce avec le marchand,
  recrutement de compagnons (groupe de 3 max), XP/niveaux, mort = respawn au village.

## Vérifications

```sh
npm run check   # syntaxe de tous les modules (node --check)
npm test        # tests de logique (bruit, sorts, données)
```
