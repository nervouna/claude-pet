import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Proportions come straight from the 2D sprite, one sprite pixel = one world unit:
// an 8x6 body, eyes in row 1, 2x2 arms in rows 2-3, four 1x2 legs in columns 0, 2, 5 and 7.
// The 3D version adds 4 units of depth and a second row of legs behind the first.
export const BODY = { w: 8, h: 6, d: 4 };
export const LEG_H = 2;
const EYE_Y = 4.5;
const ARM_Y = 3;
const LEG_X = [-3.5, -1.5, 1.5, 3.5];
const LEG_Z = [1.5, -1.5];

export const COLORS = {
  clay: '#d97b55',
  eye: '#1d1714',
};

export function block(w, h, d, material, radius = 0.18) {
  const r = Math.min(radius, Math.min(w, h, d) / 2 - 0.001);
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material);
}

export const DEFAULT_POSE = Object.freeze({
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  sit: 0, lean: 0, tilt: 0, squash: 1,
  // Arms: yaw swings forward, lift raises, dy slides along the body, z/inset move the shoulder.
  lYaw: 0, lLift: 0, lDy: 0, lZ: 0, lIn: 0,
  rYaw: 0, rLift: 0, rDy: 0, rZ: 0, rIn: 0,
  eyeX: 0, eyeY: 0, eyeOpen: 1, eyeScale: 1, eyeBoostR: 0,
  legFwd: 0, legSwing: 0,
  // Weight of cursor tracking for eyes and body yaw.
  look: 0,
});

export class Clawd {
  constructor() {
    this.clay = new THREE.MeshStandardMaterial({ color: COLORS.clay, roughness: 0.78, metalness: 0 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.3 });

    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.root.add(this.hips);

    this.torso = block(BODY.w, BODY.h, BODY.d, this.clay, 0.24);
    this.torso.position.y = BODY.h / 2;
    this.body = new THREE.Group();
    this.body.add(this.torso);
    this.hips.add(this.body);

    this.eyes = new THREE.Group();
    this.eyeL = block(1, 1, 0.3, eyeMat, 0.1);
    this.eyeR = block(1, 1, 0.3, eyeMat, 0.1);
    this.eyeL.position.x = -2.5;
    this.eyeR.position.x = 2.5;
    this.eyes.add(this.eyeL, this.eyeR);
    this.hips.add(this.eyes);

    this.arms = { l: this.#makeArm(-1), r: this.#makeArm(1) };

    this.legs = [];
    for (const z of LEG_Z) {
      for (const x of LEG_X) {
        const pivot = new THREE.Group();
        // Legs hang from the body so they lean and tilt with it.
        pivot.position.set(x, 0, z);
        const mesh = block(1, LEG_H + 0.1, 1, this.clay, 0.14);
        mesh.position.y = -LEG_H / 2;
        pivot.add(mesh);
        this.hips.add(pivot);
        this.legs.push({ pivot, mesh, front: z > 0, parity: (LEG_X.indexOf(x) + (z > 0 ? 0 : 1)) % 2 });
      }
    }

    this.hitMeshes = [this.torso, this.eyeL, this.eyeR, this.arms.l.mesh, this.arms.r.mesh, ...this.legs.map((l) => l.mesh)];
    this.hipY = LEG_H;
    this._v = new THREE.Vector3();
  }

  #makeArm(side) {
    const pivot = new THREE.Group();
    const yaw = new THREE.Group();
    const lift = new THREE.Group();
    const mesh = block(2.2, 2, 2, this.clay, 0.2);
    mesh.position.x = side * 1.0;
    const hand = new THREE.Group();
    hand.position.x = side * 2.0;
    lift.add(mesh, hand);
    yaw.add(lift);
    pivot.add(yaw);
    this.hips.add(pivot);
    return { side, pivot, yaw, lift, mesh, hand };
  }

  applyPose(p, legLift) {
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');

    const sit = THREE.MathUtils.clamp(p.sit, 0, 1);
    const hipY = LEG_H * (1 - sit);
    this.hipY = hipY;
    this.hips.position.y = hipY;
    this.hips.rotation.set(p.lean, 0, p.tilt);

    // Squash keeps volume roughly constant; eyes and arms ride along without being skewed.
    const sq = Math.max(0.35, p.squash);
    const w = 1 / Math.sqrt(sq);
    this.body.scale.set(w, sq, w);

    const front = (BODY.d / 2) * w;
    this.eyes.position.set(p.eyeX * w, (EYE_Y + p.eyeY) * sq, front);
    const open = THREE.MathUtils.clamp(p.eyeOpen, 0.07, 1.4);
    const s = p.eyeScale;
    const boost = 1 + p.eyeBoostR;
    this.eyeL.scale.set(s * w, s * open, 1);
    this.eyeR.scale.set(s * w * boost, s * open * boost, 1);

    for (const arm of [this.arms.l, this.arms.r]) {
      const k = arm.side > 0 ? 'r' : 'l';
      arm.pivot.position.set(arm.side * ((BODY.w / 2) * w - p[k + 'In']), (ARM_Y + p[k + 'Dy']) * sq, p[k + 'Z']);
      arm.yaw.rotation.y = -arm.side * p[k + 'Yaw'];
      arm.lift.rotation.z = arm.side * p[k + 'Lift'];
    }

    // Sitting tucks the legs up into the body, keeping their feet off the floor instead of
    // pushing them through it; front legs can instead fold forward and lie flat.
    this.legs.forEach((leg, i) => {
      const fwd = leg.front ? THREE.MathUtils.clamp(p.legFwd, 0, 1) : 0;
      const tuck = sit * (1 - fwd);
      const swing = (leg.parity ? 1 : -1) * p.legSwing;
      const topY = THREE.MathUtils.lerp(LEG_H + 0.4 * tuck, 0.5, fwd);
      leg.pivot.position.y = topY - hipY + (legLift ? legLift[i] : 0);
      leg.pivot.rotation.x = -fwd * Math.PI / 2 + swing;
      const thin = 1 - 0.3 * tuck;
      leg.mesh.scale.set(thin, 1, thin);
    });

    this.root.updateMatrixWorld(true);
  }

  // Hand tip position in the root's local space (props live under the root).
  handPos(side, out = new THREE.Vector3()) {
    const arm = side > 0 ? this.arms.r : this.arms.l;
    arm.hand.getWorldPosition(out);
    return this.root.worldToLocal(out);
  }

  // Converts a point from hips space (follows sitting and leaning) to root space.
  fromHips(v) {
    this.hips.localToWorld(v);
    return this.root.worldToLocal(v);
  }

  // Top of the head in world space, used to anchor speech bubbles.
  headTop(out = new THREE.Vector3()) {
    out.set(0, this.body.scale.y * BODY.h + 0.6, 0);
    return this.hips.localToWorld(out);
  }

  eyeCenter(out = new THREE.Vector3()) {
    return this.eyes.getWorldPosition(out);
  }
}
