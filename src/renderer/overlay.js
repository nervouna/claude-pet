// HTML layer over the canvas: speech bubbles, floating Zzz, typing glyphs and sparkles.
const BUBBLES = {
  dots: '<span class="dot"></span><span class="dot"></span><span class="dot"></span>',
  alert: '!',
  ask: '?',
  oops: '!?',
  heart: '♥',
  note: '♪',
};

export class Overlay {
  constructor(root, project) {
    this.root = root;
    this.project = project;
    // The anchor sits on top of the head; the bubble hangs off its upper left and rocks around it.
    this.anchor = document.createElement('div');
    this.anchor.className = 'bubble-anchor';
    this.bubble = document.createElement('div');
    this.bubble.className = 'bubble';
    this.anchor.append(this.bubble);
    root.append(this.anchor);
    this.kind = null;
    this.particles = [];
    this.zTimer = 0;
  }

  // Velocities are in px/s at the default window size and scale with the window.
  #spawn(text, className, x, y, vx, vy, life) {
    const k = this.root.clientWidth / 260;
    vx *= k;
    vy *= k;
    const el = document.createElement('div');
    el.className = `particle ${className}`;
    el.textContent = text;
    this.root.append(el);
    this.particles.push({ el, x, y, vx, vy, k, life, age: 0 });
  }

  // Glyphs drift sideways out of the laptop so they stay off the face.
  glyph(text, world, style, side) {
    const p = this.project(world);
    this.#spawn(text, `glyph ${style}`, p.x, p.y, side * (30 + Math.random() * 16), -14 - Math.random() * 12, 1.0);
  }

  sparkles(world) {
    const p = this.project(world);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const v = 70 + Math.random() * 60;
      this.#spawn(Math.random() < 0.7 ? '✦' : '•', 'sparkle', p.x, p.y, Math.cos(a) * v, Math.sin(a) * v - 40, 0.9);
    }
  }

  update(dt, kind, headWorld) {
    const head = this.project(headWorld);

    if (kind === 'zzz') {
      this.zTimer -= dt;
      if (this.zTimer <= 0) {
        this.zTimer = 1.1;
        this.#spawn('z', 'zzz', head.x + 16, head.y - 4, 14, -16, 2.6);
      }
    }
    const shown = kind && kind !== 'zzz' ? kind : null;
    if (shown !== this.kind) {
      this.kind = shown;
      if (shown) {
        this.bubble.innerHTML = BUBBLES[shown] ?? '';
        this.bubble.dataset.kind = shown;
      }
      this.bubble.classList.toggle('on', !!shown);
    }
    this.anchor.style.transform = `translate(${head.x}px, ${head.y}px)`;

    this.particles = this.particles.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) {
        p.el.remove();
        return false;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.el.classList.contains('sparkle')) p.vy += 160 * p.k * dt;
      const u = p.age / p.life;
      const grow = p.el.classList.contains('zzz') ? 0.7 + u * 0.8 : 1;
      p.el.style.opacity = String(Math.min(1, (1 - u) * 2.5, u * 8));
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${grow})`;
      return true;
    });
  }
}
