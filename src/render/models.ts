/**
 * Procedural low-poly models for the 3D view. Everything is built from
 * primitives at startup — no model files to load.
 *
 * World mapping: sim (x, y) → three (x, 0, y), height is +Y.
 */
import * as THREE from 'three';
import { ARENA_R, PLAYER_R, SPAWNS } from '../sim/constants';
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
  mats: THREE.MeshStandardMaterial[];
  ring: THREE.Mesh;
  pointer: THREE.Group;
  shield: THREE.Group;
  slowRing: THREE.Mesh;
  /** Floating sigil shown while marked by an assassin. */
  markSigil: THREE.Mesh;
}

export function buildChampion(champ: number, color: string, glowTex: THREE.Texture): ChampionRig {
  if (champ === 1) return buildWarrior(color, glowTex);
  if (champ === 2) return buildAssassin(color, glowTex);
  return buildMage(color, glowTex);
}

function buildMage(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  // Class palette: indigo robes and gold; the team color only on cape, hat band and eyes.
  const matTeam = new THREE.MeshStandardMaterial({ color: team, roughness: 0.6, metalness: 0.1, flatShading: true });
  const matRobe = new THREE.MeshStandardMaterial({ color: '#2a3478', roughness: 0.8, flatShading: true });
  const matTunic = new THREE.MeshStandardMaterial({ color: '#4157b8', roughness: 0.6, metalness: 0.1, flatShading: true });
  const matSkin = new THREE.MeshStandardMaterial({ color: '#e3c4a2', roughness: 0.7, flatShading: true });
  const matBeard = new THREE.MeshStandardMaterial({ color: '#dfe3ea', roughness: 0.9, flatShading: true });
  const matGold = new THREE.MeshStandardMaterial({ color: '#d1a75a', roughness: 0.4, metalness: 0.8, flatShading: true });
  const matWood = new THREE.MeshStandardMaterial({ color: '#5d4433', roughness: 0.8, flatShading: true });
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

  add(new THREE.CylinderGeometry(10, 19, 30, 8), matRobe, 0, 15, 0); // robe
  add(new THREE.CylinderGeometry(12.5, 10.5, 17, 8), matTunic, 0, 36, 0); // torso
  add(new THREE.CylinderGeometry(11, 11, 3.5, 8), matGold, 0, 28, 0); // belt
  for (const side of [-1, 1]) {
    const pad = add(new THREE.IcosahedronGeometry(6.5, 0), matRobe, 0, 43, side * 12);
    pad.scale.set(1, 0.7, 1);
  }
  add(new THREE.IcosahedronGeometry(7.5, 1), matSkin, 0, 52, 0); // head
  const beard = add(new THREE.ConeGeometry(5, 12, 5), matBeard, 4.5, 45, 0);
  beard.rotation.z = Math.PI;
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(1.4, 1.6, 2.4), matGlow, 6.8, 53.5, side * 2.6); // eyes
  // Wizard hat: wide brim, team band, tall bent cone
  add(new THREE.CylinderGeometry(15, 15, 1.6, 12), matRobe, 0, 58, 0);
  add(new THREE.CylinderGeometry(9.2, 9.6, 3, 10), matTeam, 0, 60.5, 0);
  const hat = add(new THREE.ConeGeometry(9, 28, 8), matRobe, -2, 75, 0);
  hat.rotation.z = 0.28;
  const cape = add(new THREE.BoxGeometry(2.5, 34, 22), matTeam, -11.5, 30, 0);
  cape.rotation.z = -0.14;

  // Staff in the right hand
  const staff = new THREE.Group();
  staff.position.set(5, 30, 17);
  body.add(staff);
  add(new THREE.CylinderGeometry(1.4, 1.7, 60, 6), matWood, 0, 18, 0, staff);
  const head = add(new THREE.TorusGeometry(4.6, 1.2, 6, 12), matGold, 0, 49, 0, staff);
  head.rotation.y = Math.PI / 2;
  const tip = add(new THREE.OctahedronGeometry(4.6, 0), matGlow, 0, 49, 0, staff);
  const tipGlow = glowSprite(glowTex, team, 28);
  tipGlow.position.set(0, 49, 0);
  staff.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;

  const m = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: staff, tip, tipGlow, mats: [matTeam, matRobe, matTunic, matSkin], ...m };
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

  return { ring, pointer, shield, slowRing, markSigil };
}

function buildWarrior(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  // Class palette: bronze plate over dark leather; the team color on shield, tabard and eyes.
  const matTeam = new THREE.MeshStandardMaterial({ color: team, roughness: 0.55, metalness: 0.15, flatShading: true });
  const matBronze = new THREE.MeshStandardMaterial({ color: '#b07a3e', roughness: 0.35, metalness: 0.75, flatShading: true });
  const matDark = new THREE.MeshStandardMaterial({ color: '#3a2a1f', roughness: 0.85, flatShading: true });
  const matMetal = new THREE.MeshStandardMaterial({ color: '#9aa4b8', roughness: 0.32, metalness: 0.8, flatShading: true });
  const matGold = new THREE.MeshStandardMaterial({ color: '#d1a75a', roughness: 0.4, metalness: 0.8, flatShading: true });
  const matWood = new THREE.MeshStandardMaterial({ color: '#5d4433', roughness: 0.8, flatShading: true });
  const matFur = new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 1, flatShading: true });
  const matBone = new THREE.MeshStandardMaterial({ color: '#e9dfc9', roughness: 0.6, flatShading: true });
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

  for (const side of [-1, 1]) add(new THREE.BoxGeometry(8, 20, 8), matDark, 0, 10, side * 7); // legs
  add(new THREE.CylinderGeometry(14, 17, 12, 8), matBronze, 0, 22, 0); // armored skirt
  add(new THREE.CylinderGeometry(17, 13.5, 22, 8), matBronze, 0, 38, 0); // torso
  add(new THREE.BoxGeometry(5, 15, 16), matTeam, 13.5, 37, 0); // tabard
  add(new THREE.CylinderGeometry(14.5, 14.5, 4, 8), matGold, 0, 28, 0); // belt
  const collar = add(new THREE.TorusGeometry(12, 4.5, 5, 10), matFur, 0, 49, 0);
  collar.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const pad = add(new THREE.IcosahedronGeometry(10, 0), matBronze, 0, 49, side * 18);
    pad.scale.set(1, 0.7, 1);
  }
  add(new THREE.IcosahedronGeometry(9.5, 1), matMetal, 0, 60, 0); // helmet
  add(new THREE.BoxGeometry(2, 2.6, 11), matGlow, 8.6, 60, 0); // visor
  yaw.scale.setScalar(1.1); // class size; body.scale is used for squash
  for (const side of [-1, 1]) {
    const horn = add(new THREE.ConeGeometry(3, 15, 5), matBone, -1, 67, side * 9);
    horn.rotation.x = side * 0.7;
  }

  // Round shield on the left arm
  const shieldMesh = add(new THREE.CylinderGeometry(13, 13, 3, 10), matTeam, 4, 35, -21);
  shieldMesh.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(4, 8, 6), matGold, 4, 35, -23);

  // Axe in the right hand
  const axe = new THREE.Group();
  axe.position.set(6, 32, 21);
  body.add(axe);
  add(new THREE.CylinderGeometry(1.8, 2, 56, 6), matWood, 0, 12, 0, axe);
  add(new THREE.BoxGeometry(18, 22, 3), matMetal, 9, 34, 0, axe);
  add(new THREE.BoxGeometry(7, 14, 3.2), matMetal, -5, 34, 0, axe);
  const tip = add(new THREE.OctahedronGeometry(3.4, 0), matGlow, 6, 34, 1.8, axe);
  const tipGlow = glowSprite(glowTex, team, 22);
  tipGlow.position.set(8, 34, 0);
  axe.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;

  const m = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: axe, tip, tipGlow, mats: [matTeam, matBronze, matDark, matMetal], ...m };
}

function buildAssassin(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  // Class palette: black-violet leathers; the team color on the scarf and eyes.
  const matTeam = new THREE.MeshStandardMaterial({ color: team, roughness: 0.6, metalness: 0.1, flatShading: true });
  const matDark = new THREE.MeshStandardMaterial({ color: '#1d1a26', roughness: 0.9, flatShading: true });
  const matCloth = new THREE.MeshStandardMaterial({ color: '#2e2546', roughness: 0.85, flatShading: true });
  const matVest = new THREE.MeshStandardMaterial({ color: '#4a3d6e', roughness: 0.6, metalness: 0.15, flatShading: true });
  const matSteel = new THREE.MeshStandardMaterial({ color: '#d5dbe6', roughness: 0.25, metalness: 0.9, flatShading: true });
  const matGlow = new THREE.MeshBasicMaterial({ color: bright, toneMapped: false });
  const matFace = new THREE.MeshBasicMaterial({ color: '#07060a' });

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

  for (const side of [-1, 1]) add(new THREE.BoxGeometry(6, 20, 6), matDark, 0, 10, side * 5); // legs
  add(new THREE.CylinderGeometry(9, 14, 20, 7), matCloth, -1, 19, 0); // coat tails
  add(new THREE.CylinderGeometry(11, 9, 18, 7), matVest, 0, 35, 0); // torso
  add(new THREE.CylinderGeometry(9.6, 9.6, 3, 7), matDark, 0, 27, 0); // sash
  for (const side of [-1, 1]) add(new THREE.IcosahedronGeometry(5, 0), matCloth, 0, 42, side * 11); // shoulders
  const scarf = add(new THREE.TorusGeometry(8, 3, 5, 10), matTeam, 0, 45, 0);
  scarf.rotation.x = Math.PI / 2;
  const tail = add(new THREE.BoxGeometry(2, 20, 6), matTeam, -10, 40, 4);
  tail.rotation.z = -0.5;
  add(new THREE.SphereGeometry(7, 10, 8), matFace, 1, 52, 0); // face in shadow
  const hood = add(new THREE.ConeGeometry(10.5, 22, 7), matCloth, -1.5, 57, 0);
  hood.rotation.z = 0.12;
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(1.5, 1.6, 2.6), matGlow, 7.2, 53, side * 2.6); // eyes
  yaw.scale.setScalar(0.95);

  // Daggers: the right one is the animated "weapon", the left one rides along with the body.
  const dagger = (parent: THREE.Object3D) => {
    add(new THREE.CylinderGeometry(1.3, 1.3, 7, 5), matDark, 0, 0, 0, parent);
    const blade = add(new THREE.ConeGeometry(2.4, 17, 4), matSteel, 11, 0, 0, parent);
    blade.rotation.z = -Math.PI / 2;
  };
  const right = new THREE.Group();
  right.position.set(6, 30, 13);
  body.add(right);
  dagger(right);
  const left = new THREE.Group();
  left.position.set(4, 30, -13);
  left.rotation.z = 0.5;
  body.add(left);
  dagger(left);

  const tip = add(new THREE.OctahedronGeometry(2.2, 0), matGlow, 19, 0, 0, right);
  const tipGlow = glowSprite(glowTex, team, 18);
  tipGlow.position.set(19, 0, 0);
  right.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;

  const m = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: right, tip, tipGlow, mats: [matTeam, matCloth, matVest, matDark], ...m };
}
