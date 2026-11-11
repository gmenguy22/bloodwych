import * as THREE from 'three';
import { SCHOOLS, CHAMPIONS, SPELLS, MAIN_QUEST, SIDE_QUEST, ITEMS, GEM_ORDER, spellsKnown, castChance, manaCost } from './data.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.panelOpen = null;
    this.dialogOpen = false;
    this.toastCount = 0;
    $('btn-play').addEventListener('click', () => {
      if (this.game.selectedChampion) this.game.startGame(this.game.selectedChampion);
    });
  }

  /* ---------------- Écran titre ---------------- */

  buildTitle() {
    const box = $('title-champs');
    box.innerHTML = '';
    for (const c of CHAMPIONS) {
      const s = SCHOOLS[c.school];
      const card = document.createElement('div');
      card.className = 'champ';
      card.innerHTML = `
        <div class="cicon">${c.icon}</div>
        <div class="cname">${c.name}</div>
        <div class="ccls">${c.cls}</div>
        <div class="cschool" style="color:${s.css}">École ${s.name} — ${s.desc}</div>
        <div class="cstats">FOR ${c.str} · AGI ${c.agi}<br>INT ${c.int} · CHA ${c.cha}<br>PV ${c.hp}</div>
        <div class="cdesc">${c.desc}</div>`;
      card.addEventListener('click', () => {
        this.game.audio.ensure();
        this.game.audio.play('ui');
        document.querySelectorAll('.champ').forEach(el => el.classList.remove('selected'));
        card.classList.add('selected');
        this.game.selectedChampion = c.id;
        $('btn-play').disabled = false;
      });
      box.appendChild(card);
    }
  }

  hideTitle() { $('title').classList.add('hidden'); }
  showHUD() { $('hud').classList.remove('hidden'); this.buildParty(); }

  /* ---------------- HUD ---------------- */

  buildParty() {
    const box = $('party');
    box.innerHTML = '';
    for (const c of this.game.companions) {
      const div = document.createElement('div');
      div.className = 'member';
      div.id = `member-${c.id}`;
      const s = SCHOOLS[c.school];
      div.innerHTML = `<div class="mname" style="color:${s.css}">${c.def.icon} ${c.def.name.split(' ')[0]}</div>
        <div class="bar hp"><div class="fill" style="width:100%"></div><span class="barlabel"></span></div>`;
      box.appendChild(div);
    }
  }

  updateHUD() {
    const g = this.game, p = g.player;
    if (!p) return;
    $('pname').textContent = p.def.name;
    $('plevel').textContent = `Niv. ${p.level} · ${p.def.cls}`;
    $('hpfill').style.width = `${clamp(p.hp / p.maxHp() * 100, 0, 100)}%`;
    $('hptxt').textContent = `${Math.ceil(p.hp)} / ${p.maxHp()}`;
    $('manafill').style.width = `${clamp(p.mana / p.maxMana() * 100, 0, 100)}%`;
    $('manatxt').textContent = `${Math.floor(p.mana)} / ${p.maxMana()} mana`;
    $('xpfill').style.width = `${clamp(p.xp / p.xpNeed() * 100, 0, 100)}%`;
    $('gold').textContent = `🪙 ${p.gold}`;
    $('potioncount').textContent = `🧪 ${p.potions.soin}+🔷${p.potions.mana}`;
    for (const s of GEM_ORDER) $(`gem_${s}`).textContent = `${SCHOOLS[s].gem} ${p.gems[s]}`;
    const keys = [...p.keys].map(k => k === 'cle_rouillee' ? '🔑 Clé rouillée' : '🔑 Clé du Château').join(' · ');
    $('keys').textContent = (keys ? keys + ' · ' : '') + (p.crystals.size ? `💎 Cristaux ${p.crystals.size}/4` : '');
    $('prepname').textContent = p.prepared ? SPELLS.find(s => s.id === p.prepared).name : 'aucun';
    // buffs
    const buffs = [];
    for (const [name, b] of Object.entries(p.buffs)) {
      if (g.time < b.until) buffs.push(`${name === 'shield' ? '🛡️' : name === 'armor' ? '🪨' : name === 'power' ? '⚔️' : '💨'} ${Math.ceil(b.until - g.time)}s`);
    }
    $('buffs').innerHTML = buffs.map(b => `<span class="buff">${b}</span>`).join('');
    // compagnons
    for (const c of g.companions) {
      const el = $(`member-${c.id}`);
      if (el) {
        const fill = el.querySelector('.fill');
        const lab = el.querySelector('.barlabel');
        fill.style.width = `${clamp(c.hp / c.maxHp() * 100, 0, 100)}%`;
        lab.textContent = c.ko ? 'K.O.' : `${Math.ceil(c.hp)}`;
      }
    }
    // quête
    const q = MAIN_QUEST[g.questStep];
    if (q) {
      $('qt-title').textContent = `Quête — ${q.title}`;
      $('qt-text').textContent = q.text + (g.sideQuest.done || g.sideQuest.herbs === 0 ? '' : ` · Secondaire : herbes ${g.player.herbs}/3`);
    } else {
      $('qt-title').textContent = 'Quête terminée';
      $('qt-text').textContent = 'Victoire !';
    }
  }

  /* ---------------- Grimoire ---------------- */

  buildSpellbook() {
    const g = this.game, p = g.player;
    const list = $('spellbook-list');
    list.innerHTML = '';
    if (!p) return;
    const known = p.knownSpellIds();
    for (const sp of SPELLS) {
      const s = SCHOOLS[sp.school];
      const isKnown = known.includes(sp.id);
      const div = document.createElement('div');
      div.className = `spell school-${sp.school}` + (p.prepared === sp.id ? ' prepared' : '') + (isKnown ? '' : ' locked');
      const cost = isKnown ? manaCost(p, sp) : '—';
      const ch = isKnown ? `${Math.round(castChance(p, sp) * 100)}%` : `niv. ${sp.level}`;
      div.innerHTML = `<div class="sname" style="color:${s.css}">${sp.name}</div>
        <div class="smeta">${sp.desc}<br>Coût : ${cost} mana · Réussite : ${ch}</div>`;
      if (isKnown) {
        div.addEventListener('click', () => g.prepareSpell(sp.id));
        div.addEventListener('dblclick', () => { g.prepareSpell(sp.id); g.castPrepared(); });
      }
      list.appendChild(div);
    }
  }

  /* ---------------- Panneaux ---------------- */

  anyPanelOpen() { return !!this.panelOpen; }

  togglePanel(name) {
    if (this.panelOpen === name) { this.closePanels(); return; }
    this.closePanels();
    this.panelOpen = name;
    $(name).classList.remove('hidden');
    if (name === 'spellbook') this.buildSpellbook();
    if (name === 'inventory') this.buildInventory();
    if (name === 'questlog') this.buildQuestlog();
    if (document.pointerLockElement) document.exitPointerLock();
    this.game.audio.play('ui');
  }

  closePanels() {
    if (this.panelOpen) {
      $(this.panelOpen).classList.add('hidden');
      this.panelOpen = null;
      if (this.game.state === 'play') this.game.lockPointer();
    }
  }

  buildInventory() {
    const p = this.game.player;
    const c = $('inv-content');
    const eq = (slot, cur) => {
      const it = cur ? `${cur.name} (${cur.dmg !== undefined ? cur.dmg + ' dég.' : cur.armor + ' armure'})` : '—';
      return `<div class="invrow"><span>${slot}</span><b>${it}</b></div>`;
    };
    let html = `<h3>Équipement</h3>`;
    html += eq('⚔️ Arme', p.weapon);
    html += eq('🛡️ Armure', p.armor);
    html += eq('🌀 Bouclier', p.shield);
    html += `<h3>Consommables</h3>`;
    html += `<div class="invrow clickable" data-potion="soin"><span>🧪 Potion de soin (55 PV) — touche H</span><b>${p.potions.soin}</b></div>`;
    html += `<div class="invrow clickable" data-potion="mana"><span>🔷 Potion de mana (mana plein)</span><b>${p.potions.mana}</b></div>`;
    html += `<h3>Gemmes (forcent un sort si échec)</h3>`;
    for (const s of GEM_ORDER) html += `<div class="invrow"><span style="color:${SCHOOLS[s].css}">◆ Gemme ${SCHOOLS[s].name}</span><b>${p.gems[s]}</b></div>`;
    html += `<h3>Objets de quête</h3>`;
    html += `<div class="invrow"><span>🔑 Clés</span><b>${[...p.keys].map(k => k === 'cle_rouillee' ? 'rouillée' : 'château').join(', ') || '—'}</b></div>`;
    html += `<div class="invrow"><span>💎 Cristaux</span><b>${p.crystals.size ? [...p.crystals].map(s => SCHOOLS[s].name).join(', ') : '—'}</b></div>`;
    html += `<div class="invrow"><span>🌿 Herbes médicinales</span><b>${p.herbs}</b></div>`;
    html += `<div class="invrow"><span>🪙 Or</span><b>${p.gold}</b></div>`;
    html += `<h3>Caractéristiques</h3>`;
    html += `<div class="invrow"><span>FOR / AGI / INT / CHA</span><b>${p.str} / ${p.agi} / ${p.int} / ${p.cha}</b></div>`;
    html += `<div class="invrow"><span>Armure totale</span><b>${Math.round(p.armorValue())}</b></div>`;
    c.innerHTML = html;
    c.querySelectorAll('[data-potion]').forEach(el => {
      el.addEventListener('click', () => { p.drinkPotion(el.dataset.potion); this.buildInventory(); this.updateHUD(); });
    });
  }

  buildQuestlog() {
    const g = this.game;
    const c = $('questlog-list');
    let html = '';
    MAIN_QUEST.forEach((q, i) => {
      const cls = i < g.questStep ? 'done' : i === g.questStep ? 'current' : '';
      const mark = i < g.questStep ? '✓ ' : i === g.questStep ? '► ' : '· ';
      html += `<div class="q ${cls}"><div class="qtitle">${mark}${q.title}</div><div>${q.text}</div></div>`;
    });
    html += `<div class="q ${g.sideQuest.done ? 'done' : 'current'}"><div class="qtitle">${g.sideQuest.done ? '✓' : '►'} ${SIDE_QUEST.title} (secondaire)</div><div>${SIDE_QUEST.text.replace('0/3', `${g.player ? g.player.herbs : 0}/3`)}</div></div>`;
    c.innerHTML = html;
  }

  /* ---------------- Dialogues ---------------- */

  dialog(name, text, options) {
    this.dialogOpen = true;
    $('dialog').classList.remove('hidden');
    $('dlg-name').textContent = name;
    $('dlg-text').textContent = text;
    const box = $('dlg-options');
    box.innerHTML = '';
    for (const opt of options) {
      const b = document.createElement('button');
      b.textContent = opt.label;
      b.addEventListener('click', () => {
        this.game.audio.play('ui');
        opt.cb();
        this.closeDialog();
      });
      box.appendChild(b);
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeDialog() {
    this.dialogOpen = false;
    $('dialog').classList.add('hidden');
    if (this.game.state === 'play' && !this.panelOpen) this.game.lockPointer();
  }

  /* ---------------- Divers ---------------- */

  toast(msg, cls = '') {
    const box = $('toasts');
    const div = document.createElement('div');
    div.className = 'toast ' + cls;
    div.textContent = msg;
    box.appendChild(div);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { div.style.transition = 'opacity .6s'; div.style.opacity = '0'; setTimeout(() => div.remove(), 650); }, 3400);
  }

  floatText(worldPos, text, color) {
    const v = worldPos.clone().project(this.game.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const div = document.createElement('div');
    div.className = 'floater';
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.color = color;
    div.textContent = text;
    $('floaters').appendChild(div);
    const start = performance.now();
    const anim = () => {
      const t = (performance.now() - start) / 900;
      if (t >= 1) { div.remove(); return; }
      div.style.transform = `translate(-50%, ${-t * 46}px)`;
      div.style.opacity = String(1 - t);
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  damageFlash() {
    const v = $('vignette');
    v.style.transition = 'none';
    v.style.opacity = '1';
    requestAnimationFrame(() => {
      v.style.transition = 'opacity .7s';
      v.style.opacity = '0';
    });
  }

  prompt(html) {
    const el = $('prompt');
    if (!html) { el.classList.add('hidden'); return; }
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  bossBar(show, frac) {
    $('bossbar').classList.toggle('hidden', !show);
    if (show) $('bossfill').style.width = `${clamp(frac * 100, 0, 100)}%`;
  }

  showDeath(show) { $('death').classList.toggle('hidden', !show); }
  showWin(timeStr) {
    $('win-time').textContent = `Temps de partie : ${timeStr}`;
    $('win').classList.remove('hidden');
  }
  showPause(show) { $('pause').classList.toggle('hidden', !show); }
}
