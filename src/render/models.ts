/**
 * Procedural low-poly models for the 3D view. Everything is built from
 * primitives at startup — no model files to load.
 *
 * World mapping: sim (x, y) → three (x, 0, y), height is +Y.
 */
import * as THREE from 'three';
import { ARENA_R, CHAMP, PLAYER_R, SPAWNS, type MapDef, type River } from '../sim/constants';
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

export type MapTheme = MapDef['theme'];

/** Lighting and palette of a map theme (the renderer applies the lights). */
export interface ThemeLook {
  background: string;
  ground: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  key: string;
  keyIntensity: number;
  rim: string;
  rimIntensity: number;
}

export const THEME_LOOKS: Record<MapTheme, ThemeLook> = {
  // Moonlit elven ruins: pale moonlight, green from the leaves below, cool teal rim.
  ruins: { background: '#060a08', ground: '#0b120d', hemiSky: '#bcd9cc', hemiGround: '#17220f', hemi: 1.25, key: '#e4ecff', keyIntensity: 2.5, rim: '#7fe8c8', rimIntensity: 1.15 },
  // Romulus's castle under a blood moon: warm stone, crimson rim light.
  castle: { background: '#0c0709', ground: '#150d0d', hemiSky: '#cfb0b8', hemiGround: '#1c0c0a', hemi: 1.1, key: '#ffd8bb', keyIntensity: 2.45, rim: '#ff4058', rimIntensity: 1.35 },
  // Rustic's crystal mine: warm lantern light from above, green crystal glow from the side.
  mine: { background: '#080705', ground: '#110d09', hemiSky: '#c9b9a0', hemiGround: '#1a1308', hemi: 1.05, key: '#ffd9a8', keyIntensity: 2.3, rim: '#5dffb0', rimIntensity: 1.25 },
  // Elianis's grove at dusk: golden light through the leaves, deep green shade.
  grove: { background: '#060b06', ground: '#0c140a', hemiSky: '#cfe3b0', hemiGround: '#14200c', hemi: 1.2, key: '#ffe9b8', keyIntensity: 2.5, rim: '#ffd27a', rimIntensity: 1.0 },
};

/** Colors of the arena ring around each theme: outer wall, glowing edge, pedestal and the four fires. */
interface ArenaPalette {
  wallTall: string;
  wallLow: string;
  rim: string;
  rimOpacity: number;
  pedestal: string;
  brazier: string;
  flame: string;
  flameGlow: string;
  flameLight: string;
}

const ARENA_PALETTES: Record<MapTheme, ArenaPalette> = {
  ruins: { wallTall: '#6f7868', wallLow: '#59614f', rim: '#9dffc8', rimOpacity: 0.3, pedestal: '#5d6656', brazier: '#4c5446', flame: '#dcffe8', flameGlow: '#6dffa8', flameLight: '#a8ffcc' },
  castle: { wallTall: '#5a4c4a', wallLow: '#463b3a', rim: '#ff4058', rimOpacity: 0.32, pedestal: '#4a3c3a', brazier: '#3e3434', flame: '#ff7a4a', flameGlow: '#ff4a2a', flameLight: '#ff6a48' },
  mine: { wallTall: '#5b4a3a', wallLow: '#463a2e', rim: '#5dffb0', rimOpacity: 0.28, pedestal: '#4a4036', brazier: '#2f2a24', flame: '#ffc070', flameGlow: '#ff9a3a', flameLight: '#ffad5c' },
  grove: { wallTall: '#3f5a2c', wallLow: '#324a24', rim: '#ffe08a', rimOpacity: 0.26, pedestal: '#5a5446', brazier: '#4a3f30', flame: '#fff0a8', flameGlow: '#ffd75a', flameLight: '#ffe7a0' },
};

/** Floor painted once into a texture (one painter per theme), plus team pads. */
function makeFloorTexture(theme: MapTheme): THREE.CanvasTexture {
  const S = 2048;
  const k = S / (2 * ARENA_R);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.scale(k, k);

  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  if (theme === 'castle') paintCastleFloor(g, rnd);
  else if (theme === 'mine') paintMineFloor(g, rnd);
  else if (theme === 'grove') paintGroveFloor(g, rnd);
  else paintRuinsFloor(g, rnd);

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

/** Pale mossy stone in concentric rings, grass in the joints, fallen leaves, a ring of elven runes. */
function paintRuinsFloor(g: CanvasRenderingContext2D, rnd: () => number) {
  g.fillStyle = '#1b2219';
  g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);
  const tile = (r0: number, r1: number, a0: number, a1: number, light: number) => {
    const gap = 1.8;
    const ga0 = gap / Math.max(r0, 20);
    const ga1 = gap / r1;
    g.beginPath();
    g.arc(0, 0, r1 - gap, a0 + ga1, a1 - ga1);
    g.arc(0, 0, Math.max(0, r0 + gap), a1 - ga0, a0 + ga0, true);
    g.closePath();
    g.fillStyle = `hsl(${88 + rnd() * 30}, ${6 + rnd() * 6}%, ${light}%)`;
    g.fill();
  };
  g.beginPath();
  g.arc(0, 0, 78, 0, TAU);
  g.fillStyle = 'hsl(100, 8%, 33%)';
  g.fill();
  for (let r0 = 80; r0 < ARENA_R; r0 += 80) {
    const r1 = Math.min(ARENA_R, r0 + 80);
    const n = Math.max(8, Math.round((TAU * r1) / 120));
    const off = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * TAU;
      tile(r0, r1, a0, a0 + TAU / n, 25 + rnd() * 10);
    }
  }
  // Moss creeping over the stones
  for (let i = 0; i < 70; i++) {
    const a = rnd() * TAU;
    const r = 60 + rnd() * (ARENA_R - 60);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const rad = 20 + rnd() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(78, 118, 48, ${0.3 + rnd() * 0.25})`);
    grad.addColorStop(1, 'rgba(78, 118, 48, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fill();
  }
  // Grass tufts and fallen leaves
  for (let i = 0; i < 420; i++) {
    const a = rnd() * TAU;
    const r = 40 + rnd() * (ARENA_R - 45);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (rnd() < 0.6) {
      g.strokeStyle = `hsla(${95 + rnd() * 25}, 45%, ${28 + rnd() * 18}%, 0.85)`;
      g.lineWidth = 1.4;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        g.moveTo(x + k * 2 - 3, y);
        g.lineTo(x + k * 2 - 3 + (rnd() - 0.5) * 6, y - 5 - rnd() * 6);
      }
      g.stroke();
    } else {
      g.fillStyle = `hsla(${70 + rnd() * 40}, 50%, ${30 + rnd() * 15}%, 0.8)`;
      g.beginPath();
      g.ellipse(x, y, 3.2, 1.6, rnd() * TAU, 0, TAU);
      g.fill();
    }
  }
  // A ring of elven runes between the pillars, softly glowing
  g.strokeStyle = 'rgba(190, 255, 220, 0.2)';
  g.lineWidth = 2;
  for (const r of [262, 298]) {
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();
  }
  g.strokeStyle = 'rgba(200, 255, 225, 0.32)';
  g.lineWidth = 2.4;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    g.beginPath();
    g.moveTo(ca * 270, sa * 270);
    g.quadraticCurveTo(ca * 280 - sa * 8, sa * 280 + ca * 8, ca * 290, sa * 290);
    if (i % 3 === 0) {
      g.moveTo(ca * 278 + sa * 5, sa * 278 - ca * 5);
      g.lineTo(ca * 284 - sa * 5, sa * 284 + ca * 5);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(255, 209, 102, 0.45)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 70, 0, TAU);
  g.stroke();
}

/** Warm grey flagstones in running bond, cracks and old blood, a crimson star in the middle. */
function paintCastleFloor(g: CanvasRenderingContext2D, rnd: () => number) {
  g.fillStyle = '#17120f';
  g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);
  const size = 66;
  for (let row = 0; row * size < ARENA_R * 2; row++) {
    const y = -ARENA_R + row * size;
    const off = row % 2 ? size / 2 : 0;
    for (let x = -ARENA_R - off; x < ARENA_R; x += size) {
      g.fillStyle = `hsl(${18 + rnd() * 14}, ${7 + rnd() * 7}%, ${23 + rnd() * 9}%)`;
      g.fillRect(x + 1.8, y + 1.8, size - 3.6, size - 3.6);
      // A lighter worn top edge on some stones
      if (rnd() < 0.4) {
        g.fillStyle = 'rgba(255, 235, 220, 0.04)';
        g.fillRect(x + 1.8, y + 1.8, size - 3.6, 6);
      }
    }
  }
  // Cracks
  g.strokeStyle = 'rgba(8, 5, 4, 0.55)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 70; i++) {
    let x = (rnd() - 0.5) * ARENA_R * 2;
    let y = (rnd() - 0.5) * ARENA_R * 2;
    let a = rnd() * TAU;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      a += (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * (8 + rnd() * 14);
      y += Math.sin(a) * (8 + rnd() * 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Old bloodstains
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const r = 90 + rnd() * (ARENA_R - 140);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const rad = 14 + rnd() * 34;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(110, 12, 24, ${0.22 + rnd() * 0.2})`);
    grad.addColorStop(1, 'rgba(110, 12, 24, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fill();
  }
  // Crimson eight-pointed star and ring around the orb
  g.fillStyle = 'hsl(10, 10%, 21%)';
  g.beginPath();
  g.arc(0, 0, 84, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(212, 32, 63, 0.55)';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU;
    const r = i % 2 ? 40 : 80;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 84, 0, TAU);
  g.stroke();
}

/** Packed earth and rock slabs, gravel, cracks, mine-cart rails down the middle lane, crystal glow. */
function paintMineFloor(g: CanvasRenderingContext2D, rnd: () => number) {
  g.fillStyle = '#2a2219';
  g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);
  // Rock slabs: irregular polygons
  for (let i = 0; i < 160; i++) {
    const x = (rnd() - 0.5) * ARENA_R * 2;
    const y = (rnd() - 0.5) * ARENA_R * 2;
    const rad = 18 + rnd() * 34;
    g.fillStyle = `hsl(${26 + rnd() * 12}, ${10 + rnd() * 8}%, ${17 + rnd() * 10}%)`;
    g.beginPath();
    const n = 6 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rnd() * 0.4;
      const rr = rad * (0.7 + rnd() * 0.3);
      if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  // Gravel
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `hsla(30, 10%, ${20 + rnd() * 25}%, 0.7)`;
    g.fillRect((rnd() - 0.5) * ARENA_R * 2, (rnd() - 0.5) * ARENA_R * 2, 1.5 + rnd() * 2, 1.5 + rnd() * 2);
  }
  // Mine-cart track along the middle lane: sleepers, then two iron rails
  for (let x = -ARENA_R; x < ARENA_R; x += 22) {
    g.fillStyle = `hsl(25, 35%, ${16 + rnd() * 6}%)`;
    g.fillRect(x, -16, 9, 32);
  }
  g.strokeStyle = 'rgba(150, 140, 130, 0.75)';
  g.lineWidth = 2.5;
  for (const y of [-10, 10]) {
    g.beginPath();
    g.moveTo(-ARENA_R, y);
    g.lineTo(ARENA_R, y);
    g.stroke();
  }
  // Green glow where crystals grow, and a few glowing veins in the rock
  for (const [x, y, r] of [[0, 330, 90], [0, -330, 90], [330, 280, 60], [-330, 280, 60], [330, -280, 60], [-330, -280, 60]]) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(90, 255, 170, 0.28)');
    grad.addColorStop(1, 'rgba(90, 255, 170, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(110, 255, 180, 0.35)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 22; i++) {
    let x = (rnd() - 0.5) * ARENA_R * 1.8;
    let y = (rnd() - 0.5) * ARENA_R * 1.8;
    let a = rnd() * TAU;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      a += (rnd() - 0.5) * 1.2;
      x += Math.cos(a) * 14;
      y += Math.sin(a) * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // A ring of rocks around the orb
  g.strokeStyle = 'rgba(255, 209, 102, 0.4)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 70, 0, TAU);
  g.stroke();
}

/** Grass and dark soil, a worn dirt path between the spawns, leaf litter, flowers and a fairy ring. */
function paintGroveFloor(g: CanvasRenderingContext2D, rnd: () => number) {
  g.fillStyle = '#1f2a16';
  g.fillRect(-ARENA_R, -ARENA_R, ARENA_R * 2, ARENA_R * 2);
  // Grass patches
  for (let i = 0; i < 120; i++) {
    const x = (rnd() - 0.5) * ARENA_R * 2;
    const y = (rnd() - 0.5) * ARENA_R * 2;
    const rad = 30 + rnd() * 80;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `hsla(${85 + rnd() * 30}, 40%, ${22 + rnd() * 12}%, 0.7)`);
    grad.addColorStop(1, 'hsla(100, 40%, 20%, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fill();
  }
  // Worn path from spawn to spawn, curving around the clearing
  g.strokeStyle = 'rgba(120, 95, 62, 0.55)';
  g.lineCap = 'round';
  g.lineWidth = 46;
  g.beginPath();
  g.moveTo(-ARENA_R, 0);
  g.bezierCurveTo(-200, 40, -120, -30, 0, 0);
  g.bezierCurveTo(120, 30, 200, -40, ARENA_R, 0);
  g.stroke();
  // Clearing in the middle
  const clear = g.createRadialGradient(0, 0, 0, 0, 0, 120);
  clear.addColorStop(0, 'rgba(150, 175, 90, 0.35)');
  clear.addColorStop(1, 'rgba(150, 175, 90, 0)');
  g.fillStyle = clear;
  g.beginPath();
  g.arc(0, 0, 120, 0, TAU);
  g.fill();
  // Blades of grass, leaf litter and small flowers
  for (let i = 0; i < 1200; i++) {
    const x = (rnd() - 0.5) * ARENA_R * 2;
    const y = (rnd() - 0.5) * ARENA_R * 2;
    const k = rnd();
    if (k < 0.6) {
      g.strokeStyle = `hsla(${90 + rnd() * 30}, 50%, ${28 + rnd() * 20}%, 0.8)`;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 5, y - 5 - rnd() * 6);
      g.stroke();
    } else if (k < 0.92) {
      g.fillStyle = `hsla(${25 + rnd() * 30}, 60%, ${30 + rnd() * 20}%, 0.85)`;
      g.beginPath();
      g.ellipse(x, y, 3.4, 1.7, rnd() * TAU, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = rnd() < 0.5 ? 'rgba(250, 245, 230, 0.9)' : 'rgba(240, 170, 210, 0.9)';
      g.beginPath();
      g.arc(x, y, 1.8, 0, TAU);
      g.fill();
    }
  }
  // Fairy ring of tiny mushrooms around the orb
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    g.fillStyle = 'rgba(235, 225, 190, 0.9)';
    g.beginPath();
    g.arc(Math.cos(a) * 74, Math.sin(a) * 74, 2.6, 0, TAU);
    g.fill();
  }
}

/** Timber supports against the mine wall and small green crystals at its foot. */
function addMineDressing(root: THREE.Group, rnd: () => number, glowTex: THREE.Texture) {
  const wood = toon('#5a3f26');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + TAU / 32;
    const r = ARENA_R + 6;
    const frame = new THREE.Group();
    frame.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    frame.rotation.y = -a;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(6, 62, 6), wood);
      post.position.set(0, 31, side * 26);
      frame.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 64), wood);
    beam.position.set(0, 62, 0);
    frame.add(beam);
    root.add(shadowed(frame));
  }
  const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#7dffb8', transparent: true, opacity: 0.8, toneMapped: false }), 40);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU;
    const r = ARENA_R - 8 - rnd() * 14;
    const h = 5 + rnd() * 9;
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.7, rnd() * 3, (rnd() - 0.5) * 0.7));
    m.compose(new THREE.Vector3(Math.cos(a) * r, h * 0.6, Math.sin(a) * r), q, new THREE.Vector3(h * 0.35, h, h * 0.35));
    crystals.setMatrixAt(i, m);
  }
  root.add(crystals);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const glow = glowSprite(glowTex, '#5dffb0', 70, 0.35);
    glow.position.set(Math.cos(a) * (ARENA_R - 14), 10, Math.sin(a) * (ARENA_R - 14));
    root.add(glow);
  }
}

/** Glowing mushrooms at the foot of the grove's hedge. */
function addGroveDressing(root: THREE.Group, rnd: () => number, glowTex: THREE.Texture) {
  const n = 36;
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 1, 6), toon('#e8dcc0'), n);
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe9a0', toneMapped: false }), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const r = ARENA_R - 10 - rnd() * 18;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 4 + rnd() * 6;
    m.compose(new THREE.Vector3(x, h / 2, z), q.identity(), new THREE.Vector3(h * 0.5, h, h * 0.5));
    stems.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, h, z), q.identity(), new THREE.Vector3(h * 0.6, h * 0.45, h * 0.6));
    caps.setMatrixAt(i, m);
    caps.setColorAt(i, col.set(i % 3 ? '#ffe9a0' : '#9fe8ff'));
  }
  root.add(stems, caps);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.3;
    const glow = glowSprite(glowTex, i % 2 ? '#ffe08a' : '#9fe8ff', 60, 0.3);
    glow.position.set(Math.cos(a) * (ARENA_R - 18), 8, Math.sin(a) * (ARENA_R - 18));
    root.add(glow);
  }
}

/** A cluster of glowing green crystals on a rock: the mine's pillars. */
export function buildCrystal(r: number, glowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.95, 0), stone('#3e352c'));
  rock.position.y = r * 0.35;
  rock.scale.set(1, 0.6, 1);
  g.add(rock);
  const mat = new THREE.MeshBasicMaterial({ color: '#7dffb8', transparent: true, opacity: 0.82, toneMapped: false });
  const edge = new THREE.MeshStandardMaterial({ color: '#2f8a5a', roughness: 0.3, metalness: 0.2, flatShading: true });
  const shards: [number, number, number, number, number][] = [
    [0, 0, 1.0, 2.6, 0],
    [0.45, 0.2, 0.7, 1.8, 0.45],
    [-0.4, 0.35, 0.65, 1.6, -0.5],
    [0.1, -0.5, 0.6, 1.5, 0.35],
    [-0.35, -0.35, 0.5, 1.2, -0.3],
  ];
  shards.forEach(([x, z, w, h, tilt], i) => {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.45, 0), i === 3 ? edge : mat);
    crystal.position.set(x * r, r * 0.5 + h * r * 0.35, z * r);
    crystal.scale.set(w, h, w);
    crystal.rotation.set(tilt, x * 2, tilt * 0.6);
    g.add(crystal);
  });
  const glow = glowSprite(glowTex, '#5dffb0', r * 5, 0.5);
  glow.position.y = r * 1.1;
  shadowed(g);
  g.add(glow);
  return g;
}

/** A rock ridge `len` long along local X, `r` thick each side, with crystals poking out. */
export function buildRidge(len: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const rockMats = ['#4a3f33', '#3e352c', '#544737'].map((c) => stone(c));
  const crystal = new THREE.MeshBasicMaterial({ color: '#7dffb8', transparent: true, opacity: 0.8, toneMapped: false });
  const n = Math.max(3, Math.round(len / (r * 1.1)));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    const size = r * (1.05 + ((i * 37) % 5) * 0.08);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMats[i % 3]);
    rock.position.set(x, size * 0.75, ((i * 13) % 5 - 2) * 1.5);
    rock.scale.set(1, 1.15 + ((i * 7) % 3) * 0.12, 0.95);
    rock.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    g.add(rock);
    if (i % 2) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.3, 0), crystal);
      shard.position.set(x, size * 1.9, (i % 4 === 1 ? 1 : -1) * r * 0.5);
      shard.scale.set(0.6, 1.8, 0.6);
      shard.rotation.z = (i % 4 === 1 ? 1 : -1) * 0.35;
      g.add(shard);
    }
  }
  shadowed(g);
  return g;
}

/** A broad-leafed tree for the grove: flared roots, a bark trunk and a layered canopy. */
export function buildTree(r: number): THREE.Group {
  const g = new THREE.Group();
  const bark = toon('#5a4330');
  const leaves = ['#3f6e2c', '#4f8536', '#5f9a3e'].map((c) => toon(c));
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.8, 70, 9), bark);
  trunk.position.y = 35;
  g.add(trunk);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + r;
    const root = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 1.3, 5), bark);
    root.position.set(Math.cos(a) * r * 0.7, r * 0.18, Math.sin(a) * r * 0.7);
    root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    g.add(root);
  }
  const blobs: [number, number, number, number][] = [
    [0, 92, 0, 1.55],
    [r * 0.7, 84, r * 0.4, 1.1],
    [-r * 0.6, 86, -r * 0.5, 1.15],
    [r * 0.1, 108, -r * 0.2, 1.05],
  ];
  blobs.forEach(([x, y, z, k], i) => {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r * k, 1), leaves[i % 3]);
    blob.position.set(x, y, z);
    blob.scale.set(1, 0.75, 1);
    g.add(blob);
  });
  shadowed(g);
  return g;
}

export interface Brazier {
  light: THREE.PointLight;
  flame: THREE.Mesh;
  glow: THREE.Sprite;
  seed: number;
}

export interface ArenaModel {
  /** Everything of this arena, to drop it when the map changes. */
  root: THREE.Group;
  braziers: Brazier[];
  pedestalInlay: THREE.Mesh;
  ambient: Ambient;
}

const AMBIENT_TOP = 180;

/** Airborne specks of a theme: one Points object, moved on the CPU. */
export interface Ambient {
  points: THREE.Points;
  speeds: Float32Array;
  mode: AmbientConfig['mode'];
}

interface AmbientConfig {
  n: number;
  color: string;
  size: number;
  opacity: number;
  /** rise: embers float up and wrap; fall: leaves and dust drift down and wrap; wander: fireflies loop in place. */
  mode: 'rise' | 'fall' | 'wander';
  low: number;
  high: number;
  speed: number;
  spread: number;
}

const AMBIENT: Record<MapTheme, AmbientConfig> = {
  ruins: { n: 110, color: '#d8ff7a', size: 6, opacity: 0.9, mode: 'wander', low: 15, high: 85, speed: 6, spread: 10 },
  castle: { n: 140, color: '#ff6a3a', size: 7, opacity: 0.85, mode: 'rise', low: 0, high: AMBIENT_TOP, speed: 18, spread: 30 },
  mine: { n: 120, color: '#b8ffd8', size: 4, opacity: 0.6, mode: 'fall', low: 0, high: AMBIENT_TOP, speed: 4, spread: 6 },
  grove: { n: 90, color: '#e8c060', size: 6, opacity: 0.85, mode: 'fall', low: 0, high: AMBIENT_TOP, speed: 10, spread: 12 },
};

function buildAmbient(theme: MapTheme, glowTex: THREE.Texture): Ambient {
  const cfg = AMBIENT[theme];
  const pos = new Float32Array(cfg.n * 3);
  const speeds = new Float32Array(cfg.n);
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < cfg.n; i++) {
    const a = rnd() * TAU;
    const r = Math.sqrt(rnd()) * (ARENA_R + 60);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = cfg.low + rnd() * (cfg.high - cfg.low);
    pos[i * 3 + 2] = Math.sin(a) * r;
    speeds[i] = cfg.speed + rnd() * cfg.spread;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: glowTex,
    color: cfg.color,
    size: cfg.size,
    transparent: true,
    opacity: cfg.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  return { points: new THREE.Points(geo, mat), speeds, mode: cfg.mode };
}

/** Embers rise and leaves fall (both wrapping around), fireflies wander in small loops. */
export function updateAmbient(a: Ambient, t: number, dt: number) {
  const attr = a.points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const pos = attr.array as Float32Array;
  for (let i = 0; i < a.speeds.length; i++) {
    if (a.mode === 'rise') {
      pos[i * 3 + 1] += a.speeds[i] * dt;
      pos[i * 3] += Math.sin(t * 1.3 + i) * 6 * dt;
      if (pos[i * 3 + 1] > AMBIENT_TOP) pos[i * 3 + 1] = 0;
    } else if (a.mode === 'fall') {
      pos[i * 3 + 1] -= a.speeds[i] * dt;
      pos[i * 3] += Math.sin(t * 0.9 + i * 1.3) * a.speeds[i] * 0.8 * dt;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = AMBIENT_TOP;
    } else {
      pos[i * 3] += Math.sin(t * 0.7 + i * 2.3) * a.speeds[i] * dt;
      pos[i * 3 + 1] += Math.sin(t * 0.6 + i * 1.7) * a.speeds[i] * dt;
      pos[i * 3 + 2] += Math.cos(t * 0.5 + i * 1.1) * a.speeds[i] * dt;
    }
  }
  attr.needsUpdate = true;
}

export function buildArena(scene: THREE.Scene, glowTex: THREE.Texture, theme: MapTheme = 'ruins'): ArenaModel {
  const castle = theme === 'castle';
  const look = THEME_LOOKS[theme];
  const pal = ARENA_PALETTES[theme];
  const root = new THREE.Group();
  scene.add(root);

  // Floor: CircleGeometry lies in XY; rotating it flat maps canvas x/y onto sim x/y.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R, 128),
    new THREE.MeshStandardMaterial({ map: makeFloorTexture(theme), roughness: 0.88, metalness: 0.04 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(3200, 64), new THREE.MeshStandardMaterial({ color: look.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  root.add(ground);

  // Wall: a ring of uneven stone blocks in the theme's colors.
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
  const tallAngles: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const tall = i % 8 === 0;
    if (tall) tallAngles.push(a);
    const h = tall ? 70 : 30 + rnd() * 16;
    const depth = tall ? 44 : 34;
    const r = ARENA_R + 3 + depth / 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2, Math.sin(a) * r), q, new THREE.Vector3(depth, h, ((TAU * r) / N) * (tall ? 1.05 : 0.95)));
    wall.setMatrixAt(i, m);
    col.set(tall ? pal.wallTall : pal.wallLow).multiplyScalar(0.85 + rnd() * 0.3);
    wall.setColorAt(i, col);
  }
  wall.castShadow = true;
  wall.receiveShadow = true;
  root.add(wall);

  // Faint glowing edge so the boundary reads clearly.
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_R - 3, ARENA_R + 1, 160),
    new THREE.MeshBasicMaterial({ color: pal.rim, transparent: true, opacity: pal.rimOpacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.6;
  root.add(rim);

  // Orb pedestal
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(52, 58, 4, 32), stone(pal.pedestal, 0.7));
  pedestal.position.y = 2;
  pedestal.receiveShadow = true;
  root.add(pedestal);
  const pedestalInlay = new THREE.Mesh(
    new THREE.RingGeometry(40, 44, 64),
    new THREE.MeshBasicMaterial({ color: COLORS.orb, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  pedestalInlay.rotation.x = -Math.PI / 2;
  pedestalInlay.position.y = 4.2;
  root.add(pedestalInlay);

  // Fires outside the wall: green moonfire, red fire, lanterns or golden wisps by theme
  const braziers: Brazier[] = [];
  for (let i = 0; i < 4; i++) {
    const a = TAU / 8 + (i / 4) * TAU;
    const r = ARENA_R + 85;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(13, 18, 46, 8), stone(pal.brazier));
    base.position.set(x, 23, z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(22, 12, 12, 8), new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: 0.6, roughness: 0.5, flatShading: true }));
    bowl.position.set(x, 52, z);
    root.add(shadowed(base), shadowed(bowl));

    const flame = new THREE.Mesh(new THREE.ConeGeometry(11, 30, 6), new THREE.MeshBasicMaterial({ color: pal.flame, toneMapped: false }));
    flame.position.set(x, 72, z);
    const glow = glowSprite(glowTex, pal.flameGlow, 130, 0.8);
    glow.position.set(x, 72, z);
    const light = new THREE.PointLight(pal.flameLight, 18000, 700, 2);
    light.position.set(x, 90, z);
    root.add(flame, glow, light);
    braziers.push({ light, flame, glow, seed: i * 1.7 });
  }

  if (theme === 'ruins' || theme === 'grove') {
    // Moss and ferns along the foot of the outer wall
    const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), toon('#4f7a34'), 90);
    for (let i = 0; i < 90; i++) {
      const a = rnd() * TAU;
      const r = ARENA_R - 6 - rnd() * 16;
      const size = 4 + rnd() * 7;
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.6, rnd() * 3, (rnd() - 0.5) * 0.6));
      m.compose(new THREE.Vector3(Math.cos(a) * r, size * 0.45, Math.sin(a) * r), q, new THREE.Vector3(size * 0.8, size, size * 0.8));
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, col.set('#5e8a3c').multiplyScalar(0.7 + rnd() * 0.5));
    }
    root.add(tufts);
  }

  if (castle) {
    // Crimson banners hanging on the inner face of the tall wall blocks
    const cloth = new THREE.MeshStandardMaterial({ color: '#6e1422', roughness: 0.9, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.5, metalness: 0.5 });
    tallAngles.forEach((a, i) => {
      const banner = new THREE.Group();
      banner.position.set(Math.cos(a) * (ARENA_R + 1), 68, Math.sin(a) * (ARENA_R + 1));
      banner.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      const panel = new THREE.Mesh(raggedPanel(24, 54, 5, 31 + i), cloth);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 30, 6), gold);
      rod.rotation.z = Math.PI / 2;
      const crest = new THREE.Mesh(new THREE.CircleGeometry(5, 12), gold);
      crest.position.set(0, -18, 0.4);
      banner.add(panel, rod, crest);
      root.add(shadowed(banner));
    });
    // Rubble along the foot of the outer wall
    const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stone('#ffffff'), 60);
    for (let i = 0; i < 60; i++) {
      const a = rnd() * TAU;
      const r = ARENA_R - 8 - rnd() * 22;
      const size = 2.5 + rnd() * 5;
      q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
      m.compose(new THREE.Vector3(Math.cos(a) * r, size * 0.4, Math.sin(a) * r), q, new THREE.Vector3(size, size * 0.7, size));
      rubble.setMatrixAt(i, m);
      rubble.setColorAt(i, col.set('#5a4c48').multiplyScalar(0.7 + rnd() * 0.4));
    }
    rubble.receiveShadow = true;
    root.add(rubble);
  }

  if (theme === 'mine') addMineDressing(root, rnd, glowTex);
  if (theme === 'grove') addGroveDressing(root, rnd, glowTex);

  const ambient = buildAmbient(theme, glowTex);
  root.add(ambient.points);

  return { root, braziers, pedestalInlay, ambient };
}

/** A rune column; `overgrown` makes it pale ruin stone wrapped in ivy, with moss at its foot. */
export function buildPillar(r: number, overgrown = false): THREE.Group {
  const g = new THREE.Group();
  const mat = stone(overgrown ? '#7a8272' : '#4b556c');
  const dark = stone(overgrown ? '#5d6656' : '#3a4357');
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
    new THREE.MeshBasicMaterial({ color: overgrown ? '#bfffd8' : '#79c8ff', transparent: true, opacity: overgrown ? 0.45 : 0.55, toneMapped: false }),
  );
  band.position.y = 52;
  if (overgrown) addIvy(g, r);
  shadowed(g);
  g.add(band);
  return g;
}

/** Two ivy vines spiralling up a column, leaves along them, and a ring of moss at its foot. */
function addIvy(g: THREE.Group, r: number) {
  const vineMat = toon('#3f5f2a');
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), toon('#ffffff'), 64);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  let n = 0;
  for (const phase of [0, Math.PI * 0.9]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const a = phase + t * Math.PI * 2.2;
      const rr = r * (1.0 - 0.1 * t) + 1.2;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, 4 + t * 74, Math.sin(a) * rr));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.9, 5), vineMat));
    for (let k = 0; k < 32 && n < 64; k++, n++) {
      const t = (k + 0.5) / 32;
      const p = curve.getPoint(t);
      const s = 2.2 + ((k * 7) % 5) * 0.5;
      q.setFromEuler(new THREE.Euler(k * 1.3, k * 2.1, k * 0.7));
      m.compose(p, q, new THREE.Vector3(s, s * 0.35, s * 0.8));
      leaves.setMatrixAt(n, m);
      leaves.setColorAt(n, col.set(k % 3 ? '#5f9a3a' : '#7bbf4a'));
    }
  }
  leaves.count = n;
  g.add(leaves);
  const moss = new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, 4, 5, 16), toon('#4c7432'));
  moss.rotation.x = Math.PI / 2;
  moss.position.y = 2;
  moss.scale.set(1, 1, 0.5);
  g.add(moss);
}

export interface RiverModel {
  root: THREE.Group;
  /** Scrolled every frame so the water flows. */
  flow: THREE.CanvasTexture;
}

/** Ripple streaks on dark teal, repeated along the river and scrolled to make it flow. */
function makeWaterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d5a62';
  g.fillRect(0, 0, 64, 256);
  let seed = 5;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(170, 235, 230, ${0.08 + rnd() * 0.18})`;
    g.lineWidth = 1 + rnd() * 1.5;
    const x = rnd() * 64;
    const y = rnd() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 10, y + 12, x + (rnd() - 0.5) * 6, y + 24 + rnd() * 20);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The river down the middle (sim y = world z): flowing water running out under the wall,
 * mossy stone curbs on both banks, lily pads and reeds, and stone bridges with railings.
 */
export function buildRiver(river: River): RiverModel {
  const root = new THREE.Group();
  const half = river.half;
  const len = (ARENA_R + 60) * 2;
  const flow = makeWaterTexture();
  flow.repeat.set(1, len / 140);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 6, len),
    new THREE.MeshStandardMaterial({ map: flow, color: '#9fd8d2', emissive: '#0b3a40', emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.93 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.35;
  water.receiveShadow = true;
  root.add(water);

  const curbMat = stone('#6c7564');
  const mossMat = toon('#4f7a34');
  const deckMat = stone('#8a917f');
  const railMat = stone('#6f7868');
  let seed = 9;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const onBridge = (z: number, pad: number) => river.bridges.some((b) => Math.abs(z - b.y) < b.half + pad);

  // Bank curbs and a strip of moss and foam along them, broken where the bridges are
  for (const side of [-1, 1]) {
    for (let z = -ARENA_R; z < ARENA_R; z += 24) {
      if (onBridge(z + 12, 24)) continue;
      const curb = new THREE.Mesh(new THREE.BoxGeometry(7, 4 + rnd() * 2, 22), curbMat);
      curb.position.set(side * (half + 3), 2, z + 12);
      root.add(curb);
      if (rnd() < 0.6) {
        const moss = new THREE.Mesh(new THREE.SphereGeometry(4, 6, 4), mossMat);
        moss.position.set(side * (half + 8), 1.2, z + 12 + (rnd() - 0.5) * 14);
        moss.scale.set(1.2, 0.35, 1.6);
        root.add(moss);
      }
    }
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(3, len),
      new THREE.MeshBasicMaterial({ color: '#d6fff6', transparent: true, opacity: 0.25, depthWrite: false }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(side * (half - 2), 0.5, 0);
    root.add(foam);
  }

  // Lily pads and reeds
  for (let i = 0; i < 14; i++) {
    const z = (rnd() - 0.5) * ARENA_R * 1.8;
    if (onBridge(z, 30)) continue;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(4 + rnd() * 3, 10, 0.4, TAU - 0.5), toon('#4f8a3a'));
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rnd() * TAU;
    pad.position.set((rnd() - 0.5) * half * 1.4, 0.6, z);
    root.add(pad);
  }
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 1, 4), toon('#5e7f3a'), 60);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const z = (rnd() - 0.5) * ARENA_R * 1.9;
    if (onBridge(z, 30)) continue;
    const side = rnd() < 0.5 ? -1 : 1;
    const h = 10 + rnd() * 12;
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4));
    m.compose(new THREE.Vector3(side * (half - 3 - rnd() * 6), h / 2, z), q, new THREE.Vector3(1, h, 1));
    reeds.setMatrixAt(n++, m);
  }
  reeds.count = n;
  root.add(reeds);

  // Bridges: a pale stone deck flush with the floor, railings outside the walkable band
  for (const b of river.bridges) {
    const width = (half + PLAYER_R) * 2 + 24;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 2, (b.half + 24) * 2), deckMat);
    deck.position.set(0, 1, b.y);
    root.add(deck);
    for (let k = -2; k <= 2; k++) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, (b.half + 22) * 2), stone('#6c7364'));
      seam.position.set((k * width) / 6, 2.1, b.y);
      root.add(seam);
    }
    for (const sz of [-1, 1]) {
      const z = b.y + sz * (b.half + 22);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width - 10, 7, 4), railMat);
      rail.position.set(0, 5.5, z);
      root.add(rail);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4, 16, 6), railMat);
        post.position.set(sx * (width / 2 - 4), 8, z);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(4.6, 8, 6), mossMat);
        cap.position.set(sx * (width / 2 - 4), 17, z);
        cap.scale.set(1, 0.5, 1);
        root.add(post, cap);
      }
    }
  }
  shadowed(root);
  water.castShadow = false;
  return { root, flow };
}

/**
 * Castle wall `len` long between its end posts (along local X, centered), `r` thick on
 * each side: a stone block with a plinth, crenellations on top and square end towers.
 */
export function buildWall(len: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const mat = stone('#4f4a55');
  const dark = stone('#3b3741');
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(len + r * 2.4, 8, r * 2.5), dark, 0, 4);
  add(new THREE.BoxGeometry(len, 58, r * 2), mat, 0, 37);
  add(new THREE.BoxGeometry(len + 2, 4, r * 2.3), dark, 0, 67);
  const merlons = Math.max(2, Math.round(len / 16));
  for (let i = 0; i < merlons; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / merlons;
    add(new THREE.BoxGeometry((len / merlons) * 0.55, 9, r * 2), mat, x, 73.5);
  }
  for (const x of [-len / 2, len / 2]) {
    add(new THREE.BoxGeometry(r * 2.4, 78, r * 2.4), mat, x, 39);
    add(new THREE.BoxGeometry(r * 2.8, 6, r * 2.8), dark, x, 81);
  }
  shadowed(g);
  return g;
}

/** A hooded stone knight on a plinth, leaning on a sword — the courtyard's statues. */
export function buildStatue(r: number): THREE.Group {
  const g = new THREE.Group();
  const mat = stone('#5a5560');
  const dark = stone('#3b3741');
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(new THREE.CylinderGeometry(r * 1.15, r * 1.3, 10, 8), dark, 0, 5);
  add(new THREE.CylinderGeometry(r, r * 1.05, 26, 8), mat, 0, 23);
  add(new THREE.CylinderGeometry(r * 1.1, r, 5, 8), dark, 0, 38.5);
  // Cloaked figure: a tall cone, shoulders, a hooded head
  add(new THREE.ConeGeometry(r * 0.75, 46, 10), mat, 0, 64);
  add(new THREE.SphereGeometry(r * 0.5, 10, 8), mat, 0, 78).scale.set(1.2, 0.7, 1.2);
  add(new THREE.SphereGeometry(r * 0.33, 10, 8), mat, 0, 90);
  add(new THREE.ConeGeometry(r * 0.38, 12, 10), dark, -1, 95);
  // Sword point-down in front, hands on the pommel
  add(new THREE.BoxGeometry(2.4, 40, 1), dark, r * 0.7, 60);
  add(new THREE.BoxGeometry(2.4, 2.4, 12), dark, r * 0.7, 79);
  add(new THREE.SphereGeometry(3, 8, 6), mat, r * 0.7, 82);
  shadowed(g);
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
  /** Little stars circling the head while stunned. */
  stunStars: THREE.Group;
  /** Shimmering half-shell in front of a deflecting samurai (turns with the aim). */
  deflectArc: THREE.Mesh;
  /** Cloud of bats shown instead of the body during Night Swarm (bats are [body, left wing, right wing, eyes]; last child is the floor haze). */
  swarm: THREE.Group;
}

export function buildChampion(champ: number, color: string, glowTex: THREE.Texture): ChampionRig {
  if (champ === CHAMP.MAGE) return buildMage(color, glowTex);
  if (champ === CHAMP.WARRIOR) return buildWarrior(color, glowTex);
  if (champ === CHAMP.ASSASSIN) return buildAssassin(color, glowTex);
  if (champ === CHAMP.ARCHER) return buildArcher(color, glowTex);
  if (champ === CHAMP.SAMURAI) return buildSamurai(color, glowTex);
  if (champ === CHAMP.BLOOD) return buildVampire(color, glowTex);
  if (champ === CHAMP.CHRONO) return buildRustic(color, glowTex);
  if (champ === CHAMP.FROG) return buildLotan(color, glowTex);
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

  const stunStars = new THREE.Group();
  const starMat = new THREE.MeshBasicMaterial({ color: '#ffe88a', toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), starMat);
    star.position.set(Math.cos(a) * 12, 0, Math.sin(a) * 12);
    stunStars.add(star);
  }
  stunStars.position.y = 80;
  stunStars.visible = false;
  root.add(stunStars);

  // Deflect: front half of a cylinder, on the pointer group so it faces the aim.
  const deflectArc = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAYER_R + 12, PLAYER_R + 12, 56, 24, 1, true, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  deflectArc.position.y = 30;
  deflectArc.visible = false;
  pointer.add(deflectArc);

  const swarm = new THREE.Group();
  const batMat = new THREE.MeshBasicMaterial({ color: '#2a0a14', side: THREE.DoubleSide });
  const batEyeMat = new THREE.MeshBasicMaterial({ color: '#ff3355', toneMapped: false });
  const batBody = new THREE.SphereGeometry(3.4, 6, 4);
  const eye = new THREE.SphereGeometry(1, 4, 3);
  const wing = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -3.5), new THREE.Vector3(16, 2.5, -6), new THREE.Vector3(11, 0, 1.5), new THREE.Vector3(0, 0, 3.5)]);
  wing.setIndex([0, 1, 2, 0, 2, 3]);
  for (let i = 0; i < 10; i++) {
    const bat = new THREE.Group();
    const left = new THREE.Mesh(wing, batMat);
    const right = new THREE.Mesh(wing, batMat);
    right.rotation.y = Math.PI;
    const eyeL = new THREE.Mesh(eye, batEyeMat);
    const eyeR = new THREE.Mesh(eye, batEyeMat);
    eyeL.position.set(-1.3, 1.6, 2.8);
    eyeR.position.set(1.3, 1.6, 2.8);
    bat.add(new THREE.Mesh(batBody, batMat), left, right, eyeL, eyeR);
    swarm.add(bat);
  }
  // A blood-red haze on the floor under the cloud.
  const haze = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.crimson, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 1;
  swarm.add(haze);
  swarm.visible = false;
  root.add(swarm);

  return { ring, pointer, shield, slowRing, markSigil, rootRing, revealEye, stunStars, deflectArc, swarm };
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
  const matSkin = toon('#909945');
  const matSkinDark = toon('#6c7334');
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

/** Off-white kimono cloth with blue and grey flower blots and small white blossoms. u around, v bottom→top. */
function makeSakuraKimonoTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8e2d6';
  g.fillRect(0, 0, W, H);
  const r = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const flower = (x: number, y: number, size: number, color: string) => {
    g.fillStyle = color;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + size;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * size * 0.55, y + Math.sin(a) * size * 0.55, size * 0.5, size * 0.32, a, 0, TAU);
      g.fill();
    }
  };
  // Ink washes and big blue flowers, denser towards the hem
  for (let i = 0; i < 36; i++) {
    const x = r() * W;
    const y = H - Math.pow(r(), 1.6) * H;
    g.globalAlpha = 0.25 + r() * 0.35;
    flower(x, y, 10 + r() * 16, r() < 0.65 ? '#2c4a8a' : '#77808f');
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 40; i++) flower(r() * W, r() * H, 4 + r() * 5, '#fbf8f2');
  // Dark wash rising from the hem
  const grad = g.createLinearGradient(0, H, 0, H * 0.55);
  grad.addColorStop(0, 'rgba(20,22,30,0.75)');
  grad.addColorStop(1, 'rgba(20,22,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Black pleated hakama with white blossoms scattered along the hem. u around, v bottom→top. */
function makeHakamaTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#17171c';
  g.fillRect(0, 0, W, H);
  // Pleats
  for (let x = 0; x < W; x += 32) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x, 0, 3, H);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x + 14, 0, 4, H);
  }
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = H - Math.pow(r(), 2.2) * H * 0.55;
    const size = 3 + r() * 6;
    g.fillStyle = r() < 0.75 ? '#efe6d8' : '#3c5ca8';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      g.beginPath();
      g.arc(x + Math.cos(a) * size * 0.6, y + Math.sin(a) * size * 0.6, size * 0.45, 0, TAU);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * Sozuki, wandering swordswoman: wide straw hat hung with blue tassels, long black
 * hair with blue ribbons and white flowers, an off-shoulder white kimono with blue
 * blossoms over a torn black hakama, blue obi, black gauntlets, leg wraps and
 * sandals, and a katana in the right hand with its scabbard on the left hip.
 */
function buildSamurai(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matKimono = toon('#ffffff', { map: makeSakuraKimonoTexture(), side: THREE.DoubleSide });
  const matHakama = toon('#ffffff', { map: makeHakamaTexture(), side: THREE.DoubleSide });
  const matBlack = toon('#1b1b21');
  const matLining = toon('#202436', { side: THREE.BackSide });
  const matBlue = toon('#2c4a8a', { side: THREE.DoubleSide });
  const matGold = toon('#c9a35c');
  const matSkin = toonSoft('#f2cdb4');
  const matHair = toonSoft('#26232b');
  const matHairDark = toonSoft('#17151b');
  const matStraw = toon('#8b6c45');
  const matStrawDark = toon('#5e4529', { side: THREE.DoubleSide });
  const matFlower = toonSoft('#f6f1ea');
  const matSteel = toon('#d4d8e0');
  const matEyeWhite = new THREE.MeshBasicMaterial({ color: '#f4f1ee' });
  const matIris = new THREE.MeshBasicMaterial({ color: '#6b4a32' });
  const matPupil = new THREE.MeshBasicMaterial({ color: '#1a1210' });
  const matLips = new THREE.MeshBasicMaterial({ color: '#b5545e' });
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

  // Legs: bare, with black wraps around the shins and strappy sandals; the left one shows through the slit.
  for (const side of [-1, 1]) {
    keep(limb(body, v(0.5, 25, side * 3.8), v(2.2, 12, side * 4.4), 2.5, matSkin));
    keep(limb(body, v(2.2, 12, side * 4.4), v(1.4, 3, side * 4.6), 2.1, matSkin));
    for (const y of [5, 8, 11, 14, 19]) {
      const wrap = add(new THREE.TorusGeometry(y > 15 ? 2.6 : 2.3, 0.45, 4, 12), matBlack, y > 15 ? 1.6 : 1.9, y, side * 4.5);
      wrap.rotation.set(Math.PI / 2 + (y % 2 ? 0.3 : -0.3), 0, 0);
    }
    keep(add(new THREE.BoxGeometry(6.4, 1.6, 3.2), matBlack, 2.6, 0.8, side * 4.6));
    add(new THREE.BoxGeometry(1.2, 2.2, 3), matBlack, 4.4, 2, side * 4.6);
  }

  // Hakama: long pleated black skirt with a torn hem, slit open over the left leg
  const hakamaGeo = raggedLathe([[16.5, 1.5], [15, 8], [13, 16], [11, 24], [9.2, 30], [8.6, 33]], 34, 5, 31, Math.PI / 2 + 0.55, TAU - 0.9);
  keep(add(hakamaGeo, matHakama, 0, 0, 0));
  // White kimono skirt panels over the hakama, torn into long tails at the back and sides
  const tailGeo = raggedLathe([[17.5, 4], [15.8, 10], [13.6, 18], [11.2, 26], [9.4, 33]], 26, 9, 37, Math.PI * 0.75, Math.PI * 1.15);
  keep(add(tailGeo, matKimono, -0.4, 0, 0));

  // Kimono top: wrapped V neck, blue obi with black cord and a gold medallion
  keep(add(lathe([[8.6, 33], [8.9, 36], [9.6, 40], [9.6, 43], [8.6, 46], [6, 48.5], [2.8, 50]]), matKimono, 0, 0, 0));
  for (const side of [-1, 1]) {
    const lapel = keep(limb(body, v(9.3, 46.5, side * 4.8), v(9.4, 37, -side * 1.2), 0.75, matBlack));
    lapel.castShadow = true;
  }
  const obi = keep(add(new THREE.CylinderGeometry(9.3, 9, 6.2, 28), matBlue, 0, 34.5, 0));
  obi.castShadow = true;
  add(new THREE.TorusGeometry(9.3, 0.55, 5, 28), matBlack, 0, 32.4, 0).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(9.4, 0.55, 5, 28), matBlack, 0, 36.6, 0).rotation.x = Math.PI / 2;
  const medal = add(new THREE.CylinderGeometry(2, 2, 0.8, 16), matGold, 9.6, 34.5, 0);
  medal.rotation.z = Math.PI / 2;
  add(new THREE.OctahedronGeometry(0.9, 0), matTeam, 10.2, 34.5, 0);
  // Blue ribbons hanging from the obi
  for (const [z, len] of [[-3.5, 14], [-1.5, 18], [6.5, 12]] as const) {
    const ribbon = add(new THREE.PlaneGeometry(1.6, len), matBlue, 9.4, 32 - len / 2, z);
    ribbon.rotation.y = Math.PI / 2;
    ribbon.rotation.z = 0.06;
  }

  // Bare shoulders; the outer robe hangs off them into wide torn sleeves, white outside, dark inside.
  for (const side of [-1, 1]) keep(add(new THREE.SphereGeometry(3.1, 14, 10), matSkin, 0, 46.4, side * 9));
  const rElbow = v(3, 38.5, 12.6);
  const rHand = v(9, 33, 11.5);
  const lElbow = v(1.5, 37.5, -12);
  const lHand = v(5, 30, -11.6);
  keep(limb(body, v(0, 46.4, 9), rElbow, 1.8, matSkin));
  keep(limb(body, rElbow, rHand, 1.7, matBlack));
  keep(limb(body, v(0, 46.4, -9), lElbow, 1.8, matSkin));
  keep(limb(body, lElbow, lHand, 1.7, matBlack));
  for (const hand of [rHand, lHand]) keep(add(new THREE.SphereGeometry(1.9, 12, 10), matSkin, hand.x, hand.y - 0.6, hand.z));
  for (const [elbow, hand] of [[rElbow, rHand], [lElbow, lHand]]) {
    // Gold studs along the black gauntlet
    for (const t of [0.35, 0.65]) {
      const p = elbow.clone().lerp(hand, t);
      add(new THREE.SphereGeometry(0.5, 6, 4), matGold, p.x + 1.6, p.y, p.z);
    }
  }
  for (const [elbow, side] of [[rElbow, 1], [lElbow, -1]] as const) {
    const sleeveGeo = raggedLathe([[7.4, -20], [6.4, -13], [4.6, -6], [3.2, 0]], 22, 3.5, side + 9);
    const sleeve = keep(add(sleeveGeo, matKimono, elbow.x - 1.5, elbow.y + 2.5, elbow.z + side * 1.4));
    sleeve.rotation.x = side * 0.2;
    add(sleeveGeo, matLining, 0, 0, 0, sleeve).castShadow = false;
    // The robe's dark collar band draped across the upper arm
    const band = add(new THREE.TorusGeometry(3.6, 0.9, 5, 14), matBlack, elbow.x - 1, elbow.y + 2.6, elbow.z + side * 0.8);
    band.rotation.x = Math.PI / 2;
  }

  // Neck and face
  keep(add(new THREE.CylinderGeometry(2.1, 2.6, 5, 12), matSkin, 0, 50.5, 0));
  keep(add(new THREE.SphereGeometry(6, 24, 18), matSkin, 0.7, 57.2, 0)).scale.set(1, 1.1, 0.92);
  keep(add(new THREE.SphereGeometry(2.3, 14, 10), matSkin, 2.6, 53.8, 0)).scale.set(1, 0.85, 1.22);
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(1.2, 12, 8), matEyeWhite, 5.7, 57.4, side * 2.4).scale.set(0.45, 0.55, 1);
    add(new THREE.SphereGeometry(0.78, 10, 8), matIris, 6.2, 57.3, side * 2.3).scale.set(0.4, 0.8, 1);
    add(new THREE.SphereGeometry(0.37, 8, 6), matPupil, 6.55, 57.3, side * 2.3).scale.set(0.4, 1, 1);
    const brow = add(new THREE.BoxGeometry(0.45, 0.38, 2.4), matHairDark, 5.95, 59.2, side * 2.5);
    brow.rotation.x = side * -0.1;
  }
  add(new THREE.ConeGeometry(0.4, 1.3, 6), matSkin, 6.4, 56, 0).rotation.z = -Math.PI / 2 + 0.6;
  add(new THREE.BoxGeometry(0.35, 0.45, 1.7), matLips, 6, 53.8, 0);

  // Long black hair: crown, side-swept bangs, locks to the waist with blue ribbons
  const crown = keep(add(new THREE.SphereGeometry(6.7, 24, 14, 0, TAU, 0, Math.PI * 0.62), matHair, -0.5, 58.2, 0));
  crown.rotation.z = 0.3;
  crown.scale.set(1.04, 1.06, 1);
  for (const side of [-1, 1]) {
    keep(limb(body, v(5.6, 61.4, side * 0.6), v(5.4, 56.4, side * 5.2), 1.4, matHair));
    keep(limb(body, v(2.6, 56.5, side * 6.1), v(3.6, 41, side * 8.4), 1.6, matHair));
    keep(limb(body, v(0, 56, side * 6.5), v(-1.6, 36, side * 9.6), 1.8, matHairDark));
  }
  for (let i = 0; i < 6; i++) {
    const z = -6 + i * 2.4;
    const wave = i % 2 ? 1.2 : -1.2;
    keep(limb(body, v(-4.6, 59, z * 0.85), v(-7.4 + wave * 0.3, 30 + Math.abs(z) * 0.6, z * 1.2 + wave), 2.1, i % 2 ? matHair : matHairDark));
  }
  // Blue ribbons and white flowers on the left side of the head, a blue tassel earring
  for (let i = 0; i < 3; i++) {
    const ribbon = add(new THREE.PlaneGeometry(1.4, 16 - i * 3), matBlue, -1 + i * 1.4, 52 - i, -7.2 - i * 0.4);
    ribbon.rotation.x = -0.15;
  }
  for (const [x, y, z, sz] of [[3.4, 62.4, -5.4, 1.8], [1.4, 63.2, -6, 1.5], [4.6, 60.6, -6.2, 1.3]] as const) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      add(new THREE.SphereGeometry(sz * 0.5, 8, 6), matFlower, x + Math.cos(a) * sz * 0.6, y + Math.sin(a) * sz * 0.6, z).scale.set(1, 1, 0.4);
    }
    add(new THREE.SphereGeometry(sz * 0.3, 6, 4), matGold, x, y, z - 0.2);
  }
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(0.6, 6, 4), matGold, 0.4, 54.6, side * 6);
    add(new THREE.CylinderGeometry(0.5, 0.2, 3.4, 6), matBlue, 0.4, 52.4, side * 6);
  }

  // Straw hat: wide shallow cone with a woven texture of rings, a knob on top, blue tassels on beaded strings around the rim
  const hat = new THREE.Group();
  hat.position.set(0.4, 62.6, 0);
  hat.rotation.z = -0.1;
  body.add(hat);
  // No shadow from the brim, or it hides the face from the top-down camera.
  const brim = keep(add(lathe([[0.01, 8.5], [2.2, 8], [9, 4.6], [17.5, 0.6], [17.8, 0]], 40), matStraw, 0, 0, 0, hat));
  add(new THREE.ConeGeometry(17.7, 8.4, 40, 1, true), matStrawDark, 0, 4.2, 0, hat).castShadow = false;
  for (const r of [5, 9, 13]) {
    const ring = add(new THREE.TorusGeometry(r, 0.18, 3, 40), matStrawDark, 0, 8.5 - (r / 17.5) * 8.1 + 0.15, 0, hat);
    ring.rotation.x = Math.PI / 2;
  }
  add(new THREE.SphereGeometry(1.3, 10, 8), matBlue, 0, 9.2, 0, hat);
  // Around the rim but leaving the front open, so they don't hang over the face.
  for (let i = 0; i < 10; i++) {
    const a = 0.75 + (i / 9) * (TAU - 1.5);
    const x = Math.cos(a) * 16.6;
    const z = Math.sin(a) * 16.6;
    const len = i % 2 ? 4 : 6.5;
    add(new THREE.CylinderGeometry(0.12, 0.12, len, 3), matGold, x, -len / 2, z, hat);
    add(new THREE.SphereGeometry(0.5, 6, 4), matGold, x, -len, z, hat);
    const tassel = add(new THREE.ConeGeometry(0.8, 3.6, 6), matBlue, x, -len - 2, z, hat);
    tassel.rotation.x = Math.PI;
  }

  // Scabbard on the left hip: black lacquer with a blue cord
  const saya = new THREE.Group();
  saya.position.set(-1, 31, -9.6);
  saya.rotation.set(0.15, 0, 0.5);
  body.add(saya);
  keep(add(new THREE.BoxGeometry(32, 1.8, 1.2), matBlack, -6, 0, 0, saya));
  add(new THREE.TorusGeometry(1.2, 0.35, 4, 10), matBlue, 6, 0, 0, saya).rotation.y = Math.PI / 2;
  add(new THREE.BoxGeometry(1.4, 2, 1.4), matGold, -21.6, 0, 0, saya);

  // Katana in the right hand: blue-wrapped grip, round gold guard, long curved steel blade along +X
  const katana = new THREE.Group();
  katana.position.copy(rHand).add(v(0.6, -0.4, 0));
  body.add(katana);
  const grip = add(new THREE.CylinderGeometry(0.75, 0.75, 9, 8), matBlack, -2, 0, 0, katana);
  grip.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.8, 0.28, 4, 8), matBlue, -5.4 + i * 2.2, 0, 0, katana).rotation.y = Math.PI / 2;
  const tsuba = add(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 16), matGold, 2.6, 0, 0, katana);
  tsuba.rotation.z = Math.PI / 2;
  // Blade: a thin box bent into a gentle curve
  const bladeGeo = new THREE.BoxGeometry(32, 1.3, 0.35, 16, 1, 1);
  const bp = bladeGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const t = (x + 16) / 32;
    bp.setY(i, bp.getY(i) + t * t * 2.4);
    // Taper to a point at the tip
    if (t > 0.94) bp.setY(i, bp.getY(i) * (1 - (t - 0.94) * 8) + t * t * 2.4 * (t - 0.94) * 8);
  }
  bladeGeo.computeVertexNormals();
  keep(add(bladeGeo, matSteel, 19, 0, 0, katana));
  const tip = add(new THREE.OctahedronGeometry(1, 0), matGlow, 35, 2.4, 0, katana);
  const tipGlow = glowSprite(glowTex, team, 16);
  tipGlow.position.set(35, 2.4, 0);
  katana.add(tipGlow);
  katana.rotation.z = -0.8;

  shadowed(body);
  tip.castShadow = false;
  brim.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matLining || m === matEyeWhite || m === matIris || m === matPupil || m === matLips || m === matGlow || m === matStrawDark) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: katana, tip, tipGlow, mats: [matTeam, matKimono, matHakama, matBlack, matSkin, matHair], ...markers };
}

/** Training dummy: a lashed wooden post with a crossbar for arms, a blocky head and a tripod foot. */
export function buildTrainingDummy(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matWood = toon('#8a6a48');
  const matWoodDark = toon('#5c442e');
  const matRope = toon('#c9b48a');
  const matTeam = toon(team);

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

  // Tripod foot and the post, made of a few lashed logs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    keep(limb(body, v(Math.cos(a) * 3, 16, Math.sin(a) * 3), v(Math.cos(a) * 15, 0.5, Math.sin(a) * 15), 1.6, matWoodDark));
  }
  for (const [x, z] of [[1.6, 0], [-1, 1.6], [-1, -1.6]]) keep(add(new THREE.CylinderGeometry(2.6, 2.9, 50, 8), matWood, x, 27, z));
  for (const y of [12, 22, 36, 46]) add(new THREE.TorusGeometry(5, 0.8, 5, 16), matRope, 0, y, 0).rotation.x = Math.PI / 2;

  // Crossbar arms with rope wraps; the right end is the "weapon" so the rig contract holds
  const arms = new THREE.Group();
  arms.position.set(1, 41, 0);
  body.add(arms);
  const bar = keep(add(new THREE.CylinderGeometry(2.2, 2.2, 34, 8), matWood, 0, 0, 0, arms));
  bar.rotation.x = Math.PI / 2;
  for (const z of [-11, 11]) add(new THREE.TorusGeometry(2.5, 0.6, 4, 12), matRope, 0, 0, z, arms);

  // Blocky head: a sawn log end with two carved eye slits
  keep(add(new THREE.CylinderGeometry(6, 6.4, 12, 10), matWood, 0.5, 57, 0));
  add(new THREE.CylinderGeometry(6.1, 6.1, 0.6, 10), matWoodDark, 0.5, 63.2, 0);
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(1, 0.8, 2.2), matWoodDark, 6.4, 58, side * 2.2);
  // Team colored sash so you can tell the sides apart
  const sash = add(new THREE.TorusGeometry(5.4, 1.2, 5, 18), matTeam, 0, 30, 0);
  sash.rotation.x = Math.PI / 2;

  const tip = add(new THREE.OctahedronGeometry(0.5, 0), matTeam, 0, 0, 17, arms);
  tip.visible = false;
  const tipGlow = glowSprite(glowTex, team, 1, 0);
  tipGlow.visible = false;
  arms.add(tipGlow);

  shadowed(body);
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: arms, tip, tipGlow, mats: [matWood, matWoodDark, matRope, matTeam], ...markers };
}

/** Off-white linen splashed with blood, darker towards the hem. u around, v bottom→top. */
function makeBloodClothTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4ddd2';
  g.fillRect(0, 0, W, H);
  let seed = 17;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Long vertical folds
  for (let x = 0; x < W; x += 18) {
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(x + r() * 6, 0, 3, H);
  }
  // Blood: splats with drips running down
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = H * 0.25 + r() * H * 0.75;
    const size = 2 + r() * 7;
    g.fillStyle = r() < 0.5 ? '#8f1020' : '#b3192d';
    g.beginPath();
    g.arc(x, y, size, 0, TAU);
    g.fill();
    g.fillRect(x - 1, y, 2, 6 + r() * 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Black coat cloth with broad blood-red bands down the back and sides. u around (lathe phi), v bottom→top. */
function makeVampireCoatTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d181c';
  g.fillRect(0, 0, W, H);
  // Bands (u = 0.5 is the back of a lathe opened at the front)
  for (const [u, w] of [[0.32, 0.07], [0.44, 0.05], [0.56, 0.05], [0.68, 0.07]]) {
    const grad = g.createLinearGradient((u - w) * W, 0, (u + w) * W, 0);
    grad.addColorStop(0, 'rgba(126,16,32,0)');
    grad.addColorStop(0.3, '#7e1020');
    grad.addColorStop(0.7, '#8e1424');
    grad.addColorStop(1, 'rgba(126,16,32,0)');
    g.fillStyle = grad;
    g.fillRect((u - w) * W, 0, 2 * w * W, H);
  }
  // Fine scale pattern
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < H; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Romulus, high vampire: tall and pale, long white hair, ram horns and pointed ears,
 * a high red collar, spiked scale pauldrons, a long torn black coat lined in red
 * over a blood-splashed white tunic, clawed hands with a blood orb, pointed boots.
 */
function buildVampire(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matCoat = toon('#1d181c', { side: THREE.FrontSide });
  const matCoatBack = toon('#ffffff', { map: makeVampireCoatTexture() });
  const matLining = toon('#7c1020', { side: THREE.BackSide });
  const matRed = toon('#8e1424', { side: THREE.DoubleSide });
  const matLinen = toon('#ffffff', { map: makeBloodClothTexture(), side: THREE.DoubleSide });
  const matLeather = toon('#2a1f1c');
  const matGold = toon('#b08a4a');
  const matSkin = toonSoft('#c9c0bd');
  const matHair = toonSoft('#ede4d2');
  const matHorn = toon('#5a4636');
  const matEye = new THREE.MeshBasicMaterial({ color: '#ff2a3d', toneMapped: false });
  const matBlood = new THREE.MeshBasicMaterial({ color: '#d4203f', toneMapped: false });
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

  // Legs: dark trousers, tall pointed boots with gold-edged greaves
  for (const side of [-1, 1]) {
    keep(limb(body, v(0, 27, side * 4.4), v(1.4, 13, side * 4.8), 2.6, matLeather));
    keep(limb(body, v(1.4, 14, side * 4.8), v(0.8, 3, side * 5), 2.6, matLeather));
    const toe = keep(add(new THREE.ConeGeometry(2.2, 10, 6), matLeather, 4.6, 1.6, side * 5));
    toe.rotation.z = -Math.PI / 2;
    toe.scale.set(1, 1, 0.8);
    add(new THREE.TorusGeometry(2.8, 0.4, 4, 12), matGold, 1.2, 12, side * 4.9).rotation.x = Math.PI / 2;
  }

  // Long coat: black outside, red lining, torn to the floor at the back and sides, open in front
  const coatGeo = raggedLathe([[19, 0.5], [16, 10], [13, 22], [10.5, 34], [9.6, 42], [9, 47]], 30, 9, 61, Math.PI / 2 + 0.6, TAU - 1.2);
  keep(add(coatGeo, matCoatBack, 0, 0, 0));
  add(coatGeo, matLining, 0, 0, 0);
  // White tunic falling in front, splashed with blood
  const tunic = add(raggedPanel(11, 30, 4, 83), matLinen, 9.4, 4, 0);
  tunic.rotation.y = Math.PI / 2;
  tunic.rotation.x = -0.12;

  // Torso: white shirt, black waistcoat front, wide belt with a gold clasp, gold chains
  keep(add(lathe([[8.6, 28], [9.2, 34], [9.8, 40], [9.8, 44], [8.8, 47], [6, 49.5], [2.6, 51]]), matCoat, 0, 0, 0));
  const shirt = add(new THREE.PlaneGeometry(6, 18), matLinen, 9.9, 39, 0);
  shirt.rotation.y = Math.PI / 2;
  const belt = keep(add(new THREE.CylinderGeometry(9.2, 9, 4, 24), matLeather, 0, 29.5, 0));
  belt.castShadow = true;
  add(new THREE.BoxGeometry(1.2, 3.2, 4), matGold, 9.2, 29.5, 0);
  for (const side of [-1, 1]) limb(body, v(9.6, 46, side * 4.5), v(9.9, 31, -side * 3), 0.35, matGold);
  add(new THREE.OctahedronGeometry(1, 0), matTeam, 10.2, 44, 0);

  // Spiked scale pauldrons and the high red collar behind the head
  for (const side of [-1, 1]) {
    const pad = keep(add(new THREE.SphereGeometry(5.4, 12, 8, 0, TAU, 0, Math.PI * 0.55), matCoat, 0, 46, side * 9.6));
    pad.rotation.x = side * 0.5;
    for (let k = 0; k < 4; k++) {
      const spike = add(new THREE.ConeGeometry(0.9, 5 + k, 4), matGold, -2 + k * 1.6, 49 + k * 0.4, side * (10 + k * 0.6));
      spike.rotation.x = side * (0.6 + k * 0.15);
      spike.rotation.z = 0.3;
    }
  }
  const collar = keep(add(new THREE.CylinderGeometry(7.5, 5.5, 13, 20, 1, true, Math.PI * 0.75, Math.PI * 1.5), matRed, -0.5, 55, 0));
  collar.castShadow = false;

  // Arms in long black sleeves with torn cuffs; pale clawed hands. The right reaches out.
  const rElbow = v(4.5, 39, 12.8);
  const rHand = v(12, 37, 12);
  const lElbow = v(1, 37, -12);
  const lHand = v(3.5, 29, -12);
  keep(limb(body, v(0, 46, 9.6), rElbow, 2.3, matCoat));
  keep(limb(body, rElbow, rHand, 2.1, matCoat));
  keep(limb(body, v(0, 46, -9.6), lElbow, 2.3, matCoat));
  keep(limb(body, lElbow, lHand, 2.1, matCoat));
  for (const [elbow, hand, side] of [[rElbow, rHand, 1], [lElbow, lHand, -1]] as const) {
    const cuff = add(raggedLathe([[4, -6], [3.4, -3], [2.6, 0]], 14, 2.5, side + 40), matCoat, 0, 0, 0);
    cuff.position.copy(elbow.clone().lerp(hand, 0.75));
    cuff.quaternion.setFromUnitVectors(v(0, -1, 0), hand.clone().sub(elbow).normalize().negate());
    keep(add(new THREE.SphereGeometry(1.9, 10, 8), matSkin, hand.x, hand.y, hand.z));
    for (let k = -1; k <= 1; k++) {
      const claw = add(new THREE.ConeGeometry(0.35, 3.2, 4), matSkin, hand.x + 2, hand.y - 0.6, hand.z + k * 0.9);
      claw.rotation.z = -Math.PI / 2 - 0.4;
    }
  }

  // Head: gaunt, pale, red eyes, pointed ears, long white hair, ram horns
  keep(add(new THREE.CylinderGeometry(2, 2.5, 5, 12), matSkin, 0, 51.5, 0));
  keep(add(new THREE.SphereGeometry(5.8, 22, 16), matSkin, 0.7, 58, 0)).scale.set(1, 1.18, 0.88);
  keep(add(new THREE.SphereGeometry(2.1, 12, 10), matSkin, 2.6, 54.2, 0)).scale.set(1, 0.9, 1.15);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.5, 0.55, 1.6), matEye, 5.8, 58.4, side * 2.2);
    const eyeGlow = glowSprite(glowTex, '#ff2a3d', 4, 0.8);
    eyeGlow.position.set(6.2, 58.4, side * 2.2);
    body.add(eyeGlow);
    const brow = add(new THREE.BoxGeometry(0.5, 0.45, 2.6), matHair, 5.7, 59.8, side * 2.4);
    brow.rotation.x = side * 0.25;
    const ear = keep(add(new THREE.ConeGeometry(1.1, 7, 8), matSkin, -0.8, 59, side * 6));
    ear.scale.set(0.5, 1, 1);
    ear.rotation.x = side * (Math.PI / 2 - 0.7);
    ear.rotation.z = 0.6;
    // Ram horn: a thick arc curling back and down from the temple
    const horn = keep(add(new THREE.TorusGeometry(4.2, 1.2, 6, 14, Math.PI * 1.4), matHorn, -1, 64, side * 4.6));
    horn.rotation.set(0, side * 0.3, Math.PI * 0.35);
    horn.scale.set(1, 1, 0.9);
  }
  const crown = keep(add(new THREE.SphereGeometry(6.3, 22, 12, 0, TAU, 0, Math.PI * 0.55), matHair, -0.6, 59, 0));
  crown.rotation.z = 0.32;
  for (let i = 0; i < 7; i++) {
    const z = -6.4 + i * 2.1;
    keep(limb(body, v(-4.4, 60, z * 0.85), v(-8.4 + (i % 2) * 0.6, 36 + Math.abs(z) * 0.5, z * 1.1), 1.8, matHair));
  }
  for (const side of [-1, 1]) keep(limb(body, v(2.4, 57, side * 5.8), v(3.4, 43, side * 8), 1.4, matHair));

  // Blood orb in the outstretched claw: the "weapon" that rises when casting
  const orb = new THREE.Group();
  orb.position.copy(rHand);
  body.add(orb);
  const tip = add(new THREE.SphereGeometry(2.2, 14, 10), matBlood, 4.5, 1.5, 0, orb);
  const tipGlow = glowSprite(glowTex, '#d4203f', 22, 0.9);
  tipGlow.position.copy(tip.position);
  orb.add(tipGlow);
  for (let k = 0; k < 3; k++) {
    const drop = add(new THREE.SphereGeometry(0.7, 8, 6), matBlood, 4.5 + Math.cos(k * 2.1) * 4, 1.5 + Math.sin(k * 2.1) * 3, Math.sin(k * 1.3) * 3, orb);
    drop.castShadow = false;
  }

  shadowed(body);
  tip.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matLining || m === matEye || m === matBlood || m === matGlow) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon: orb, tip, tipGlow, mats: [matTeam, matCoat, matCoatBack, matLinen, matLeather, matSkin, matHair], ...markers };
}

/**
 * Rustic — time kobold (from the concept sheet), toon style: a hunched grey rat with a
 * long pink tail, red eyes and a snout full of teeth, a riveted miner's helmet with a
 * glowing green clock for a lamp, a torn red scarf and brown rags, wrapped shins, a
 * backpack with scroll rolls, time crystals and an hourglass, a pickaxe in the right
 * claw and a clockwork bomb in the left. The right arm (with the pick) is the weapon.
 * Team color: armband and scarf knot.
 */
function buildRustic(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matFur = toonSoft('#8f8486');
  const matBelly = toonSoft('#d8cfc6');
  const matPink = toonSoft('#c98a8e');
  const matRags = toon('#4f3b2d', { side: THREE.DoubleSide });
  const matScarf = toon('#7c2026', { side: THREE.DoubleSide });
  const matWrap = toon('#5c4c3e');
  const matLeather = toon('#3d3129');
  const matBronze = toon('#8a6a3c');
  const matIron = toon('#3a3631');
  const matParch = toon('#cdb88e');
  const matIvory = toon('#e8dcc0');
  const matTooth = new THREE.MeshBasicMaterial({ color: '#efe6d2' });
  const matEye = new THREE.MeshBasicMaterial({ color: '#ff3b3b', toneMapped: false });
  const matTime = new THREE.MeshBasicMaterial({ color: COLORS.chrono, toneMapped: false });
  const matGlass = new THREE.MeshBasicMaterial({ color: '#cfe8d4', transparent: true, opacity: 0.35, depthWrite: false });
  const matSand = toon('#d9b46a');
  const matCrystal = new THREE.MeshBasicMaterial({ color: '#7dff8a', transparent: true, opacity: 0.8, toneMapped: false });
  const matSteel = toon('#a9a49a');
  const matHaft = toon('#5a4330');

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

  // Digitigrade rat legs: thigh forward, shin back, wrapped, clawed pink feet
  for (const side of [-1, 1]) {
    const hip = v(-1, 21, side * 5);
    const knee = v(4, 13, side * 5.6);
    const ankle = v(-0.5, 4.5, side * 5.8);
    keep(limb(body, hip, knee, 3, matFur));
    keep(limb(body, knee, ankle, 2.3, matFur));
    wraps(body, knee.clone().lerp(ankle, 0.15), ankle, 2.6, 4, matWrap);
    keep(add(new THREE.BoxGeometry(8, 2.4, 4.4), matPink, 2.6, 1.3, side * 5.8));
    for (let k = -1; k <= 1; k++) {
      const claw = add(new THREE.ConeGeometry(0.45, 2.6, 4), matIvory, 7.2, 1, side * 5.8 + k * 1.3);
      claw.rotation.z = -Math.PI / 2;
    }
  }

  // Tail: a long pink rope curling out behind and up
  const tailCurve = new THREE.CatmullRomCurve3([v(-6, 18, 0), v(-13, 12, 1), v(-20, 7, 2.5), v(-27, 5, 3), v(-33, 8, 2), v(-36, 15, 0), v(-34, 22, -1.5), v(-28, 26, -2.5)]);
  keep(add(new THREE.TubeGeometry(tailCurve, 40, 1.5, 8), matPink, 0, 0, 0));
  const tailTip = add(new THREE.ConeGeometry(1.5, 4, 8), matPink, -26.2, 26.6, -2.7);
  tailTip.quaternion.setFromUnitVectors(v(0, 1, 0), tailCurve.getTangent(1));
  keep(add(new THREE.SphereGeometry(2.6, 10, 8), matPink, -6, 18, 0));

  // Torn rags around the hips
  keep(add(raggedLathe([[9.6, 13], [9, 17], [8.2, 21], [7.6, 24]], 26, 5, 17), matRags, 0, 0, 0));
  keep(add(new THREE.SphereGeometry(7.2, 16, 12), matLeather, 0, 23, 0)).scale.set(1, 0.65, 1.1);
  const belt = add(new THREE.TorusGeometry(8, 0.9, 6, 24), matLeather, 0, 24, 0);
  belt.rotation.x = Math.PI / 2;
  for (const [z, s] of [[-5, 1], [4, 0.8]] as const) {
    add(new THREE.CylinderGeometry(2.1 * s, 2.1 * s, 1.2, 14), matBronze, 6.6, 22, z).rotation.z = Math.PI / 2;
  }

  // Hunched torso: everything above the hips leans forward from here
  const torso = new THREE.Group();
  torso.position.set(0, 24, 0);
  torso.rotation.z = -0.5;
  body.add(torso);
  keep(add(new THREE.CapsuleGeometry(8, 9, 4, 16), matFur, 0, 9, 0, torso)).scale.set(0.95, 1, 1.12);
  keep(add(new THREE.SphereGeometry(6.4, 14, 10), matBelly, 3.6, 8, 0, torso)).scale.set(0.7, 1.15, 1.1);
  // Ragged red scarf around the neck, ends flapping on the chest
  const scarf = keep(add(new THREE.TorusGeometry(6.6, 2.4, 8, 20), matScarf, 0.6, 17, 0, torso));
  scarf.rotation.x = Math.PI / 2;
  scarf.scale.set(1, 1.1, 0.8);
  const tails = add(raggedPanel(7, 12, 4, 29), matScarf, 6.4, 16, 2, torso);
  tails.rotation.y = Math.PI / 2 - 0.3;
  add(new THREE.OctahedronGeometry(1.6, 0), matTeam, 7.2, 15.5, -2.4, torso);
  // Harness straps over the shoulders
  for (const side of [-1, 1]) limb(torso, v(6.5, 15, side * 5), v(5.5, 2, -side * 4), 0.7, matLeather);

  // Backpack with a bedroll, glowing time crystals and a brass hourglass hanging off its side
  keep(add(new THREE.BoxGeometry(9, 13, 15), matLeather, -9.5, 11, 0, torso));
  keep(add(new THREE.BoxGeometry(2, 9, 12), matRags, -14.4, 10, 0, torso));
  const bedroll = keep(add(new THREE.CylinderGeometry(2.6, 2.6, 15, 12), matParch, -9.5, 19.5, 0, torso));
  bedroll.rotation.x = Math.PI / 2;
  for (const [x, z, h, t] of [[-8, -4, 9, 0.25], [-11, 0, 12, -0.1], [-7.5, 3.5, 8, 0.35], [-12, 5, 6, -0.3]] as const) {
    const crystal = add(new THREE.OctahedronGeometry(2, 0), matCrystal, x, 21 + h / 3, z, torso);
    crystal.scale.set(0.8, h / 4, 0.8);
    crystal.rotation.set(t, t * 2, t);
  }
  const packGlow = glowSprite(glowTex, COLORS.chrono, 20, 0.45);
  packGlow.position.set(-9.5, 24, 0);
  torso.add(packGlow);
  const hourglass = new THREE.Group();
  hourglass.position.set(-9, 9, 9.5);
  torso.add(hourglass);
  add(new THREE.CylinderGeometry(2.4, 2.4, 0.8, 10), matBronze, 0, 4.4, 0, hourglass);
  add(new THREE.CylinderGeometry(2.4, 2.4, 0.8, 10), matBronze, 0, -4.4, 0, hourglass);
  for (const a of [0, 2.1, 4.2]) add(new THREE.CylinderGeometry(0.3, 0.3, 8.8, 4), matBronze, Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2, hourglass);
  add(new THREE.ConeGeometry(1.8, 4, 10), matGlass, 0, 2, 0, hourglass).rotation.x = Math.PI;
  add(new THREE.ConeGeometry(1.8, 4, 10), matGlass, 0, -2, 0, hourglass);
  add(new THREE.ConeGeometry(1.3, 2, 10), matSand, 0, -3, 0, hourglass);

  // Head, held forward on the hunch: long snout, red eyes, big pink-lined ears, teeth
  const head = new THREE.Group();
  head.position.set(4, 20, 0);
  head.rotation.z = 0.55;
  torso.add(head);
  keep(add(new THREE.SphereGeometry(5.4, 18, 14), matFur, 0, 2, 0, head)).scale.set(1.05, 0.95, 0.95);
  const snout = keep(add(new THREE.ConeGeometry(3.6, 10, 14), matFur, 7, 0.4, 0, head));
  snout.rotation.z = -Math.PI / 2;
  snout.scale.set(1, 1, 0.85);
  keep(add(new THREE.SphereGeometry(1.2, 10, 8), matPink, 12, 0.5, 0, head));
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.6, 1, 1.6), matEye, 4.4, 3.4, side * 2.9, head).rotation.x = side * 0.3;
    const eyeGlow = glowSprite(glowTex, '#ff3b3b', 4, 0.8);
    eyeGlow.position.set(4.8, 3.4, side * 3);
    head.add(eyeGlow);
    const ear = keep(add(new THREE.SphereGeometry(3.4, 12, 10), matFur, -1.5, 7, side * 5.4, head));
    ear.scale.set(0.45, 1.25, 1);
    ear.rotation.x = side * 0.5;
    const inner = add(new THREE.SphereGeometry(2.6, 12, 10), matPink, -0.9, 7, side * 5.6, head);
    inner.scale.set(0.3, 1.1, 0.85);
    inner.rotation.x = side * 0.5;
    // Teeth along the jaw, and whiskers
    for (let k = 0; k < 3; k++) {
      const tooth = add(new THREE.ConeGeometry(0.4, 1.6, 4), matTooth, 7 + k * 1.6, -1.6, side * (1.8 - k * 0.3), head);
      tooth.rotation.x = Math.PI;
    }
    for (let k = -1; k <= 1; k++) limb(head, v(10, 0.8, side * 1.6), v(11, 0.8 + k * 1.6, side * 7), 0.1, matIvory);
  }

  // Miner's helmet, riveted, with a glowing clock for a lamp
  const helmet = new THREE.Group();
  helmet.position.set(-0.4, 4.4, 0);
  head.add(helmet);
  keep(add(new THREE.SphereGeometry(6.2, 18, 10, 0, TAU, 0, Math.PI * 0.5), matBronze, 0, 0, 0, helmet));
  keep(add(new THREE.CylinderGeometry(8.2, 8.4, 0.9, 22), matBronze, 1.2, 0, 0, helmet));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    add(new THREE.SphereGeometry(0.45, 6, 4), matIron, Math.cos(a) * 5, 3.3, Math.sin(a) * 5, helmet);
  }
  const lamp = new THREE.Group();
  lamp.position.set(5.6, 2.4, 0);
  lamp.rotation.z = -Math.PI / 2;
  helmet.add(lamp);
  keep(add(new THREE.CylinderGeometry(3, 3, 2, 18), matBronze, 0, 0, 0, lamp));
  const face = add(new THREE.CircleGeometry(2.5, 18), matTime, 0, 1.05, 0, lamp);
  face.rotation.x = -Math.PI / 2;
  add(new THREE.BoxGeometry(0.3, 0.2, 1.8), matIron, 0, 1.15, -0.7, lamp);
  add(new THREE.BoxGeometry(1.3, 0.2, 0.3), matIron, 0.5, 1.15, 0, lamp);
  const lampGlow = glowSprite(glowTex, COLORS.chrono, 18, 0.75);
  lampGlow.position.set(7.5, 2.4, 0);
  helmet.add(lampGlow);

  // A clockwork bomb: dark scaled iron, a bronze rim and an ivory clock face
  const bomb = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    keep(add(new THREE.SphereGeometry(4, 16, 12), matIron, 0, 0, 0, g));
    const rim = add(new THREE.TorusGeometry(2.9, 0.45, 6, 18), matBronze, 2.9, 0, 0, g);
    rim.rotation.y = Math.PI / 2;
    const dial = add(new THREE.CircleGeometry(2.6, 18), matIvory, 3.3, 0, 0, g);
    dial.rotation.y = Math.PI / 2;
    add(new THREE.TorusGeometry(1.2, 0.35, 4, 10), matBronze, 0, 4.6, 0, g);
    return g;
  };

  // Left arm hangs forward with a bomb in its claw
  const lShoulder = v(1, 15, -8.6);
  const lElbow = v(5, 7, -11);
  const lHand = v(10, 1, -10);
  keep(limb(torso, lShoulder, lElbow, 2.4, matFur));
  keep(limb(torso, lElbow, lHand, 2.1, matFur));
  wraps(torso, lElbow.clone().lerp(lHand, 0.25), lHand, 2.4, 3, matWrap);
  keep(add(new THREE.SphereGeometry(2, 10, 8), matPink, lHand.x, lHand.y, lHand.z, torso));
  bomb(torso, lHand.x + 3.5, lHand.y - 2, lHand.z);

  // Right arm: the weapon, swinging the pickaxe from the shoulder
  const weapon = new THREE.Group();
  weapon.position.set(1, 15, 8.6);
  torso.add(weapon);
  const rElbow = v(4, -8, 2.4);
  const rHand = v(9, -14, 1.4);
  keep(limb(weapon, v(0, 0, 0), rElbow, 2.4, matFur));
  keep(limb(weapon, rElbow, rHand, 2.1, matFur));
  wraps(weapon, rElbow.clone().lerp(rHand, 0.25), rHand, 2.4, 3, matWrap);
  const band = add(new THREE.TorusGeometry(2.6, 0.7, 6, 14), matTeam, 2, -4, 1.2, weapon);
  band.quaternion.setFromUnitVectors(v(0, 0, 1), rElbow.clone().normalize());
  keep(add(new THREE.SphereGeometry(2, 10, 8), matPink, rHand.x, rHand.y, rHand.z, weapon));
  // Pickaxe gripped near the top of the haft, the head hanging forward and down
  const pick = new THREE.Group();
  pick.position.copy(rHand);
  pick.rotation.z = 1.05;
  weapon.add(pick);
  keep(add(new THREE.CylinderGeometry(0.8, 0.9, 20, 8), matHaft, 0, -5, 0, pick));
  wraps(pick, v(0, 3, 0), v(0, -2, 0), 1.1, 3, matLeather);
  keep(add(new THREE.BoxGeometry(3, 3.4, 2.6), matIron, 0, -14.5, 0, pick));
  const blade = keep(add(new THREE.ConeGeometry(1.4, 12, 6), matSteel, 6.4, -15.6, 0, pick));
  blade.rotation.z = -Math.PI / 2 - 0.35;
  blade.scale.set(1, 1, 0.6);
  const back = keep(add(new THREE.ConeGeometry(1.2, 8, 6), matSteel, -5, -15, 0, pick));
  back.rotation.z = Math.PI / 2 + 0.3;
  back.scale.set(1, 1, 0.6);
  const tip = add(new THREE.SphereGeometry(0.7, 8, 6), matTime, 11.8, -17.6, 0, pick);
  const tipGlow = glowSprite(glowTex, COLORS.chrono, 14, 0.8);
  tipGlow.position.copy(tip.position);
  pick.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matEye || m === matTime || m === matGlass || m === matTooth || m === matCrystal) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon, tip, tipGlow, mats: [matTeam, matFur, matBelly, matPink, matRags, matScarf, matLeather, matBronze, matIron, matSteel, matHaft], ...markers };
}

/** A serrated leaf lying in the XY plane, stem at the origin, pointing down -Y. */
function leafGeometry(width: number, length: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const teeth = 5;
  for (let i = 1; i <= teeth; i++) {
    const t = i / teeth;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.1)) * width * 0.5;
    shape.lineTo(w * (i % 2 ? 1 : 0.8), -length * (t - 0.08));
  }
  shape.lineTo(0, -length);
  for (let i = teeth; i >= 1; i--) {
    const t = i / teeth;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.1)) * width * 0.5;
    shape.lineTo(-w * (i % 2 ? 1 : 0.8), -length * (t - 0.08));
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * Lotan — swamp frog spearman (from the concept sheet), toon style: a stocky green frog
 * with sleepy amber eyes under a wide leaf hat crowned with a red lotus, red bead strings
 * and leaf charms swaying from the brim, a red scarf, a cloak of olive and rust leaves over
 * a pale robe, wrapped shins and big webbed feet, a net bag on the back, and a stone-tipped
 * spear wound with red cloth in the right hand (the weapon). Team color: the scarf knot
 * and a band on the spear.
 */
function buildLotan(color: string, glowTex: THREE.Texture): ChampionRig {
  const team = new THREE.Color(color);
  const bright = lighten(color, 0.45);
  const matTeam = toon(team);
  const matSkin = toonSoft('#7d9a5a');
  const matBelly = toonSoft('#d9d2a8');
  const matRobe = toon('#d6ccb4', { side: THREE.DoubleSide });
  const matLeafA = toon('#5f7a34', { side: THREE.DoubleSide });
  const matLeafB = toon('#8c3a2a', { side: THREE.DoubleSide });
  const matLeafC = toon('#a86a32', { side: THREE.DoubleSide });
  const matHat = toon('#6b7f3c', { side: THREE.DoubleSide });
  const matScarf = toon('#a8282c', { side: THREE.DoubleSide });
  const matBead = toon('#b3262c');
  const matWrap = toon('#8a7558');
  const matLeather = toon('#5a4330');
  const matNet = toon('#6a4a2e');
  const matHaft = toon('#5c4128');
  const matStone = toon('#8d8e94');
  const matLotus = new THREE.MeshToonMaterial({ color: '#e0453a', gradientMap: toonGradient(), emissive: '#5a0d08' });
  const matPollen = new THREE.MeshBasicMaterial({ color: '#ffcf4a', toneMapped: false });
  const matEye = toonSoft('#e2b45a');
  const matPupil = new THREE.MeshBasicMaterial({ color: '#141010' });
  const matFlower = toon('#f2efe6');

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

  // Short legs with wrapped shins and big webbed feet
  for (const side of [-1, 1]) {
    keep(limb(body, v(0, 14, side * 5.5), v(1.5, 4, side * 6.5), 2.8, matSkin));
    wraps(body, v(0.6, 10, side * 6.1), v(1.4, 4.5, side * 6.5), 2.9, 3, matWrap);
    const foot = keep(add(new THREE.SphereGeometry(4, 12, 8), matSkin, 4.5, 1.2, side * 7));
    foot.scale.set(1.5, 0.35, 1.05);
    for (let k = -1; k <= 1; k++) keep(add(new THREE.SphereGeometry(1.1, 8, 6), matSkin, 9.5, 1, side * 7 + k * 2.4));
  }

  // Pale robe under the cloak
  keep(add(raggedLathe([[11, 6], [10.5, 12], [9.6, 20], [8.6, 26]], 24, 3, 41), matRobe, 0, 0, 0));
  keep(add(new THREE.SphereGeometry(9, 16, 12), matRobe, 0, 24, 0)).scale.set(1, 1, 1.12);
  const belt = add(new THREE.TorusGeometry(9.4, 1.1, 6, 24), matScarf, 0, 18, 0);
  belt.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(3.4, 4, 3), matLeather, 9, 16, 4);

  // Cloak of leaves: olive layers with rust and amber leaves hanging from the shoulders
  keep(add(raggedLathe([[14, 9], [13, 15], [11.5, 22], [9, 29], [6, 33]], 26, 5, 13, Math.PI * 0.35, Math.PI * 1.3), matLeafA, 0, 0, 0));
  keep(add(raggedLathe([[12.5, 16], [11, 23], [8.6, 30], [6, 34]], 22, 4, 29, Math.PI * 0.2, Math.PI * 1.6), matLeafB, 0, 1.5, 0));
  const leafGeo = leafGeometry(6, 13);
  const leafMats = [matLeafA, matLeafB, matLeafC];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * 0.3 + (i / 26) * Math.PI * 1.4;
    const row = i % 2;
    const r = 10.5 - row * 1.2;
    const leaf = add(leafGeo, leafMats[(i * 7) % 3], Math.cos(a) * r, 33 - row * 7, Math.sin(a) * r);
    leaf.rotation.y = -a + Math.PI / 2;
    leaf.rotation.x = -0.25 - row * 0.1;
    leaf.scale.setScalar(0.9 + ((i * 13) % 5) * 0.08);
  }

  // Red scarf around the neck, a tail flapping on the chest, the team knot
  const scarf = keep(add(new THREE.TorusGeometry(8, 2.6, 8, 22), matScarf, 0.6, 35, 0));
  scarf.rotation.x = Math.PI / 2;
  scarf.scale.set(1, 1.1, 0.8);
  const tail = add(raggedPanel(5, 11, 4, 53), matScarf, 7.6, 34, -3);
  tail.rotation.y = Math.PI / 2 - 0.2;
  add(new THREE.OctahedronGeometry(1.8, 0), matTeam, 8.4, 33.5, -1.5);
  add(new THREE.CircleGeometry(1.6, 8), matFlower, 7.8, 36, 4.8).rotation.y = Math.PI / 2 - 0.5;

  // Net bag on the back: a round sack with a cord net over it
  const bag = new THREE.Group();
  bag.position.set(-11, 25, -1);
  body.add(bag);
  keep(add(new THREE.SphereGeometry(7, 14, 10), matNet, 0, 0, 0, bag));
  add(new THREE.SphereGeometry(7.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#2e2016', wireframe: true }), 0, 0, 0, bag);
  add(new THREE.SphereGeometry(2.4, 10, 8), toon('#a5743c'), 2, 6, 5, bag);

  // Head: a wide frog head with a pale chin and sleepy amber eyes
  const head = new THREE.Group();
  head.position.set(1.5, 42, 0);
  body.add(head);
  keep(add(new THREE.SphereGeometry(9, 20, 14), matSkin, 0, 0, 0, head)).scale.set(1, 0.72, 1.12);
  keep(add(new THREE.SphereGeometry(8.4, 18, 12), matBelly, 1.6, -2.2, 0, head)).scale.set(0.92, 0.5, 1.02);
  // Mouth line
  const mouth = add(new THREE.TorusGeometry(7.4, 0.35, 4, 20, Math.PI * 0.8), matPupil, 2, -1.4, 0, head);
  mouth.rotation.set(Math.PI / 2, 0, -Math.PI * 0.4 - Math.PI / 2);
  for (const side of [-1, 1]) {
    const eye = keep(add(new THREE.SphereGeometry(3.4, 14, 10), matEye, 5.6, 3.6, side * 5, head));
    eye.scale.set(0.8, 0.95, 1);
    // Heavy lid over the top half, and a slit pupil
    const lid = add(new THREE.SphereGeometry(3.6, 14, 8, 0, TAU, 0, Math.PI * 0.45), matSkin, 5.6, 3.7, side * 5, head);
    lid.rotation.z = -0.45;
    lid.scale.set(0.85, 1, 1.05);
    add(new THREE.BoxGeometry(0.8, 0.9, 2.6), matPupil, 8.3, 3.1, side * 5, head);
    add(new THREE.SphereGeometry(0.5, 6, 4), matTeam, 7, -0.4, side * 6.4, head);
  }

  // Wide leaf hat with a ragged brim, a red lotus on top, bead strings around the brim
  const hat = new THREE.Group();
  hat.position.set(0, 7, 0);
  hat.rotation.z = -0.08;
  head.add(hat);
  keep(add(lathe([[24, -1.2], [22, 0], [15, 2.2], [8, 5], [3, 7.5], [0.2, 8]], 30), matHat, 0, 0, 0, hat));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const leaf = add(leafGeo, i % 4 === 0 ? matLeafC : matLeafA, Math.cos(a) * 17, 2.4, Math.sin(a) * 17, hat);
    leaf.rotation.y = -a - Math.PI / 2;
    leaf.rotation.x = -Math.PI / 2 + 0.35;
    leaf.scale.set(1.1, 0.75, 1);
  }
  const lotus = new THREE.Group();
  lotus.position.set(-1, 8, 0);
  hat.add(lotus);
  const petal = new THREE.SphereGeometry(2.2, 10, 8);
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + ring * 0.45;
      const p = add(petal, matLotus, Math.cos(a) * (3 - ring * 1.3), 2 + ring * 1.6, Math.sin(a) * (3 - ring * 1.3), lotus);
      p.scale.set(0.55, 2.4 - ring * 0.6, 1);
      p.rotation.set(Math.sin(a) * (1 - ring * 0.45), 0, -Math.cos(a) * (1 - ring * 0.45));
    }
  }
  add(new THREE.SphereGeometry(1.3, 8, 6), matPollen, 0, 3.4, 0, lotus);
  const lotusGlow = glowSprite(glowTex, '#ff6a4a', 18, 0.5);
  lotusGlow.position.set(0, 4, 0);
  lotus.add(lotusGlow);
  add(new THREE.CircleGeometry(4.2, 14), matLeafA, 4.5, 6.4, 3, hat).rotation.x = -Math.PI / 2 + 0.3;
  // Bead strings swaying from the brim, each ending in a little leaf charm
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const x = Math.cos(a) * 19;
    const z = Math.sin(a) * 19;
    limb(hat, v(x, -1, z), v(x, -12, z), 0.18, matLeather);
    for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(1.15, 8, 6), matBead, x, -3.5 - k * 2.8, z, hat);
    const charm = add(new THREE.ConeGeometry(1.1, 4, 5), matLeafC, x, -14, z, hat);
    charm.rotation.x = Math.PI;
  }

  // Left arm hangs at the side
  keep(limb(body, v(1, 31, -10), v(4, 22, -12), 2.4, matRobe));
  keep(add(new THREE.SphereGeometry(2.4, 10, 8), matSkin, 5, 20, -12));

  // Right arm: the weapon, holding the spear upright from the shoulder
  const weapon = new THREE.Group();
  weapon.position.set(1, 31, 10);
  body.add(weapon);
  const hand = v(6, -9, 2.5);
  keep(limb(weapon, v(0, 0, 0), hand, 2.4, matRobe));
  keep(add(new THREE.SphereGeometry(2.4, 10, 8), matSkin, hand.x, hand.y, hand.z, weapon));
  const spear = new THREE.Group();
  spear.position.copy(hand);
  weapon.add(spear);
  keep(add(new THREE.CylinderGeometry(0.85, 1, 64, 8), matHaft, 0, 12, 0, spear));
  wraps(spear, v(0, -2, 0), v(0, 3, 0), 1.2, 3, matLeather);
  add(new THREE.CylinderGeometry(1.2, 1.2, 2, 8), matTeam, 0, 30, 0, spear);
  // Red cloth wound under the head, with beads and a feather hanging off it
  wraps(spear, v(0, 35, 0), v(0, 41, 0), 1.3, 4, matScarf);
  const rag = add(raggedPanel(3, 12, 3, 61), matScarf, 0.8, 37, 0, spear);
  rag.rotation.y = Math.PI / 2;
  for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.9, 6, 4), matBead, -1.2, 33 - k * 2.2, 1, spear);
  const feather = add(leafGeometry(2.4, 8), matLeafC, -1.2, 26.5, 1, spear);
  feather.rotation.y = Math.PI / 2;
  // Knapped stone head
  const head2 = keep(add(new THREE.OctahedronGeometry(3.2, 0), matStone, 0, 47, 0, spear));
  head2.scale.set(1, 2.6, 0.45);
  const tip = add(new THREE.SphereGeometry(0.6, 8, 6), matPollen, 0, 55, 0, spear);
  const tipGlow = glowSprite(glowTex, COLORS.bog, 14, 0.7);
  tipGlow.position.copy(tip.position);
  spear.add(tipGlow);

  shadowed(body);
  tip.castShadow = false;
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m === matPupil || m === matPollen || (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry === leafGeo) o.castShadow = false;
  });
  for (const m of outlined) outline(m);

  const markers = addMarkers(root, team, bright);
  return { root, lean, yaw, body, weapon, tip, tipGlow, mats: [matTeam, matSkin, matBelly, matRobe, matLeafA, matLeafB, matLeafC, matHat, matScarf, matWrap, matLeather, matHaft, matStone], ...markers };
}

export interface ToadModel {
  root: THREE.Group;
  /** The upper head, hinged at the back of the mouth: rotation.z opens it (positive = open). */
  jaw: THREE.Group;
}

/**
 * The ancestor toad of Lotan's ult: a huge warty swamp toad with a pale throat, sleepy amber
 * eyes, moss and glowing blue mushrooms on its back and a red lotus on its head. Faces +X;
 * the upper head swings open on `jaw` so it can burst up mouth agape and gulp.
 */
export function buildAncestorToad(glowTex: THREE.Texture): ToadModel {
  const matSkin = toonSoft('#82ad4c');
  const matDark = toon('#5b7f37');
  const matBelly = toonSoft('#d6cf9e');
  const matMouth = new THREE.MeshBasicMaterial({ color: '#4a1418', side: THREE.DoubleSide });
  const matTongue = toon(COLORS.tongue);
  const matEye = toonSoft('#e2b45a');
  const matPupil = new THREE.MeshBasicMaterial({ color: '#141010' });
  const matShroom = new THREE.MeshBasicMaterial({ color: '#7fd0ff', toneMapped: false });
  const matStem = toon('#d8e4ea');
  const matLotus = new THREE.MeshToonMaterial({ color: '#e0453a', gradientMap: toonGradient(), emissive: '#5a0d08' });

  const root = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const outlined: THREE.Mesh[] = [];
  const keep = <T extends THREE.Mesh>(m: T) => (outlined.push(m), m);

  // Squat body, pale throat and lower jaw, haunches and front feet
  keep(add(new THREE.SphereGeometry(48, 24, 16), matSkin, -10, 26, 0, root)).scale.set(1.15, 0.72, 1.05);
  keep(add(new THREE.SphereGeometry(40, 22, 14), matBelly, 14, 18, 0, root)).scale.set(0.95, 0.55, 1);
  for (const side of [-1, 1]) {
    keep(add(new THREE.SphereGeometry(22, 14, 10), matSkin, -30, 16, side * 40, root)).scale.set(1.3, 0.75, 0.8);
    const foot = keep(add(new THREE.SphereGeometry(10, 12, 8), matSkin, 34, 4, side * 30, root));
    foot.scale.set(1.5, 0.45, 1.2);
  }
  // Warts and moss over the back, with glowing mushrooms growing out of it
  const wart = new THREE.SphereGeometry(4, 8, 6);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU * 3.1;
    const r = 18 + (i % 4) * 7;
    add(wart, i % 3 ? matDark : matSkin, -18 + Math.cos(a) * r * 0.9, 50 - (r - 18) * 0.5, Math.sin(a) * r, root);
  }
  for (const [x, z, h] of [[-30, 14, 12], [-22, -20, 9], [-40, -4, 14], [-12, 26, 8]] as const) {
    add(new THREE.CylinderGeometry(1.6, 2.2, h, 8), matStem, x, 50 + h / 2, z, root);
    add(new THREE.SphereGeometry(6, 12, 6, 0, TAU, 0, Math.PI / 2), matShroom, x, 50 + h, z, root).scale.set(1, 0.6, 1);
    const glow = glowSprite(glowTex, '#7fd0ff', 26, 0.55);
    glow.position.set(x, 52 + h, z);
    root.add(glow);
  }
  // Inside of the mouth and the tongue, seen when the head swings open
  keep(add(new THREE.CircleGeometry(30, 24), matMouth, 22, 34, 0, root)).rotation.x = -Math.PI / 2;
  add(new THREE.CapsuleGeometry(7, 22, 4, 10), matTongue, 22, 35, 0, root).rotation.z = Math.PI / 2;

  // Upper head on a hinge at the back of the mouth
  const jaw = new THREE.Group();
  jaw.position.set(-8, 34, 0);
  root.add(jaw);
  keep(add(new THREE.SphereGeometry(34, 22, 14, 0, TAU, 0, Math.PI / 2), matSkin, 30, 0, 0, jaw)).scale.set(1.15, 0.55, 1.05);
  add(new THREE.CircleGeometry(33, 24), matMouth, 31, -0.2, 0, jaw).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const eye = keep(add(new THREE.SphereGeometry(10, 16, 12), matEye, 26, 16, side * 20, jaw));
    eye.scale.set(0.9, 0.85, 0.9);
    const lid = add(new THREE.SphereGeometry(10.6, 16, 8, 0, TAU, 0, Math.PI * 0.45), matSkin, 26, 16.4, side * 20, jaw);
    lid.rotation.z = -0.5;
    add(new THREE.BoxGeometry(2.4, 2.4, 8), matPupil, 34.6, 14.4, side * 20, jaw);
  }
  // A red lotus on its brow
  const lotus = new THREE.Group();
  lotus.position.set(16, 20, 0);
  jaw.add(lotus);
  const petal = new THREE.SphereGeometry(4, 10, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const p = add(petal, matLotus, Math.cos(a) * 5, 3, Math.sin(a) * 5, lotus);
    p.scale.set(0.55, 2.2, 1);
    p.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
  }

  for (const m of outlined) outline(m);
  shadowed(root);
  return { root, jaw };
}
