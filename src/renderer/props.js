import * as THREE from 'three';
import { block, COLORS } from './model.js';

const SPRITE = [
  '..########..',
  '..#.####.#..',
  '############',
  '############',
  '..########..',
  '..########..',
  '..#.#..#.#..',
  '..#.#..#.#..',
];

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Laptop: the origin sits under the middle of the base, +z points away from the pet.
// The lid is hinged on the far edge, so the camera sees its back with a tiny pixel Clawd on it.
export class Laptop {
  static W = 6.8;
  static D = 3.2;
  static T = 0.3;
  static LID_H = 3.0;

  constructor() {
    const { W, D, T, LID_H } = Laptop;
    const shell = new THREE.MeshStandardMaterial({ color: '#cfd2d8', metalness: 0.35, roughness: 0.38 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2e35', roughness: 0.7 });

    this.group = new THREE.Group();
    const base = block(W, T, D, shell, 0.1);
    base.position.y = T / 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W - 0.8, 0.04, D * 0.55), dark);
    deck.position.set(0, T + 0.01, -D * 0.12);
    this.group.add(base, deck);

    this.lid = new THREE.Group();
    this.lid.position.set(0, T, D / 2 - 0.08);
    const lidShell = block(W, LID_H, 0.16, shell, 0.08);
    lidShell.position.set(0, LID_H / 2, 0);

    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.8),
      new THREE.MeshBasicMaterial({ map: spriteTexture(COLORS.clay), transparent: true }),
    );
    logo.position.set(0, LID_H * 0.55, 0.09);

    this.screenMat = new THREE.MeshBasicMaterial({ color: '#7fc4ff' });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, LID_H - 0.45), this.screenMat);
    screen.position.set(0, LID_H / 2, -0.09);
    screen.rotation.y = Math.PI;

    // Screen glow lighting the pet's face while it types.
    this.glow = new THREE.PointLight('#9fd2ff', 0, 9, 2);
    this.glow.position.set(0, LID_H * 0.6, -1.2);

    this.lid.add(lidShell, logo, screen, this.glow);
    this.group.add(this.lid);
    this.setOpen(0);
    this.group.visible = false;
  }

  // 0 = folded flat onto the deck, 1 = open and leaning slightly back.
  setOpen(k) {
    this.lid.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0.24, k);
  }

  // A point on one side edge of the lid in world space, where typing glyphs pop out.
  lidSide(out = new THREE.Vector3(), side = 1) {
    out.set(side * (Laptop.W / 2 + 0.2), Laptop.LID_H * 0.55, 0);
    return this.lid.localToWorld(out);
  }
}

export function spriteTexture(color) {
  return canvasTexture(24, 16, (ctx) => {
    ctx.fillStyle = color;
    SPRITE.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === '#') ctx.fillRect(x * 2, y * 2, 2, 2);
      });
    });
  });
}

// Magnifying glass: the lens faces +z, the handle is re-aimed every frame so it always ends in the hand.
export class Magnifier {
  constructor() {
    this.group = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: '#3b3f47', metalness: 0.5, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.17, 10, 28), brass);
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 28),
      new THREE.MeshStandardMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1 }),
    );
    this.lens = new THREE.Group();
    this.lens.add(ring, glass);
    this.handle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 1, 10), new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.6 }));
    this.group.add(this.lens, this.handle);
    this.group.visible = false;
    this._a = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // lensPos and handPos are in the parent's (root) space.
  place(lensPos, handPos, scale = 1) {
    this.lens.position.copy(lensPos);
    this.lens.scale.setScalar(scale);
    const start = this._a.copy(lensPos).add(this._d.set(0, -1.05 * scale, 0));
    const dir = this._d.copy(handPos).sub(start);
    const len = Math.max(0.2, dir.length());
    this.handle.position.copy(start).addScaledVector(dir, 0.5);
    this.handle.scale.set(scale, len, scale);
    this.handle.quaternion.setFromUnitVectors(this._up, dir.normalize());
  }
}

// A sheet of paper held in both hands; text faces the pet.
export class Paper {
  constructor() {
    this.group = new THREE.Group();
    const text = canvasTexture(256, 180, (ctx, w, h) => {
      ctx.fillStyle = '#fbf8f1';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8f877b';
      ctx.fillRect(18, 18, 120, 10);
      ctx.fillStyle = '#b3ab9e';
      for (let y = 42; y < h - 14; y += 15) {
        const len = 150 + Math.random() * 70;
        ctx.fillRect(18, y, Math.min(w - 36, len), 6);
      }
    });
    // The sheet is held tilted back like a document on a lap, so its upper (+z) face is the
    // one the pet looks at. The text is turned 180° to read upright from the pet's side.
    text.center.set(0.5, 0.5);
    text.rotation = Math.PI;
    const back = new THREE.MeshStandardMaterial({ color: '#efeadf', roughness: 0.9 });
    const front = new THREE.MeshStandardMaterial({ map: text, roughness: 0.9 });
    this.sheet = new THREE.Group();
    const geo = new THREE.PlaneGeometry(4.6, 3.2);
    const a = new THREE.Mesh(geo, front);
    const b = new THREE.Mesh(geo, back);
    b.rotation.y = Math.PI;
    a.position.z = 0.01;
    this.sheet.add(a, b);
    this.group.add(this.sheet);
    this.group.visible = false;
  }
}

// Soft contact shadow that stays on the ground while the pet hops.
export class BlobShadow {
  constructor() {
    const tex = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.42)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = -1;
  }

  update(root, extra = 0) {
    const h = Math.max(0, root.position.y);
    const k = 1 / (1 + h * 0.12);
    this.mesh.position.set(root.position.x, 0.02, root.position.z + 0.3);
    this.mesh.scale.set((12 + extra) * k, 7.5 * k, 1);
    this.mesh.material.opacity = k;
  }
}
