#!/bin/sh
# Télécharge Three.js en local pour jouer HORS LIGNE.
# Ensuite, remplacez dans index.html la ligne de l'import map :
#   "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
# par :
#   "three": "./vendor/three.module.js"
set -e
mkdir -p vendor
curl -L -o vendor/three.module.js https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
echo "OK : vendor/three.module.js téléchargé ($(wc -c < vendor/three.module.js) octets)"
