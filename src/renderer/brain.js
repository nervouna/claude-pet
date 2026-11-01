import {
  Celebrate, Compact, Dance, Hop, LookAround, Pace, Ponder, Reaction, Reading, ScratchHead,
  Searching, SitRest, Sleeping, Stand, Stretch, Typing, Waiting, Wake, Wander,
} from './actions.js';

const IDLE = [
  [() => new Stand(), 5],
  [() => new LookAround(0.8), 2],
  [() => new Hop(), 1],
  [() => new Stretch(), 0.8],
  [() => new Wander(), 1.5],
  [() => new SitRest(), 1],
  [() => new Dance(), 0.3],
];

const THINK = [
  [() => new ScratchHead(), 3],
  [() => new LookAround(1.3, 'think'), 2.5],
  [() => new Ponder(), 2],
  [() => new Pace(), 1],
];

const PULSES = {
  celebrate: () => new Celebrate(),
  wake: () => new Wake(),
  compact: () => new Compact(),
};

const REACTIONS = new Set(['poke', 'cheer', 'oops', 'land']);

function weighted(list, avoid) {
  const options = list.filter(([make]) => make !== avoid);
  let r = Math.random() * options.reduce((s, [, w]) => s + w, 0);
  for (const [make, w] of options) {
    if ((r -= w) <= 0) return make;
  }
  return options[0][0];
}

const stateKey = (s) => `${s.mode}:${s.activity ?? ''}:${s.waitKind ?? ''}`;

// Picks what the pet does next from Claude's state, one action at a time.
export class Brain {
  constructor() {
    this.state = { mode: 'idle' };
    this.effective = { mode: 'idle' };
    this.pending = null;
    this.pendingT = 0;
    this.action = null;
    this.lastMaker = null;
    this.lastKey = 'idle';
    this.pulses = [];
    this.reactions = [];
    this.awakeUntil = 0;
    this.time = 0;
  }

  setState(state) {
    this.state = { ...state };
  }

  pulse(kind) {
    if (REACTIONS.has(kind)) {
      this.reactions.push(new Reaction(kind));
      if (kind === 'poke') this.awakeUntil = this.time + 8;
    } else if (PULSES[kind]) {
      this.pulses = [kind];
    }
  }

  // Short gaps between tool calls should not make the pet pack its laptop away.
  #updateEffective(dt) {
    const want = stateKey(this.state);
    if (want === stateKey(this.effective)) {
      this.pending = null;
      this.effective.tool = this.state.tool;
      return;
    }
    if (this.pending !== want) {
      this.pending = want;
      this.pendingT = 0;
    }
    this.pendingT += dt;
    const linger = this.effective.mode === 'working' && this.state.mode === 'thinking' ? 3 : 0;
    if (this.pendingT >= linger) this.effective = { ...this.state };
  }

  get wantedKey() {
    const e = this.effective;
    switch (e.mode) {
      case 'sleep':
        return this.time < this.awakeUntil ? 'idle' : 'sleep';
      case 'waiting':
        return 'wait';
      case 'working':
        return `work:${['search', 'read'].includes(e.activity) ? e.activity : 'type'}`;
      case 'thinking':
        return 'think';
      default:
        return 'idle';
    }
  }

  #next() {
    if (this.pulses.length) return PULSES[this.pulses.shift()]();
    const key = this.wantedKey;
    if (this.lastKey === 'sleep' && key !== 'sleep') return new Wake();
    switch (key) {
      case 'sleep': return new Sleeping();
      case 'wait': return new Waiting(this.effective.waitKind);
      case 'work:type': return new Typing(this.effective.tool);
      case 'work:search': return new Searching();
      case 'work:read': return new Reading();
      case 'think': {
        const make = weighted(THINK, this.lastMaker);
        this.lastMaker = make;
        return make();
      }
      default: {
        const make = weighted(IDLE, this.lastMaker);
        this.lastMaker = make;
        return make();
      }
    }
  }

  update(dt, pose, add, ctx) {
    this.time += dt;
    this.#updateEffective(dt);
    ctx.mode = this.state.mode;

    if (!this.action) this.action = this.#next();
    const a = this.action;
    if (a.key !== 'pulse' && (a.key !== this.wantedKey || this.pulses.length)) a.end();
    if (a instanceof Typing && this.effective.tool) a.tool = this.effective.tool;
    if (!a.step(dt, pose, add, ctx)) {
      a.cleanup(ctx);
      this.lastKey = a.key;
      this.action = null;
    }

    this.reactions = this.reactions.filter((r) => r.step(dt, add));
  }

  afterPose(ctx) {
    this.action?.props(ctx);
  }

  get bubble() {
    const r = this.reactions.findLast((x) => x.bubble);
    if (r) return r.bubble;
    if (this.action?.bubble) return this.action.bubble;
    return this.effective.mode === 'thinking' ? 'dots' : null;
  }

  // Idle and sleep can run at a lower frame rate.
  get calm() {
    return !this.reactions.length && ['idle', 'sleep'].includes(this.wantedKey) && this.action?.key !== 'pulse';
  }
}
