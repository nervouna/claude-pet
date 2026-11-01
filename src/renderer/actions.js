import * as THREE from 'three';
import { Laptop } from './props.js';

const DEG = Math.PI / 180;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (t) => t * t * (3 - 2 * t);
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = THREE.MathUtils.lerp;
const backOut = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
// One hop: 0 -> peak -> 0 over t in [0, 1].
const hopArc = (t) => (t <= 0 || t >= 1 ? 0 : 4 * t * (1 - t));

// An action drives the pose for a while. Base targets are eased by the animator;
// `add` holds fast oscillations that are layered on top without easing.
export class Action {
  constructor(key, duration = Infinity) {
    this.key = key;
    this.duration = duration;
    this.t = 0;
    this.ending = false;
    this.outroT = 0;
    this.outro = 0.3;
    this.bubble = null;
  }

  end() {
    if (!this.ending) {
      this.ending = true;
      this.outroT = 0;
    }
  }

  // Weight that fades the action's own contribution out during the outro.
  get w() {
    return this.ending ? 1 - smooth(clamp01(this.outroT / this.outro)) : 1;
  }

  step(dt, pose, add, ctx) {
    this.t += dt;
    if (this.ending) this.outroT += dt;
    else if (this.t >= this.duration) this.end();
    this.update(pose, add, ctx, dt);
    return !(this.ending && this.outroT >= this.outro);
  }

  update() {}
  props() {}
  cleanup() {}
}

// Blend helper: move a pose channel toward `value` by the action's weight.
function set(pose, key, value, w) {
  pose[key] += (value - pose[key]) * w;
}

/* ---------------------------------------------------------------- idle */

export class Stand extends Action {
  constructor(duration = rand(2.5, 5)) {
    super('idle', duration);
  }
  update(p, add) {
    p.look = 1;
    add.squash += Math.sin(this.t * 2.2) * 0.012;
  }
}

export class LookAround extends Action {
  constructor(speed = 1, key = 'idle') {
    super(key, 3.2 / speed);
    this.speed = speed;
    this.dir = Math.random() < 0.5 ? 1 : -1;
  }
  update(p, add) {
    const t = this.t * this.speed;
    const w = this.w;
    // left, hold, right, hold, back to center; the eyes lead the body.
    const a = seg(t, 0.1, 0.5), b = seg(t, 1.2, 1.7), c = seg(t, 2.5, 3.0);
    const side = this.dir * (smooth(a) - 2 * smooth(b) + smooth(c));
    const eyeSide = this.dir * (smooth(seg(t, 0, 0.3)) - 2 * smooth(seg(t, 1.1, 1.4)) + smooth(seg(t, 2.4, 2.7)));
    set(p, 'yaw', side * 0.5, w);
    set(p, 'eyeX', eyeSide * 0.42, w);
    set(p, 'tilt', -side * 0.05, w);
    add.squash += Math.sin(this.t * 2.2) * 0.01;
  }
}

export class Hop extends Action {
  constructor(count = pick([1, 2])) {
    super('idle', 0.25 + count * 0.5);
    this.count = count;
  }
  update(p, add) {
    const t = this.t - 0.15;
    const i = Math.floor(t / 0.5);
    const local = (t - i * 0.5) / 0.5;
    if (t > 0 && i < this.count) {
      const crouch = local < 0.2 ? Math.sin((local / 0.2) * Math.PI) : 0;
      add.y += hopArc((local - 0.15) / 0.75) * 1.6;
      add.squash += -crouch * 0.12 + hopArc((local - 0.15) / 0.75) * 0.06;
      add.lLift += hopArc(local) * 0.5;
      add.rLift += hopArc(local) * 0.5;
    }
    p.look = 1;
  }
}

export class Stretch extends Action {
  constructor() {
    super('idle', 2.4);
  }
  update(p) {
    const k = smooth(seg(this.t, 0, 0.6)) * this.w * (1 - smooth(seg(this.t, 1.8, 2.4)));
    p.lLift += 95 * DEG * k;
    p.rLift += 95 * DEG * k;
    p.lDy += 1.3 * k;
    p.rDy += 1.3 * k;
    p.squash += 0.1 * k;
    p.eyeOpen -= 0.85 * k;
    p.lean -= 0.08 * k;
  }
}

// Walks to another spot in the window and stays there (ctx.home keeps the spot).
export class Wander extends Action {
  constructor(bounds = 4.5) {
    super('idle', 9);
    this.target = rand(-bounds, bounds);
    this.speed = 2.2;
    this.phase = 0;
  }
  update(p, add, ctx, dt) {
    const dx = this.target - ctx.home.x;
    const walking = !this.ending && Math.abs(dx) > 0.15;
    if (walking) {
      ctx.home.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * dt);
      p.x = ctx.home.x;
      this.phase += dt * 11;
      p.yaw = lerp(p.yaw, Math.sign(dx) * 0.75, 1 - Math.exp(-dt * 8));
      add.legSwing += Math.sin(this.phase) * 0.45;
      add.y += Math.abs(Math.sin(this.phase)) * 0.18;
      add.roll += Math.sin(this.phase) * 0.03;
    } else {
      this.end();
    }
  }
}

export class SitRest extends Action {
  constructor() {
    super('idle', rand(4, 7));
    this.outro = 0.5;
  }
  update(p, add) {
    const w = this.w * smooth(seg(this.t, 0, 0.4));
    set(p, 'sit', 1, w);
    set(p, 'legFwd', 0.55, w);
    set(p, 'eyeOpen', 0.7, w);
    p.look = 1;
    add.squash += Math.sin(this.t * 1.8) * 0.015;
  }
}

export class Dance extends Action {
  constructor() {
    super('idle', 3.6);
    this.bubble = 'note';
  }
  update(p, add) {
    const w = this.w;
    const b = this.t * 2 * Math.PI * 1.6;
    add.y += Math.abs(Math.sin(b / 2)) * 0.5 * w;
    add.roll += Math.sin(b / 2) * 0.1 * w;
    add.yaw += Math.sin(b / 4) * 0.35 * w;
    add.lLift += (0.6 + Math.sin(b) * 0.6) * w;
    add.rLift += (0.6 - Math.sin(b) * 0.6) * w;
    add.squash += Math.cos(b) * 0.04 * w;
    set(p, 'eyeOpen', 0.35, w);
  }
}

/* ------------------------------------------------------------ thinking */

export class ScratchHead extends Action {
  constructor(key = 'think') {
    super(key, rand(2.2, 3.2));
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.outro = 0.4;
    this.bubble = 'dots';
  }
  update(p, add) {
    const s = this.side > 0 ? 'r' : 'l';
    const w = this.w * smooth(seg(this.t, 0, 0.35));
    set(p, s + 'Lift', 150 * DEG, w);
    set(p, s + 'Dy', 2.7, w);
    set(p, s + 'In', 0.2, w);
    set(p, 'tilt', -this.side * 0.12, w);
    set(p, 'eyeX', this.side * 0.25, w);
    set(p, 'eyeY', 0.22, w);
    set(p, 'eyeOpen', 0.6, w);
    add[s + 'Lift'] += Math.sin(this.t * 40) * 0.13 * w;
    add[s + 'Dy'] += Math.sin(this.t * 40 + 1) * 0.1 * w;
  }
}

export class Ponder extends Action {
  constructor() {
    super('think', rand(2.4, 3.4));
    this.bubble = 'dots';
    this.side = Math.random() < 0.5 ? 1 : -1;
  }
  update(p, add) {
    const w = this.w * smooth(seg(this.t, 0, 0.4));
    set(p, 'tilt', this.side * 0.1, w);
    set(p, 'eyeY', 0.28, w);
    set(p, 'eyeX', -this.side * 0.3, w);
    set(p, 'lLift', -12 * DEG, w);
    set(p, 'rLift', -12 * DEG, w);
    // Tap a front foot while thinking.
    const tap = Math.max(0, Math.sin(this.t * 13));
    add.legs[this.side > 0 ? 7 : 4] += tap * 0.35 * w;
    add.squash += Math.sin(this.t * 2.5) * 0.012;
  }
}

export class Pace extends Action {
  constructor() {
    super('think', 4.6);
    this.bubble = 'dots';
    this.from = 0;
    this.phase = 0;
    this.dir = Math.random() < 0.5 ? 1 : -1;
  }
  update(p, add, ctx, dt) {
    const t = this.t;
    if (t < 0.05) {
      this.from = p.x;
      // Pace toward the middle when standing near an edge of the window.
      if (Math.abs(p.x) > 1.5) this.dir = -Math.sign(p.x);
    }
    // Walk out, turn around, walk back.
    const out = smooth(seg(t, 0, 1.8)) - smooth(seg(t, 2.4, 4.2));
    const moving = (t < 1.8 || (t > 2.4 && t < 4.2)) && !this.ending;
    p.x = this.from + this.dir * 3 * out;
    const heading = t < 2.1 ? this.dir : -this.dir;
    set(p, 'yaw', heading * 0.8 * (moving ? 1 : 0.3), this.w);
    set(p, 'eyeY', 0.15, this.w);
    if (moving) {
      this.phase += dt * 10;
      add.legSwing += Math.sin(this.phase) * 0.4;
      add.y += Math.abs(Math.sin(this.phase)) * 0.14;
    }
  }
}

/* ------------------------------------------------------------- working */

const TYPING_POSE = { sit: 1, legFwd: 1, lean: 0.08, yaw: -0.12, lYaw: 100 * DEG, rYaw: 100 * DEG, lLift: -22 * DEG, rLift: -22 * DEG, lIn: 0.7, rIn: 0.7, lZ: 0.9, rZ: 0.9, eyeY: -0.15 };
const LAPTOP_REST = new THREE.Vector3(0, 1.0, 3.45);
const CODE_GLYPHS = ['{ }', ';', '</>', '=>', '()', '#', '[ ]', '&&', '++'];
const SHELL_GLYPHS = ['$', '>_', '|', '&&', '~/', '-rf', 'ok', '⏎'];

// Sit down, pull a laptop from behind, open it and type until the work changes.
export class Typing extends Action {
  constructor(tool) {
    super('work:type');
    this.tool = tool;
    this.outro = 1.0;
    this.burst = 0;
    this.pause = 0;
    this.nextGlyph = 0.5;
    this.typePhase = 0;
    this._hand = new THREE.Vector3();
    this._v = new THREE.Vector3();
  }

  get introDone() {
    return this.t > 1.45;
  }

  update(p, add, ctx, dt) {
    const t = this.t;
    const out = this.ending ? this.outroT : 0;
    // Sit for the whole action, standing up at the very end of the outro.
    const seated = smooth(seg(t, 0, 0.35)) * (1 - smooth(seg(out, 0.7, 1.0)));
    for (const [k, v] of Object.entries(TYPING_POSE)) {
      if (k === 'sit' || k === 'legFwd') set(p, k, v, seated);
    }

    // Right arm reaches behind the back during pull-out and put-away.
    const reachIn = seg(t, 0.05, 0.3) * (1 - seg(t, 0.35, 0.75));
    const reachOut = seg(out, 0.25, 0.45) * (1 - seg(out, 0.65, 0.95));
    const reach = smooth(Math.max(reachIn, reachOut));
    const typingW = smooth(seg(t, 0.9, 1.4)) * (1 - smooth(seg(out, 0, 0.3)));

    for (const [k, v] of Object.entries(TYPING_POSE)) {
      if (k !== 'sit' && k !== 'legFwd') set(p, k, v, typingW);
    }
    set(p, 'rYaw', -75 * DEG, reach);
    set(p, 'rLift', 10 * DEG, reach);

    // During the intro the arm swings forward carrying the laptop.
    const swing = seg(t, 0.35, 0.8) * (1 - typingW);
    set(p, 'rYaw', 80 * DEG, smooth(swing) * (1 - reach));

    if (typingW > 0.5) {
      const working = ctx.mode === 'working';
      if (!working) {
        // Waiting on the next step: hands hover, glance up, pondering.
        set(p, 'eyeY', 0.25, 1);
        set(p, 'eyeX', Math.sin(t * 0.8) * 0.3, 1);
        set(p, 'lLift', -18 * DEG, 1);
        set(p, 'rLift', -18 * DEG, 1);
        this.bubble = 'dots';
      } else {
        this.bubble = null;
        this.pause -= dt;
        this.burst -= dt;
        if (this.burst <= 0 && this.pause <= 0) {
          if (Math.random() < 0.25) this.pause = rand(0.4, 1.1);
          this.burst = rand(0.8, 2.4);
        }
        const typing = this.pause <= 0;
        if (typing) this.typePhase += dt * rand(15, 19);
        const ph = this.typePhase;
        const k = typing ? 1 : 0;
        add.lLift += -Math.max(0, Math.sin(ph)) * 0.2 * k * typingW;
        add.rLift += -Math.max(0, Math.sin(ph + Math.PI * 0.9)) * 0.2 * k * typingW;
        add.lYaw += Math.sin(ph * 0.31) * 0.08 * k;
        add.rYaw += Math.sin(ph * 0.27 + 2) * 0.08 * k;
        add.squash += Math.sin(ph * 2) * 0.008 * k;
        set(p, 'eyeX', Math.sin(t * 0.9) * 0.22, 1);
        if (!typing) set(p, 'eyeY', 0.1, 1);
        this.nextGlyph -= dt * k;
      }
    }
    add.squash += Math.sin(t * 2) * 0.01;
  }

  props(ctx) {
    const { laptop } = ctx.props;
    const g = laptop.group;
    const t = this.t;
    const out = this.ending ? this.outroT : 0;
    const hand = ctx.model.handPos(1, this._hand);
    hand.y -= 0.6;

    let pos, scale, open;
    if (!this.ending) {
      if (t < 0.3) {
        g.visible = false;
        return;
      }
      g.visible = true;
      const carry = smooth(seg(t, 0.3, 0.8));
      const land = seg(t, 0.8, 1.1);
      pos = this._v.copy(hand).lerp(LAPTOP_REST, smooth(land));
      pos.y += hopArc(land) * 0.8;
      scale = land > 0 ? lerp(0.6, 1, backOut(land)) : lerp(0.15, 0.6, carry);
      open = smooth(seg(t, 1.1, 1.45));
    } else {
      open = 1 - smooth(seg(out, 0, 0.25));
      const leave = smooth(seg(out, 0.25, 0.6));
      pos = this._v.copy(LAPTOP_REST).lerp(hand, leave);
      scale = lerp(1, 0.5, leave) * (1 - smooth(seg(out, 0.6, 0.85)));
      g.visible = scale > 0.02;
    }
    g.position.copy(pos);
    g.scale.setScalar(Math.max(0.001, scale));
    g.rotation.set(0, 0, 0);
    laptop.setOpen(open);
    laptop.glow.intensity = open * (7 + Math.sin(t * 7) * 0.8);

    if (this.nextGlyph <= 0) {
      this.nextGlyph = rand(0.18, 0.4);
      const chars = this.tool === 'Bash' ? SHELL_GLYPHS : CODE_GLYPHS;
      const side = pick([-1, 1]);
      ctx.fx.glyph(pick(chars), laptop.lidSide(this._v, side), this.tool === 'Bash' ? 'shell' : 'code', side);
    }
  }

  cleanup(ctx) {
    ctx.props.laptop.group.visible = false;
    ctx.props.laptop.glow.intensity = 0;
  }
}

// Detective mode: a magnifying glass in front of one (now huge) eye, sweeping around.
export class Searching extends Action {
  constructor() {
    super('work:search');
    this.outro = 0.45;
    this.phase = 0;
    this._l = new THREE.Vector3();
    this._h = new THREE.Vector3();
  }
  update(p, add, ctx, dt) {
    const t = this.t;
    const w = this.w * smooth(seg(t, 0, 0.4));
    set(p, 'rYaw', 62 * DEG, w);
    set(p, 'rLift', 22 * DEG, w);
    set(p, 'rIn', 0.3, w);
    set(p, 'lLift', -10 * DEG, w);
    const sweep = Math.sin(t * 0.95);
    set(p, 'yaw', sweep * 0.42, w);
    set(p, 'eyeX', -sweep * 0.12, w);
    // Peer closer every few seconds.
    const peer = Math.pow(Math.max(0, Math.sin(t * 0.7 - 1)), 6);
    set(p, 'lean', 0.06 + peer * 0.18, w);
    set(p, 'eyeBoostR', 0.55 + peer * 0.25, w * this.lensIn());
    // Sidestep slowly around the spot it stands on.
    p.x = ctx.home.x + Math.sin(t * 0.42) * 2 * w;
    const pace = Math.abs(Math.cos(t * 0.42)) * w;
    this.phase += dt * 9 * pace;
    add.legSwing += Math.sin(this.phase) * 0.3 * pace;
    this.peer = peer;
  }
  lensIn() {
    return smooth(seg(this.t, 0.2, 0.6)) * this.w;
  }
  props(ctx) {
    const m = ctx.props.magnifier;
    const k = this.lensIn();
    m.group.visible = k > 0.02;
    if (!m.group.visible) return;
    const model = ctx.model;
    // Lens floats in front of the right eye.
    const lens = model.fromHips(this._l.set(2.5, 4.6 + 0.1 * Math.sin(this.t * 3), 2.55 + (this.peer || 0) * 0.4));
    const hand = model.handPos(1, this._h);
    m.place(lens, hand, k);
  }
  cleanup(ctx) {
    ctx.props.magnifier.group.visible = false;
  }
}

// Read a sheet of paper line by line, flipping it now and then.
export class Reading extends Action {
  constructor() {
    super('work:read');
    this.outro = 0.4;
    this.line = 0;
    this.lineT = 0;
    this.flipT = -1;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }
  update(p, add, ctx, dt) {
    const w = this.w * smooth(seg(this.t, 0, 0.4));
    set(p, 'lYaw', 84 * DEG, w);
    set(p, 'rYaw', 84 * DEG, w);
    set(p, 'lLift', -16 * DEG, w);
    set(p, 'rLift', -16 * DEG, w);
    set(p, 'lIn', 0.4, w);
    set(p, 'rIn', 0.4, w);
    set(p, 'lean', 0.1, w);
    // Eyes scan each line from the pet's own left (+x) to its right, then drop to the next one.
    this.lineT += dt;
    const lineDur = 0.85;
    if (this.lineT > lineDur) {
      this.lineT = 0;
      this.line++;
      if (this.line % 4 === 0) this.flipT = 0;
    }
    if (this.flipT >= 0) this.flipT += dt;
    if (this.flipT > 0.5) this.flipT = -1;
    const scan = seg(this.lineT, 0, lineDur * 0.85);
    set(p, 'eyeX', lerp(0.32, -0.32, scan), w);
    set(p, 'eyeY', -0.12 - (this.line % 4) * 0.07, w);
    add.yaw += Math.sin(this.t * 0.6) * 0.06;
    add.squash += Math.sin(this.t * 2) * 0.01;
  }
  props(ctx) {
    const paper = ctx.props.paper;
    const k = smooth(seg(this.t, 0.15, 0.45)) * this.w;
    paper.group.visible = k > 0.02;
    if (!paper.group.visible) return;
    const l = ctx.model.handPos(-1, this._a);
    const r = ctx.model.handPos(1, this._b);
    paper.group.position.copy(l).add(r).multiplyScalar(0.5);
    paper.group.position.y += 0.1;
    paper.group.position.z += 0.6;
    paper.group.rotation.set(-0.85, 0, 0);
    paper.group.scale.setScalar(k);
    // Page flip: spin the sheet around its vertical axis.
    paper.sheet.rotation.y = this.flipT >= 0 ? smooth(this.flipT / 0.5) * Math.PI * 2 : 0;
  }
  cleanup(ctx) {
    ctx.props.paper.group.visible = false;
  }
}

/* ------------------------------------------------------- needs the user */

export class Waiting extends Action {
  constructor(kind) {
    super('wait');
    this.bubble = kind === 'ask' ? 'ask' : 'alert';
    this.outro = 0.4;
  }
  update(p, add) {
    const t = this.t;
    const w = this.w * smooth(seg(t, 0, 0.3));
    set(p, 'rLift', 96 * DEG, w);
    set(p, 'rDy', 2.9, w);
    set(p, 'rIn', -0.3, w);
    set(p, 'lLift', 15 * DEG, w);
    set(p, 'eyeOpen', 1.15, w);
    p.look = 1;
    add.rLift += Math.sin(t * 11) * 0.38 * w;
    // Double hop every two seconds to get attention.
    const c = t % 2.2;
    add.y += (hopArc(c / 0.4) + hopArc((c - 0.45) / 0.4)) * 1.1 * w;
    add.squash += (hopArc(c / 0.4) + hopArc((c - 0.45) / 0.4)) * 0.05 * w;
  }
}

/* ------------------------------------------------------------- sleeping */

export class Sleeping extends Action {
  constructor() {
    super('sleep');
    this.outro = 0.8;
    this.bubble = 'zzz';
  }
  update(p, add) {
    const w = this.w * smooth(seg(this.t, 0, 1.2));
    set(p, 'sit', 1, w);
    set(p, 'legFwd', 0.5, w);
    set(p, 'eyeOpen', 0.07, w);
    set(p, 'tilt', 0.07, w);
    set(p, 'lean', 0.06, w);
    set(p, 'lLift', -20 * DEG, w);
    set(p, 'rLift', -20 * DEG, w);
    add.squash += Math.sin(this.t * 1.4) * 0.035 * w;
    add.roll += Math.sin(this.t * 0.7) * 0.02 * w;
  }
}

/* ------------------------------------------------------------ one-shots */

export class Celebrate extends Action {
  constructor() {
    super('pulse', 1.9);
    this.outro = 0.2;
    this.burst = false;
  }
  update(p, add, ctx) {
    const t = this.t;
    const crouch = Math.sin(seg(t, 0, 0.22) * Math.PI);
    const air = seg(t, 0.2, 0.95);
    const land = Math.sin(seg(t, 0.95, 1.2) * Math.PI);
    add.squash += -crouch * 0.2 - land * 0.18 + hopArc(air) * 0.08;
    add.y += hopArc(air) * 4.2;
    add.yaw += smooth(air) * Math.PI * 2;
    const arms = smooth(seg(t, 0.15, 0.35)) * (1 - smooth(seg(t, 1.4, 1.9)));
    p.lLift += 110 * DEG * arms;
    p.rLift += 110 * DEG * arms;
    p.lDy += 1 * arms;
    p.rDy += 1 * arms;
    p.eyeOpen -= 0.7 * arms;
    add.lLift += Math.sin(t * 20) * 0.15 * arms;
    add.rLift += Math.sin(t * 20 + 2) * 0.15 * arms;
    if (!this.burst && t > 0.55) {
      this.burst = true;
      ctx.fx.sparkles(ctx.model.headTop());
    }
  }
}

export class Wake extends Action {
  constructor() {
    super('pulse', 1.6);
  }
  update(p, add) {
    const t = this.t;
    const k = smooth(seg(t, 0.1, 0.5)) * (1 - smooth(seg(t, 1.0, 1.6)));
    p.lLift += 100 * DEG * k;
    p.rLift += 100 * DEG * k;
    p.squash += 0.12 * k;
    p.eyeOpen += 0.25 * k;
    add.roll += Math.sin(t * 30) * 0.05 * seg(t, 1.0, 1.1) * (1 - seg(t, 1.1, 1.5));
  }
}

export class Compact extends Action {
  constructor() {
    super('pulse', 1.8);
    this.bubble = null;
  }
  update(p, add) {
    const t = this.t;
    const k = smooth(seg(t, 0, 0.35)) * (1 - backOut(seg(t, 1.3, 1.8)) * 1);
    p.squash -= 0.45 * Math.max(0, k);
    p.eyeOpen -= 0.75 * Math.max(0, k);
    add.roll += Math.sin(t * 38) * 0.04 * Math.max(0, k);
    add.y += hopArc(seg(t, 1.3, 1.75)) * 1.4;
  }
}

/* ------------------------------------------------- additive reactions */

// Short reactions layered on whatever is running (they never interrupt typing).
export class Reaction {
  constructor(kind) {
    this.kind = kind;
    this.t = 0;
    this.duration = { poke: 0.55, cheer: 0.7, oops: 1.1, land: 0.3 }[kind] ?? 0.6;
    this.bubble = { poke: pick(['alert', 'heart']), oops: 'oops', cheer: 'heart' }[kind] ?? null;
  }
  step(dt, add) {
    this.t += dt;
    const u = clamp01(this.t / this.duration);
    switch (this.kind) {
      case 'poke':
        add.y += hopArc(seg(u, 0.1, 0.8)) * 1.3;
        add.squash += -Math.sin(seg(u, 0, 0.2) * Math.PI) * 0.22 + hopArc(seg(u, 0.1, 0.8)) * 0.08;
        add.eyeOpen += -Math.sin(u * Math.PI) * 0.7;
        break;
      case 'cheer':
        add.y += hopArc(seg(u, 0, 0.7)) * 1.4;
        add.lLift += hopArc(u) * 1.2;
        add.rLift += hopArc(u) * 1.2;
        break;
      case 'oops':
        add.roll += Math.sin(u * Math.PI * 6) * 0.08 * (1 - u);
        add.squash += -Math.sin(u * Math.PI) * 0.08;
        add.eyeOpen += -Math.sin(u * Math.PI) * 0.4;
        break;
      case 'land':
        add.squash += -Math.sin(u * Math.PI) * 0.18;
        break;
    }
    return this.t < this.duration;
  }
}
