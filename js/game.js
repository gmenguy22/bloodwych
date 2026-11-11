import * as THREE from 'three';
import { SCHOOLS, CHAMPIONS, SPELLS, ITEMS, MAIN_QUEST, SIDE_QUEST, GEM_ORDER, spellsKnown, castChance, manaCost } from './data.js';
import { clamp, lerp, Particles, AudioSys, dist, rand, pick, chance } from './util.js';
import { GameWorld, ZONES } from './world.js';
import { Champion, Enemy, NPC, Projectile, updateCompanionAI } from './actors.js';
import { UI } from './ui.js';

const NPC_DEFS = [
  { id: 'elder',    name: 'Aîné Boric',       icon: '🧙', color: 0x8a7a4a, x: 0,  z: 124, yaw: Math.PI },
  { id: 'merchant', name: 'Odo le marchand',  icon: '⚗️', color: 0x4a7a8a, x: 13, z: 148, yaw: -2.4 },
  { id: 'edmond',   name: 'Blodwyn',          icon: '🛡️', color: SCHOOLS.serpent.color, x: -9, z: 122, yaw: 0.6, recruit: 'blodwyn' },
  { id: 'lyra',     name: 'Megrim',           icon: '🌙', color: SCHOOLS.lune.color,    x: 9,  z: 122, yaw: -0.6, recruit: 'megrim' },
];

const SPELL_SFX = {
  boule: 'fire', eclair: 'bolt', brasier: 'fire', soin: 'heal', bouclier: 'shield',
  pas: 'teleport', armure: 'shield', frappe: 'hit', paralysie: 'ice',
  drain: 'nova', tp: 'teleport', nova: 'nova',
};

const CHEST_LOOT = {
  village:       { potions: { soin: 1 }, gems: 2, gold: [5, 12] },
  cle_rouillee:  { key: 'cle_rouillee', gems: 2, gold: [8, 16], potions: { mana: 1 } },
  chateau_key:   { key: 'cle_chateau', gems: 3, gold: [15, 30], potions: { soin: 2 } },
  tour_loot:     { item: 'hache', item2: 'plaques', potions: { soin: 1 }, gems: 2 },
  castle1:       { item: 'epee_longue', item2: 'ecu', gems: 3, gold: [20, 40] },
  castle2:       { potions: { soin: 2, mana: 1 }, gems: 3, gold: [20, 40] },
  default:       { gems: 2, gold: [6, 14], potions: { soin: 1 } },
};

export class Game {
  constructor() {
    this.state = 'title'; // title | play | dead | win
    this.time = 0;
    this.bossFightTime = 0;
    this.keys = new Set();
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.enemies = [];
    this.companions = [];
    this.npcs = [];
    this.projectiles = [];
    this.fireZones = [];
    this.novas = [];
    this.flags = {};
    this.questStep = 0;
    this.spellList = SPELLS;
    this.sideQuest = { herbs: 0, done: false };
    this.selectedChampion = null;
    this.interactTarget = null;
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(0, 20, 20);

    this.audio = new AudioSys();
    this.particles = new Particles(this.scene);
    this.world = new GameWorld(this.scene, this);
    this.world.build();

    this.flashLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 2);
      this.scene.add(l);
      this.flashLights.push({ light: l, t: 0 });
    }

    this.ui = new UI(this);
    this.spawnAll();
    this.createNPCs();
    this.bindInput();
    this.ui.buildTitle();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  spawnAll() {
    for (const s of this.world.spawns) this.spawnEnemy(s.type, s.x, s.z);
  }

  spawnEnemy(type, x, z) {
    const e = new Enemy(this, type, x, z);
    this.enemies.push(e);
    return e;
  }

  summonAt(type, x, z) { return this.spawnEnemy(type, x, z); }

  createNPCs() {
    for (const d of NPC_DEFS) {
      const npc = new NPC(this, d.x, d.z, d);
      npc.def = d;
      this.npcs.push(npc);
      this.world.interactables.push({
        x: d.x, y: npc.pos.y, z: d.z, r: 3.0,
        label: () => d.recruit && this.companionById(d.recruit) ? null : `Parler à ${d.name}`,
        enabled: () => !(d.recruit && this.companionById(d.recruit)),
        action: () => this.talkTo(d),
      });
    }
  }

  companionById(id) { return this.companions.find(c => c.def.id === id); }
  allChampions() { return this.player ? [this.player, ...this.companions] : [...this.companions]; }
  hasKey(keyId) { return this.player && this.player.keys.has(keyId); }
  crystalCount() { return this.player ? this.player.crystals.size : 0; }

  /* ---------------- Démarrage ---------------- */

  startGame(championId) {
    const def = CHAMPIONS.find(c => c.id === championId);
    this.player = new Champion(this, def, true);
    this.player.place(this.world.spawnPoint.x, this.world.spawnPoint.z);
    this.state = 'play';
    this.ui.hideTitle();
    this.ui.showHUD();
    this.ui.buildSpellbook();
    this.recomputeQuest(true);
    this.ui.toast(`Bienvenue à Sanglune, ${def.name} !`, 'quest');
    this.ui.toast('Parlez à l’Aîné Boric (au nord du village).');
    this.audio.ensure();
    this.audio.play('quest');
    this.lockPointer();
  }

  lockPointer() { this.renderer.domElement.requestPointerLock?.(); }

  /* ---------------- Entrées ---------------- */

  bindInput() {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (this.state !== 'play') return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'Tab': this.ui.togglePanel('spellbook'); break;
        case 'KeyI': this.ui.togglePanel('inventory'); break;
        case 'KeyJ': this.ui.togglePanel('questlog'); break;
        case 'KeyE': this.tryInteract(); break;
        case 'KeyF': this.castPrepared(); break;
        case 'KeyH': this.player.drinkPotion('soin'); break;
        case 'KeyM': this.audio.ensure(); this.audio.setMuted(!this.audio.muted); this.ui.toast(this.audio.muted ? 'Son coupé' : 'Son activé'); document.getElementById('btn-mute').textContent = `Son : ${this.audio.muted ? 'OFF' : 'ON'}`; break;
        case 'Escape': this.ui.closePanels(); break;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'play' || this.ui.anyPanelOpen() || this.ui.dialogOpen) return;
      if (document.pointerLockElement !== canvas) { this.lockPointer(); return; }
      if (e.button === 0) this.attack();
      if (e.button === 2) { this.player.blocking = true; this.audio.play('block'); }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2 && this.player) this.player.blocking = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || this.state !== 'play') return;
      this.camYaw -= e.movementX * 0.0026;
      this.camPitch = clamp(this.camPitch + e.movementY * 0.0024, -0.45, 1.25);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.state === 'play' && !this.ui.anyPanelOpen() && !this.ui.dialogOpen) {
        this.ui.showPause(true);
      } else {
        this.ui.showPause(false);
      }
    });
    document.getElementById('btn-resume').addEventListener('click', () => { this.ui.showPause(false); this.lockPointer(); });
    document.getElementById('btn-mute').addEventListener('click', () => {
      this.audio.ensure(); this.audio.setMuted(!this.audio.muted);
      document.getElementById('btn-mute').textContent = `Son : ${this.audio.muted ? 'OFF' : 'ON'}`;
    });
    document.getElementById('btn-respawn').addEventListener('click', () => this.respawn());
    document.getElementById('btn-restart').addEventListener('click', () => location.reload());
  }

  /* ---------------- Boucle ---------------- */

  loop() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.state === 'play') {
      this.time += dt;
      this.update(dt, t);
    }
    this.world.update(dt, t, this.player ? this.player.pos : this.world.spawnPoint);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt, t) {
    this.updatePlayer(dt);
    for (const c of this.companions) updateCompanionAI(c, dt);
    for (const e of this.enemies) e.update(dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updateFireZones(dt);
    this.updateNovas(dt);
    this.updatePickups();
    this.updateInteract();
    this.updateCamera(dt);
    this.recomputeQuest();
    if (this.boss && !this.boss.dead) { this.bossFightTime += dt; this.ui.bossBar(true, this.boss.hp / this.boss.maxHp); }
    for (const f of this.flashLights) {
      if (f.t > 0) { f.t -= dt; f.light.intensity = Math.max(0, (f.t / 0.25) * 26); }
    }
    for (const n of this.npcs) n.update(dt, t);
    this.ui.updateHUD();
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p || p.dead) return;
    if (this.ui.dialogOpen || this.ui.anyPanelOpen()) { p.update(dt); p.syncMesh(dt); return; }
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const r = new THREE.Vector3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    let mx = 0, mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('KeyZ')) mz += 1;
    if (this.keys.has('KeyS')) mz -= 1;
    if (this.keys.has('KeyD')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('KeyQ')) mx -= 1;
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      const dirv = f.clone().multiplyScalar(mz).add(r.clone().multiplyScalar(mx));
      const sp = p.moveSpeed() * (sprint ? 1.55 : 1);
      p.pos.x += dirv.x * sp * dt;
      p.pos.z += dirv.z * sp * dt;
      p.yaw = Math.atan2(dirv.x, dirv.z);
    }
    if (this.keys.has('Space') && p.onGround) { p.vel.y = 8.5; p.onGround = false; }
    p.vel.y -= 22 * dt;
    p.pos.y += p.vel.y * dt;
    this.world.resolve(p.pos, p.radius);
    const ground = this.world.heightAt(p.pos.x, p.pos.z);
    if (p.pos.y <= ground) { p.pos.y = ground; p.vel.y = 0; p.onGround = true; }
    else if (p.pos.y - ground > 0.02) p.onGround = false;
    p.mana = Math.min(p.maxMana(), p.mana + dt * 3.2);
    p.update(dt);
    p.syncMesh(dt);
  }

  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const distCam = 7.6;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const cx = p.pos.x - Math.sin(this.camYaw) * cp * distCam;
    const cz = p.pos.z - Math.cos(this.camYaw) * cp * distCam;
    let cy = p.pos.y + 1.6 + sp * distCam;
    const minY = this.world.heightAt(cx, cz) + 0.6;
    if (cy < minY) cy = minY;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(p.pos.x, p.pos.y + 1.7, p.pos.z);
  }

  separateEnemies() {
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = a.radius + b.radius;
        if (d2 < min * min && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2 / d;
          a.pos.x -= dx * push; a.pos.z -= dz * push;
          b.pos.x += dx * push; b.pos.z += dz * push;
        }
      }
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].update(dt)) {
        this.projectiles[i].dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  addFireZone(pt, spell, dps, caster) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spell.radius - 0.5, spell.radius, 28),
      new THREE.MeshBasicMaterial({ color: spell.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pt.x, this.world.heightAt(pt.x, pt.z) + 0.15, pt.z);
    this.scene.add(ring);
    this.fireZones.push({ x: pt.x, z: pt.z, r: spell.radius, until: this.time + spell.duration, dps, color: spell.color, mesh: ring, caster, acc: 0 });
  }

  updateFireZones(dt) {
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const z = this.fireZones[i];
      if (this.time > z.until) { this.scene.remove(z.mesh); this.fireZones.splice(i, 1); continue; }
      z.acc += dt;
      if (z.acc > 0.12) {
        z.acc = 0;
        this.particles.burst(new THREE.Vector3(z.x + rand(-z.r, z.r) * 0.7, this.world.heightAt(z.x, z.z) + 0.3, z.z + rand(-z.r, z.r) * 0.7), { color: z.color, count: 2, speed: 1, life: 0.5, size: 0.5, up: 3, gravity: 1 });
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist(e.pos.x, e.pos.z, z.x, z.z) < z.r + e.radius) e.takeDamage(z.dps * dt, null);
      }
    }
  }

  bossNova(pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xc040ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, this.world.heightAt(pos.x, pos.z) + 0.2, pos.z);
    this.scene.add(ring);
    this.novas.push({ pos: pos.clone(), t: 3, r: 8, mesh: ring });
    this.audio.play('nova');
    this.ui.toast('Nova entropique imminente — fuyez !', 'bad');
  }

  updateNovas(dt) {
    for (let i = this.novas.length - 1; i >= 0; i--) {
      const n = this.novas[i];
      n.t -= dt;
      const k = 1 - Math.max(0, n.t) / 3;
      n.mesh.scale.setScalar(0.5 + k * n.r);
      n.mesh.material.opacity = 0.4 + 0.5 * Math.sin(this.time * 20);
      if (n.t <= 0) {
        this.scene.remove(n.mesh);
        this.novas.splice(i, 1);
        this.explode(n.pos, 0xc040ff, n.r, 34, { owner: 'enemy' });
      }
    }
  }

  /* ---------------- Combat & sorts ---------------- */

  attack() {
    const p = this.player;
    if (!p || p.dead || p.attackCd > 0) return;
    p.attackCd = 0.5;
    p.swing = 1;
    this.audio.play('swing');
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 2.7 + e.radius) {
        const dot = (dx / (d || 1)) * f.x + (dz / (d || 1)) * f.z;
        if (dot > 0.35 || d < 1.2) {
          e.takeDamage(p.meleeDmg(), p.pos);
          hitAny = true;
          this.ui.floatText(e.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), `-${p.meleeDmg()}`, '#ffd0a0');
        }
      }
    }
    if (hitAny) this.audio.play('hit');
  }

  prepareSpell(id) {
    const p = this.player;
    if (!p.knownSpellIds().includes(id)) return;
    p.prepared = id;
    this.audio.play('ui');
    this.ui.buildSpellbook();
    this.ui.updateHUD();
  }

  castPrepared() {
    const p = this.player;
    if (!p || !p.prepared || p.castCd > 0) return;
    const spell = SPELLS.find(s => s.id === p.prepared);
    this.castSpell(p, spell);
  }

  castSpell(c, spell, fromAI = false) {
    const cost = manaCost(c, spell);
    if (c.mana < cost) {
      if (!fromAI) { this.ui.toast('Pas assez de mana !', 'bad'); this.audio.play('fizzle'); }
      return;
    }
    c.mana -= cost;
    c.practice[spell.id] = (c.practice[spell.id] || 0) + 1;
    let ok = chance(castChance(c, spell));
    if (!ok && c.gems[spell.school] > 0) {
      c.gems[spell.school]--;
      ok = true;
      if (!fromAI) this.ui.toast(`Une gemme ${SCHOOLS[spell.school].name} force le sort !`, 'quest');
    }
    const eye = c.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    if (!ok) {
      if (!fromAI) this.ui.toast('Le sort échoue…', 'bad');
      this.audio.play('fizzle');
      this.particles.burst(eye, { color: 0x999999, count: 8, speed: 2, life: 0.5, size: 0.3 });
      return;
    }
    if (c.isPlayer) c.castCd = 0.7;
    let dir;
    if (c.isPlayer) {
      dir = new THREE.Vector3(Math.sin(this.camYaw), -0.06, Math.cos(this.camYaw)).normalize();
    } else {
      let best = null, bd = 1e9;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = (e.pos.x - c.pos.x) ** 2 + (e.pos.z - c.pos.z) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      dir = best ? new THREE.Vector3(best.pos.x - c.pos.x, -0.05, best.pos.z - c.pos.z).normalize() : new THREE.Vector3(1, 0, 0);
    }
    const power = spell.power + c.int * 1.2;
    switch (spell.type) {
      case 'projectile':
        this.projectiles.push(new Projectile(this, {
          pos: eye.clone().addScaledVector(dir, 0.8), dir, speed: spell.speed,
          dmg: power, radius: spell.radius, color: spell.color, owner: 'player', spell, caster: c,
        }));
        break;
      case 'bolt': {
        let best = null, bd = 24;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          const dot = d > 0.1 ? (dx / d) * dir.x + (dz / d) * dir.z : 1;
          if (d < bd && dot > 0.5) { bd = d; best = e; }
        }
        if (best) {
          best.takeDamage(power, c.pos);
          this.particles.burst(best.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: spell.color, count: 20, speed: 7, life: 0.6, size: 0.45 });
          this.particles.burst(eye, { color: spell.color, count: 10, speed: 5, life: 0.4, size: 0.35 });
          this.ui.floatText(best.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), `-${Math.round(power)}`, '#ffe066');
        } else {
          this.particles.burst(eye.clone().addScaledVector(dir, 10), { color: spell.color, count: 8, speed: 3, life: 0.4, size: 0.3 });
        }
        break;
      }
      case 'self':
        if (spell.id === 'soin') {
          c.heal(Math.round(power));
          this.particles.burst(eye, { color: spell.color, count: 18, speed: 2.5, life: 0.9, size: 0.4, up: 3.5 });
        }
        break;
      case 'buff':
        c.buffs[spell.buff] = { until: this.time + spell.duration, amount: spell.power, power: spell.power };
        this.particles.burst(eye, { color: spell.color, count: 14, speed: 2, life: 0.8, size: 0.4, up: 2 });
        break;
      case 'dash':
        if (spell.dist) {
          const np = c.pos.clone().addScaledVector(dir, spell.dist);
          this.world.resolve(np, c.radius);
          this.particles.burst(c.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: spell.color, count: 16, speed: 4, life: 0.6, size: 0.4 });
          c.pos.x = np.x; c.pos.z = np.z;
          c.pos.y = this.world.heightAt(c.pos.x, c.pos.z);
          this.particles.burst(c.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: spell.color, count: 16, speed: 4, life: 0.6, size: 0.4 });
        } else {
          c.buffs.speed = { until: this.time + spell.duration };
        }
        break;
      case 'aoe':
        if (spell.self) {
          this.explode(c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), spell.color, spell.radius, power, { owner: 'player', caster: c, spell });
        } else {
          const pt = c.pos.clone().addScaledVector(dir, 9);
          this.addFireZone(pt, spell, power, c);
        }
        break;
    }
    this.audio.play(SPELL_SFX[spell.id] || 'cast');
    if (c.isPlayer) { this.ui.buildSpellbook(); this.ui.updateHUD(); }
  }

  explode(pos, color, radius, dmg, opts = {}) {
    pos.y = Math.max(pos.y, this.world.heightAt(pos.x, pos.z) + 0.4);
    this.particles.burst(pos, { color, count: 20, speed: 6.5, life: 0.75, size: 0.55 });
    this.flashLight(pos, color);
    if (opts.owner !== 'enemy') {
      this.audio.play('fire');
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = dist(e.pos.x, e.pos.z, pos.x, pos.z);
        if (d < radius + e.radius) {
          const dealt = dmg * (1 - 0.45 * (d / Math.max(radius, 0.1)));
          e.takeDamage(dealt, pos);
          if (opts.spell?.slow && !e.dead) { e.slowUntil = this.time + opts.spell.slowDur; e.slowFactor = 1 - opts.spell.slow; }
          if (opts.spell?.drain && opts.caster) opts.caster.heal(dealt * 0.5);
          if (!e.dead) this.ui.floatText(e.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), `-${Math.round(dealt)}`, '#ff8a66');
        }
      }
    } else {
      this.audio.play('nova');
      for (const c of this.allChampions()) {
        if (c.dead || c.ko) continue;
        const d = dist(c.pos.x, c.pos.z, pos.x, pos.z);
        if (d < radius + c.radius) c.takeDamage(dmg * (1 - 0.4 * d / radius), pos);
      }
    }
  }

  flashLight(pos, color) {
    const f = this.flashLights.find(fl => fl.t <= 0) || this.flashLights[0];
    f.light.position.set(pos.x, pos.y + 1.2, pos.z);
    f.light.color.set(color);
    f.light.intensity = 26;
    f.t = 0.25;
  }

  enemyShoot(enemy, target) {
    const from = enemy.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
    const to = target.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    const dir = to.sub(from).normalize();
    this.projectiles.push(new Projectile(this, {
      pos: from, dir, speed: 15, dmg: enemy.dmg(), radius: 1.3,
      color: enemy.def.final ? 0xc040ff : 0xff5040, owner: 'enemy',
    }));
    this.audio.play('shoot');
  }

  /* ---------------- Butin & interactions ---------------- */

  onEnemyKilled(e) {
    this.scene.remove(e.mesh);
    this.particles.burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: e.def.body, count: 22, speed: 5, life: 0.8, size: 0.5 });
    this.audio.play('hit');
    const g = e.def.gold;
    this.world.addCoinPile(e.pos.x + rand(-1, 1), e.pos.z + rand(-1, 1), clamp(Math.round(rand(g[0], g[1]) / 2) + 1, 1, 6));
    if (chance(0.35)) this.world.addGem(e.pos.x + rand(-1.5, 1.5), e.pos.z + rand(-1.5, 1.5), pick(GEM_ORDER));
    if (chance(0.12)) this.world.addPotion(e.pos.x + rand(-1, 1), e.pos.z + rand(-1, 1), chance(0.5) ? 'soin' : 'mana');
    if (e.type === 'necromancien') {
      this.dropKey(e.pos.x + 1.5, e.pos.z, 'cle_chateau');
      this.ui.toast('Le Nécromancien tombe… il lâche la Clé du Château !', 'quest');
    }
    for (const c of this.allChampions()) {
      if (c.dead || c.ko) continue;
      c.addXp(c.isPlayer ? e.def.xp : Math.round(e.def.xp * 0.5));
    }
    this.ui.floatText(e.pos.clone().add(new THREE.Vector3(0, 2, 0)), `+${e.def.xp} XP`, '#ffd97a');
    if (e.def.final) this.win();
  }

  dropKey(x, z, keyId) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 12), new THREE.MeshLambertMaterial({ color: 0xd9b545, emissive: 0x554411 }));
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), ring.material);
    stem.position.y = -0.35;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), ring.material);
    tooth.position.set(0.1, -0.55, 0);
    g.add(ring, stem, tooth);
    g.position.set(x, this.world.heightAt(x, z) + 0.5, z);
    this.scene.add(g);
    this.world.pickups.push({ kind: 'key', keyId, mesh: g, glow: null, x, y: this.world.heightAt(x, z) + 0.5, z, phase: 0 });
  }

  updatePickups() {
    const p = this.player;
    if (!p) return;
    for (const pk of [...this.world.pickups]) {
      if (dist(p.pos.x, p.pos.z, pk.x, pk.z) < 1.8 && Math.abs(p.pos.y - pk.y) < 2) {
        this.onPickup(pk);
        this.world.removePickup(pk);
      }
    }
  }

  onPickup(pk) {
    const p = this.player;
    switch (pk.kind) {
      case 'gem':
        p.giveGem(pk.school);
        this.audio.play('gem');
        this.ui.toast(`Gemme ${SCHOOLS[pk.school].name} obtenue ${SCHOOLS[pk.school].gem}`);
        break;
      case 'coin':
        p.gold += pk.value;
        this.audio.play('coin');
        break;
      case 'potion':
        p.potions[pk.ptype]++;
        this.audio.play('pickup');
        this.ui.toast(pk.ptype === 'soin' ? 'Potion de soin +1 🧪' : 'Potion de mana +1 🔷');
        break;
      case 'herb':
        p.herbs++;
        this.audio.play('pickup');
        this.ui.toast(`Herbe médicinale (${p.herbs}/3) 🌿`);
        if (p.herbs >= 3 && !this.sideQuest.done) this.ui.toast('Apportez-les au marchand Odo !', 'quest');
        break;
      case 'key':
        p.keys.add(pk.keyId);
        this.audio.play('quest');
        this.ui.toast(pk.keyId === 'cle_rouillee' ? 'Clé rouillée obtenue ! 🔑' : 'Clé du Château obtenue ! 🔑', 'quest');
        break;
    }
    this.particles.burst(new THREE.Vector3(pk.x, pk.y + 0.3, pk.z), { color: 0xffffff, count: 8, speed: 2.5, life: 0.5, size: 0.3 });
  }

  onChest(lootId, pos) {
    const loot = CHEST_LOOT[lootId] || CHEST_LOOT.default;
    this.audio.play('chest');
    this.particles.burst(pos, { color: 0xffd97a, count: 16, speed: 3.5, life: 0.8, size: 0.4, up: 3 });
    const p = this.player;
    const msgs = [];
    if (loot.key) { p.keys.add(loot.key); msgs.push(loot.key === 'cle_rouillee' ? 'Clé rouillée' : 'Clé du Château'); }
    if (loot.item) msgs.push(this.equipIfBetter(loot.item));
    if (loot.item2) msgs.push(this.equipIfBetter(loot.item2));
    if (loot.gems) for (let i = 0; i < loot.gems; i++) p.giveGem(pick(GEM_ORDER));
    if (loot.gold) { const g = Math.round(rand(loot.gold[0], loot.gold[1])); p.gold += g; msgs.push(`${g} or`); }
    if (loot.potions) for (const [k, n] of Object.entries(loot.potions)) { p.potions[k] += n; msgs.push(`${n}× potion ${k}`); }
    this.ui.toast(`Coffre : ${msgs.join(', ') || '…'}`, 'quest');
  }

  equipIfBetter(itemId) {
    const item = ITEMS[itemId];
    const p = this.player;
    if (item.slot === 'weapon') {
      if (item.dmg > p.weapon.dmg) { const old = p.weapon.name; p.weapon = item; p.refreshWeaponMesh(); return `${item.name} (remplace ${old})`; }
      return null;
    }
    if (item.slot === 'armor') {
      if (item.armor > (p.armor?.armor || 0)) { const old = p.armor.name; p.armor = item; return `${item.name} (remplace ${old})`; }
      return null;
    }
    if (item.slot === 'shield') {
      if (!p.shield || item.armor > p.shield.armor) { const old = p.shield ? p.shield.name : 'rien'; p.shield = item; return `${item.name} (remplace ${old})`; }
      return null;
    }
    return null;
  }

  updateInteract() {
    const p = this.player;
    if (!p) { this.ui.prompt(null); return; }
    let best = null, bestD = 1e9;
    for (const it of this.world.interactables) {
      if (!it.enabled()) continue;
      const label = it.label();
      if (!label) continue;
      const d = dist(p.pos.x, p.pos.z, it.x, it.z);
      if (d < it.r + 1.0 && d < bestD) { bestD = d; best = { it, label }; }
    }
    this.interactTarget = best ? best.it : null;
    this.ui.prompt(best ? `<b>E</b> — ${best.label}` : null);
  }

  tryInteract() {
    if (this.interactTarget) this.interactTarget.action();
  }

  useTeleporter(tp) {
    const other = this.world.teleporters.find(t => t.pair === tp.pair && t !== tp);
    if (!other) return;
    const p = this.player;
    this.particles.burst(p.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: 0x66ffee, count: 24, speed: 5, life: 0.9, size: 0.45 });
    const nx = other.x + 1.6, nz = other.z + 1.6;
    p.pos.set(nx, this.world.heightAt(nx, nz), nz);
    for (const c of this.companions) c.pos.set(nx + rand(-1.5, 1.5), this.world.heightAt(nx, nz), nz + rand(-1.5, 1.5));
    this.particles.burst(p.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: 0x66ffee, count: 24, speed: 5, life: 0.9, size: 0.45 });
    this.audio.play('teleport');
    this.ui.toast('Téléportation !');
  }

  /* ---------------- PNJ & dialogues ---------------- */

  talkTo(npcDef) {
    this.audio.play('ui');
    const p = this.player;
    if (npcDef.id === 'elder') {
      if (!this.flags.intro) {
        this.ui.dialog(npcDef.name, `Zendrick le Traître a tué le Grand Dragon et bâtit quatre tours qui drainent la vie de Trazère. Quatre cristaux ont été cachés : la ruine de la forêt (Dragon), la crypte (Lune), la tour de guet (Serpent) et la caverne (Chaos). Ramenez-les à l'autel du château, puis terrassez Zendrick.`, [
          { label: 'J’accepte la quête !', cb: () => { this.flags.intro = true; this.audio.play('quest'); this.ui.toast('Quête principale mise à jour', 'quest'); } },
          { label: 'Au revoir', cb: () => {} },
        ]);
      } else {
        const n = this.crystalCount();
        const hint = n >= 4 ? 'Tous les cristaux sont à vous ! Allez au château (nord) et déposez-les sur l’autel.'
          : this.hasKey('cle_chateau') ? 'Vous avez la Clé du Château : direction le château au nord !'
          : this.hasKey('cle_rouillee') ? 'La crypte à l’est s’ouvre avec votre clé. Le levier BLEU révélera le Cristal de la Lune.'
          : 'Explorez l’ouest : la ruine de la forêt cache le Cristal du Dragon (levier ROUGE), et un coffre contient la Clé rouillée.';
        this.ui.dialog(npcDef.name, `Que les Bloodwych veillent sur vous, ${p.def.name}.\n\n${hint}`, [
          { label: 'Merci, Aîné.', cb: () => {} },
        ]);
      }
    } else if (npcDef.id === 'merchant') {
      const opts = [];
      opts.push({ label: 'Potion de soin — 15 or', cb: () => this.buy('soin') });
      opts.push({ label: 'Potion de mana — 10 or', cb: () => this.buy('mana') });
      opts.push({ label: 'Gemme aléatoire — 25 or', cb: () => this.buy('gem') });
      if (!this.sideQuest.done) {
        if (p.herbs >= 3) opts.push({ label: `Lui donner les 3 herbes médicinales (${SIDE_QUEST.text})`, cb: () => {
          p.herbs -= 3; this.sideQuest.done = true;
          p.potions.soin += 3; p.gold += 10; p.giveGem(pick(GEM_ORDER)); p.giveGem(pick(GEM_ORDER));
          this.audio.play('quest');
          this.ui.toast('Quête secondaire terminée : 3 potions de soin, 2 gemmes, 10 or !', 'quest');
        } });
        else opts.push({ label: `Herbes médicinales pour Odo (${p.herbs}/3) — forêt ouest`, cb: () => this.ui.toast('Trouvez 3 herbes lumineuses dans la forêt.', '') });
      }
      opts.push({ label: 'Au revoir', cb: () => {} });
      this.ui.dialog(npcDef.name, `Bien le bonjour, voyageur ! Odo, à votre service. J’achète aussi les herbes médicinales (3 contre des potions). Vous avez ${p.gold} or.`, opts);
    } else if (npcDef.recruit) {
      const comp = this.companionById(npcDef.recruit);
      if (comp) {
        this.ui.dialog(npcDef.name, 'Je combats à vos côtés, chef !', [{ label: 'Au revoir', cb: () => {} }]);
      } else if (this.companions.length >= 2) {
        this.ui.dialog(npcDef.name, 'Votre groupe est déjà complet (3 champions max).', [{ label: 'Au revoir', cb: () => {} }]);
      } else {
        const def = CHAMPIONS.find(c => c.id === npcDef.recruit);
        this.ui.dialog(npcDef.name, `${def.name}, ${def.cls} de l’école ${SCHOOLS[def.school].name}. « Rejoindre votre groupe ? »`, [
          { label: `Recruter ${def.name}`, cb: () => this.recruit(def) },
          { label: 'Plus tard', cb: () => {} },
        ]);
      }
    }
  }

  buy(kind) {
    const p = this.player;
    const price = kind === 'soin' ? 15 : kind === 'mana' ? 10 : 25;
    if (p.gold < price) { this.ui.toast('Pas assez d’or !', 'bad'); this.audio.play('fizzle'); return; }
    p.gold -= price;
    if (kind === 'soin') p.potions.soin++;
    else if (kind === 'mana') p.potions.mana++;
    else p.giveGem(pick(GEM_ORDER));
    this.audio.play('coin');
    this.ui.toast('Acheté !');
    this.ui.updateHUD();
  }

  recruit(def) {
    const c = new Champion(this, def, false);
    c.place(this.player.pos.x + rand(-2, 2), this.player.pos.z + rand(-2, 2));
    this.companions.push(c);
    this.audio.play('recruit');
    this.ui.toast(`${def.name} rejoint le groupe !`, 'quest');
    this.ui.buildParty();
  }

  /* ---------------- Quêtes & cristaux ---------------- */

  questDone(id) {
    const p = this.player;
    switch (id) {
      case 'intro': return !!this.flags.intro;
      case 'ruin': return p.crystals.has('dragon');
      case 'key': return p.keys.has('cle_rouillee');
      case 'crypt': return p.crystals.has('lune');
      case 'tower': return p.crystals.has('serpent');
      case 'cave': return p.crystals.has('chaos');
      case 'castle': return !!(this.world.castleGate && this.world.castleGate.opened);
      case 'altar': return !!this.flags.altar;
      case 'boss': return !!this.flags.bossDead;
    }
    return false;
  }

  recomputeQuest(force = false) {
    let step = 0;
    while (step < MAIN_QUEST.length && this.questDone(MAIN_QUEST[step].id)) step++;
    if (step !== this.questStep || force) {
      const prev = this.questStep;
      this.questStep = step;
      if (!force && step > prev && step < MAIN_QUEST.length) {
        this.audio.play('quest');
        this.ui.toast(`Quête : ${MAIN_QUEST[step].title}`, 'quest');
      }
    }
  }

  takeCrystal(school) {
    const p = this.player;
    if (p.crystals.has(school)) return;
    p.crystals.add(school);
    const cr = this.world.crystals[school];
    cr.taken = true;
    this.scene.remove(cr.mesh);
    this.scene.remove(cr.glow);
    this.audio.play('crystal');
    this.particles.burst(new THREE.Vector3(cr.x, this.world.heightAt(cr.x, cr.z) + 2, cr.z), { color: SCHOOLS[school].color, count: 30, speed: 6, life: 1, size: 0.5 });
    this.ui.toast(`Cristal de ${SCHOOLS[school].name} récupéré ! (${p.crystals.size}/4)`, 'quest');
    if (p.crystals.size >= 4) this.ui.toast('Les 4 cristaux ! Déposez-les sur l’autel du château.', 'quest');
    this.recomputeQuest();
  }

  placeCrystals() {
    if (this.crystalCount() < 4) return;
    this.flags.altar = true;
    this.player.crystals.clear();
    this.world.openDoor(this.world.bossDoor);
    const bs = this.world.bossSpawn;
    this.boss = this.spawnEnemy('zandrick', bs.x, bs.z);
    this.bossFightTime = 0;
    this.ui.bossBar(true, 1);
    this.audio.play('boss');
    this.ui.toast('La porte du trône s’ouvre… ZENDRICK !', 'bad');
    this.recomputeQuest();
  }

  onLevelUp(c) {
    this.audio.play('level');
    this.particles.burst(c.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), { color: 0xffd97a, count: 30, speed: 5, life: 1.1, size: 0.5, up: 4 });
    if (c.isPlayer) {
      const newly = spellsKnown(c.level).filter(s => !spellsKnown(c.level - 1).map(x => x.id).includes(s.id));
      if (newly.length) this.ui.toast(`Niveau ${c.level} ! Nouveau sort : ${newly.map(s => s.name).join(', ')}`, 'quest');
      else this.ui.toast(`Niveau ${c.level} !`, 'quest');
      this.ui.buildSpellbook();
    }
  }

  /* ---------------- Mort & victoire ---------------- */

  onPlayerDeath() {
    if (this.state !== 'play') return;
    this.state = 'dead';
    this.player.dead = true;
    this.audio.play('death');
    document.exitPointerLock?.();
    this.ui.showDeath(true);
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = p.maxHp();
    p.mana = p.maxMana();
    p.xp = Math.floor(p.xp * 0.9);
    p.place(this.world.spawnPoint.x, this.world.spawnPoint.z);
    for (const c of this.companions) { if (c.ko) { c.ko = false; c.hp = c.maxHp(); } c.pos.set(p.pos.x + rand(-2, 2), p.pos.y, p.pos.z + rand(-2, 2)); }
    this.state = 'play';
    this.ui.showDeath(false);
    this.ui.toast('Vous vous relevez au village de Sanglune. (-10% XP)', 'bad');
    this.lockPointer();
  }

  win() {
    if (this.state === 'win') return;
    this.flags.bossDead = true;
    this.state = 'win';
    this.ui.bossBar(false, 0);
    this.audio.play('win');
    document.exitPointerLock?.();
    const m = Math.floor(this.time / 60), s = Math.floor(this.time % 60);
    this.ui.showWin(`${m} min ${s.toString().padStart(2, '0')} s — niveau ${this.player.level}, ${this.player.gold} or`);
  }
}
