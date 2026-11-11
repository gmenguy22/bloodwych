import * as THREE from 'three';
import { Simplex, fbm, mulberry32, clamp, lerp, smoothstep, dist, rand, pick, makeGlowTexture } from './util.js';
import { SCHOOLS } from './data.js';

export const WORLD_SIZE = 1500;

export const ZONES = {
  village: { x: 0, z: 140 },
  castle:  { x: 0, z: -430 },
  ruin:    { x: -420, z: -100 },
  crypt:   { x: 450, z: 90 },
  tower:   { x: -320, z: 410 },
  cave:    { x: 415, z: -340 },
  lake:    { x: -140, z: -250 },
};

const FLATS = [
  { x: ZONES.village.x, z: ZONES.village.z, r: 100, h: 8 },
  { x: ZONES.castle.x,  z: ZONES.castle.z,  r: 120, h: 10 },
  { x: ZONES.ruin.x,    z: ZONES.ruin.z,    r: 85,  h: 6 },
  { x: ZONES.crypt.x,   z: ZONES.crypt.z,   r: 78,  h: 7 },
  { x: ZONES.tower.x,   z: ZONES.tower.z,   r: 72,  h: 9 },
  { x: ZONES.cave.x,    z: ZONES.cave.z,    r: 82,  h: 9 },
];
const LAKE = { x: ZONES.lake.x, z: ZONES.lake.z, r: 58, waterY: 2.0 };

const simplex = new Simplex(20240613);
const simplex2 = new Simplex(777);

function baseHeight(x, z) {
  return fbm(simplex, x * 0.0035 + 7.3, z * 0.0035 + 3.1, 4) * 26
       + fbm(simplex2, x * 0.018, z * 0.018, 2) * 2.5 + 7;
}

export function rawHeight(x, z) {
  let h = baseHeight(x, z);
  for (const f of FLATS) {
    const d = dist(x, z, f.x, f.z);
    if (d < f.r) h = f.h;
    else if (d < f.r * 1.8) h = lerp(f.h, h, smoothstep(f.r, f.r * 1.8, d));
  }
  const dl = dist(x, z, LAKE.x, LAKE.z);
  if (dl < LAKE.r) h = Math.min(h, lerp(0.6, h, smoothstep(LAKE.r * 0.25, LAKE.r, dl)));
  return Math.max(0.5, h);
}

export class GameWorld {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.colliders = [];
    this.interactables = [];
    this.pickups = [];
    this.doors = [];
    this.torchLights = [];
    this.timeOfDay = 0.32; // matin
    this.rng = mulberry32(987654);
    this.glow = makeGlowTexture();

    this.mats = {
      stone:      new THREE.MeshLambertMaterial({ color: 0x8d8578, flatShading: true }),
      stoneDark:  new THREE.MeshLambertMaterial({ color: 0x5f594e, flatShading: true }),
      stoneRed:   new THREE.MeshLambertMaterial({ color: 0x9a4a3a, flatShading: true }),
      wood:       new THREE.MeshLambertMaterial({ color: 0x7a5a34, flatShading: true }),
      woodDark:   new THREE.MeshLambertMaterial({ color: 0x4a3620, flatShading: true }),
      roof:       new THREE.MeshLambertMaterial({ color: 0x8a3a2a, flatShading: true }),
      roofDark:   new THREE.MeshLambertMaterial({ color: 0x3a4a6a, flatShading: true }),
      trunk:      new THREE.MeshLambertMaterial({ color: 0x5a4028, flatShading: true }),
      leaf:       new THREE.MeshLambertMaterial({ color: 0x3f7a34, flatShading: true }),
      leaf2:      new THREE.MeshLambertMaterial({ color: 0x55913c, flatShading: true }),
      rock:       new THREE.MeshLambertMaterial({ color: 0x7a7468, flatShading: true }),
      grassTuft:  new THREE.MeshLambertMaterial({ color: 0x5d9a44, flatShading: true }),
      gold:       new THREE.MeshLambertMaterial({ color: 0xd9b545, emissive: 0x554411 }),
      metal:      new THREE.MeshLambertMaterial({ color: 0x9aa0aa, flatShading: true }),
      doorWood:   new THREE.MeshLambertMaterial({ color: 0x6a4a26, flatShading: true }),
      water:      new THREE.MeshLambertMaterial({ color: 0x2a5a8a, transparent: true, opacity: 0.75 }),
      crystal:    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x888888 }),
    };
  }

  heightAt(x, z) { return rawHeight(x, z); }

  addColliderCircle(x, z, r) { const c = { x, z, r, disabled: false }; this.colliders.push(c); return c; }
  addColliderBox(x, z, hx, hz) { const c = { x, z, hx, hz, disabled: false }; this.colliders.push(c); return c; }

  resolve(pos, r) {
    for (const c of this.colliders) {
      if (c.disabled) continue;
      if (c.r !== undefined) {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d2 = dx * dx + dz * dz, min = c.r + r;
        if (d2 < min * min) {
          if (d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; }
          else pos.x += min;
        }
      } else {
        const cx = clamp(pos.x, c.x - c.hx, c.x + c.hx);
        const cz = clamp(pos.z, c.z - c.hz, c.z + c.hz);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r; }
          else {
            const px = c.hx - Math.abs(pos.x - c.x), pz = c.hz - Math.abs(pos.z - c.z);
            if (px < pz) pos.x = c.x + (Math.sign(pos.x - c.x) || 1) * (c.hx + r);
            else pos.z = c.z + (Math.sign(pos.z - c.z) || 1) * (c.hz + r);
          }
        }
      }
    }
    pos.x = clamp(pos.x, -WORLD_SIZE / 2 + 6, WORLD_SIZE / 2 - 6);
    pos.z = clamp(pos.z, -WORLD_SIZE / 2 + 6, WORLD_SIZE / 2 - 6);
  }

  addBox(x, y, z, w, h, d, mat, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (opts.rotY) m.rotation.y = opts.rotY;
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    this.scene.add(m);
    if (opts.collide) this.addColliderBox(x, z, w / 2, d / 2);
    return m;
  }

  addCyl(x, y, z, rt, rb, h, seg, mat, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    if (opts.rotZ) m.rotation.z = opts.rotZ;
    if (opts.rotX) m.rotation.x = opts.rotX;
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    this.scene.add(m);
    if (opts.collide) this.addColliderCircle(x, z, Math.max(rt, rb));
    return m;
  }

  tree(x, z) {
    const h = rawHeight(x, z);
    const s = 0.8 + this.rng() * 0.7;
    this.addCyl(x, h + 1.2 * s, z, 0.22 * s, 0.3 * s, 2.4 * s, 5, this.mats.trunk, { shadow: false });
    const leaf = this.rng() > 0.5 ? this.mats.leaf : this.mats.leaf2;
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.5 * s, 3.2 * s, 6), leaf);
    c1.position.set(x, h + 3.4 * s, z); c1.castShadow = false; this.scene.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.05 * s, 2.4 * s, 6), leaf);
    c2.position.set(x, h + 4.9 * s, z); c2.castShadow = false; this.scene.add(c2);
    this.addColliderCircle(x, z, 0.45);
  }

  rock(x, z, s = 1) {
    const h = rawHeight(x, z);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), this.mats.rock);
    m.position.set(x, h + s * 0.4, z);
    m.rotation.set(this.rng() * 3, this.rng() * 3, this.rng() * 3);
    m.castShadow = false;
    this.scene.add(m);
    if (s > 1.4) this.addColliderCircle(x, z, s * 0.85);
  }

  torch(x, z) {
    const h = rawHeight(x, z);
    this.addCyl(x, h + 1.0, z, 0.09, 0.12, 2.0, 5, this.mats.woodDark, { shadow: false });
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: 0xffa030, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    flame.position.set(x, h + 2.2, z);
    flame.scale.set(0.9, 0.9, 1);
    this.scene.add(flame);
    const light = new THREE.PointLight(0xff9030, 0, 22, 1.8);
    light.position.set(x, h + 2.4, z);
    this.scene.add(light);
    this.torchLights.push({ light, flame, phase: Math.random() * 10 });
  }

  house(x, z, w, d, h, roofMat) {
    const y = rawHeight(x, z);
    this.addBox(x, y + h / 2, z, w, h, d, this.mats.stone);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.7, 4), roofMat || this.mats.roof);
    roof.position.set(x, y + h + h * 0.35, z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.scene.add(roof);
    const door = this.addBox(x, y + 1.1, z + d / 2 + 0.06, 1.6, 2.2, 0.12, this.mats.doorWood, { shadow: false });
    door.castShadow = false;
    this.addColliderBox(x, z, w / 2, d / 2);
    return y;
  }

  chest(x, z, lootId) {
    const h = rawHeight(x, z);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.8), this.mats.woodDark);
    base.position.y = 0.35; base.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.8), this.mats.wood);
    lid.position.y = 0.85; lid.castShadow = true;
    g.add(base, lid);
    g.position.set(x, h, z);
    g.rotation.y = this.rng() * 0.6 - 0.3;
    this.scene.add(g);
    this.addColliderCircle(x, z, 0.8);
    const self = this;
    this.interactables.push({
      x, y: h, z, r: 2.6,
      label: () => 'Ouvrir le coffre',
      enabled: () => !g.userData.opened,
      action: () => {
        g.userData.opened = true;
        lid.position.y = 1.25; lid.rotation.x = -1.9;
        self.game.onChest(lootId, new THREE.Vector3(x, h + 1, z));
      },
    });
    return g;
  }

  makeDoor(x, z, w, h, mat, opts = {}) {
    const y = rawHeight(x, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), mat || this.mats.doorWood);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    if (opts.rot90) mesh.rotation.y = Math.PI / 2;
    const col = opts.rot90 ? this.addColliderBox(x, z, 0.4, w / 2) : this.addColliderBox(x, z, w / 2, 0.4);
    const door = {
      mesh, collider: col, opened: false, openT: 0, h,
      color: opts.color || null, locked: !!opts.locked, keyId: opts.keyId || null,
      label: opts.label || 'Ouvrir la porte',
    };
    this.doors.push(door);
    const self = this;
    this.interactables.push({
      x, y, z, r: 3.0,
      label: () => {
        if (door.opened) return null;
        if (door.locked && !self.game.hasKey(door.keyId)) return `Porte verrouillée — ${door.label}`;
        return door.locked ? `Ouvrir avec ${door.label}` : 'Ouvrir la porte';
      },
      enabled: () => !door.opened,
      action: () => {
        if (door.locked && !self.game.hasKey(door.keyId)) {
          self.game.ui.toast('Porte verrouillée. Il vous faut la bonne clé.', 'bad');
          self.game.audio.play('ui');
          return;
        }
        self.openDoor(door);
      },
    });
    return door;
  }

  openDoor(door) {
    if (door.opened) return;
    door.opened = true;
    door.collider.disabled = true;
    this.game.audio.play('door');
    this.game.ui.toast('Une porte s’ouvre…');
  }

  makeLever(x, z, colorHex, onUse) {
    const h = rawHeight(x, z);
    const base = this.addCyl(x, h + 0.3, z, 0.35, 0.4, 0.6, 6, this.mats.stoneDark, { shadow: false });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), this.mats.metal);
    handle.position.set(x, h + 1.2, z);
    handle.rotation.z = 0.6;
    handle.castShadow = true;
    this.scene.add(handle);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: colorHex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.position.set(x, h + 1.2, z);
    glow.scale.set(0.8, 0.8, 1);
    this.scene.add(glow);
    let used = false;
    const self = this;
    this.interactables.push({
      x, y: h, z, r: 2.6,
      label: () => used ? null : 'Actionner le levier',
      enabled: () => !used,
      action: () => {
        used = true;
        handle.rotation.z = -0.6;
        self.game.audio.play('lever');
        self.game.particles.burst(new THREE.Vector3(x, h + 1.3, z), { color: colorHex, count: 18, speed: 4, life: 0.8, size: 0.4 });
        onUse();
      },
    });
  }

  makeCrystal(x, z, school) {
    const h = rawHeight(x, z);
    const s = SCHOOLS[school];
    this.addCyl(x, h + 0.4, z, 0.9, 1.1, 0.8, 6, this.mats.stoneDark);
    const cr = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85),
      new THREE.MeshLambertMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.55 })
    );
    cr.position.set(x, h + 2.1, z);
    cr.castShadow = true;
    this.scene.add(cr);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: s.color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.position.copy(cr.position);
    glow.scale.set(2.6, 2.6, 1);
    this.scene.add(glow);
    this.crystals = this.crystals || {};
    this.crystals[school] = { mesh: cr, glow, x, z, taken: false };
    const self = this;
    this.interactables.push({
      x, y: h, z, r: 3.2,
      label: () => self.crystals[school].taken ? null : `Prendre le Cristal de ${s.name}`,
      enabled: () => !self.crystals[school].taken,
      action: () => self.game.takeCrystal(school),
    });
  }

  makeTeleporter(x, z, pair) {
    const h = rawHeight(x, z);
    this.addCyl(x, h + 1.6, z, 0.7, 1.0, 3.2, 6, this.mats.stoneDark);
    const cr = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5),
      new THREE.MeshLambertMaterial({ color: 0x66ffee, emissive: 0x22aa88, emissiveIntensity: 0.7 })
    );
    cr.position.set(x, h + 3.6, z);
    this.scene.add(cr);
    this.teleporters = this.teleporters || [];
    const tp = { x, z, pair, mesh: cr, active: true };
    this.teleporters.push(tp);
    const self = this;
    this.interactables.push({
      x, y: h, z, r: 3.0,
      label: () => 'Pierre de téléportation',
      enabled: () => true,
      action: () => self.game.useTeleporter(tp),
    });
    return tp;
  }

  addGem(x, z, school) {
    const h = rawHeight(x, z);
    const s = SCHOOLS[school];
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32),
      new THREE.MeshLambertMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.8 })
    );
    m.position.set(x, h + 0.7, z);
    this.scene.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: s.color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.position.copy(m.position); glow.scale.set(1.4, 1.4, 1);
    this.scene.add(glow);
    this.pickups.push({ kind: 'gem', school, mesh: m, glow, x, y: h + 0.7, z, phase: Math.random() * 6 });
  }

  addCoinPile(x, z, n = 5) {
    const h = rawHeight(x, z);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8), this.mats.gold);
      const ox = (Math.random() - 0.5) * 1.2, oz = (Math.random() - 0.5) * 1.2;
      m.position.set(x + ox, h + 0.15 + i * 0.02, z + oz);
      m.castShadow = false;
      this.scene.add(m);
      this.pickups.push({ kind: 'coin', value: 1 + ((Math.random() * 3) | 0), mesh: m, glow: null, x: x + ox, y: h + 0.2, z: z + oz, phase: Math.random() * 6 });
    }
  }

  addPotion(x, z, ptype) {
    const h = rawHeight(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshLambertMaterial({ color: ptype === 'mana' ? 0x3a6fd4 : 0xd43a2f, emissive: ptype === 'mana' ? 0x1a2f6a : 0x5a1010, emissiveIntensity: 0.6 }));
    body.position.y = 0.3;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.25, 6), this.mats.woodDark);
    neck.position.y = 0.62;
    g.add(body, neck);
    g.position.set(x, h, z);
    this.scene.add(g);
    this.pickups.push({ kind: 'potion', ptype, mesh: g, glow: null, x, y: h + 0.3, z, phase: Math.random() * 6 });
  }

  addHerb(x, z) {
    const h = rawHeight(x, z);
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4),
        new THREE.MeshLambertMaterial({ color: 0x7fe0a0, emissive: 0x2a8a50, emissiveIntensity: 0.7 }));
      leaf.position.set((i - 1) * 0.15, 0.35, (Math.random() - 0.5) * 0.2);
      leaf.rotation.z = (i - 1) * 0.35;
      g.add(leaf);
    }
    g.position.set(x, h, z);
    this.scene.add(g);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: 0x7fe0a0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.position.set(x, h + 0.5, z); glow.scale.set(1.2, 1.2, 1);
    this.scene.add(glow);
    this.pickups.push({ kind: 'herb', mesh: g, glow, x, y: h + 0.4, z, phase: Math.random() * 6 });
  }

  /* ---------------- Construction du monde ---------------- */

  build() {
    this.buildTerrain();
    this.buildSky();
    this.buildLake();
    this.buildVillage();
    this.buildRuin();
    this.buildCrypt();
    this.buildTower();
    this.buildCave();
    this.buildCastle();
    this.scatterNature();
    this.scatterPickups();
    this.defineSpawns();
    this.buildLights();
  }

  buildTerrain() {
    const seg = 150;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x4a7c3a), cGrass2 = new THREE.Color(0x5d8f42);
    const cDirt = new THREE.Color(0x8a6f4d), cRock = new THREE.Color(0x7a7268);
    const cSand = new THREE.Color(0xcbb27a), cSnow = new THREE.Color(0xdfe6ee);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = rawHeight(x, z);
      pos.setY(i, h);
      const n = fbm(simplex2, x * 0.03, z * 0.03, 2);
      tmp.copy(cGrass).lerp(cGrass2, clamp(n * 0.5 + 0.5, 0, 1));
      let inFlat = false;
      for (const f of FLATS) {
        if (dist(x, z, f.x, f.z) < f.r * 0.95) { inFlat = true; break; }
      }
      if (inFlat) tmp.lerp(cDirt, 0.75);
      const slope = Math.abs(rawHeight(x + 2, z) - h) + Math.abs(rawHeight(x, z + 2) - h);
      if (slope > 1.6) tmp.lerp(cRock, clamp(slope / 4, 0, 1));
      if (h > 24) tmp.lerp(cSnow, smoothstep(24, 30, h));
      if (h < 2.6) tmp.lerp(cSand, smoothstep(2.6, 1.8, h));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  buildSky() {
    this.scene.fog = new THREE.Fog(0x87b5e0, 40, 460);
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.48 + 0.05;
      const r = 700;
      starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      starPos[i * 3 + 1] = Math.sin(e) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0,
    }));
    this.scene.add(this.stars);
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, flatShading: true });
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      const n = 3 + ((Math.random() * 3) | 0);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(rand(6, 12), 7, 5), cloudMat);
        s.position.set(j * 7 - n * 3 + rand(-2, 2), rand(-1.5, 1.5), rand(-3, 3));
        s.scale.y = 0.45;
        c.add(s);
      }
      c.position.set(rand(-700, 700), rand(120, 190), rand(-700, 700));
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }

  buildLake() {
    const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 0.98, 40), this.mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(LAKE.x, LAKE.waterY, LAKE.z);
    this.scene.add(water);
    this.water = water;
    this.addColliderCircle(LAKE.x, LAKE.z, LAKE.r - 4);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.rock(LAKE.x + Math.cos(a) * (LAKE.r + rand(1, 4)), LAKE.z + Math.sin(a) * (LAKE.r + rand(1, 4)), rand(1.5, 3));
    }
  }

  buildVillage() {
    const V = ZONES.village;
    // place + fontaine
    this.addCyl(V.x, rawHeight(V.x, V.z) + 1.1, V.z, 2.2, 2.6, 2.2, 10, this.mats.stone);
    this.addColliderCircle(V.x, V.z, 2.8);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.9, 12), this.mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(V.x, rawHeight(V.x, V.z) + 2.15, V.z);
    this.scene.add(water);
    // maisons
    this.house(V.x, V.z - 24, 14, 10, 5.5, this.mats.roofDark);           // hall de l'Aîné
    this.house(V.x - 24, V.z + 10, 9, 8, 4, this.mats.roof);
    this.house(V.x + 24, V.z + 12, 9, 8, 4, this.mats.roof);
    this.house(V.x - 21, V.z + 30, 8, 7, 3.6, this.mats.roofDark);
    this.house(V.x + 25, V.z - 14, 8, 7, 3.6, this.mats.roof);
    this.house(V.x, V.z + 34, 10, 8, 4.2, this.mats.roof);
    // étal du marchand
    this.addBox(V.x + 11, rawHeight(V.x + 11, V.z + 7) + 0.5, V.z + 7, 3, 1, 1.6, this.mats.wood);
    // palissades partielles
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 1.6 + 0.5;
      const fx = V.x + Math.cos(a) * 42, fz = V.z + Math.sin(a) * 42;
      if (dist(fx, fz, V.x, V.z - 24) < 12) continue;
      this.addBox(fx, rawHeight(fx, fz) + 0.6, fz, 0.3, 1.2, 3.4, this.mats.woodDark, { shadow: false });
    }
    for (const [tx, tz] of [[-14, 128], [14, 128], [-14, 152], [14, 152], [0, 122], [-30, 140], [30, 140]]) {
      this.torch(V.x + tx, V.z + tz);
    }
    this.chest(V.x - 28, V.z + 22, 'village');
    this.makeTeleporter(V.x - 12, V.z - 2, 'AB');
    this.spawnPoint = new THREE.Vector3(V.x, rawHeight(V.x, V.z + 18) + 1, V.z + 18);
  }

  buildRuin() {
    const R = ZONES.ruin;
    const cx = R.x, cz = R.z - 8;
    // anneau de piliers brisés
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const px = cx + Math.cos(a) * 17, pz = cz + Math.sin(a) * 17;
      const h = rawHeight(px, pz);
      this.addCyl(px, h + 1.6, pz, 0.9, 1.1, 3.2 + (i % 3), 7, this.mats.stoneDark, { rotZ: (this.rng() - 0.5) * 0.3, shadow: true });
      if (i % 2 === 0) this.addColliderCircle(px, pz, 1.0);
    }
    // petit sanctuaire avec porte rouge
    const sx = cx, sz = cz - 6;
    const sy = rawHeight(sx, sz);
    this.addBox(sx, sy + 2.5, sz - 4.5, 11, 5, 1, this.mats.stone);           // mur nord
    this.addBox(sx - 5.5, sy + 2.5, sz, 1, 5, 9, this.mats.stone);            // mur ouest
    this.addBox(sx + 5.5, sy + 2.5, sz, 1, 5, 9, this.mats.stone);            // mur est
    this.addBox(sx - 3.2, sy + 2.5, sz + 4.5, 4.4, 5, 1, this.mats.stone);    // mur sud ouest
    this.addBox(sx + 3.2, sy + 2.5, sz + 4.5, 4.4, 5, 1, this.mats.stone);    // mur sud est
    this.addColliderBox(sx, sz - 4.5, 5.5, 0.5);
    this.addColliderBox(sx - 5.5, sz, 0.5, 4.5);
    this.addColliderBox(sx + 5.5, sz, 0.5, 4.5);
    this.addColliderBox(sx - 3.2, sz + 4.5, 2.2, 0.5);
    this.addColliderBox(sx + 3.2, sz + 4.5, 2.2, 0.5);
    const redDoor = this.makeDoor(sx, sz + 4.5, 2.6, 3.6, new THREE.MeshLambertMaterial({ color: SCHOOLS.dragon.color, flatShading: true }), { color: 'dragon', label: 'Clé du sanctuaire' });
    this.makeLever(cx - 8, cz + 5, SCHOOLS.dragon.color, () => this.openDoor(redDoor));
    this.makeCrystal(sx, sz - 1.5, 'dragon');
    // coffre à la clé rouillée, dans un campement de la forêt
    this.chest(R.x - 26, R.z + 22, 'cle_rouillee');
  }

  buildCrypt() {
    const C = ZONES.crypt;
    const bx = C.x, bz = C.z;
    const by = rawHeight(bx, bz);
    const W = 9, D = 7, H = 4.5;
    // murs avec porte sud verrouillée
    this.addBox(bx, by + H / 2, bz - D, W, H, 1, this.mats.stoneDark);
    this.addBox(bx - W / 2, by + H / 2, bz, 1, H, D, this.mats.stoneDark);
    this.addBox(bx + W / 2, by + H / 2, bz - 2.5, 1, H, 2.0, this.mats.stoneDark);
    this.addBox(bx + W / 2, by + H / 2, bz + 2.5, 1, H, 2.0, this.mats.stoneDark);
    this.addBox(bx - 3, by + H / 2, bz + D, 3, H, 1, this.mats.stoneDark);
    this.addBox(bx + 3, by + H / 2, bz + D, 3, H, 1, this.mats.stoneDark);
    this.addColliderBox(bx, bz - D, W / 2, 0.5);
    this.addColliderBox(bx - W / 2, bz, 0.5, D / 2);
    this.addColliderBox(bx + W / 2, bz - 2.5, 0.5, 1.0);
    this.addColliderBox(bx + W / 2, bz + 2.5, 0.5, 1.0);
    this.addColliderBox(bx - 3, bz + D, 1.5, 0.5);
    this.addColliderBox(bx + 3, bz + D, 1.5, 0.5);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.75, 2.6, 4), this.mats.roofDark);
    roof.position.set(bx, by + H + 1.3, bz); roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    this.scene.add(roof);
    const cryptDoor = this.makeDoor(bx, bz + D, 3.0, 3.2, this.mats.doorWood, { locked: true, keyId: 'cle_rouillee', label: 'Clé rouillée' });
    // levier bleu + porte intérieure est vers la chambre du nécromancien
    const blueDoor = this.makeDoor(bx + W / 2, bz, 3.0, 3.2, new THREE.MeshLambertMaterial({ color: SCHOOLS.lune.color, flatShading: true }), { color: 'lune', rot90: true });
    this.makeLever(bx - W / 2 + 1.4, bz - D + 1.4, SCHOOLS.lune.color, () => this.openDoor(blueDoor));
    // chambre est (pièce séparée visuellement par un mur avec la porte bleue)
    const cx = bx + W / 2 + 8, cz = bz;
    const cy = rawHeight(cx, cz);
    this.addBox(cx, cy + 2.2, cz - 5.5, 15, 4.4, 1, this.mats.stoneDark);
    this.addBox(cx, cy + 2.2, cz + 5.5, 15, 4.4, 1, this.mats.stoneDark);
    this.addBox(cx + 7.5, cy + 2.2, cz, 1, 4.4, 11, this.mats.stoneDark);
    this.addColliderBox(cx, cz - 5.5, 7.5, 0.5);
    this.addColliderBox(cx, cz + 5.5, 7.5, 0.5);
    this.addColliderBox(cx + 7.5, cz, 0.5, 5.5);
    this.makeCrystal(cx + 4.5, cz - 3, 'lune');
    this.chest(cx - 5.5, cz + 3.5, 'chateau_key');
    this.torch(cx - 6, cz - 4);
    this.torch(cx + 6, cz + 4);
    this.makeTeleporter(bx - W / 2 - 4, bz + D + 3, 'CD');
    this.cryptDoor = cryptDoor;
  }

  buildTower() {
    const T = ZONES.tower;
    const bx = T.x, bz = T.z;
    const by = rawHeight(bx, bz);
    const W = 10, D = 10, H = 8;
    this.addBox(bx, by + H / 2, bz - D / 2, W, H, 1.2, this.mats.stone);
    this.addBox(bx - W / 2, by + H / 2, bz, 1.2, H, D, this.mats.stone);
    this.addBox(bx + W / 2, by + H / 2, bz - 3.25, 1.2, H, 3.5, this.mats.stone);
    this.addBox(bx + W / 2, by + H / 2, bz + 3.25, 1.2, H, 3.5, this.mats.stone);
    this.addBox(bx - 3.25, by + H / 2, bz + D / 2, 3.5, H, 1.2, this.mats.stone);
    this.addBox(bx + 3.25, by + H / 2, bz + D / 2, 3.5, H, 1.2, this.mats.stone);
    this.addColliderBox(bx, bz - D / 2, W / 2, 0.6);
    this.addColliderBox(bx - W / 2, bz, 0.6, D / 2);
    this.addColliderBox(bx + W / 2, bz - 3.25, 0.6, 1.75);
    this.addColliderBox(bx + W / 2, bz + 3.25, 0.6, 1.75);
    this.addColliderBox(bx - 3.25, bz + D / 2, 1.75, 0.6);
    this.addColliderBox(bx + 3.25, bz + D / 2, 1.75, 0.6);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(W * 0.72, 3, 4), this.mats.roofDark);
    cap.position.set(bx, by + H + 1.5, bz); cap.rotation.y = Math.PI / 4; cap.castShadow = true;
    this.scene.add(cap);
    this.makeDoor(bx, bz + D / 2, 3.0, 3.2, this.mats.doorWood);
    // levier vert + porte verte vers la salle du cristal (cloison est)
    const greenDoor = this.makeDoor(bx + W / 2, bz, 3.0, 3.2, new THREE.MeshLambertMaterial({ color: SCHOOLS.serpent.color, flatShading: true }), { color: 'serpent', rot90: true });
    this.makeLever(bx - W / 2 + 1.5, bz - D / 2 + 1.5, SCHOOLS.serpent.color, () => this.openDoor(greenDoor));
    this.makeCrystal(bx + W / 2 - 0.01 + 3.5, bz, 'serpent');
    this.addBox(bx + W / 2 + 3.5, by + 1.5, bz - 4, 0.8, 3, 8, this.mats.stoneDark); // cloison chambre cristal
    this.addBox(bx + W / 2 + 7, by + 2.2, bz, 1, 4.4, 8, this.mats.stoneDark);
    this.addBox(bx + W / 2 + 3.5, by + 2.2, bz + 4, 8, 4.4, 1, this.mats.stoneDark);
    this.addBox(bx + W / 2 + 3.5, by + 2.2, bz - 4, 8, 4.4, 1, this.mats.stoneDark);
    this.addColliderBox(bx + W / 2 + 3.5, bz, 0.4, 4);
    this.addColliderBox(bx + W / 2 + 7, bz, 0.5, 4);
    this.addColliderBox(bx + W / 2 + 3.5, bz + 4, 4, 0.5);
    this.addColliderBox(bx + W / 2 + 3.5, bz - 4, 4, 0.5);
    this.chest(bx - 3.5, bz + 3, 'tour_loot');
    this.torch(bx - 4, bz - 4);
    this.torch(bx + 4, bz + 4);
  }

  buildCave() {
    const V = ZONES.cave;
    const cx = V.x, cz = V.z;
    // anneau de rochers avec entrée au sud
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(((a + Math.PI / 2) % (Math.PI * 2)) - Math.PI / 2) < 0.35) continue; // entrée est
      if (Math.abs(a - 3 * Math.PI / 2) < 0.35) continue; // alcôve nord (cristal)
      const px = cx + Math.cos(a) * 26, pz = cz + Math.sin(a) * 26;
      this.rock(px, pz, rand(3.5, 5.5));
      this.addColliderCircle(px, pz, 3.4);
    }
    // levier jaune + porte de pierre au nord
    const stoneDoor = this.makeDoor(cx, cz - 18, 3.2, 4, this.mats.stoneDark, { color: 'chaos' });
    this.addBox(cx - 6, rawHeight(cx - 6, cz - 18) + 2, cz - 18, 5, 4, 0.8, this.mats.stoneDark);
    this.addBox(cx + 6, rawHeight(cx + 6, cz - 18) + 2, cz - 18, 5, 4, 0.8, this.mats.stoneDark);
    this.addColliderBox(cx - 6, cz - 18, 2.5, 0.4);
    this.addColliderBox(cx + 6, cz - 18, 2.5, 0.4);
    this.makeLever(cx - 10, cz + 12, SCHOOLS.chaos.color, () => this.openDoor(stoneDoor));
    this.makeCrystal(cx, cz - 24, 'chaos');
    this.addColliderCircle(cx, cz - 24, 1.2);
    for (const [tx, tz] of [[cx - 14, cz - 14], [cx + 14, cz - 14], [cx - 14, cz + 14], [cx + 14, cz + 14]]) this.torch(tx, tz);
    this.makeTeleporter(cx, cz + 30, 'CD');
  }

  buildCastle() {
    const C = ZONES.castle;
    const cx = C.x, cz = C.z;
    const cy = rawHeight(cx, cz);
    const H = 12, T = 4, E = 65; // demi-côté
    const wall = this.mats.stone;
    // murs extérieurs (grande porte au NORD, côté village)
    this.addBox(cx - E / 2 - 2.5, cy + H / 2, cz + E, E - 5, H, T, wall);
    this.addBox(cx + E / 2 + 2.5, cy + H / 2, cz + E, E - 5, H, T, wall);
    this.addColliderBox(cx - E / 2 - 2.5, cz + E, (E - 5) / 2, T / 2);
    this.addColliderBox(cx + E / 2 + 2.5, cz + E, (E - 5) / 2, T / 2);
    this.addBox(cx, cy + H / 2, cz - E, E * 2, H, T, wall);
    this.addBox(cx - E, cy + H / 2, cz, T, H, E * 2, wall);
    this.addBox(cx + E, cy + H / 2, cz, T, H, E * 2, wall);
    this.addColliderBox(cx, cz - E, E, T / 2);
    this.addColliderBox(cx - E, cz, T / 2, E);
    this.addColliderBox(cx + E, cz, T / 2, E);
    // tours d'angle
    for (const [tx, tz] of [[-E, -E], [E, -E], [-E, E], [E, E]]) {
      this.addCyl(cx + tx, cy + 10, cz + tz, 6, 7, 20, 10, this.mats.stoneDark);
    }
    // grande porte sud (clé du château)
    const gate = this.makeDoor(cx, cz + E, 10, 9, this.mats.doorWood, { locked: true, keyId: 'cle_chateau', label: 'Clé du Château' });
    this.castleGate = gate;
    // donjon (keep)
    const K = { x: cx, z: cz - 25, w: 46, d: 34, h: 10 };
    const ky = rawHeight(K.x, K.z);
    this.addBox(K.x - K.w / 4 - 1.25, ky + K.h / 2, K.z - K.d / 2, K.w / 2 - 2.5, K.h, 2.5, this.mats.stoneDark);
    this.addBox(K.x + K.w / 4 + 1.25, ky + K.h / 2, K.z - K.d / 2, K.w / 2 - 2.5, K.h, 2.5, this.mats.stoneDark);
    this.addBox(K.x - K.w / 2, ky + K.h / 2, K.z, 2.5, K.h, K.d, this.mats.stoneDark);
    this.addBox(K.x + K.w / 2, ky + K.h / 2, K.z, 2.5, K.h, K.d, this.mats.stoneDark);
    this.addBox(K.x - K.w / 4 - 1, ky + K.h / 2, K.z + K.d / 2, K.w / 2 - 2, K.h, 2.5, this.mats.stoneDark);
    this.addBox(K.x + K.w / 4 + 1, ky + K.h / 2, K.z + K.d / 2, K.w / 2 - 2, K.h, 2.5, this.mats.stoneDark);
    this.addColliderBox(K.x - K.w / 4 - 1.25, K.z - K.d / 2, (K.w / 2 - 2.5) / 2, 1.25);
    this.addColliderBox(K.x + K.w / 4 + 1.25, K.z - K.d / 2, (K.w / 2 - 2.5) / 2, 1.25);
    this.addColliderBox(K.x - K.w / 2, K.z, 1.25, K.d / 2);
    this.addColliderBox(K.x + K.w / 2, K.z, 1.25, K.d / 2);
    this.addColliderBox(K.x - K.w / 4 - 1, K.z + K.d / 2, (K.w / 2 - 2) / 2, 1.25);
    this.addColliderBox(K.x + K.w / 4 + 1, K.z + K.d / 2, (K.w / 2 - 2) / 2, 1.25);
    const keepDoor = this.makeDoor(K.x, K.z + K.d / 2, 4, 4.5, this.mats.doorWood);
    // porte du boss (nord du keep)
    const bossDoor = this.makeDoor(K.x, K.z - K.d / 2, 5, 5, new THREE.MeshLambertMaterial({ color: 0x7a2ad8, flatShading: true }), { color: 'boss', label: 'les 4 cristaux' });
    this.bossDoor = bossDoor;
    // salle du trône (au nord du keep)
    const B = { x: K.x, z: K.z - K.d / 2 - 11, w: 34, d: 20, h: 12 };
    const byy = rawHeight(B.x, B.z);
    this.addBox(B.x, byy + B.h / 2, B.z - B.d / 2, B.w, B.h, 2, this.mats.stoneDark);
    this.addBox(B.x - B.w / 2, byy + B.h / 2, B.z, 2, B.h, B.d, this.mats.stoneDark);
    this.addBox(B.x + B.w / 2, byy + B.h / 2, B.z, 2, B.h, B.d, this.mats.stoneDark);
    // pas de mur sud : la porte du boss du keep y donne directement
    this.addColliderBox(B.x, B.z - B.d / 2, B.w / 2, 1);
    this.addColliderBox(B.x - B.w / 2, B.z, 1, B.d / 2);
    this.addColliderBox(B.x + B.w / 2, B.z, 1, B.d / 2);
    // trône
    this.addBox(B.x, byy + 1.2, B.z - 8, 4, 2.4, 2, this.mats.stoneRed);
    this.addBox(B.x, byy + 3.2, B.z - 8.8, 4, 2.4, 0.6, this.mats.stoneRed);
    this.addColliderCircle(B.x, B.z - 8, 2.4);
    // piliers du donjon
    for (const [px, pz] of [[-14, -38], [14, -38], [-14, -12], [14, -12]]) {
      this.addCyl(cx + px, rawHeight(cx + px, cz + pz) + 4, cz + pz, 1.4, 1.7, 8, 8, this.mats.stone);
    }
    // autel des cristaux
    this.buildAltar(K.x, K.z - 6);
    // torches cour + donjon + salle du trône
    for (const [tx, tz] of [[-20, cz - 40], [20, cz - 40], [-30, cz - 15], [30, cz - 15]]) this.torch(cx + tx, cz + tz);
    this.torch(K.x - 18, K.z + 12); this.torch(K.x + 18, K.z + 12);
    this.torch(K.x - 18, K.z - 12); this.torch(K.x + 18, K.z - 12);
    this.torch(B.x - 14, B.z); this.torch(B.x + 14, B.z); this.torch(B.x, B.z - 6);
    this.chest(cx - 25, cz - 55, 'castle1');
    this.chest(cx + 25, cz - 55, 'castle2');
    this.makeTeleporter(cx, cz + E + 22, 'AB');
    this.bossSpawn = new THREE.Vector3(B.x, byy + 1, B.z - 2);
    this.altarPos = new THREE.Vector3(K.x, ky, K.z - 6);
  }

  buildAltar(x, z) {
    const h = rawHeight(x, z);
    this.addBox(x, h + 0.6, z, 4, 1.2, 2.4, this.mats.stoneRed);
    this.addColliderBox(x, z, 2, 1.2);
    const self = this;
    this.interactables.push({
      x, y: h, z, r: 3.4,
      label: () => {
        const n = self.game.crystalCount();
        return n >= 4 ? 'Déposer les 4 cristaux' : `Autel des cristaux (${n}/4)`;
      },
      enabled: () => self.game.crystalCount() >= 4,
      action: () => self.game.placeCrystals(),
    });
  }

  scatterNature() {
    const treeZones = [
      { x: ZONES.ruin.x, z: ZONES.ruin.z, r: 120, n: 130 },
      { x: -250, z: -220, r: 160, n: 90 },
      { x: 200, z: 200, r: 170, n: 80 },
      { x: -100, z: -50, r: 130, n: 60 },
      { x: 250, z: -150, r: 130, n: 60 },
      { x: -350, z: 200, r: 140, n: 70 },
    ];
    for (const tz of treeZones) {
      for (let i = 0; i < tz.n; i++) {
        const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * tz.r;
        const x = tz.x + Math.cos(a) * r, z = tz.z + Math.sin(a) * r;
        let tooClose = false;
        for (const f of FLATS) if (dist(x, z, f.x, f.z) < f.r * 0.92) { tooClose = true; break; }
        if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r + 6) tooClose = true;
        if (tooClose) continue;
        this.tree(x, z);
      }
    }
    // buissons / rochers / herbes sauvages
    for (let i = 0; i < 420; i++) {
      const x = (this.rng() - 0.5) * WORLD_SIZE * 0.92, z = (this.rng() - 0.5) * WORLD_SIZE * 0.92;
      if (dist(x, z, LAKE.x, LAKE.z) < LAKE.r) continue;
      let inFlat = false;
      for (const f of FLATS) if (dist(x, z, f.x, f.z) < f.r * 0.9) { inFlat = true; break; }
      const h = rawHeight(x, z);
      if (inFlat && this.rng() > 0.3) continue;
      const t = this.rng();
      if (t < 0.55) {
        const g = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), this.mats.grassTuft);
        g.position.set(x, h + 0.3, z);
        this.scene.add(g);
      } else if (t < 0.85) {
        this.rock(x, z, rand(0.5, 1.3));
      }
    }
  }

  scatterPickups() {
    const gemSpots = [
      [ZONES.ruin.x + 30, ZONES.ruin.z + 30], [ZONES.ruin.x - 35, ZONES.ruin.z - 25],
      [ZONES.crypt.x - 30, ZONES.crypt.z - 30], [ZONES.crypt.x + 25, ZONES.crypt.z + 35],
      [ZONES.tower.x + 35, ZONES.tower.z - 30], [ZONES.tower.x - 30, ZONES.tower.z + 35],
      [ZONES.cave.x - 40, ZONES.cave.z + 40], [ZONES.cave.x + 40, ZONES.cave.z - 20],
      [ZONES.castle.x + 40, ZONES.castle.z + 40], [ZONES.castle.x - 45, ZONES.castle.z - 20],
      [ZONES.village.x + 35, ZONES.village.z + 20], [-200, -60], [120, 60], [-60, -320],
      [300, 250], [-380, 60], [60, 320], [-240, -340],
    ];
    const schools = ['dragon', 'lune', 'serpent', 'chaos'];
    for (const [x, z] of gemSpots) this.addGem(x, z, pick(schools));
    this.addCoinPile(ZONES.ruin.x - 26, ZONES.ruin.z + 24, 6);
    this.addCoinPile(-250, 300, 6);
    this.addCoinPile(150, -60, 5);
    this.addPotion(ZONES.village.x + 30, ZONES.village.z + 24, 'soin');
    this.addPotion(-250, 302, 'mana');
    this.addPotion(150, -58, 'soin');
    const herbSpots = [[-460, -60], [-390, -150], [-440, -30], [-360, -110], [-480, -120]];
    for (const [x, z] of herbSpots) this.addHerb(x, z);
  }

  defineSpawns() {
    this.spawns = [
      // forêt / ruine
      { type: 'gobelin', x: ZONES.ruin.x - 20, z: ZONES.ruin.z + 10 },
      { type: 'gobelin', x: ZONES.ruin.x + 15, z: ZONES.ruin.z + 25 },
      { type: 'gobelin', x: ZONES.ruin.x - 35, z: ZONES.ruin.z - 10 },
      { type: 'gobelin', x: ZONES.ruin.x + 5, z: ZONES.ruin.z - 30 },
      { type: 'gobelin', x: -360, z: -160 },
      { type: 'gobelin', x: -380, z: -40 },
      { type: 'gobelin', x: -300, z: -180 },
      { type: 'gobelin', x: -460, z: -70 },
      { type: 'gobelin', x: ZONES.ruin.x - 26, z: ZONES.ruin.z + 26 },
      { type: 'gobelinchef', x: ZONES.ruin.x, z: ZONES.ruin.z - 14 },
      { type: 'loup', x: -280, z: -240 },
      { type: 'loup', x: -320, z: -60 },
      { type: 'loup', x: 80, z: -100 },
      { type: 'gobelin', x: -200, z: -40 },
      { type: 'gobelin', x: 100, z: 20 },
      { type: 'gobelin', x: -250, z: 300 },
      { type: 'gobelin', x: -245, z: 305 },
      // crypte
      { type: 'squelette', x: ZONES.crypt.x - 4, z: ZONES.crypt.z - 2 },
      { type: 'squelette', x: ZONES.crypt.x + 3, z: ZONES.crypt.z + 2 },
      { type: 'squelette', x: ZONES.crypt.x, z: ZONES.crypt.z - 4 },
      { type: 'squelette', x: ZONES.crypt.x + 5, z: ZONES.crypt.z - 1 },
      { type: 'squelette', x: ZONES.crypt.x - 5, z: ZONES.crypt.z + 3 },
      { type: 'necromancien', x: ZONES.crypt.x + 17, z: ZONES.crypt.z },
      // tour
      { type: 'brute', x: ZONES.tower.x - 3, z: ZONES.tower.z - 2 },
      { type: 'brute', x: ZONES.tower.x + 3, z: ZONES.tower.z + 2 },
      { type: 'brute', x: ZONES.tower.x, z: ZONES.tower.z + 4 },
      { type: 'brute', x: ZONES.tower.x - 4, z: ZONES.tower.z + 1 },
      // caverne
      { type: 'spectre', x: ZONES.cave.x - 8, z: ZONES.cave.z - 5 },
      { type: 'spectre', x: ZONES.cave.x + 8, z: ZONES.cave.z + 5 },
      { type: 'spectre', x: ZONES.cave.x, z: ZONES.cave.z + 10 },
      { type: 'spectre', x: ZONES.cave.x - 12, z: ZONES.cave.z + 8 },
      { type: 'spectre', x: ZONES.cave.x + 12, z: ZONES.cave.z - 10 },
      { type: 'chaosspawn', x: ZONES.cave.x, z: ZONES.cave.z - 22 },
      // château
      { type: 'cultiste', x: ZONES.castle.x - 20, z: ZONES.castle.z + 20 },
      { type: 'cultiste', x: ZONES.castle.x + 20, z: ZONES.castle.z + 20 },
      { type: 'cultiste', x: ZONES.castle.x - 30, z: ZONES.castle.z - 10 },
      { type: 'cultiste', x: ZONES.castle.x + 30, z: ZONES.castle.z - 10 },
      { type: 'cultiste', x: ZONES.castle.x, z: ZONES.castle.z - 30 },
      { type: 'cultiste', x: ZONES.castle.x - 10, z: ZONES.castle.z + 45 },
      { type: 'cultiste', x: 0, z: -465 },
      { type: 'cultiste', x: 10, z: -462 },
    ];
  }

  buildLights() {
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 0.7);
    this.scene.add(this.hemi);
  }

  /* ---------------- Mise à jour ---------------- */

  update(dt, t, playerPos) {
    // cycle jour/nuit (8 minutes)
    this.timeOfDay = (this.timeOfDay + dt / 480) % 1;
    const ang = this.timeOfDay * Math.PI * 2;
    const elev = Math.sin(ang - Math.PI / 2); // 0.25 = aube, 0.5 = midi
    const day = clamp(elev * 2.2, 0, 1);
    const night = 1 - day;
    const dusk = clamp(1 - Math.abs(elev) * 4, 0, 1) * (elev > -0.2 ? 1 : 0);

    const skyDay = new THREE.Color(0x87b5e0), skyDusk = new THREE.Color(0xe0915a), skyNight = new THREE.Color(0x0a0e20);
    const sky = new THREE.Color();
    if (day > 0.5) sky.copy(skyNight).lerp(skyDay, clamp((day - 0.5) * 2.4, 0, 1));
    else sky.copy(skyNight).lerp(skyDusk, dusk * 0.8).lerp(skyDay, day * 2);
    if (dusk > 0.05 && day < 0.9) sky.lerp(skyDusk, dusk * 0.45 * (1 - day));
    this.scene.background = sky;
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0x0a0e20), night * 0.6);

    const sunDir = new THREE.Vector3(Math.cos(ang - Math.PI / 2), Math.max(0.08, elev), Math.sin(ang - Math.PI / 2) * 0.6).normalize();
    this.sun.position.copy(playerPos).addScaledVector(sunDir, 160);
    this.sun.target.position.copy(playerPos);
    if (elev > 0) {
      this.sun.color.set(0xfff2dd);
      this.sun.intensity = 0.25 + 1.15 * day;
    } else {
      this.sun.color.set(0x8899ff);
      this.sun.intensity = 0.18 * night;
    }
    this.hemi.intensity = 0.22 + 0.55 * day;
    this.stars.material.opacity = night * 0.95;
    this.stars.position.set(playerPos.x, 0, playerPos.z);

    for (const tl of this.torchLights) {
      const f = night * (2.2 + Math.sin(t * 9 + tl.phase) * 0.35 + Math.sin(t * 23 + tl.phase * 2) * 0.15);
      tl.light.intensity = f;
      const s = 0.75 + Math.sin(t * 11 + tl.phase) * 0.18;
      tl.flame.scale.set(s, s * 1.25, 1);
      tl.flame.material.opacity = 0.55 + night * 0.45;
    }

    // nuages
    for (const c of this.clouds.children) {
      c.position.x += dt * 2.2;
      if (c.position.x > 800) c.position.x = -800;
      c.position.y += Math.sin(t * 0.1 + c.position.z) * dt * 0.2;
    }
    // eau
    this.water.position.y = LAKE.waterY + Math.sin(t * 0.8) * 0.05;
    // portes qui glissent
    for (const d of this.doors) {
      if (d.opened && d.openT < 1) {
        d.openT = Math.min(1, d.openT + dt / 1.1);
        d.mesh.position.y += (d.h * 0.95) * dt / 1.1;
      }
    }
    // cristaux qui tournent
    if (this.crystals) {
      for (const k of Object.keys(this.crystals)) {
        const c = this.crystals[k];
        if (c.taken) continue;
        c.mesh.rotation.y += dt * 1.5;
        c.mesh.position.y = rawHeight(c.x, c.z) + 2.1 + Math.sin(t * 2 + c.x) * 0.2;
        c.glow.position.copy(c.mesh.position);
      }
    }
    // téléporteurs
    if (this.teleporters) {
      for (const tp of this.teleporters) {
        tp.mesh.rotation.y += dt * 2;
        tp.mesh.position.y = rawHeight(tp.x, tp.z) + 3.6 + Math.sin(t * 2.4) * 0.15;
      }
    }
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2.5;
      p.mesh.position.y = p.y + Math.sin(t * 3 + p.phase) * 0.14;
      if (p.glow) { p.glow.position.copy(p.mesh.position); p.glow.material.opacity = 0.5 + Math.sin(t * 4 + p.phase) * 0.25; }
    }
  }

  removePickup(p) {
    p.taken = true;
    this.scene.remove(p.mesh);
    if (p.glow) this.scene.remove(p.glow);
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
  }
}
