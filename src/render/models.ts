/**
 * Procedural low-poly models for the 3D view. Everything is built from
 * primitives at startup — no model files to load.
 *
 * World mapping: sim (x, y) → three (x, 0, y), height is +Y.
 */
import * as THREE from 'three';
import { ARENA_R, CHAMP, PLAYER_R, SPAWNS } from '../sim/constants';
import { COLORS } from './theme';
import { hexA } from './view';

const TAU = Math.PI * 2;

export function lighten(hex: string, amt: number): THREE.Color {
  return new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amt);
}

/** Soft round sprite used for every glow. */
export function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowSprite(tex: THREE.Texture, color: THREE.ColorRepresentation, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      color,
      opacity,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  s.scale.setScalar(size);
  return s;
}

function stone(color: string, rough = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05, flatShading: true });
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

// ---------------------------------------------------------------- floor

/** Polar stone tiles + team pads, painted once into a texture. */
function makeFloorTexture(): THREE.CanvasTexture {
  const S = 2048;
  const k = S / (2 * ARENA_R);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.scale(k, k);

  // Grout
  g.fillStyle = '#1a1f2b';
  g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);

  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const tile = (r0: number, r1: number, a0: number, a1: number, light: number) => {
    const gap = 1.6;
    const ga0 = gap / Math.max(r0, 20);
    const ga1 = gap / r1;
    g.beginPath();
    g.arc(0, 0, r1 - gap, a0 + ga1, a1 - ga1);
    g.arc(0, 0, Math.max(0, r0 + gap), a1 - ga0, a0 + ga0, true);
    g.closePath();
    g.fillStyle = `hsl(222, 13%, ${light}%)`;
    g.fill();
  };

  // Center disc
  g.beginPath();
  g.arc(0, 0, 78, 0, TAU);
  g.fillStyle = 'hsl(222, 12%, 30%)';
  g.fill();
  for (let r0 = 80; r0 < ARENA_R; r0 += 80) {
    const r1 = Math.min(ARENA_R, r0 + 80);
    const n = Math.max(8, Math.round((TAU * r1) / 120));
    const off = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * TAU;
      tile(r0, r1, a0, a0 + TAU / n, 26 + rnd() * 9);
    }
  }

  // Worn spots
  for (let i = 0; i < 60; i++) {
    const a = rnd() * TAU;
    const r = rnd() * ARENA_R;
    const grad = g.createRadialGradient(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * r, Math.sin(a) * r, 30 + rnd() * 50);
    grad.addColorStop(0, `rgba(0,0,0,${0.08 + rnd() * 0.1})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);
  }

  // Center inlay
  g.strokeStyle = 'rgba(255, 209, 102, 0.45)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 70, 0, TAU);
  g.stroke();

  // Team pads
  SPAWNS.forEach((sp, i) => {
    const glow = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 95);
    glow.addColorStop(0, hexA(COLORS.players[i], 0.32));
    glow.addColorStop(1, hexA(COLORS.players[i], 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(sp.x, sp.y, 95, 0, TAU);
    g.fill();
    g.strokeStyle = hexA(COLORS.players[i], 0.75);
    g.lineWidth = 3;
    g.setLineDash([12, 9]);
    g.beginPath();
    g.arc(sp.x, sp.y, 44, 0, TAU);
    g.stroke();
    g.setLineDash([]);
  });

  // Darker near the wall
  const edge = g.createRadialGradient(0, 0, ARENA_R - 90, 0, 0, ARENA_R);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = edge;
  g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface Brazier {
  light: THREE.PointLight;
  flame: THREE.Mesh;
  glow: THREE.Sprite;
  seed: number;
}

export interface ArenaModel {
  braziers: Brazier[];
  pedestalInlay: THREE.Mesh;
}

export function buildArena(scene: THREE.Scene, glowTex: THREE.Texture): ArenaModel {
  // Floor: CircleGeometry lies in XY; rotating it flat maps canvas x/y onto sim x/y.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R, 128),
    new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.88, metalness: 0.04 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(3200, 64), new THREE.MeshStandardMaterial({ color: '#0f131b', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // Wall: a ring of uneven stone blocks.
  const N = 64;
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone('#ffffff'), N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  let seed = 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const tall = i % 8 === 0;
    const h = tall ? 70 : 30 + rnd() * 16;
    const depth = tall ? 44 : 34;
    const r = ARENA_R + 3 + depth / 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2, Math.sin(a) * r), q, new THREE.Vector3(depth, h, ((TAU * r) / N) * (tall ? 1.05 : 0.95)));
    wall.setMatrixAt(i, m);
    col.set(tall ? '#4a556e' : '#394357').multiplyScalar(0.85 + rnd() * 0.3);
    wall.setColorAt(i, col);
  }
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);

  // Faint glowing edge so the boundary reads clearly.
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_R - 3, ARENA_R + 1, 160),
    new THREE.MeshBasicMaterial({ color: '#7aa2ff', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.6;
  scene.add(rim);

  // Orb pedestal
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(52, 58, 4, 32), stone('#3e475c', 0.7));
  pedestal.position.y = 2;
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const pedestalInlay = new THREE.Mesh(
    new THREE.RingGeometry(40, 44, 64),
    new THREE.MeshBasicMaterial({ color: COLORS.orb, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  pedestalInlay.rotation.x = -Math.PI / 2;
  pedestalInlay.position.y = 4.2;
  scene.add(pedestalInlay);

  // Braziers outside the wall
  const braziers: Brazier[] = [];
  for (let i = 0; i < 4; i++) {
    const a = TAU / 8 + (i / 4) * TAU;
    const r = ARENA_R + 85;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(13, 18, 46, 8), stone('#353e51'));
    base.position.set(x, 23, z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(22, 12, 12, 8), new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: 0.6, roughness: 0.5, flatShading: true }));
    bowl.position.set(x, 52, z);
    scene.add(shadowed(base), shadowed(bowl));

    const flame = new THREE.Mesh(new THREE.ConeGeometry(11, 30, 6), new THREE.MeshBasicMaterial({ color: '#ffb35c', toneMapped: false }));
    flame.position.set(x, 72, z);
    const glow = glowSprite(glowTex, '#ff8a3a', 130, 0.8);
    glow.position.set(x, 72, z);
    const light = new THREE.PointLight('#ff9b50', 18000, 700, 2);
    light.position.set(x, 90, z);
    scene.add(flame, glow, light);
    braziers.push({ light, flame, glow, seed: i * 1.7 });
  }

  return { braziers, pedestalInlay };
}

export function buildPillar(r: number): THREE.Group {
  const g = new THREE.Group();
  const mat = stone('#4b556c');
  const dark = stone('#3a4357');
  const parts: [THREE.BufferGeometry, THREE.Material, number][] = [
    [new THREE.CylinderGeometry(r * 1.22, r * 1.34, 10, 8), dark, 5],
    [new THREE.CylinderGeometry(r * 0.9, r, 62, 8), mat, 41],
    [new THREE.CylinderGeometry(r * 1.22, r * 0.95, 10, 8), dark, 77],
    [new THREE.CylinderGeometry(r * 1.08, r * 1.22, 5, 8), mat, 84.5],
  ];
  for (const [geo, m, y] of parts) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.y = y;
    g.add(mesh);
  }
  // Rune band
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.955, r * 0.965, 4, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: '#79c8ff', transparent: true, opacity: 0.55, toneMapped: false }),
  );
  band.position.y = 52;
  shadowed(g);
  g.add(band);
  return g;
}

// ---------------------------------------------------------------- champion

export interface ChampionRig {
  root: THREE.Group;
  /** Tilt from movement / falling, in world space. */
  lean: THREE.Group;
  /** Rotates with the aim direction (local +X = forward, +Z = right). */
  yaw: THREE.Group;
  /** Bob / squash. */
  body: THREE.Group;
  /** Staff (mage) or axe (warrior); swings around its local Z axis. */
  weapon: THREE.Group;
  tip: THREE.Mesh;
  tipGlow: THREE.Sprite;
  /** Materials that flash white on hit. */
  mats: (THREE.MeshStandardMaterial | THREE.MeshToonMaterial)[];
  ring: THREE.Mesh;
  pointer: THREE.Group;
  shield: THREE.Group;
  slowRing: THREE.Mesh;
  /** Floating sigil shown while marked by an assassin. */
  markSigil: THREE.Mesh;
  /** Vines around the feet while rooted. */
  rootRing: THREE.Group;
  /** Eye above the head while revealed by a sonic arrow. */
  revealEye: THREE.Group;
}

export function buildChampion(champ: number, color: string, glowTex: THREE.Texture): ChampionRig {
  if (champ === CHAMP.MAGE) return buildMage(color, glowTex);
  if (champ === CHAMP.WARRIOR) return buildWarrior(color, glowTex);
  if (champ === CHAMP.ASSASSIN) return buildAssassin(color, glowTex);
  if (champ === CHAMP.ARCHER) return buildArcher(color, glowTex);
  // No modeled skin yet: the test mannequin.
  return buildDummy(color, glowTex);
}

// ---------------------------------------------------------------- toon style

let toonRamp: THREE.DataTexture | null = null;

/** Four-step light ramp: crisp shading bands instead of smooth gradients. */
function toonGradient(): THREE.DataTexture {
  if (!toonRamp) {
    const steps = [115, 170, 220, 255];
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
    toonRamp = new THREE.DataTexture(data, steps.length, 1);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

function toon(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

let softRamp: THREE.DataTexture | null = null;

/** Toon material with a lighter shadow band, for faces and hair that face away from the key light. */
function toonSoft(color: THREE.ColorRepresentation) {
  if (!softRamp) {
    const steps = [175, 205, 232, 255];
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
    softRamp = new THREE.DataTexture(data, steps.length, 1);
    softRamp.minFilter = softRamp.magFilter = THREE.NearestFilter;
    softRamp.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: softRamp });
}

let outlineMaterial: THREE.MeshBasicMaterial | null = null;

/** Inverted hull: the back faces pushed out along their normals by a fixed width. */
function outlineMat(): THREE.MeshBasicMaterial {
  if (!outlineMaterial) {
    outlineMaterial = new THREE.MeshBasicMaterial({ color: '#0d0b18', side: THREE.BackSide });
    outlineMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.55;');
    };
  }
  return outlineMaterial;
}

function outline(mesh: THREE.Mesh) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat());
  o.castShadow = false;
  o.userData.outline = true;
  mesh.add(o);
}

/** Capsule from point a to point b. */
function limb(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.1, len - 2 * r), 4, 10), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function lathe(profile: [number, number][], segments = 28): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/** Simple seeded noise in [0, 1) for a ring index, so lathe seams match. */
function ringNoise(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Lathe whose bottom edge is torn: the lowest profile point of each segment drops
 * by up to `tear`. Optional phi range makes partial shells (cloaks, capes).
 */
function raggedLathe(profile: [number, number][], segments: number, tear: number, seed: number, phiStart = 0, phiLength = TAU): THREE.LatheGeometry {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
    phiStart,
    phiLength,
  );
  const pos = geo.attributes.position;
  const n = profile.length;
  const full = phiLength >= TAU - 1e-6;
  for (let i = 0; i <= segments; i++) {
    const k = full ? i % segments : i;
    const drop = (i % 2 ? 0.25 : 0.75) * tear + ringNoise(k, seed) * tear * 0.6;
    pos.setY(i * n, pos.getY(i * n) - drop);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Witch gown: deep purple with gold filigree hem, vines and a scattered pattern. u around, v bottom→top. */
function makeWitchGownTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#3e2759');
  grad.addColorStop(1, '#25163a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 20; i++) {
    const x = (i / 20) * W;
    const fold = g.createLinearGradient(x, 0, x + W / 20, 0);
    fold.addColorStop(0, 'rgba(0,0,0,0.2)');
    fold.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    fold.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = fold;
    g.fillRect(x, 0, W / 20, H);
  }
  g.strokeStyle = '#d9b260';
  g.fillStyle = '#d9b260';
  // Hem band with scrolls
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, H - 30);
  g.lineTo(W, H - 30);
  g.stroke();
  g.lineWidth = 3;
  for (let x = 0; x < W; x += 64) {
    g.beginPath();
    g.moveTo(x, H - 36);
    g.bezierCurveTo(x + 10, H - 90, x + 50, H - 90, x + 32, H - 60);
    g.bezierCurveTo(x + 22, H - 46, x + 12, H - 60, x + 22, H - 66);
    g.stroke();
  }
  // Rising vines
  for (let x = 32; x < W; x += 128) {
    g.beginPath();
    g.moveTo(x, H - 90);
    for (let y = H - 90; y > 140; y -= 30) g.quadraticCurveTo(x + (y % 60 ? 14 : -14), y - 15, x, y - 30);
    g.stroke();
  }
  // Tiny diamonds
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(217, 178, 96, 0.55)';
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = 30 + rnd() * (H - 150);
    g.beginPath();
    g.moveTo(x, y - 4);
    g.lineTo(x + 3, y);
    g.lineTo(x, y + 4);
    g.lineTo(x - 3, y);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- mage

/**
 * Mage — witch (from the concept sheet), toon style: crooked purple hat with a
 * skull and gold chain band, purple gown with gold filigree and a wine-red lining
 * (high-low hem showing white stockings and gold heels), bell sleeves, platinum
 * hair, gold choker and bracers, a slim gold staff with a red gem.
 * Team color: the hat skull's eyes, the pendant gem and the staff glow.
 */
function buildMage(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matGown = toon('#ffffff', { map: makeWitchGownTexture() });
  const matPurple = toon('#3a2454');
  const matPurpleDark = toon('#24152f');
  const matLining = toon('#6e1f2c', { side: THREE.BackSide });
  const matSkin = toonSoft('#f3c3a6');
  const matStocking = toon('#ece6df');
  const matHair = toonSoft('#e6dccd');
  const matHairDark = toonSoft('#bfb3a3');
  const matGold = toon('#dcb465');
  const matBone = toon('#d8ccb0');
  const matRuby = new THREE.MeshBasicMaterial({ color: '#d42a3c', toneMapped: false });
  const matGlow = new THREE.MeshBasicMaterial({ color: bright, toneMapped: false });
  const matEyeWhite = new THREE.MeshBasicMaterial({ color: '#f4f1ee' });
  const matIris = new THREE.MeshBasicMaterial({ color: '#7d6cc4' });
  const matPupil = new THREE.MeshBasicMaterial({ color: '#1a1026' });
  const matLips = new THREE.MeshBasicMaterial({ color: '#b04a5c' });

  const root = new THREE.Group();
  const lean = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  root.add(lean);
  lean.add(yaw);
  yaw.add(body);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const outlined: THREE.Mesh[] = [];
  const keep = <T extends THREE.Mesh>(m: T) => (outlined.push(m), m);

  // Legs in white stockings with gold heels (seen through the high-low hem)
  for (const side of [-1, 1]) {
    keep(limb(body, v(0.5, 25, side * 3.8), v(2.2, 12, side * 4.4), 2.5, matStocking));
    keep(limb(body, v(2.2, 12, side * 4.4), v(1.4, 3, side * 4.6), 2.1, matStocking));
    for (const y of [9, 16]) add(new THREE.TorusGeometry(2.4, 0.3, 4, 12), matGold, 2, y, side * 4.4).rotation.x = Math.PI / 2;
    keep(add(new THREE.BoxGeometry(5, 1.6, 2.6), matGold, 3.2, 1.6, side * 4.6));
    keep(add(new THREE.ConeGeometry(0.5, 3, 5), matGold, -0.2, 1.5, side * 4.6));
  }

  // Gown: high-low skirt (front hem lifted), gold-patterned outside, wine lining inside
  const skirt = lathe([[18, 0], [17.2, 4], [15.4, 10], [13, 17], [10.6, 24], [8.9, 30], [8.2, 33]], 32);
  const sp = skirt.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const y = sp.getY(i);
    const front = Math.max(0, x / Math.hypot(x, z || 1e-6));
    if (y < 24) sp.setY(i, y + front * front * (24 - y) * 0.68);
  }
  skirt.computeVertexNormals();
  keep(add(skirt, matGown, 0, 0, 0));
  add(skirt, matLining, 0, 0, 0);

  // Bodice with gold trim and a team pendant
  keep(add(lathe([[8.2, 33], [8.7, 36], [9.5, 40], [9.6, 43], [8.8, 46], [6.2, 48.6], [2.8, 50.2]]), matPurpleDark, 0, 0, 0));
  for (const y of [33.5, 46.2]) add(new THREE.TorusGeometry(y > 40 ? 8.8 : 8.3, 0.5, 6, 28), matGold, 0, y, 0).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) limb(body, v(9.2, 46.3, side * 4.6), v(8.7, 37.8, 0), 0.45, matGold);
  limb(body, v(8.8, 37.8, 0), v(8.6, 34, 0), 0.45, matGold);
  add(new THREE.OctahedronGeometry(1.5, 0), matTeam, 9.1, 41.5, 0).scale.set(0.6, 1.3, 1);
  add(new THREE.OctahedronGeometry(0.9, 0), matGlow, 9.6, 41.5, 0);

  // Bare shoulders, arms inside long bell sleeves (purple outside, wine inside), gold bracers
  for (const side of [-1, 1]) keep(add(new THREE.SphereGeometry(3, 14, 10), matSkin, 0, 46.4, side * 8.8));
  const rElbow = v(2.5, 38, 12.4);
  const rHand = v(5, 30.5, 15.2);
  const lElbow = v(1.5, 37.5, -11.8);
  const lHand = v(5, 30, -11.2);
  keep(limb(body, v(0, 46.4, 8.8), rElbow, 1.7, matSkin));
  keep(limb(body, rElbow, rHand, 1.45, matSkin));
  keep(limb(body, v(0, 46.4, -8.8), lElbow, 1.7, matSkin));
  keep(limb(body, lElbow, lHand, 1.45, matSkin));
  for (const hand of [rHand, lHand]) keep(add(new THREE.SphereGeometry(1.8, 12, 10), matSkin, hand.x, hand.y - 1, hand.z));
  for (const [elbow, hand, side] of [[rElbow, rHand, 1], [lElbow, lHand, -1]] as const) {
    const sleeveGeo = raggedLathe([[6.2, -19], [5.2, -13], [3.5, -6], [2.4, 0]], 20, 2.2, side + 3);
    const sleeve = keep(add(sleeveGeo, matPurple, elbow.x - 0.5, elbow.y + 5.5, elbow.z + side * 0.8));
    sleeve.rotation.x = side * 0.12;
    const lining = add(sleeveGeo, matLining, 0, 0, 0, sleeve);
    lining.castShadow = false;
    const bracer = add(new THREE.CylinderGeometry(1.9, 1.7, 2.6, 10), matGold, hand.x - 0.8, hand.y + 2, hand.z);
    bracer.rotation.x = side * 0.15;
    add(new THREE.OctahedronGeometry(0.7, 0), matRuby, hand.x + 0.9, hand.y + 2, hand.z);
  }

  // Neck, gold choker, head and face
  keep(add(new THREE.CylinderGeometry(2.2, 2.7, 5, 12), matSkin, 0, 50.5, 0));
  add(new THREE.TorusGeometry(2.6, 0.6, 6, 16), matGold, 0, 51, 0).rotation.x = Math.PI / 2;
  add(new THREE.OctahedronGeometry(0.8, 0), matRuby, 2.9, 50.6, 0);
  keep(add(new THREE.SphereGeometry(6.1, 24, 18), matSkin, 0.7, 57.4, 0)).scale.set(1, 1.1, 0.92);
  keep(add(new THREE.SphereGeometry(2.3, 14, 10), matSkin, 2.6, 53.9, 0)).scale.set(1, 0.85, 1.25);
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(1.25, 12, 8), matEyeWhite, 5.75, 57.8, side * 2.4).scale.set(0.45, 0.65, 1);
    add(new THREE.SphereGeometry(0.8, 10, 8), matIris, 6.25, 57.7, side * 2.3).scale.set(0.4, 0.9, 1);
    add(new THREE.SphereGeometry(0.38, 8, 6), matPupil, 6.6, 57.7, side * 2.3).scale.set(0.4, 1, 1);
    const brow = add(new THREE.BoxGeometry(0.5, 0.4, 2.5), matHairDark, 6, 59.7, side * 2.5);
    brow.rotation.x = side * -0.12;
    const ear = keep(add(new THREE.ConeGeometry(1.2, 5.5, 8), matSkin, -0.4, 58, side * 6.2));
    ear.scale.set(0.55, 1, 1);
    ear.rotation.x = side * (Math.PI / 2 - 0.55);
    ear.rotation.z = 0.35;
  }
  add(new THREE.ConeGeometry(0.42, 1.3, 6), matSkin, 6.45, 56.3, 0).rotation.z = -Math.PI / 2 + 0.6;
  add(new THREE.BoxGeometry(0.35, 0.42, 1.8), matLips, 6.05, 53.9, 0);

  // Long platinum hair: crown, bangs, locks to the waist at the back and sides
  const crown = keep(add(new THREE.SphereGeometry(6.8, 24, 14, 0, TAU, 0, Math.PI * 0.6), matHair, -0.5, 58.4, 0));
  crown.rotation.z = 0.32;
  crown.scale.set(1.04, 1.06, 0.98);
  for (const side of [-1, 1]) keep(limb(body, v(5.6, 61.6, side * 0.8), v(5.2, 57.4, side * 5.2), 1.4, matHair));
  for (let i = 0; i < 6; i++) {
    const z = -6 + i * 2.4;
    const wave = i % 2 ? 1.2 : -1.2;
    keep(limb(body, v(-4.6, 59, z * 0.85), v(-7.6 + wave * 0.3, 33 + Math.abs(z) * 0.6, z * 1.2 + wave), 2.2, i % 2 ? matHair : matHairDark));
  }
  for (const side of [-1, 1]) {
    keep(limb(body, v(2.4, 56.5, side * 6.2), v(3.4, 40, side * 8.2), 1.6, matHair));
    keep(limb(body, v(0, 56, side * 6.6), v(-2, 38, side * 9.2), 1.8, matHairDark));
  }

  // Witch hat: wide brim (wine underside), crooked purple crown, gold chain band, skull
  const hat = new THREE.Group();
  hat.position.set(0, 61.4, 0);
  hat.rotation.z = 0.12;
  body.add(hat);
  const brim = keep(add(lathe([[5.6, 0], [15, -0.6], [16.2, 0.3], [15, 0.9], [10, 1], [5.6, 1.6]], 36), matPurple, 0, 0, 0, hat));
  const under = add(new THREE.RingGeometry(6, 15.2, 36), toon('#5a1a26', { side: THREE.DoubleSide }), 0, -0.55, 0, hat);
  under.rotation.x = Math.PI / 2;
  const crownGeo = lathe([[7, 0.8], [6.5, 4], [5.4, 8], [4.2, 12], [3, 16], [1.9, 20], [0.9, 24], [0, 28]], 28);
  const hp = crownGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i);
    // Two kinks: slump back, then the tip flops to the side
    if (y > 10) hp.setX(i, hp.getX(i) - 0.03 * (y - 10) * (y - 10));
    if (y > 20) hp.setZ(i, hp.getZ(i) + 0.12 * (y - 20) * (y - 20));
    hp.setX(i, hp.getX(i) + Math.sin(y * 0.9) * 0.25);
  }
  crownGeo.computeVertexNormals();
  keep(add(crownGeo, matPurple, 0, 0, 0, hat));
  const linkGeo = new THREE.TorusGeometry(0.75, 0.3, 5, 10);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    const link = add(linkGeo, matGold, Math.cos(a) * 6.9, 2.4, Math.sin(a) * 6.9, hat);
    link.rotation.set(0, -a + Math.PI / 2, i % 2 ? Math.PI / 2 : 0);
  }
  const skullHead = keep(add(new THREE.SphereGeometry(2.2, 12, 10), matBone, 6.8, 3.6, 0, hat));
  skullHead.scale.set(0.8, 1, 0.9);
  add(new THREE.BoxGeometry(1.4, 1.2, 2.2), matBone, 7.1, 1.9, 0, hat);
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.55, 8, 6), matGlow, 8.4, 3.8, side * 0.8, hat);

  // Staff: slim gold rod with ornate prongs holding a red gem
  const staff = new THREE.Group();
  staff.position.set(5, 30, 16);
  body.add(staff);
  keep(add(new THREE.CylinderGeometry(0.75, 0.9, 62, 8), matGold, 0, 15, 0, staff));
  for (const y of [-10, 10, 32]) add(new THREE.SphereGeometry(1.3, 8, 6), matGold, 0, y, 0, staff);
  keep(add(new THREE.ConeGeometry(1.2, 6, 6), matGold, 0, -18.5, 0, staff)).rotation.x = Math.PI;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const prong = keep(limb(staff, v(0, 45, 0), v(Math.cos(a) * 3.4, 53, Math.sin(a) * 3.4), 0.45, matGold));
    prong.castShadow = true;
  }
  const gem = keep(add(new THREE.OctahedronGeometry(3, 0), matRuby, 0, 52, 0, staff));
  gem.scale.set(0.8, 1.6, 0.8);
  add(new THREE.ConeGeometry(0.8, 5, 6), matGold, 0, 59, 0, staff);
  const tip = add(new THREE.OctahedronGeometry(1.4, 0), matGlow, 0, 52, 0, staff);
  const tipGlow = glowSprite(glowTex, team, 30);
  tipGlow.position.set(0, 52, 0);
  staff.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;
  brim.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matLining || m === matEyeWhite || m === matIris || m === matPupil || m === matLips || m === matGlow) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: staff, tip, tipGlow, mats: [matTeam, matGown, matPurple, matPurpleDark, matSkin, matHair], ...markers };
}

/** Team ring + facing arrow on the floor, counter shield, slow ring. Don't tilt with the body. */
function addMarkers(root: THREE.Group, team: THREE.Color, bright: THREE.Color) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLAYER_R + 3, PLAYER_R + 6.5, 48),
    new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.8;
  root.add(ring);

  const pointer = new THREE.Group();
  const tri = new THREE.Shape();
  tri.moveTo(PLAYER_R + 20, 0);
  tri.lineTo(PLAYER_R + 9, -7);
  tri.lineTo(PLAYER_R + 9, 7);
  tri.closePath();
  const arrow = new THREE.Mesh(
    new THREE.ShapeGeometry(tri),
    new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.y = 0.9;
  pointer.add(arrow);
  root.add(pointer);

  // Counter: hex shield bubble
  const shield = new THREE.Group();
  shield.position.y = 34;
  shield.add(
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(PLAYER_R + 18, 1),
      new THREE.MeshBasicMaterial({ color: bright, wireframe: true, transparent: true, opacity: 0.75, toneMapped: false }),
    ),
    new THREE.Mesh(
      new THREE.SphereGeometry(PLAYER_R + 16, 24, 16),
      new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    ),
  );
  shield.visible = false;
  root.add(shield);

  const slowRing = new THREE.Mesh(
    new THREE.RingGeometry(PLAYER_R + 9, PLAYER_R + 13, 6),
    new THREE.MeshBasicMaterial({ color: COLORS.frost, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
  );
  slowRing.rotation.x = -Math.PI / 2;
  slowRing.position.y = 1;
  slowRing.visible = false;
  root.add(slowRing);

  const markSigil = new THREE.Mesh(
    new THREE.TorusGeometry(9, 1.8, 4, 3),
    new THREE.MeshBasicMaterial({ color: COLORS.shadow, transparent: true, opacity: 0.95, toneMapped: false }),
  );
  markSigil.position.y = 92;
  markSigil.visible = false;
  root.add(markSigil);

  // Root: a few vine loops hugging the feet.
  const rootRing = new THREE.Group();
  const vineMat = new THREE.MeshBasicMaterial({ color: COLORS.vine, toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(PLAYER_R - 2 - i * 3, 1.6, 5, 24), vineMat);
    loop.rotation.set(Math.PI / 2 + (i - 1) * 0.25, (i - 1) * 0.3, 0);
    loop.position.y = 3 + i * 5;
    rootRing.add(loop);
  }
  rootRing.visible = false;
  root.add(rootRing);

  // Revealed: an open eye floating above the head.
  const revealEye = new THREE.Group();
  const eyeMat = new THREE.MeshBasicMaterial({ color: COLORS.sonic, transparent: true, opacity: 0.95, toneMapped: false, side: THREE.DoubleSide });
  const lid = new THREE.Mesh(new THREE.TorusGeometry(8, 1.4, 4, 24), eyeMat);
  lid.scale.set(1.4, 0.75, 1);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(3.4, 16), eyeMat);
  revealEye.add(lid, pupil);
  revealEye.position.y = 96;
  revealEye.visible = false;
  root.add(revealEye);

  return { ring, pointer, shield, slowRing, markSigil, rootRing, revealEye };
}

/**
 * Test mannequin for champions without a modeled skin: team-colored torso, grey
 * limbs, a visor showing where it faces and a plain rod as the weapon.
 */
function buildDummy(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matGrey = toon('#8d93a3');
  const matDark = toon('#3a3f4c');
  const matWood = toon('#8a6640');
  const matGlow = new THREE.MeshBasicMaterial({ color: bright, toneMapped: false });

  const root = new THREE.Group();
  const lean = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  root.add(lean);
  lean.add(yaw);
  yaw.add(body);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const outlined: THREE.Mesh[] = [];
  const keep = <T extends THREE.Mesh>(m: T) => (outlined.push(m), m);

  // Legs and feet
  for (const side of [-1, 1]) {
    keep(limb(body, v(0, 26, side * 5), v(0.5, 4, side * 5.4), 3, matGrey));
    keep(add(new THREE.BoxGeometry(7, 3, 4.6), matDark, 1.6, 1.5, side * 5.4));
  }
  // Pelvis, torso, belt
  keep(add(new THREE.SphereGeometry(7.6, 16, 12), matDark, 0, 27, 0)).scale.set(1, 0.6, 1.15);
  keep(add(new THREE.CapsuleGeometry(8.4, 12, 4, 16), matTeam, 0, 38, 0)).scale.set(0.9, 1, 1.08);
  const belt = add(new THREE.TorusGeometry(8.2, 1, 6, 24), matDark, 0, 30.5, 0);
  belt.rotation.x = Math.PI / 2;

  // Arms: the left hand holds the rod out front, the right one rests near the chest.
  const lHand = v(13, 37, -9);
  const rHand = v(7, 36, 9);
  keep(limb(body, v(0, 45, -10.5), v(5, 40, -12), 2.4, matGrey));
  keep(limb(body, v(5, 40, -12), lHand, 2.2, matGrey));
  keep(limb(body, v(0, 45, 10.5), v(1, 37, 12), 2.4, matGrey));
  keep(limb(body, v(1, 37, 12), rHand, 2.2, matGrey));
  for (const h of [lHand, rHand]) keep(add(new THREE.SphereGeometry(2.6, 10, 8), matDark, h.x, h.y, h.z));

  // Head with a glowing visor so the facing reads at a glance
  keep(add(new THREE.SphereGeometry(7.2, 18, 14), matGrey, 0.5, 57, 0));
  const visor = add(new THREE.BoxGeometry(2, 2.2, 9), matGlow, 6.8, 58, 0);
  visor.castShadow = false;

  // Rod: rotates around its local Z axis at the left hand.
  const weapon = new THREE.Group();
  weapon.position.copy(lHand);
  weapon.rotation.z = -0.22;
  body.add(weapon);
  keep(add(new THREE.CylinderGeometry(0.9, 0.9, 54, 8), matWood, 0, 12, 0, weapon));
  const tip = add(new THREE.OctahedronGeometry(2.2, 0), matGlow, 0, 40, 0, weapon);
  const tipGlow = glowSprite(glowTex, team, 22);
  tipGlow.position.copy(tip.position);
  weapon.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon, tip, tipGlow, mats: [matTeam, matGrey, matDark], ...markers };
}

/** Overlapping scales for the orc's pauldron. */
function makeScaleTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4d5743';
  g.fillRect(0, 0, S, S);
  const r = 16;
  for (let row = 0; row * r * 0.75 < S + r; row++) {
    for (let col = -1; col * r * 2 < S + r * 2; col++) {
      const x = col * r * 2 + (row % 2 ? r : 0);
      const y = row * r * 0.75;
      const grad = g.createRadialGradient(x, y - r * 0.3, 2, x, y, r);
      grad.addColorStop(0, '#9aa585');
      grad.addColorStop(1, '#5e6a52');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI);
      g.fill();
      g.strokeStyle = '#2a3024';
      g.lineWidth = 2;
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

/** Torn cloth panel: straight top edge, ragged bottom. Lies in the XY plane, hanging down from y = 0. */
function raggedPanel(width: number, height: number, teeth: number, seed: number): THREE.ShapeGeometry {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  for (let i = teeth; i >= 0; i--) {
    const x = -width / 2 + (i / teeth) * width;
    const y = -height * (i % 2 ? 0.62 + rnd() * 0.15 : 0.85 + rnd() * 0.15);
    shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/** Wrap a limb from a to b with rings (bandages, bracers). */
function wraps(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, count: number, mat: THREE.Material) {
  const dir = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  const geo = new THREE.TorusGeometry(r, 0.75, 5, 14);
  for (let i = 0; i < count; i++) {
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(a).addScaledVector(dir, (i + 0.5) / count);
    ring.quaternion.copy(q);
    ring.rotateX((i % 2 ? 1 : -1) * 0.18);
    parent.add(ring);
  }
}

/**
 * Warrior — orc berserker (from the concept sheet), toon style: green skin, black
 * mohawk and braid, tusks and a roaring mouth, a scaly horned pauldron on the left
 * shoulder, chain across the chest, skull belt over chainmail and torn cloth,
 * wrapped arms and legs, knee plates, sandals and a notched cleaver.
 * Team color: front cloth, pauldron strips and eyes.
 */
function buildWarrior(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team, { side: THREE.DoubleSide });
  const matSkin = toon('#7f9545');
  const matSkinDark = toon('#5f7334');
  const matHair = toon('#1c1a1a');
  const matLeather = toon('#6a4428');
  const matWrap = toon('#8e3d26');
  const matCloth = toon('#7a2f20', { side: THREE.DoubleSide });
  const matMail = toon('#6f6c69');
  const matMetal = toon('#a8a29a');
  const matBone = toon('#e8dcc0');
  const matScales = toon('#ffffff', { map: makeScaleTexture() });
  const matMouth = new THREE.MeshBasicMaterial({ color: '#3a1010' });
  const matSocket = new THREE.MeshBasicMaterial({ color: '#1a1410' });
  const matGlow = new THREE.MeshBasicMaterial({ color: bright, toneMapped: false });

  const root = new THREE.Group();
  const lean = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  root.add(lean);
  lean.add(yaw);
  yaw.add(body);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const outlined: THREE.Mesh[] = [];
  const keep = <T extends THREE.Mesh>(m: T) => (outlined.push(m), m);
  const skull = (x: number, y: number, z: number, size: number, facing: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = facing;
    keep(add(new THREE.SphereGeometry(size, 12, 10), matBone, 0, 0, 0, g)).scale.set(0.9, 1, 0.85);
    keep(add(new THREE.BoxGeometry(size * 0.9, size * 0.6, size * 1.1), matBone, size * 0.25, -size * 0.75, 0, g));
    for (const side of [-1, 1]) add(new THREE.SphereGeometry(size * 0.28, 8, 6), matSocket, size * 0.78, size * 0.05, side * size * 0.38, g);
    body.add(g);
  };

  // Legs: thighs, wrapped shins, knee plates, sandals
  for (const side of [-1, 1]) {
    const hip = v(0, 25, side * 7.2);
    const knee = v(1.8, 13.5, side * 8.6);
    const ankle = v(0.4, 3.2, side * 8.8);
    keep(limb(body, hip, knee, 4.4, matSkin));
    keep(limb(body, knee, ankle, 3.9, matWrap));
    wraps(body, knee, ankle, 4.1, 4, matLeather);
    const plate = keep(add(new THREE.SphereGeometry(3.4, 10, 8, 0, Math.PI), matMetal, knee.x + 2.4, knee.y + 0.6, knee.z));
    plate.rotation.y = -Math.PI / 2;
    plate.scale.set(1, 1.15, 0.6);
    keep(add(new THREE.BoxGeometry(9, 2.6, 6), matLeather, ankle.x + 2.2, 1.3, ankle.z));
    keep(add(new THREE.CapsuleGeometry(2.4, 3.5, 3, 8), matSkin, ankle.x + 3.4, 3, ankle.z)).rotation.z = Math.PI / 2;
  }

  // Chainmail skirt, torn cloth (team front, red back and sides)
  keep(add(lathe([[13.5, 12], [12.5, 18], [11.5, 25], [11.2, 28]], 20), matMail, 0, 0, 0));
  const front = add(raggedPanel(12, 17, 7, 3), matTeam, 11.6, 27, 0);
  front.rotation.y = Math.PI / 2;
  front.rotation.z = -0.08;
  const back = add(raggedPanel(14, 20, 8, 7), matCloth, -11.6, 27, 0);
  back.rotation.y = -Math.PI / 2;
  for (const side of [-1, 1]) {
    const flap = add(raggedPanel(10, 14, 5, 11 + side), matCloth, 0, 27, side * 12.4);
    flap.rotation.y = side < 0 ? Math.PI : 0;
  }

  // Belt with a skull buckle and skulls on the hips
  const belt = keep(add(new THREE.TorusGeometry(12, 1.8, 6, 24), matLeather, 0, 27.5, 0));
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 1.15, 1);
  skull(12.6, 27.8, 0, 3.2, 0);
  skull(1, 25.5, 13.6, 2.4, -Math.PI / 2);
  skull(1, 25.5, -13.6, 2.4, Math.PI / 2);

  // Torso: big lathed chest, wider than deep, with pecs
  const torsoProfile: [number, number][] = [[11, 27], [12.6, 32], [14.8, 39], [15.8, 45], [13.8, 49.5], [7.5, 52.5], [4, 53.5]];
  const torso = keep(add(lathe(torsoProfile, 24), matSkin, 0, 0, 0));
  torso.scale.set(0.85, 1, 1.15);
  /** Torso radius at height y (linear between profile points). */
  const torsoR = (y: number) => {
    for (let i = 1; i < torsoProfile.length; i++) {
      const [r0, y0] = torsoProfile[i - 1];
      const [r1, y1] = torsoProfile[i];
      if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
    }
    return torsoProfile[torsoProfile.length - 1][0];
  };
  for (const side of [-1, 1]) keep(add(new THREE.SphereGeometry(6, 14, 10), matSkin, 8.6, 43, side * 6)).scale.set(0.55, 0.75, 1);
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.6, 0.5, 6), matSkinDark, 11 - i * 0.6, 37 - i * 3.2, 0);

  // Chain across the chest, bone necklace with fangs
  const linkGeo = new THREE.TorusGeometry(1.2, 0.42, 5, 10);
  // Diagonal from the right shoulder to the left hip, lying on the (elliptical) chest.
  for (let i = 0; i <= 13; i++) {
    const t = i / 13;
    const y = 48 - t * 19;
    const a = 0.95 - t * 1.9;
    const r = torsoR(y) + 0.7;
    const link = add(linkGeo, matMetal, Math.cos(a) * r * 0.85, y, Math.sin(a) * r * 1.15);
    link.rotation.set(0, -a + (i % 2 ? Math.PI / 2 : 0), 0.75);
  }
  const necklace = add(new THREE.TorusGeometry(7.6, 0.6, 5, 18), matLeather, 1.4, 51, 0);
  necklace.rotation.x = Math.PI / 2;
  necklace.rotation.y = 0.3;
  for (let i = -3; i <= 3; i++) {
    const a = (i / 3) * 1.1;
    const fang = add(new THREE.ConeGeometry(0.6, 3.2, 5), matBone, 1.4 + Math.cos(a) * 7.6, 49.4, Math.sin(a) * 7.6);
    fang.rotation.x = Math.PI;
  }

  // Left shoulder: scaly pauldron with horns and torn strips (team colored)
  const pauldron = new THREE.Group();
  pauldron.position.set(0, 49, -15);
  body.add(pauldron);
  const dome = keep(add(new THREE.SphereGeometry(10.5, 18, 12, 0, TAU, 0, Math.PI * 0.55), matScales, 0, 0, 0, pauldron));
  dome.scale.set(1.05, 0.8, 1);
  dome.rotation.x = -0.35;
  for (const [x, z, h, tilt] of [[4, -6, 9, 0.6], [-1, -8, 11, 0.8], [-6, -5, 8, 0.6]]) {
    const horn = keep(add(new THREE.ConeGeometry(1.8, h, 7), matBone, x, 4, z, pauldron));
    horn.rotation.x = -tilt;
  }
  for (let i = 0; i < 3; i++) {
    const strip = add(raggedPanel(5.5, 11, 3, 19 + i), i === 1 ? matTeam : matCloth, -3 + i * 4, -4, -4.5, pauldron);
    strip.rotation.y = Math.PI / 2;
    strip.rotation.x = 0.4;
  }

  // Arms: huge, forearms wrapped; the right fist holds the cleaver
  const shoulders = [v(0, 46.5, 16.5), v(0, 46.5, -16.5)];
  const elbows = [v(1.5, 34, 20.5), v(1, 34, -20)];
  const fists = [v(6, 26.5, 20), v(4.5, 25, -18.5)];
  for (let i = 0; i < 2; i++) {
    keep(add(new THREE.SphereGeometry(6, 14, 10), matSkin, shoulders[i].x, shoulders[i].y, shoulders[i].z * 0.95));
    keep(limb(body, shoulders[i], elbows[i], 4.8, matSkin));
    keep(limb(body, elbows[i], fists[i], 4.3, matWrap));
    wraps(body, elbows[i], fists[i], 4.5, 4, matLeather);
    keep(add(new THREE.SphereGeometry(4, 12, 10), matSkin, fists[i].x, fists[i].y - 1.5, fists[i].z));
  }

  // Head: pushed forward, heavy brow, open roaring mouth with tusks, pointed ears
  const head = new THREE.Group();
  head.position.set(3.5, 57, 0);
  body.add(head);
  keep(add(new THREE.SphereGeometry(7.2, 18, 14), matSkin, 0, 0.8, 0, head)).scale.set(1, 0.95, 0.92);
  keep(add(new THREE.SphereGeometry(5.6, 16, 12), matSkin, 2.4, -3.4, 0, head)).scale.set(0.95, 0.72, 1.22); // jaw
  keep(limb(head, v(6.1, 2.6, -4.6), v(6.1, 2.6, 4.6), 1.5, matSkinDark)); // brow ridge
  keep(add(new THREE.SphereGeometry(1.5, 10, 8), matSkinDark, 7.4, 0.4, 0, head)).scale.set(0.8, 0.8, 1.2); // nose
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.9, 1, 2.2), matGlow, 6.6, 1.6, side * 2.5, head); // eyes
  add(new THREE.BoxGeometry(1.6, 3, 5.4), matMouth, 6.6, -3.4, 0, head);
  for (const side of [-1, 1]) {
    const tusk = keep(add(new THREE.ConeGeometry(1.25, 6.5, 7), matBone, 7, -2.8, side * 3.3, head));
    tusk.rotation.x = side * -0.3;
    tusk.rotation.z = -0.25;
    const ear = keep(add(new THREE.ConeGeometry(1.5, 6.5, 6), matSkin, -0.5, 1.5, side * 7.2, head));
    ear.scale.set(0.55, 1, 1);
    ear.rotation.x = side * (Math.PI / 2 - 0.35);
    ear.rotation.z = 0.5;
    add(new THREE.TorusGeometry(0.9, 0.25, 4, 10), matMetal, -0.2, -0.6, side * 8.2, head).rotation.y = Math.PI / 2;
  }

  // Mohawk and a long braid down the back
  for (let i = 0; i < 7; i++) {
    const tuft = keep(add(new THREE.ConeGeometry(1.9, 6.5 + Math.sin((i / 6) * Math.PI) * 2.5, 5), matHair, 4.5 - i * 1.9, 8.6 - Math.abs(i - 2.5) * 0.45, 0, head));
    tuft.scale.set(1, 1, 0.6);
    tuft.rotation.z = 0.35 + i * 0.13;
  }
  for (let i = 0; i < 9; i++) {
    keep(add(new THREE.SphereGeometry(1.7 - i * 0.07, 8, 6), matHair, -8 - i * 0.35, 3 - i * 3.1, 0, head)).scale.set(0.8, 1.2, 0.9);
    if (i % 3 === 2) add(new THREE.CylinderGeometry(1.3, 1.3, 1, 8), matBone, -8.3 - i * 0.35, 1.4 - i * 3.1, 0, head);
  }

  // Cleaver: wrapped handle, notched one-sided blade with a back spike
  const axe = new THREE.Group();
  axe.position.copy(fists[0]);
  body.add(axe);
  keep(add(new THREE.CylinderGeometry(1.5, 1.8, 54, 8), matLeather, 0, 10, 0, axe));
  wraps(axe, v(0, -12, 0), v(0, 6, 0), 1.9, 6, matWrap);
  keep(add(new THREE.ConeGeometry(1.6, 5, 6), matMetal, 0, -19.5, 0, axe)).rotation.x = Math.PI;
  const blade = new THREE.Shape();
  blade.moveTo(0, 0);
  blade.lineTo(15, -3);
  blade.lineTo(17.5, 6);
  blade.lineTo(16, 7.5);
  blade.lineTo(17.8, 10);
  blade.lineTo(16.5, 13);
  blade.lineTo(18.5, 18);
  blade.lineTo(13, 22);
  blade.lineTo(0, 16);
  blade.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 1 });
  bladeGeo.translate(0, 0, -0.8);
  keep(add(bladeGeo, matMetal, 0.8, 22, 0, axe));
  keep(add(new THREE.ConeGeometry(1.4, 7, 5), matMetal, -3.5, 31, 0, axe)).rotation.z = Math.PI / 2;
  const tip = add(new THREE.OctahedronGeometry(1.6, 0), matGlow, 7, 31, 1.4, axe); // rune on the blade
  const tipGlow = glowSprite(glowTex, team, 22);
  tipGlow.position.set(8, 31, 0);
  axe.add(tipGlow);

  yaw.scale.setScalar(1.08); // class size; body.scale is used for squash
  shadowed(body);
  tip.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matMouth || m === matSocket || m === matGlow) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: axe, tip, tipGlow, mats: [matTeam, matSkin, matWrap, matLeather, matCloth], ...markers };
}

/** Quilted black leather: diamond stitching. */
function makeQuiltTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#26232b';
  g.fillRect(0, 0, S, S);
  const step = 32;
  for (let y = -step; y < S + step; y += step) {
    for (let x = -step; x < S + step; x += step) {
      const grad = g.createRadialGradient(x + step / 2, y + step / 2, 2, x + step / 2, y + step / 2, step * 0.6);
      grad.addColorStop(0, '#3a3640');
      grad.addColorStop(1, '#1d1b22');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x + step / 2, y);
      g.lineTo(x + step, y + step / 2);
      g.lineTo(x + step / 2, y + step);
      g.lineTo(x, y + step / 2);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = 'rgba(170, 140, 90, 0.35)';
  g.lineWidth = 1.5;
  for (let k = -S; k < S * 2; k += step) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + S, S);
    g.moveTo(k, S);
    g.lineTo(k + S, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  return t;
}

/**
 * Assassin — hooded shade (from the concept sheet), toon style: a pointed hood
 * over a black void with burning red eyes, a torn navy cloak and capelet with a
 * pale lining, quilted black leather, crossing belts with pouches, boots, gloves,
 * and two ornate daggers with red-lit blades.
 * Team color: the brooch gem and the dagger gems (the eyes stay red — it's the
 * class's signature).
 */
function buildAssassin(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matCloak = toon('#2b3150', { side: THREE.FrontSide });
  const matLining = toon('#a9a4a2', { side: THREE.BackSide });
  const matQuilt = toon('#ffffff', { map: makeQuiltTexture() });
  const matBlack = toon('#1c1a20');
  const matLeather = toon('#4a3324');
  const matBoot = toon('#2e2622');
  const matGold = toon('#c9a35c');
  const matSteel = toon('#c9ccd4');
  const matVoid = new THREE.MeshBasicMaterial({ color: '#030305' });
  const matRedGlow = new THREE.MeshBasicMaterial({ color: '#ff2a3d', toneMapped: false });
  const matGlow = new THREE.MeshBasicMaterial({ color: bright, toneMapped: false });

  const root = new THREE.Group();
  const lean = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  root.add(lean);
  lean.add(yaw);
  yaw.add(body);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const outlined: THREE.Mesh[] = [];
  const keep = <T extends THREE.Mesh>(m: T) => (outlined.push(m), m);

  // Legs: dark trousers, tall boots with straps
  for (const side of [-1, 1]) {
    keep(limb(body, v(0, 26, side * 4.6), v(1.8, 13, side * 5.2), 2.8, matBlack));
    keep(limb(body, v(1.8, 14, side * 5.2), v(0.6, 3.2, side * 5.4), 2.7, matBoot));
    keep(add(new THREE.BoxGeometry(7, 2.8, 4), matBoot, 2, 1.4, side * 5.4));
    for (const y of [7, 11]) add(new THREE.TorusGeometry(2.85, 0.35, 4, 12), matLeather, 1.2, y, side * 5.3).rotation.x = Math.PI / 2;
  }

  // Torso: quilted leather, crossing belts, waist belt with pouches
  keep(add(lathe([[7.4, 24], [8, 30], [8.8, 37], [9.2, 42], [8.4, 46], [5.5, 48.5], [2.6, 50]]), matQuilt, 0, 0, 0));
  for (const side of [-1, 1]) {
    const strap = keep(limb(body, v(7.6, 46, side * 6), v(8.4, 30, -side * 6.6), 0.75, matLeather));
    strap.castShadow = true;
  }
  const belt = keep(add(new THREE.TorusGeometry(8.1, 1.1, 6, 24), matLeather, 0, 29, 0));
  belt.rotation.x = Math.PI / 2;
  for (const [z, x] of [[-6.5, 4.5], [6.8, 3.5], [-2, -7.6]]) keep(add(new THREE.BoxGeometry(3, 3.6, 2.6), matLeather, x, 27, z));
  add(new THREE.BoxGeometry(1.2, 2.2, 2.6), matGold, 8.6, 29, 0);

  // Arms: leather sleeves, gloves, gold-trimmed bracers
  const rElbow = v(2, 37, 11.4);
  const rHand = v(6, 29.5, 13);
  const lElbow = v(1.5, 37, -11);
  const lHand = v(5.5, 29, -11.5);
  keep(limb(body, v(0, 45, 8.4), rElbow, 2.2, matBlack));
  keep(limb(body, rElbow, rHand, 2, matQuilt));
  keep(limb(body, v(0, 45, -8.4), lElbow, 2.2, matBlack));
  keep(limb(body, lElbow, lHand, 2, matQuilt));
  for (const hand of [rHand, lHand]) {
    keep(add(new THREE.SphereGeometry(2.1, 12, 10), matBlack, hand.x, hand.y - 1, hand.z));
    add(new THREE.CylinderGeometry(2.3, 2.2, 2.4, 10), matGold, hand.x - 1.2, hand.y + 2.2, hand.z);
  }

  // Cloak: long torn back panel and a torn capelet, navy outside, pale lining inside
  const cloakGeo = raggedLathe([[19, 2], [15, 14], [12, 28], [10.2, 40], [9, 46.5]], 24, 9, 4, Math.PI * 0.85, Math.PI * 1.3);
  keep(add(cloakGeo, matCloak, -1, 0, 0));
  add(cloakGeo, matLining, -1, 0, 0);
  // Capelet: to the upper arms, split open at the front (lathe phi = PI/2 faces local +X).
  const capeGeo = raggedLathe([[12.6, 39], [11, 44], [8, 48.5], [4.6, 51.5]], 28, 4, 9, Math.PI / 2 + 0.45, TAU - 0.9);
  keep(add(capeGeo, matCloak, 0, 0, 0));
  add(capeGeo, matLining, 0, 0, 0);

  // Brooch: gold star with a team gem
  for (let i = 0; i < 4; i++) {
    const ray = add(new THREE.ConeGeometry(0.6, 3.2, 4), matGold, 10.6, 46, -5.2, body);
    ray.rotation.set(0, 0, (i / 4) * TAU);
  }
  add(new THREE.OctahedronGeometry(1, 0), matTeam, 11, 46, -5.2);
  add(new THREE.OctahedronGeometry(0.55, 0), matGlow, 11.5, 46, -5.2);

  // Hood: shell open at the front, pointed tip; inside a black void with red eyes
  const hood = new THREE.Group();
  hood.position.set(0.4, 56.6, 0);
  body.add(hood);
  const gap = Math.PI * 0.62;
  const shell = keep(add(new THREE.SphereGeometry(8.4, 24, 16, Math.PI + gap / 2, TAU - gap, 0, Math.PI * 0.8), toon('#2b3150', { side: THREE.DoubleSide }), 0, 0, 0, hood));
  shell.scale.set(1.05, 1.12, 1);
  const tipGeo = lathe([[6.4, 0], [4.8, 4], [3, 8], [1.4, 12], [0, 15]], 20);
  const tp = tipGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) - 0.035 * y * y);
  }
  tipGeo.computeVertexNormals();
  keep(add(tipGeo, matCloak, -1.5, 5, 0, hood));
  add(new THREE.SphereGeometry(6.6, 16, 12), matVoid, 1, -0.6, 0, hood);
  for (const side of [-1, 1]) {
    const eye = add(new THREE.BoxGeometry(0.8, 0.7, 2), matRedGlow, 6.9, 0.2, side * 2.3, hood);
    eye.rotation.x = side * -0.25;
    const glow = glowSprite(glowTex, '#ff2236', 7, 0.9);
    glow.position.set(7.4, 0.2, side * 2.3);
    hood.add(glow);
  }
  // Red wisps trailing from the eyes
  for (let i = 1; i <= 4; i++) {
    const wisp = glowSprite(glowTex, '#ff2236', 6 - i, 0.55 - i * 0.1);
    wisp.position.set(6.5 - i * 1.6, 0.6 + i * 0.4, 3.4 + i * 1.8);
    hood.add(wisp);
  }

  // Daggers: steel blade with a red-lit core, gold crossguard, team gem
  const dagger = (parent: THREE.Object3D, withTip: boolean) => {
    add(new THREE.CylinderGeometry(0.8, 0.8, 5, 8), matLeather, 0, 0, 0, parent).rotation.z = Math.PI / 2;
    const guard = keep(add(new THREE.BoxGeometry(1.2, 1, 6), matGold, 3, 0, 0, parent));
    guard.castShadow = true;
    for (const side of [-1, 1]) add(new THREE.ConeGeometry(0.5, 2.4, 4), matGold, 3, 0, side * 3.6, parent).rotation.x = side * (Math.PI / 2);
    const blade = keep(add(new THREE.ConeGeometry(1.5, 17, 4), matSteel, 12, 0, 0, parent));
    blade.rotation.z = -Math.PI / 2;
    blade.scale.set(1, 1, 0.35);
    const core = add(new THREE.BoxGeometry(12, 0.5, 0.7), matRedGlow, 10.5, 0, 0, parent);
    core.castShadow = false;
    add(new THREE.OctahedronGeometry(0.9, 0), withTip ? matGlow : matTeam, -3, 0, 0, parent);
  };
  const right = new THREE.Group();
  right.position.copy(rHand).add(v(0.5, -1, 0));
  body.add(right);
  dagger(right, true);
  const left = new THREE.Group();
  left.position.copy(lHand).add(v(0.5, -1, 0));
  left.rotation.z = -1.1;
  body.add(left);
  dagger(left, false);

  const tip = add(new THREE.OctahedronGeometry(1.1, 0), matGlow, 18, 0, 0, right);
  const tipGlow = glowSprite(glowTex, team, 16);
  tipGlow.position.set(18, 0, 0);
  right.add(tipGlow);

  yaw.scale.setScalar(0.97);
  shadowed(body);
  tip.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matLining || m === matVoid || m === matRedGlow || m === matGlow) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: right, tip, tipGlow, mats: [matTeam, matCloak, matQuilt, matBlack, matBoot], ...markers };
}

/** Dark leather with bronze vine filigree and small leaves, for the elf's armor. u around, v bottom→top. */
function makeElvenLeatherTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a291e';
  g.fillRect(0, 0, W, H);
  // Overlapping leaf-shaped plates
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 16; col++) {
      const x = col * 32 + (row % 2 ? 16 : 0);
      const y = row * 32 + 4;
      g.fillStyle = (row + col) % 3 === 0 ? '#45311f' : '#33251a';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 15, y + 12, x, y + 30);
      g.quadraticCurveTo(x - 15, y + 12, x, y);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
  // Bronze filigree: wavy vines climbing up with curls
  g.strokeStyle = '#b8894d';
  g.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const x0 = 40 + k * 86;
    g.lineWidth = 3;
    g.beginPath();
    for (let y = 0; y <= H; y += 8) {
      const x = x0 + Math.sin(y * 0.05 + k) * 14;
      if (y === 0) g.moveTo(x, H - y);
      else g.lineTo(x, H - y);
    }
    g.stroke();
    g.lineWidth = 2;
    for (let y = 30; y < H; y += 60) {
      const x = x0 + Math.sin(y * 0.05 + k) * 14;
      const dir = (y / 60) % 2 ? 1 : -1;
      g.beginPath();
      g.arc(x + dir * 9, H - y, 8, 0, Math.PI * 1.5);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * Elianis, wood elf archer: platinum hair with a leaf circlet and long ears, a torn
 * moss-green cloak with the hood down, dark leaf-plate leather with bronze filigree,
 * a thorned recurve bow in the left hand and a quiver on the back.
 */
function buildArcher(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matCloak = toon('#3e5634', { side: THREE.FrontSide });
  const matCloakDark = toon('#2b3d26');
  const matLining = toon('#6b6a3e', { side: THREE.BackSide });
  const matArmor = toon('#ffffff', { map: makeElvenLeatherTexture() });
  const matLeather = toon('#4a3324');
  const matDark = toon('#2a1e17');
  const matBoot = toon('#3d2a1d');
  const matBronze = toon('#b8894d');
  const matWood = toon('#4b3220');
  const matLeaf = toon('#6f8f3a');
  const matSkin = toonSoft('#f1d2bb');
  const matHair = toonSoft('#e6c98f');
  const matHairDark = toonSoft('#c29b5e');
  const matSteel = toon('#c9ccd4');
  const matString = new THREE.MeshBasicMaterial({ color: '#e8e2d0' });
  const matEyeWhite = new THREE.MeshBasicMaterial({ color: '#f4f1ee' });
  const matIris = new THREE.MeshBasicMaterial({ color: '#6f8a4a' });
  const matPupil = new THREE.MeshBasicMaterial({ color: '#1b1a12' });
  const matGlow = new THREE.MeshBasicMaterial({ color: bright, toneMapped: false });

  const root = new THREE.Group();
  const lean = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  root.add(lean);
  lean.add(yaw);
  yaw.add(body);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const outlined: THREE.Mesh[] = [];
  const keep = <T extends THREE.Mesh>(m: T) => (outlined.push(m), m);

  // Legs: dark trousers, tall boots with bronze knee guards
  for (const side of [-1, 1]) {
    keep(limb(body, v(0, 26, side * 4.6), v(1.6, 13.5, side * 5.1), 2.9, matDark));
    keep(limb(body, v(1.6, 14, side * 5.1), v(0.6, 3.2, side * 5.3), 2.8, matBoot));
    keep(add(new THREE.BoxGeometry(7.4, 2.8, 4.4), matBoot, 2, 1.4, side * 5.3));
    const knee = keep(add(new THREE.ConeGeometry(2.4, 5, 4), matBronze, 3.6, 14.5, side * 5.1));
    knee.rotation.z = -Math.PI / 2 + 0.2;
    knee.scale.set(1, 1, 0.7);
    add(new THREE.TorusGeometry(2.9, 0.4, 4, 12), matBronze, 1.1, 9, side * 5.2).rotation.x = Math.PI / 2;
  }

  // Torso: leaf-plate leather; belt with pouches and a knife; quiver strap across the chest
  keep(add(lathe([[7.6, 24], [8.3, 30], [9.2, 37], [9.8, 42], [9, 46], [6, 48.6], [2.8, 50]]), matArmor, 0, 0, 0));
  const belt = keep(add(new THREE.TorusGeometry(8.3, 1.1, 6, 24), matLeather, 0, 28.5, 0));
  belt.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(1.2, 2.4, 2.8), matBronze, 8.8, 28.5, 0);
  for (const [z, x] of [[-6.8, 3.8], [-2, -7.8]]) keep(add(new THREE.BoxGeometry(3, 3.6, 2.6), matLeather, x, 26.5, z));
  const knife = new THREE.Group();
  knife.position.set(6.5, 27, 6.4);
  knife.rotation.set(0.25, 0, -0.35);
  body.add(knife);
  add(new THREE.CylinderGeometry(0.7, 0.7, 3.6, 8), matLeather, 0, 1.8, 0, knife);
  add(new THREE.BoxGeometry(1, 0.8, 3.2), matBronze, 0, 0, 0, knife);
  const blade = keep(add(new THREE.ConeGeometry(1.1, 9, 4), matSteel, 0, -4.8, 0, knife));
  blade.rotation.x = Math.PI;
  blade.scale.set(1, 1, 0.35);
  keep(limb(body, v(8.2, 46, -6.4), v(8.6, 30, 6.4), 0.8, matLeather));

  // Arms: the left one holds the bow out front, the right one rests near the string.
  const lShoulder = v(0, 45.5, -9);
  const lElbow = v(6.5, 41, -11.5);
  const lHand = v(13, 37.5, -9);
  const rShoulder = v(0, 45.5, 9);
  const rElbow = v(1.5, 37.5, 12.5);
  const rHand = v(6.5, 34, 9.5);
  for (const s of [lShoulder, rShoulder]) keep(add(new THREE.SphereGeometry(3.4, 14, 10), matArmor, s.x, s.y, s.z));
  keep(limb(body, lShoulder, lElbow, 2.3, matDark));
  keep(limb(body, lElbow, lHand, 2.1, matLeather));
  keep(limb(body, rShoulder, rElbow, 2.3, matDark));
  keep(limb(body, rElbow, rHand, 2.1, matLeather));
  for (const [elbow, hand] of [[lElbow, lHand], [rElbow, rHand]]) {
    // Bronze bracer two thirds down the forearm
    const at = elbow.clone().lerp(hand, 0.6);
    const dir = hand.clone().sub(elbow).normalize();
    const bracer = add(new THREE.CylinderGeometry(2.5, 2.4, 3.4, 10), matBronze, at.x, at.y, at.z);
    bracer.quaternion.setFromUnitVectors(v(0, 1, 0), dir);
    keep(add(new THREE.SphereGeometry(2.2, 12, 10), matDark, hand.x, hand.y, hand.z));
  }

  // Cloak: long torn back panel to the ankles and a torn mantle with the hood lying down
  const cloakGeo = raggedLathe([[19.5, 1], [15.5, 13], [12.6, 27], [10.8, 40], [9.6, 47]], 26, 10, 14, Math.PI * 0.82, Math.PI * 1.36);
  keep(add(cloakGeo, matCloak, -1.2, 0, 0));
  add(cloakGeo, matLining, -1.2, 0, 0);
  const mantleGeo = raggedLathe([[13.4, 38], [12, 43.5], [9, 48.4], [5, 51.4]], 30, 4.5, 21, Math.PI / 2 + 0.5, TAU - 1);
  keep(add(mantleGeo, matCloak, 0, 0, 0));
  add(mantleGeo, matLining, 0, 0, 0);
  // Lowered hood: a soft roll of cloth behind the neck
  const hood = keep(add(new THREE.TorusGeometry(5.6, 2.6, 8, 20, Math.PI * 1.2), matCloakDark, -2.2, 50.5, 0));
  hood.rotation.set(Math.PI / 2, 0, Math.PI * 0.4);
  // Clasp: bronze leaf with a team gem
  add(new THREE.OctahedronGeometry(1.4, 0), matBronze, 9.6, 46.4, -4.6).scale.set(0.6, 1.4, 1);
  add(new THREE.OctahedronGeometry(0.85, 0), matTeam, 10.3, 46.4, -4.6);

  // Quiver on the back, angled over the right shoulder, full of fletched arrows
  const quiver = new THREE.Group();
  quiver.position.set(-13.5, 43, 3.5);
  quiver.rotation.set(-0.5, 0, 0.22);
  body.add(quiver);
  keep(add(new THREE.CylinderGeometry(3.2, 2.6, 24, 10), matLeather, 0, 0, 0, quiver));
  for (const y of [-9, 8]) add(new THREE.TorusGeometry(3.1, 0.45, 4, 12), matBronze, 0, y, 0, quiver).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.cos(a) * 1.5;
    const z = Math.sin(a) * 1.5;
    add(new THREE.CylinderGeometry(0.25, 0.25, 6, 4), matWood, x, 14, z, quiver);
    const fletch = add(new THREE.ConeGeometry(1, 3.4, 3), i % 2 ? matTeam : matHair, x, 16.5, z, quiver);
    fletch.rotation.y = a;
  }

  // Neck and head
  keep(add(new THREE.CylinderGeometry(2.3, 2.8, 5, 12), matSkin, 0, 50.5, 0));
  keep(add(new THREE.SphereGeometry(6.1, 24, 18), matSkin, 0.7, 57.4, 0)).scale.set(1, 1.12, 0.92);
  keep(add(new THREE.SphereGeometry(2.4, 14, 10), matSkin, 2.7, 53.8, 0)).scale.set(1, 0.85, 1.25);
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(1.15, 12, 8), matEyeWhite, 5.75, 57.8, side * 2.4).scale.set(0.45, 0.55, 1);
    add(new THREE.SphereGeometry(0.75, 10, 8), matIris, 6.25, 57.75, side * 2.3).scale.set(0.4, 0.8, 1);
    add(new THREE.SphereGeometry(0.36, 8, 6), matPupil, 6.6, 57.75, side * 2.3).scale.set(0.4, 1, 1);
    const brow = add(new THREE.BoxGeometry(0.55, 0.45, 2.7), matHairDark, 6, 59.5, side * 2.5);
    brow.rotation.x = side * 0.18;
    // Long elven ears sweeping back and up
    const ear = keep(add(new THREE.ConeGeometry(1.3, 8.5, 8), matSkin, -1.2, 59, side * 6.4));
    ear.scale.set(0.5, 1, 1);
    ear.rotation.x = side * (Math.PI / 2 - 0.75);
    ear.rotation.z = 0.7;
  }
  add(new THREE.ConeGeometry(0.42, 1.4, 6), matSkin, 6.45, 56.2, 0).rotation.z = -Math.PI / 2 + 0.6;
  add(new THREE.BoxGeometry(0.3, 0.3, 1.6), new THREE.MeshBasicMaterial({ color: '#a8635a' }), 6.05, 53.9, 0);

  // Platinum hair: crown, swept bangs, wavy locks to the shoulder blades
  const crown = keep(add(new THREE.SphereGeometry(6.8, 24, 14, 0, TAU, 0, Math.PI * 0.6), matHair, -0.6, 58.5, 0));
  crown.rotation.z = 0.3;
  crown.scale.set(1.05, 1.06, 0.99);
  for (const side of [-1, 1]) {
    keep(limb(body, v(5.4, 62, side * 0.6), v(5.6, 57, side * 5.4), 1.4, matHair));
    keep(limb(body, v(3, 57, side * 6.3), v(3.2, 45, side * 7.6), 1.5, matHair));
  }
  // Back locks fall over the lowered hood and mantle, not inside them.
  for (let i = 0; i < 7; i++) {
    const z = -6.6 + i * 2.2;
    const wave = i % 2 ? 1 : -1;
    const mid = v(-9.6, 52, z * 1.05);
    keep(limb(body, v(-4.6, 60, z * 0.8), mid, 2.1, i % 2 ? matHair : matHairDark));
    keep(limb(body, mid, v(-13.4 + wave * 0.5, 39 + Math.abs(z) * 0.6, z * 1.2 + wave), 1.9, i % 2 ? matHair : matHairDark));
  }

  // Circlet of leaves and twigs
  const circlet = add(new THREE.TorusGeometry(6.6, 0.4, 5, 24), matWood, -0.3, 61.4, 0);
  circlet.rotation.set(Math.PI / 2, 0.22, 0);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.55 + (i / 6) * Math.PI * 0.9;
    const leaf = add(new THREE.OctahedronGeometry(1.6, 0), matLeaf, -0.3 + Math.cos(a) * 6.8, 61.6 + (i % 2) * 0.8, Math.sin(a) * 6.8);
    leaf.scale.set(0.35, 0.9, 1.5);
    leaf.rotation.y = -a;
  }

  // Bow: dark recurve with bronze thorns along the limbs, held upright in the left hand.
  // Local +X faces forward; the limbs bend back towards the archer and the tips curl forward.
  const bowGroup = new THREE.Group();
  bowGroup.position.copy(lHand);
  body.add(bowGroup);
  const half: [number, number][] = [[0, 0], [-2.6, 6], [-6.8, 14], [-8.6, 22], [-7, 28.5], [-5.4, 31]];
  const pts = [...half.slice(1).reverse().map(([x, y]) => v(x, -y, 0)), ...half.map(([x, y]) => v(x, y, 0))];
  const curve = new THREE.CatmullRomCurve3(pts);
  keep(add(new THREE.TubeGeometry(curve, 64, 1.05, 6), matWood, 0, 0, 0, bowGroup));
  for (const s of [-1, 1]) {
    for (const d of [0.1, 0.2, 0.3, 0.4]) {
      const p = curve.getPoint(0.5 + s * d);
      const thorn = add(new THREE.ConeGeometry(0.55, 2.8, 4), matBronze, p.x + 1, p.y, p.z, bowGroup);
      thorn.rotation.z = -Math.PI / 2 + s * 0.6;
    }
    const tipPt = half[half.length - 1];
    add(new THREE.ConeGeometry(0.7, 3, 5), matBronze, tipPt[0] + 0.6, s * (tipPt[1] + 1), 0, bowGroup).rotation.z = s > 0 ? -0.6 : Math.PI + 0.6;
  }
  const nock = half[half.length - 2];
  const string = add(new THREE.CylinderGeometry(0.22, 0.22, nock[1] * 2, 4), matString, nock[0], 0, 0, bowGroup);
  string.castShadow = false;
  keep(add(new THREE.CylinderGeometry(1.5, 1.5, 5.5, 8), matLeather, 0.2, 0, 0, bowGroup));
  add(new THREE.OctahedronGeometry(0.9, 0), matTeam, 1.6, 3.6, 0, bowGroup);

  const tip = add(new THREE.OctahedronGeometry(1.2, 0), matGlow, 3.4, 0, 0, bowGroup);
  const tipGlow = glowSprite(glowTex, team, 18);
  tipGlow.position.set(3.4, 0, 0);
  bowGroup.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matLining || m === matEyeWhite || m === matIris || m === matPupil || m === matGlow) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: bowGroup, tip, tipGlow, mats: [matTeam, matCloak, matArmor, matDark, matSkin, matHair], ...markers };
}
