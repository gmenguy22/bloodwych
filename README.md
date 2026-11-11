# bloodwych — Sanglune (Mistral App + jeu statique)

**Sanglune** est un hommage 3D jouable dans le navigateur au jeu **Bloodwych** (Mirrorsoft, 1989) :
monde ouvert médiéval-fantastique, 4 écoles de magie colorées, grimoire à % de réussite,
4 cristaux à ramener à l'autel du château, boss final Zendrick. Voir [PLAN.md](PLAN.md).

## Contenu du dépôt

- `apps/web/public/sanglune/` — le jeu (HTML/CSS/JS, Three.js embarqué dans `vendor/`), servi à l'URL **`/sanglune/`** de l'app.
- `apps/`, `apps.json`, `deploy/` — le projet Mistral App (frontend TanStack Start) qui sert le jeu.

## Jouer en local

```sh
cd apps/web/public/sanglune
python3 -m http.server 8000   # ouvrir http://localhost:8000
```

## Déployer sur Mistral Studio (depuis un poste avec navigateur)

```sh
git clone https://github.com/gmenguy22/bloodwych.git && cd bloodwych
mistral login                                  # connexion navigateur
mistral deploy --organization "Les Zelles"     # build du commit poussé sur origin
```

Pré-requis : la [Mistral GitHub App](https://github.com/apps/mistralai) doit avoir accès au dépôt
(le déploiement clone le repo via cette connexion GitHub).

## Vérifications du jeu

```sh
cd apps/web/public/sanglune
node --check js/main.js && node test/logic.test.mjs
```
