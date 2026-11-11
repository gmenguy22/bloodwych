import * as THREE from 'three';

export * from './noise.js';

/* Texture de halo pour sprites (glow) */
export function makeGlowTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/* Système de particules à base de sprites */
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.glow = makeGlowTexture();
  }
  burst(pos, opts = {}) {
    const {
      color = 0xffffff, count = 14, speed = 5, life = 0.7, size = 0.5,
      gravity = -6, up = 2.5, spread = 1,
    } = opts;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glow, color, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      s.userData.vel = new THREE.Vector3(
        Math.cos(a) * r * speed, up * (0.4 + Math.random() * 0.8), Math.sin(a) * r * speed
      );
      s.userData.life = life * (0.6 + Math.random() * 0.7);
      s.userData.maxLife = s.userData.life;
      const sc = size * (0.6 + Math.random() * 0.9);
      s.scale.set(sc, sc, 1);
      s.userData.gravity = gravity;
      this.scene.add(s);
      this.items.push(s);
    }
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.userData.life -= dt;
      if (s.userData.life <= 0) {
        this.scene.remove(s);
        s.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      s.userData.vel.y += s.userData.gravity * dt;
      s.position.addScaledVector(s.userData.vel, dt);
      const t = s.userData.life / s.userData.maxLife;
      s.material.opacity = t * 0.95;
      const sc = s.scale.x * (0.4 + 0.6 * t) + dt * 0.4;
      s.scale.set(sc, sc, 1);
    }
  }
}

/* Petit synthétiseur WebAudio (sons procéduraux) */
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.22; }
  tone(freq, dur, type = 'square', vol = 0.5, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise(dur, vol = 0.4, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'swing': this.tone(300, 0.09, 'sawtooth', 0.25, 140); break;
      case 'hit': this.tone(160, 0.12, 'square', 0.5, 60); this.noise(0.08, 0.3, 900); break;
      case 'hurt': this.tone(110, 0.25, 'sawtooth', 0.5, 50); this.noise(0.15, 0.3, 500); break;
      case 'cast': this.tone(520, 0.18, 'sine', 0.4, 900); break;
      case 'fizzle': this.tone(220, 0.25, 'sawtooth', 0.3, 90); break;
      case 'fire': this.noise(0.35, 0.5, 700); this.tone(180, 0.3, 'sawtooth', 0.35, 60); break;
      case 'ice': this.tone(900, 0.25, 'sine', 0.4, 300); this.tone(1200, 0.2, 'sine', 0.25, 500, 0.05); break;
      case 'bolt': this.tone(1400, 0.15, 'square', 0.35, 200); this.noise(0.12, 0.35, 3000); break;
      case 'heal': this.tone(520, 0.3, 'sine', 0.4, 780); this.tone(780, 0.3, 'sine', 0.3, 1040, 0.12); break;
      case 'shield': this.tone(340, 0.3, 'triangle', 0.4, 500); break;
      case 'teleport': this.tone(200, 0.35, 'sine', 0.4, 1400); this.noise(0.2, 0.25, 2500); break;
      case 'pickup': this.tone(700, 0.1, 'sine', 0.35, 1000); break;
      case 'gem': this.tone(880, 0.12, 'sine', 0.4, 1320); this.tone(1320, 0.15, 'sine', 0.3, 1760, 0.08); break;
      case 'coin': this.tone(1050, 0.07, 'square', 0.3); this.tone(1400, 0.12, 'square', 0.3, null, 0.06); break;
      case 'chest': this.tone(300, 0.12, 'triangle', 0.4, 450); this.tone(450, 0.18, 'triangle', 0.4, 600, 0.1); break;
      case 'door': this.noise(0.4, 0.4, 300); this.tone(90, 0.4, 'sine', 0.4, 60); break;
      case 'lever': this.tone(240, 0.1, 'square', 0.4, 120); this.tone(120, 0.15, 'square', 0.4, 90, 0.1); break;
      case 'quest': this.tone(660, 0.15, 'sine', 0.4); this.tone(880, 0.2, 'sine', 0.4, null, 0.14); break;
      case 'level': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.4, null, i * 0.1)); break;
      case 'recruit': [392, 523, 659].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.4, null, i * 0.09)); break;
      case 'death': this.tone(220, 0.8, 'sawtooth', 0.5, 40); this.noise(0.7, 0.4, 300); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.45, null, i * 0.15)); break;
      case 'boss': this.tone(70, 1.0, 'sawtooth', 0.6, 45); this.noise(0.9, 0.5, 250); break;
      case 'nova': this.noise(0.6, 0.6, 500); this.tone(120, 0.6, 'sawtooth', 0.5, 40); break;
      case 'ui': this.tone(600, 0.06, 'sine', 0.25); break;
      case 'shoot': this.tone(500, 0.08, 'square', 0.3, 250); break;
      case 'block': this.tone(200, 0.1, 'square', 0.35, 150); break;
      case 'potion': this.tone(400, 0.15, 'sine', 0.4, 700); break;
      case 'crystal': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.4, null, i * 0.12)); break;
    }
  }
}
