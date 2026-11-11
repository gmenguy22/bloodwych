import * as THREE from 'three';
import { SCHOOLS, ENEMY_TYPES, ITEMS, spellsKnown } from './data.js';
import { clamp, lerp, dist, makeGlowTexture } from './util.js';

let nextId = 1;
const skinMat = new THREE.MeshLambertMaterial({ color: 0xd8b090, flatShading: true });

function humanoidMesh(robeColor, scale = 1, hatColor = null) {
  const g = new THREE.Group();
  const robe = new THREE.MeshLambertMaterial({ color: robeColor, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.42 * scale, 1.15 * scale, 7), robe);
  body.position.y = 0.58 * scale;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21 * scale, 8, 6), skinMat);
  head.position.y = 1.32 * scale;
  head.castShadow = true;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3 * scale, 0.75 * scale, 7),
    new THREE.MeshLambertMaterial({ color: hatColor !== null ? hatColor : robeColor, flatShading: true }));
  hat.position.y = 1.68 * scale;
  hat.castShadow = true;
  g.add(body, head, hat);
  return g;
}

export class Champion {
  constructor(game, def, isPlayer = false) {
    this.game = game;
    this.def = def;
    this.isPlayer = isPlayer;
    this.id = nextId++;
    this.level = 1;
    this.xp = 0;
    this.str = def.str; this.agi = def.agi; this.int = def.int; this.cha = def.cha;
    this.hp = this.maxHp();
    this.mana = this.maxMana();
    this.gems = { dragon: 0, lune: 0, serpent: 0, chaos: 0 };
    this.potions = { soin: 2, mana: 0 };
    this.gold = 10;
    this.weapon = ITEMS.baton;
    this.armor = ITEMS.tunique;
    this.shield = null;
    this.keys = new Set();
    this.crystals = new Set();
    this.herbs = 0;
    this.practice = {};
    this.prepared = null;
    this.buffs = {};
    this.attackCd = 0;
    this.castCd = 0;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.45;
    this.onGround = true;
    this.dead = false;
    this.ko = false;
    this.koTimer = 0;
    this.blocking = false;
    this.swing = 0;
    this.buildMesh();
  }

  maxHp() { return this.def.hp + this.str * 2 + (this.level - 1) * 14; }
  maxMana() { return 40 + this.int * 4 + (this.level - 1) * 10; }
  xpNeed() { return Math.round(60 * Math.pow(this.level, 1.35)); }
  hasBuff(name) { const b = this.buffs[name]; return b && this.game.time < b.until; }
  armorValue() {
    let a = (this.armor?.armor || 0) + (this.shield?.armor || 0);
    if (this.hasBuff('armor')) a += this.buffs.armor.power;
    return a;
  }
  meleeDmg() {
    let d = this.weapon.dmg + this.str * 0.8;
    if (this.hasBuff('power')) d *= 2;
    return Math.round(d);
  }
  moveSpeed() {
    let s = 5.6 + this.agi * 0.12;
    if (this.hasBuff('speed')) s *= 2;
    if (this.blocking) s *= 0.45;
    return s;
  }
  knownSpellIds() { return spellsKnown(this.level).map(s => s.id); }

  buildMesh() {
    const s = SCHOOLS[this.def.school];
    this.mesh = humanoidMesh(s.color, 1, 0x2a2018);
    // bâton
    const staff = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 5),
      new THREE.MeshLambertMaterial({ color: 0x5a4028, flatShading: true }));
    stick.position.y = 0.85;
    stick.castShadow = true;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.13),
      new THREE.MeshLambertMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.9 }));
    orb.position.y = 1.75;
    this.staffOrb = orb;
    staff.add(stick, orb);
    staff.position.set(0.45, 0, 0.1);
    this.mesh.add(staff);
    this.weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xb8bcc4, flatShading: true }));
    this.weaponMesh.position.set(0.5, 0.9, 0.15);
    this.weaponMesh.rotation.z = 0.5;
    this.weaponMesh.castShadow = true;
    this.weaponMesh.visible = false;
    this.mesh.add(this.weaponMesh);
    this.game.scene.add(this.mesh);
  }

  refreshWeaponMesh() {
    if (this.weapon.slot !== 'weapon') return;
    this.weaponMesh.visible = this.weapon !== ITEMS.baton;
  }

  place(x, z) {
    this.pos.set(x, this.game.world.heightAt(x, z), z);
    this.mesh.position.copy(this.pos);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.02;
    if (this.swing > 0) {
      this.weaponMesh.rotation.x = lerp(-1.2, 0.6, this.swing);
      this.staffOrb.rotation.y += dt * 10;
    }
    this.mesh.rotation.y = this.yaw;
  }

  takeDamage(amount, srcPos = null) {
    if (this.dead || this.ko) return;
    let dmg = amount;
    const sh = this.buffs.shield;
    if (sh && this.game.time < sh.until && sh.amount > 0) {
      const absorbed = Math.min(sh.amount, dmg);
      sh.amount -= absorbed;
      dmg -= absorbed;
      this.game.ui.toast(`${this.def.name} : bouclier -${Math.round(absorbed)}`, '');
    }
    dmg = Math.max(1, Math.round(dmg - this.armorValue() * 0.6));
    if (this.blocking) dmg = Math.max(1, Math.round(dmg * 0.35));
    this.hp -= dmg;
    this.game.audio.play('hurt');
    if (srcPos) {
      const dx = this.pos.x - srcPos.x, dz = this.pos.z - srcPos.z;
      const d = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
      this.vel.x += (dx / d) * 4;
      this.vel.z += (dz / d) * 4;
    }
    if (this.isPlayer) this.game.ui.damageFlash();
    if (this.hp <= 0) {
      this.hp = 0;
      if (this.isPlayer) this.game.onPlayerDeath();
      else { this.ko = true; this.koTimer = 12; this.hp = 0; this.game.ui.toast(`${this.def.name} est à terre !`, 'bad'); }
    }
  }

  heal(n) {
    if (this.dead || this.ko) return;
    this.hp = Math.min(this.maxHp(), this.hp + n);
  }

  addXp(n) {
    if (this.dead) return;
    this.xp += n;
    while (this.xp >= this.xpNeed()) {
      this.xp -= this.xpNeed();
      this.level++;
      this.str += 1; this.agi += 1; this.int += 2; this.cha += 1;
      this.hp = this.maxHp();
      this.mana = this.maxMana();
      this.game.onLevelUp(this);
    }
  }

  drinkPotion(ptype) {
    if (this.potions[ptype] <= 0) { this.game.ui.toast('Plus de potion.', 'bad'); return false; }
    if (ptype === 'soin' && this.hp >= this.maxHp()) { this.game.ui.toast('PV déjà au maximum.', ''); return false; }
    if (ptype === 'mana' && this.mana >= this.maxMana()) { this.game.ui.toast('Mana déjà plein.', ''); return false; }
    this.potions[ptype]--;
    if (ptype === 'soin') { this.heal(55); this.game.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: 0x66ff88, count: 16, speed: 2.5, life: 0.8, size: 0.35, up: 3 }); }
    else { this.mana = this.maxMana(); this.game.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: 0x66aaff, count: 16, speed: 2.5, life: 0.8, size: 0.35, up: 3 }); }
    this.game.audio.play('potion');
    return true;
  }

  giveGem(school) { this.gems[school]++; }

  update(dt) {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.castCd = Math.max(0, this.castCd - dt);
    this.swing = Math.max(0, this.swing - dt * 4);
    if (this.ko) {
      this.koTimer -= dt;
      if (this.koTimer <= 0) {
        this.ko = false;
        this.hp = this.maxHp();
        this.mana = this.maxMana();
        this.place(this.game.world.spawnPoint.x, this.game.world.spawnPoint.z);
        this.game.ui.toast(`${this.def.name} est de retour !`);
      }
    }
  }
}

/* ---------------- Compagnon (IA) ---------------- */

export function updateCompanionAI(c, dt) {
  const game = c.game;
  if (c.ko || c.dead) return;
  const p = game.player;
  const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  // trouver une cible ennemie
  let target = null, bestD = 16;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const ed = dist(c.pos.x, c.pos.z, e.pos.x, e.pos.z);
    if (ed < bestD) { bestD = ed; target = e; }
  }
  c.yaw = Math.atan2(dx, dz);
  if (target) {
    const ex = target.pos.x - c.pos.x, ez = target.pos.z - c.pos.z;
    const ed = Math.sqrt(ex * ex + ez * ez);
    c.yaw = Math.atan2(ex, ez);
    if (ed > 2.2) {
      c.pos.x += (ex / ed) * c.moveSpeed() * 0.9 * dt;
      c.pos.z += (ez / ed) * c.moveSpeed() * 0.9 * dt;
    } else if (c.attackCd <= 0) {
      c.attackCd = 0.7;
      c.swing = 1;
      game.audio.play('swing');
      target.takeDamage(c.meleeDmg(), c.pos);
    } else if (ed < 9 && c.mana >= 10 && c.castCd <= 0) {
      // le compagnon lance parfois un sort de son école
      const schoolSpells = game.spellList.filter(s => s.school === c.def.school && c.knownSpellIds().includes(s.id) && s.type === 'projectile');
      if (schoolSpells.length) {
        const sp = schoolSpells[0];
        c.castCd = 3.5;
        game.castSpell(c, sp, true);
      }
    }
  } else if (d > 4) {
    c.pos.x += (dx / d) * c.moveSpeed() * dt;
    c.pos.z += (dz / d) * c.moveSpeed() * dt;
  }
  game.world.resolve(c.pos, c.radius);
  c.pos.y = game.world.heightAt(c.pos.x, c.pos.z);
  c.mana = Math.min(c.maxMana(), c.mana + dt * 3.5);
  c.syncMesh(dt);
}

/* ---------------- Ennemis ---------------- */

export class Enemy {
  constructor(game, type, x, z) {
    this.game = game;
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.id = nextId++;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.pos = new THREE.Vector3(x, game.world.heightAt(x, z), z);
    this.radius = 0.55 * this.def.scale;
    this.attackCd = 0;
    this.shootCd = 2;
    this.dead = false;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.flash = 0;
    this.bossPhase = 0;
    this.novaCd = 8;
    this.summoned = 0;
    this.enraged = false;
    this.home = { x, z };
    this.buildMesh();
  }

  buildMesh() {
    const s = this.def.scale;
    const col = this.def.body;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({
      color: col, flatShading: true,
      transparent: !!this.def.ethereal, opacity: this.def.ethereal ? 0.65 : 1,
    });
    this.bodyMat = bodyMat;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 1.1 * s, 7), bodyMat);
    body.position.y = 0.55 * s;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 8, 6),
      new THREE.MeshLambertMaterial({ color: this.def.ethereal ? 0xcfe4ff : 0xd8d0c0, flatShading: true, transparent: !!this.def.ethereal, opacity: this.def.ethereal ? 0.7 : 1 }));
    head.position.y = 1.28 * s;
    head.castShadow = true;
    g.add(body, head);
    // yeux
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 6, 4), eyeMat);
      eye.position.set(side * 0.09 * s, 1.32 * s, 0.18 * s);
      g.add(eye);
    }
    if (this.def.boss) {
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.5 * s, 5),
          new THREE.MeshLambertMaterial({ color: 0x1a0a24, flatShading: true }));
        horn.position.set(side * 0.16 * s, 1.62 * s, 0);
        horn.rotation.z = -side * 0.5;
        horn.castShadow = true;
        g.add(horn);
      }
      const glowTex = makeGlowTexture();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xa030ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.y = 1.1 * s;
      glow.scale.set(2.4 * s, 2.4 * s, 1);
      g.add(glow);
    }
    if (!this.def.ranged && !this.def.boss) {
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.8 * s, 0.07 * s),
        new THREE.MeshLambertMaterial({ color: 0xb8bcc4, flatShading: true }));
      sword.position.set(0.45 * s, 0.8 * s, 0.1);
      sword.rotation.z = 0.6;
      sword.castShadow = true;
      this.weaponMesh = sword;
      g.add(sword);
    }
    this.mesh = g;
    this.mesh.position.copy(this.pos);
    this.game.scene.add(g);
  }

  speed() {
    let s = this.def.speed * (this.game.time < this.slowUntil ? this.slowFactor : 1);
    if (this.enraged) s *= 1.25;
    return s;
  }

  dmg() {
    let d = this.def.dmg;
    if (this.enraged) d = Math.round(d * 1.6);
    return d;
  }

  takeDamage(dmg, srcPos = null) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.12;
    this.bodyMat.emissive = new THREE.Color(0xff4040);
    if (srcPos) {
      const dx = this.pos.x - srcPos.x, dz = this.pos.z - srcPos.z;
      const d = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
      this.pos.x += (dx / d) * 0.5;
      this.pos.z += (dz / d) * 0.5;
    }
    if (this.hp <= 0) {
      this.dead = true;
      this.game.onEnemyKilled(this);
    }
  }

  update(dt) {
    if (this.dead) return;
    const game = this.game;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.flash <= 0) this.bodyMat.emissive = new THREE.Color(0x000000);

    // cible : champion le plus proche en vie
    let target = null, bestD = this.def.aggro * this.def.aggro;
    for (const c of game.allChampions()) {
      if (c.dead || c.ko) continue;
      const d2 = (c.pos.x - this.pos.x) ** 2 + (c.pos.z - this.pos.z) ** 2;
      if (d2 < bestD) { bestD = d2; target = c; }
    }
    if (this.def.boss) { target = game.player.dead ? null : game.player; bestD = 1e9; }

    if (target) {
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
      const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
      this.mesh.rotation.y = Math.atan2(dx, dz);
      const sp = this.speed();
      if (this.def.ranged) {
        const want = 9;
        if (d > want + 2) { this.pos.x += (dx / d) * sp * dt; this.pos.z += (dz / d) * sp * dt; }
        else if (d < want - 3) { this.pos.x -= (dx / d) * sp * dt; this.pos.z -= (dz / d) * sp * dt; }
        if (d < 22 && this.shootCd <= 0) {
          this.shootCd = this.def.final ? 2.0 : 2.6;
          game.enemyShoot(this, target);
        }
      } else {
        if (d > this.radius + target.radius + 0.7) {
          this.pos.x += (dx / d) * sp * dt;
          this.pos.z += (dz / d) * sp * dt;
        } else if (this.attackCd <= 0) {
          this.attackCd = 1.1;
          if (this.weaponMesh) this.weaponMesh.rotation.x = -1.4;
          target.takeDamage(this.dmg(), this.pos);
        }
      }
      // boss Zendrick : phases
      if (this.def.final) this.updateBoss(dt, target);
    } else {
      // patrouille autour du point de spawn
      const dx = this.home.x - this.pos.x, dz = this.home.z - this.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 2) { this.pos.x += (dx / d) * this.def.speed * 0.4 * dt; this.pos.z += (dz / d) * this.def.speed * 0.4 * dt; }
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    game.world.resolve(this.pos, this.radius);
    this.pos.y = game.world.heightAt(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    if (this.weaponMesh && this.attackCd < 0.9) this.weaponMesh.rotation.x = 0;
  }

  updateBoss(dt, target) {
    const game = this.game;
    const frac = this.hp / this.maxHp;
    if (!this.enraged && game.bossFightTime > 240) {
      this.enraged = true;
      game.ui.toast('Zendrick entre en rage !', 'bad');
      game.audio.play('boss');
    }
    if (frac < 0.66 && this.bossPhase < 1) {
      this.bossPhase = 1;
      game.summonAt('cultiste', this.pos.x + 3, this.pos.z);
      game.summonAt('cultiste', this.pos.x - 3, this.pos.z);
      game.ui.toast('Zendrick invoque des cultistes !', 'bad');
      game.audio.play('boss');
    }
    if (frac < 0.33 && this.bossPhase < 2) {
      this.bossPhase = 2;
      game.summonAt('spectre', this.pos.x + 3, this.pos.z + 2);
      game.summonAt('spectre', this.pos.x - 3, this.pos.z - 2);
      game.ui.toast('Zendrick invoque des spectres !', 'bad');
      game.audio.play('boss');
    }
    if (frac < 0.5) {
      this.novaCd -= dt;
      if (this.novaCd <= 0) {
        this.novaCd = 8;
        game.bossNova(this.pos.clone());
      }
    }
  }
}

/* ---------------- Projectiles ---------------- */

export class Projectile {
  constructor(game, opts) {
    this.game = game;
    this.pos = opts.pos.clone();
    this.vel = opts.dir.clone().multiplyScalar(opts.speed);
    this.dmg = opts.dmg;
    this.radius = opts.radius || 1.6;
    this.owner = opts.owner; // 'player' | 'enemy'
    this.spell = opts.spell || null;
    this.caster = opts.caster || null;
    this.life = opts.life || 3;
    this.color = opts.color || 0xffaa33;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshLambertMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 1.2 }));
    m.position.copy(this.pos);
    this.mesh = m;
    const glowTex = makeGlowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: this.color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.6, 1.6, 1);
    m.add(glow);
    game.scene.add(m);
  }

  update(dt) {
    this.life -= dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    const ground = this.game.world.heightAt(this.pos.x, this.pos.z);
    if (this.life <= 0 || this.pos.y < ground + 0.15) {
      this.game.explode(this.pos, this.color, this.spell?.radius || this.radius, this.dmg, { owner: this.owner, spell: this.spell, caster: this.caster });
      return false;
    }
    if (this.owner !== 'enemy') {
      for (const e of this.game.enemies) {
        if (e.dead) continue;
        const d2 = (e.pos.x - this.pos.x) ** 2 + (e.pos.z - this.pos.z) ** 2 + (e.pos.y + 0.8 - this.pos.y) ** 2;
        if (d2 < (e.radius + this.radius) ** 2) {
          this.game.explode(this.pos, this.color, this.spell?.radius || this.radius, this.dmg, { owner: this.owner, spell: this.spell, caster: this.caster, directHit: e });
          return false;
        }
      }
    } else {
      for (const c of this.game.allChampions()) {
        if (c.dead || c.ko) continue;
        const d2 = (c.pos.x - this.pos.x) ** 2 + (c.pos.z - this.pos.z) ** 2 + (c.pos.y + 0.9 - this.pos.y) ** 2;
        if (d2 < (c.radius + this.radius) ** 2) {
          c.takeDamage(this.dmg, this.pos);
          this.game.particles.burst(this.pos, { color: this.color, count: 10, speed: 3, life: 0.5, size: 0.4 });
          return false;
        }
      }
    }
    return true;
  }

  dispose() { this.game.scene.remove(this.mesh); }
}

/* ---------------- PNJ ---------------- */

export class NPC {
  constructor(game, x, z, def) {
    this.game = game;
    this.def = def;
    this.pos = new THREE.Vector3(x, game.world.heightAt(x, z), z);
    this.mesh = humanoidMesh(def.color, 1, 0x3a2a1a);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    game.world.addColliderCircle(x, z, 0.6);
    this.yaw = def.yaw || 0;
  }
  update(dt, t) {
    this.mesh.position.y = this.pos.y + Math.sin(t * 2 + this.pos.x) * 0.04;
    this.mesh.rotation.y = this.yaw;
  }
}
