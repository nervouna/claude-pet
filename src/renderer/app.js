import * as THREE from 'three';
import { Clawd, DEFAULT_POSE } from './model.js';
import { BlobShadow, Laptop, Magnifier, Paper } from './props.js';
import { Brain } from './brain.js';
import { Overlay } from './overlay.js';

const DEG = Math.PI / 180;
// World units visible in the window; the pet keeps its size relative to the window.
const VIEW = { w: 26, h: 22, ground: 3, elevation: 18 * DEG, azimuth: 16 * DEG };
const BASE_W = 260;

const bridge = window.petBridge;
const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const params = new URLSearchParams(location.search);
// Browser preview: framed stage plus state buttons. `?record` (scripts/record.js) gets a bare stage.
const preview = !bridge && !params.has('record');
if (params.has('az')) VIEW.azimuth = Number(params.get('az')) * DEG;
if (params.has('el')) VIEW.elevation = Number(params.get('el')) * DEG;
if (preview) {
  document.body.classList.add('preview');
  document.body.style.setProperty('--zoom', params.get('zoom') ?? '2');
}

/* ------------------------------------------------------------- scene */

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-VIEW.w / 2, VIEW.w / 2, VIEW.h / 2, -VIEW.h / 2, 1, 200);
{
  const target = new THREE.Vector3(0, (VIEW.h / 2 - VIEW.ground) / Math.cos(VIEW.elevation), 0);
  const dir = new THREE.Vector3(Math.sin(VIEW.azimuth) * Math.cos(VIEW.elevation), Math.sin(VIEW.elevation), Math.cos(VIEW.azimuth) * Math.cos(VIEW.elevation));
  camera.position.copy(target).addScaledVector(dir, 80);
  camera.lookAt(target);
}

scene.add(new THREE.HemisphereLight('#fff4ea', '#9c7a6c', 2.1));
const key = new THREE.DirectionalLight('#fff1e2', 2.4);
key.position.set(-6, 12, 10);
const rim = new THREE.DirectionalLight('#dfe9ff', 0.9);
rim.position.set(8, 6, -10);
scene.add(key, rim);

const model = new Clawd();
const laptop = new Laptop();
const magnifier = new Magnifier();
const paper = new Paper();
const shadow = new BlobShadow();
model.root.add(laptop.group, magnifier.group, paper.group);
scene.add(model.root, shadow.mesh);

const overlay = new Overlay(document.getElementById('overlay'), project);
const brain = new Brain();
const ctx = {
  model,
  props: { laptop, magnifier, paper },
  fx: overlay,
  mode: 'idle',
  // Where the pet stands in the window; Wander moves it.
  home: { x: 0 },
};

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height, false);
  stage.style.setProperty('--ui', String(width / BASE_W));
}
new ResizeObserver(resize).observe(stage);
resize();

const _p = new THREE.Vector3();
function project(world) {
  const rect = stage.getBoundingClientRect();
  _p.copy(world).project(camera);
  return { x: (_p.x + 1) / 2 * rect.width, y: (1 - _p.y) / 2 * rect.height };
}

/* ------------------------------------------------------- pose easing */

const RATES = { x: 30, yaw: 7, sit: 6, legFwd: 7, eyeX: 14, eyeY: 14 };
const current = { ...DEFAULT_POSE };
const ADD_KEYS = Object.keys(DEFAULT_POSE);

function zeroAdd() {
  const add = { legs: new Array(8).fill(0) };
  for (const k of ADD_KEYS) add[k] = 0;
  return add;
}

/* --------------------------------------------- cursor, hit test, drag */

const cursor = { x: -1e4, y: -1e4, sx: 0, sy: 0, known: false };
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hit = false;
let drag = null;
let held = 0;
let heldVel = 0;
let lastSx = null;

function hitTest() {
  const rect = stage.getBoundingClientRect();
  if (cursor.x < 0 || cursor.y < 0 || cursor.x > rect.width || cursor.y > rect.height) return false;
  ndc.set((cursor.x / rect.width) * 2 - 1, -(cursor.y / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = laptop.group.visible ? [...model.hitMeshes, laptop.group] : model.hitMeshes;
  return raycaster.intersectObjects(targets, true).length > 0;
}

if (bridge) {
  bridge.onCursor((c) => {
    Object.assign(cursor, c, { known: true });
  });
  bridge.onState((s) => brain.setState(s));
  bridge.onPulse((p) => brain.pulse(p.kind));
} else {
  window.addEventListener('pointermove', (e) => {
    const rect = stage.getBoundingClientRect();
    Object.assign(cursor, { x: e.clientX - rect.left, y: e.clientY - rect.top, sx: e.screenX, sy: e.screenY, known: true });
  });
}

stage.addEventListener('pointerdown', (e) => {
  const rect = stage.getBoundingClientRect();
  Object.assign(cursor, { x: e.clientX - rect.left, y: e.clientY - rect.top, known: true });
  hit = hitTest();
  if (e.button !== 0 || !hit) return;
  try {
    stage.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic pointers cannot be captured; dragging still works without it.
  }
  drag ={ x: e.screenX, y: e.screenY, moved: false };
  bridge?.drag('start');
  stage.classList.add('grabbing');
});
stage.addEventListener('pointermove', (e) => {
  if (drag && Math.hypot(e.screenX - drag.x, e.screenY - drag.y) > 4) drag.moved = true;
});
stage.addEventListener('pointerup', () => {
  if (!drag) return;
  bridge?.drag('end');
  brain.pulse(drag.moved ? 'land' : 'poke');
  drag = null;
  stage.classList.remove('grabbing');
});
stage.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (hit) bridge?.openMenu();
});

/* ------------------------------------------------------------- loop */

let last = performance.now();
let acc = 0;
let timeScale = 1;
let blinkIn = 2;
let blinkT = -1;

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += elapsed;
  const fps = drag ? 60 : brain.calm ? (brain.wantedKey === 'sleep' ? 15 : 30) : 60;
  if (acc < 1 / fps - 0.002) return;
  const dt = Math.min(0.05, acc) * timeScale;
  acc = 0;
  tick(dt);
}

function tick(dt) {
  const target = { ...DEFAULT_POSE, x: ctx.home.x };
  const add = zeroAdd();
  brain.update(dt, target, add, ctx);

  // Being carried: dangle the legs and swing with the motion.
  held += ((drag?.moved ? 1 : 0) - held) * (1 - Math.exp(-dt * 10));
  if (cursor.known && lastSx !== null) heldVel += ((cursor.sx - lastSx) / Math.max(dt, 1e-3) - heldVel) * (1 - Math.exp(-dt * 8));
  lastSx = cursor.sx;
  if (held > 0.01) {
    target.eyeOpen += 0.2 * held;
    target.lLift += 0.5 * held;
    target.rLift += 0.5 * held;
    target.roll = THREE.MathUtils.clamp(-heldVel * 0.0006, -0.45, 0.45) * held;
    add.legSwing += Math.sin(brain.time * 13) * 0.3 * held;
  }

  // Follow the cursor with the eyes (and a little with the body).
  if (target.look > 0 && cursor.known && !drag) {
    const eye = project(model.eyeCenter());
    const dx = cursor.x - eye.x;
    const dy = cursor.y - eye.y;
    const near = THREE.MathUtils.clamp(1.6 - Math.hypot(dx, dy) / 900, 0, 1) * target.look;
    target.eyeX += THREE.MathUtils.clamp(dx / 160, -1, 1) * 0.4 * near;
    target.eyeY += THREE.MathUtils.clamp(-dy / 160, -1, 1) * 0.26 * near;
    target.yaw += THREE.MathUtils.clamp(dx / 500, -1, 1) * 0.35 * near;
  }

  // Blink every few seconds unless the eyes are already closed.
  blinkIn -= dt;
  if (blinkIn <= 0 && blinkT < 0) {
    blinkT = 0;
    blinkIn = 1.8 + Math.random() * 4.5 - (Math.random() < 0.2 ? 1.6 : 0);
  }
  let blink = 1;
  if (blinkT >= 0) {
    blinkT += dt;
    blink = 1 - Math.sin(Math.min(1, blinkT / 0.16) * Math.PI) * 0.92;
    if (blinkT > 0.16) blinkT = -1;
  }

  const final = {};
  for (const k of ADD_KEYS) {
    const rate = RATES[k] ?? 11;
    current[k] += (target[k] - current[k]) * (1 - Math.exp(-dt * rate));
    final[k] = current[k] + add[k];
  }
  final.eyeOpen *= blink;
  model.applyPose(final, add.legs);
  brain.afterPose(ctx);
  shadow.update(model.root, current.sit * 1.5);

  renderer.render(scene, camera);
  overlay.update(dt, brain.bubble, model.headTop());

  const nowHit = drag ? true : hitTest();
  if (nowHit !== hit) {
    hit = nowHit;
    bridge?.setHit(hit);
    stage.classList.toggle('grab', hit);
  }
}
requestAnimationFrame(frame);
bridge?.ready();

/* ------------------------------------------- browser preview helpers */

const PRESETS = {
  idle: { mode: 'idle' },
  thinking: { mode: 'thinking' },
  Edit: { mode: 'working', activity: 'type', tool: 'Edit' },
  Bash: { mode: 'working', activity: 'type', tool: 'Bash' },
  Grep: { mode: 'working', activity: 'search', tool: 'Grep' },
  Read: { mode: 'working', activity: 'read', tool: 'Read' },
  permission: { mode: 'waiting', waitKind: 'permission' },
  ask: { mode: 'waiting', waitKind: 'ask' },
  sleep: { mode: 'sleep' },
};

window.pet = {
  brain,
  setState: (s) => brain.setState(typeof s === 'string' ? PRESETS[s] : s),
  pulse: (k) => brain.pulse(k),
  setTimeScale: (k) => (timeScale = k),
  hitAt: (x, y) => {
    Object.assign(cursor, { x, y, known: true });
    return hitTest();
  },
  // Steps the simulation synchronously (for screenshots when rAF is throttled).
  advance: (seconds, fps = 60) => {
    for (let i = 0; i < seconds * fps; i++) tick(1 / fps);
  },
};

if (preview) {
  const panel = document.createElement('div');
  panel.id = 'debug';
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => window.pet.setState(name);
    panel.append(b);
  }
  for (const name of ['celebrate', 'wake', 'compact', 'poke', 'cheer', 'oops']) {
    const b = document.createElement('button');
    b.textContent = `⚡${name}`;
    b.onclick = () => brain.pulse(name);
    panel.append(b);
  }
  for (const bg of ['#ece6dc', '#1f2430', '#4a6fa5']) {
    const b = document.createElement('button');
    b.textContent = '■';
    b.style.color = bg;
    b.onclick = () => document.body.style.setProperty('--bg', bg);
    panel.append(b);
  }
  document.body.append(panel);
  if (params.get('state')) window.pet.setState(params.get('state'));
}
