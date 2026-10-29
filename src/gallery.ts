/**
 * Dev-only model gallery (models.html): every procedural model on its own
 * turntable, lit like the 3D arena view. Not part of the production build.
 *
 * One renderer draws every card into its rectangle of a fixed full-page canvas
 * (a page of separate canvases would run out of WebGL contexts).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CHAMP, MAPS, ORB_R, PROJ } from './sim/constants';
import type { ProjKind } from './sim/types';
import {
  buildArena,
  buildChampion,
  buildCrystal,
  buildPillar,
  buildRidge,
  buildStatue,
  buildTrainingDummy,
  buildTree,
  buildWall,
  glowSprite,
  lighten,
  makeGlowTexture,
  THEME_LOOKS,
  updateAmbient,
  type ChampionRig,
  type MapTheme,
} from './render/models';
import { abilityColor, COLORS } from './render/theme';
import { buildMapProps, projectileGeometry } from './render/world3d';

type Vec3 = [number, number, number];
type Tick = (t: number, dt: number) => void;

const SECTIONS = {
  champions: 'Champions',
  props: 'Map props',
  effects: 'Objective & effects',
  maps: 'Maps',
} as const;

interface Entry {
  name: string;
  note: string;
  section: keyof typeof SECTIONS;
  wide?: boolean;
  /** Lit like this map theme (otherwise the neutral champion-select light). */
  theme?: MapTheme;
  /** Fixed view; without it the camera frames the model from the front three-quarter side. */
  view?: { camera: Vec3; target: Vec3; shadow: number };
  /** Rebuilt when the team color changes. */
  teamed?: boolean;
  /** No stage disc under the model (maps bring their own floor). */
  bare?: boolean;
  /** Adds the model to the scene; may return a per-frame animation. */
  build: (scene: THREE.Scene, team: number) => Tick | void;
}

const glowTex = makeGlowTexture();

function rig(make: (color: string) => ChampionRig) {
  return (scene: THREE.Scene, team: number) => {
    const r = make(COLORS.players[team]);
    r.pointer.visible = false;
    scene.add(r.root);
  };
}

const champion = (name: string, note: string, champ: number): Entry => ({
  name,
  note,
  section: 'champions',
  teamed: true,
  build: rig((color) => buildChampion(champ, color, glowTex)),
});

function orb(): THREE.Group {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.IcosahedronGeometry(ORB_R, 0),
    new THREE.MeshStandardMaterial({ color: COLORS.orb, emissive: '#ffa21f', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3, flatShading: true }),
  );
  gem.castShadow = true;
  g.add(gem, glowSprite(glowTex, COLORS.orb, 170, 0.7));
  return g;
}

const PROJ_KINDS = Object.keys(PROJ) as ProjKind[];
const PROJ_COLS = Math.ceil(PROJ_KINDS.length / 2);

const ENTRIES: Entry[] = [
  champion('Perrie — Mage', 'buildMage · elven witch, gold staff with a ruby', CHAMP.MAGE),
  champion('Bogo Boga — Warrior', 'buildWarrior · orc, cleaver and horned pauldron', CHAMP.WARRIOR),
  champion('Shade — Assassin', 'buildAssassin · hooded shade, twin daggers', CHAMP.ASSASSIN),
  champion('Elianis — Archer', 'buildArcher · wood elf, thorned recurve bow and quiver', CHAMP.ARCHER),
  champion('Sozuki — Samurai', 'buildSamurai · straw hat and katana', CHAMP.SAMURAI),
  champion('Romulus — Blood mage', 'buildVampire · horns, high collar, blood orb', CHAMP.BLOOD),
  champion('Rustic — Time kobold', 'buildRustic · clock helmet, backpack, chronobombs', CHAMP.CHRONO),
  champion('Lotan — Swamp frog', 'buildLotan · leaf hat with a red lotus, leaf cloak, stone spear', CHAMP.FROG),
  champion("Kro'aw — Storm bull", 'buildKroaw · gold horns and spiked pauldrons, red rags, gold medallions', CHAMP.BULL),
  {
    name: 'Training dummy',
    note: 'buildTrainingDummy · lashed post for training mode',
    section: 'champions',
    teamed: true,
    build: rig((color) => buildTrainingDummy(color, glowTex)),
  },
  champion('Test mannequin', 'buildDummy · fallback for a champion without a skin', 99),

  { name: 'Overgrown pillar', note: 'buildPillar(r, true) · Moonlit Ruins', section: 'props', theme: 'ruins', build: (s) => void s.add(buildPillar(42, true)) },
  { name: 'Statue', note: 'buildStatue · Courtyard', section: 'props', theme: 'castle', build: (s) => void s.add(buildStatue(30)) },
  { name: 'Castle wall', note: 'buildWall · Courtyard', section: 'props', theme: 'castle', build: (s) => void s.add(buildWall(130, 18)) },
  { name: 'Crystal', note: 'buildCrystal · Crystal Mine', section: 'props', theme: 'mine', build: (s) => void s.add(buildCrystal(30, glowTex)) },
  { name: 'Rock ridge', note: 'buildRidge · Crystal Mine', section: 'props', theme: 'mine', build: (s) => void s.add(buildRidge(160, 22)) },
  { name: 'Tree', note: 'buildTree · Whispering Grove', section: 'props', theme: 'grove', build: (s) => void s.add(buildTree(30)) },
  { name: 'Pillar', note: 'buildPillar · plain stone with a rune band (no map uses it now)', section: 'props', build: (s) => void s.add(buildPillar(42)) },

  {
    name: 'Orb',
    note: 'world3d · objective gem',
    section: 'effects',
    build: (scene) => {
      const o = orb();
      o.position.y = 40;
      const light = new THREE.PointLight(COLORS.orb, 9000, 420, 2);
      light.position.y = 46;
      scene.add(o, light);
    },
  },
  {
    name: 'Meteor',
    note: 'world3d · falling rock',
    section: 'effects',
    build: (scene) => {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(17, 0),
        new THREE.MeshStandardMaterial({ color: '#3b2a22', emissive: '#ff5a1a', emissiveIntensity: 1.3, roughness: 0.8, flatShading: true }),
      );
      rock.castShadow = true;
      const glow = glowSprite(glowTex, COLORS.meteor, 140, 0.9);
      rock.position.y = glow.position.y = 30;
      scene.add(rock, glow);
    },
  },
  {
    name: 'Projectiles',
    note: `projectileGeometry · back row: ${PROJ_KINDS.slice(0, PROJ_COLS).join(', ')} · front row: ${PROJ_KINDS.slice(PROJ_COLS).join(', ')}`,
    section: 'effects',
    wide: true,
    bare: true,
    teamed: true,
    view: { camera: [0, 170, 340], target: [0, 10, 0], shadow: 300 },
    build: (scene, team) => {
      PROJ_KINDS.forEach((kind, i) => {
        const color = abilityColor(kind, team);
        const size = PROJ[kind].r;
        const core = new THREE.Mesh(projectileGeometry(kind, size), new THREE.MeshBasicMaterial({ color: lighten(color, 0.6), toneMapped: false }));
        const glow = glowSprite(glowTex, color, size * 6);
        const col = i % PROJ_COLS;
        const row = Math.floor(i / PROJ_COLS);
        for (const o of [core, glow]) o.position.set((col - (PROJ_COLS - 1) / 2) * 52, 18, (row - 0.5) * 80);
        scene.add(core, glow);
      });
    },
  },

  ...MAPS.map(
    (def): Entry => ({
      name: def.name,
      note: `buildArena('${def.theme}') + buildMapProps · ${def.pillars.length} obstacles, ${def.walls.length} walls${def.river ? ', river' : ''}`,
      section: 'maps',
      wide: true,
      bare: true,
      theme: def.theme,
      view: { camera: [0, 1080, 1000], target: [0, 0, 40], shadow: 640 },
      build: (scene) => {
        const arena = buildArena(scene, glowTex, def.theme);
        const props = buildMapProps(def, glowTex);
        const o = orb();
        o.position.y = 46;
        scene.add(props.root, o);
        scene.fog = new THREE.Fog(THEME_LOOKS[def.theme].background, 1900, 3800);
        return (t, dt) => {
          updateAmbient(arena.ambient, t, dt);
          if (props.river) props.river.flow.offset.y -= dt * 0.18;
        };
      },
    }),
  ),
];

// ---------------------------------------------------------------- scenes

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

/** Camera direction for framed models: champions face +X, so this is their front-right three-quarter. */
const FRONT = new THREE.Vector3(1, 0.42, 0.6).normalize();

/** Bounds of the visible meshes among `objects` (sprites and particles left out: their glow would inflate it). */
function meshBounds(objects: THREE.Object3D[]): THREE.Box3 {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  for (const root of objects) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.userData.outline) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
    });
  }
  return box;
}

interface Built {
  scene: THREE.Scene;
  tick: Tick | null;
  view: { camera: Vec3; target: Vec3 };
}

/** Same light rig as World3D: sky fill, key with shadows, rim from behind, warm front fill (theme colors when given). */
function makeScene(entry: Entry, team: number, aspect: number): Built {
  const look = entry.theme ? THEME_LOOKS[entry.theme] : null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(look?.background ?? COLORS.bg);
  scene.environment = env;
  scene.environmentIntensity = 0.3;

  const before = scene.children.length;
  const tick = entry.build(scene, team) ?? null;
  const subject = scene.children.slice(before);

  let view = entry.view;
  if (!view) {
    const sphere = meshBounds(subject).getBoundingSphere(new THREE.Sphere());
    // Small gems still leave room for their glow.
    sphere.radius = Math.max(sphere.radius, 55);
    const vHalf = THREE.MathUtils.degToRad(35 / 2);
    const half = Math.min(vHalf, Math.atan(Math.tan(vHalf) * aspect));
    const dist = (sphere.radius / Math.sin(half)) * 1.04;
    const cam = sphere.center.clone().addScaledVector(FRONT, dist);
    view = { camera: cam.toArray(), target: sphere.center.toArray(), shadow: Math.max(80, sphere.radius * 1.6) };
  }

  scene.add(new THREE.HemisphereLight(look?.hemiSky ?? '#a9bcff', look?.hemiGround ?? '#20180f', look?.hemi ?? 1.25));
  const key = new THREE.DirectionalLight(look?.key ?? '#ffe6c7', look?.keyIntensity ?? 2.6);
  const reach = Math.max(view.shadow * 2, 600);
  key.position.set(-420, 900, -300).setLength(reach);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(entry.wide ? 2048 : 1024);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -view.shadow;
  sc.right = sc.top = view.shadow;
  sc.near = 1;
  sc.far = reach * 2.5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 1.2;
  const rim = new THREE.DirectionalLight(look?.rim ?? '#6f8dff', look?.rimIntensity ?? 1.1);
  rim.position.set(300, 420, -800);
  const fill = new THREE.DirectionalLight('#ffe0c8', 0.9);
  fill.position.set(-150, 500, 900);
  scene.add(key, rim, fill);

  if (!entry.bare) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(view.shadow, 64), new THREE.MeshStandardMaterial({ color: '#232a3b', roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }
  return { scene, tick, view };
}

// ---------------------------------------------------------------- page

interface Card {
  entry: Entry;
  el: HTMLElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  tick: Tick | null;
}

const sectionsEl = document.getElementById('sections')!;
const grids = new Map<string, HTMLElement>();
let team = 0;

const cards: Card[] = ENTRIES.map((entry) => {
  let grid = grids.get(entry.section);
  if (!grid) {
    const count = ENTRIES.filter((e) => e.section === entry.section).length;
    const h = document.createElement('h2');
    h.innerHTML = `${SECTIONS[entry.section]}<small>${count}</small>`;
    grid = document.createElement('div');
    grid.className = 'grid';
    sectionsEl.append(h, grid);
    grids.set(entry.section, grid);
  }
  const fig = document.createElement('figure');
  if (entry.wide) fig.className = 'wide';
  const el = document.createElement('div');
  el.className = 'model';
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${entry.name}</b><span>${entry.note}</span>`;
  fig.append(el, cap);
  grid.append(fig);

  const built = makeScene(entry, team, entry.wide ? 16 / 7 : 4 / 5);
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 6000);
  camera.position.set(...built.view.camera);
  const controls = new OrbitControls(camera, el);
  controls.target.set(...built.view.target);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = entry.wide ? 0.4 : 1.6;
  // The wheel scrolls the page until you grab a model; then it zooms that one while the pointer stays on it.
  controls.enableZoom = false;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    controls.enableZoom = true;
  });
  el.addEventListener('pointerleave', () => (controls.enableZoom = false));
  // Vertical swipes still scroll the page on touch screens.
  el.style.touchAction = 'pan-y';

  return { entry, el, camera, controls, scene: built.scene, tick: built.tick };
});

const teamBar = document.getElementById('team')!;
// Colors are per player slot; slots 0 and 1 are one of each team.
const teamButtons = COLORS.players.slice(0, 2).map((color, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<i style="background:${color}"></i>Team ${i + 1}`;
  b.setAttribute('aria-pressed', String(i === team));
  b.onclick = () => {
    team = i;
    teamButtons.forEach((o, j) => o.setAttribute('aria-pressed', String(j === team)));
    for (const c of cards) {
      if (!c.entry.teamed) continue;
      const built = makeScene(c.entry, team, c.entry.wide ? 16 / 7 : 4 / 5);
      c.scene = built.scene;
      c.tick = built.tick;
    }
  };
  teamBar.append(b);
  return b;
});

let last = performance.now();
let time = 0;

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);

  // A scene's background color stays behind as the GL clear color, so reset it before clearing the page.
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const c of cards) {
    const r = c.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
    c.camera.aspect = r.width / r.height;
    c.camera.updateProjectionMatrix();
    c.controls.update(dt);
    c.tick?.(time, dt);
    const y = h - r.bottom;
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    renderer.render(c.scene, c.camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
