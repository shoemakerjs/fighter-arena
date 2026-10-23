import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ARENA_R, CHAMP, CHAMPIONS, LEAP, METEOR, ORB_HP, ORB_R, PILLARS, PLAYER_R, PROJ, RIFT, SLOT, SUDDEN_DEATH_AT } from '../sim/constants';
import { abilityOf, airborne } from '../sim/step';
import { canSee, pointVisible } from '../sim/vision';
import { FOG_EXTENT, FogMask } from './fog';
import type { GameState, Meteor, Projectile, ProjKind, Vec } from '../sim/types';
import type { Fx } from './fx';
import { buildArena, buildChampion, buildPillar, glowSprite, lighten, makeGlowTexture, type ArenaModel, type ChampionRig } from './models';
import { abilityColor, COLORS } from './theme';
import { HUD_BOTTOM, HUD_TOP, lerpPlayer, type DrawOptions, type WorldView } from './view';

const TAU = Math.PI * 2;
/** Height at which projectiles fly. */
const PROJ_H = 30;
const MAX_PARTICLES = 4000;
const LIGHT_POOL = 4;

interface ChampionAnim {
  /** Rendered as a ghost (own stealth) — materials switched to transparent. */
  ghost: boolean;
  speed: number;
  mx: number;
  my: number;
  phase: number;
  deadT: number;
  squash: number;
}

interface ProjView {
  group: THREE.Group;
  core: THREE.Mesh;
  trail: THREE.Sprite[];
  /** Hook only: chain back to the thrower's hand. */
  chain: THREE.Mesh | null;
}

interface MeteorView {
  fill: THREE.Mesh;
  ring: THREE.Mesh;
  rock: THREE.Group;
  sx: number;
  sz: number;
}

interface KindLook {
  core: THREE.BufferGeometry;
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.SpriteMaterial;
  trailMats: THREE.SpriteMaterial[];
  decalMat: THREE.MeshBasicMaterial;
  size: number;
}

export class World3D implements WorldView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 10, 7000);
  private camBase = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private w = 1;
  private h = 1;
  private time = 0;

  private glowTex = makeGlowTexture();
  private arena: ArenaModel;
  private champions: ChampionRig[] = [];
  /** Which champion each rig was built for (rebuilt when a match picks others). */
  private rigChamps: number[] = [-1, -1];
  private anim: ChampionAnim[] = [];
  private chainGeo = new THREE.BoxGeometry(1, 1, 1);
  private chainMat = new THREE.MeshStandardMaterial({ color: COLORS.steel, metalness: 0.9, roughness: 0.3 });
  private looks = new Map<string, KindLook>();
  private decalGeo = new THREE.CircleGeometry(1, 24);
  private projViews = new Map<number, ProjView>();
  private meteorViews = new Map<number, MeteorView>();
  private lights: THREE.PointLight[] = [];
  private rings: THREE.Mesh[] = [];
  private particles: THREE.Points;
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private pSize = new Float32Array(MAX_PARTICLES);
  private pAlpha = new Float32Array(MAX_PARTICLES);
  private colorCache = new Map<string, THREE.Color>();

  private fog = new FogMask();
  private fogTex = new THREE.CanvasTexture(this.fog.canvas);
  private orb: THREE.Group;
  private orbGem: THREE.Mesh;
  private orbLight: THREE.PointLight;
  private orbRing: THREE.Mesh;
  private orbRingHp = -1;
  private suddenWall: THREE.Mesh;
  private outside: THREE.Mesh;
  private aimLane: THREE.Group;
  private aimLaneMesh: THREE.Mesh;
  private aimCircle: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    this.renderer = r;

    const scene = this.scene;
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.Fog(COLORS.bg, 1900, 3800);
    // Soft reflections so metal parts don't render black.
    scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;

    // Lighting: cool sky fill, warm key light with shadows, blue rim from behind.
    scene.add(new THREE.HemisphereLight('#a9bcff', '#20180f', 1.25));
    const key = new THREE.DirectionalLight('#ffe6c7', 2.6);
    key.position.set(-420, 900, -300);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -640;
    sc.right = 640;
    sc.top = 640;
    sc.bottom = -640;
    sc.near = 100;
    sc.far = 2400;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 1.2;
    scene.add(key);
    const rimLight = new THREE.DirectionalLight('#6f8dff', 1.1);
    rimLight.position.set(300, 420, -800);
    scene.add(rimLight);

    this.arena = buildArena(scene, this.glowTex);
    for (const pl of PILLARS) {
      const p = buildPillar(pl.r);
      p.position.set(pl.x, 0, pl.y);
      scene.add(p);
    }


    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 320, 2);
      scene.add(l);
      this.lights.push(l);
    }

    // Shockwave rings
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 1.5;
      m.visible = false;
      scene.add(m);
      this.rings.push(m);
    }

    // Particles
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('pcolor', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.particles = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute vec3 pcolor;
          attribute float size;
          attribute float alpha;
          uniform float uScale;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vColor = pcolor;
            vAlpha = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * uScale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.05, d);
            gl_FragColor = vec4(vColor * a * a * vAlpha * 1.6, 1.0);
          }`,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.particles.frustumCulled = false;
    scene.add(this.particles);

    // Orb
    this.orb = new THREE.Group();
    this.orbGem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(ORB_R, 0),
      new THREE.MeshStandardMaterial({ color: COLORS.orb, emissive: '#ffa21f', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3, flatShading: true }),
    );
    this.orbGem.castShadow = true;
    const orbGlow = glowSprite(this.glowTex, COLORS.orb, 170, 0.7);
    this.orb.add(this.orbGem, orbGlow);
    // Kept outside the orb group: hiding a light changes the light count and recompiles every shader.
    this.orbLight = new THREE.PointLight(COLORS.orb, 0, 420, 2);
    this.orbLight.position.set(0, 46, 0);
    scene.add(this.orb, this.orbLight);
    this.orbRing = new THREE.Mesh(
      new THREE.RingGeometry(ORB_R + 30, ORB_R + 35, 48),
      new THREE.MeshBasicMaterial({ color: '#ffe6a6', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    );
    this.orbRing.rotation.x = -Math.PI / 2;
    this.orbRing.position.y = 5;
    scene.add(this.orbRing);

    // Sudden death: closing energy wall + darkened floor outside it.
    this.suddenWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 110, 128, 1, true),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(COLORS.danger) } },
        vertexShader: /* glsl */ `
          varying float vH;
          varying vec2 vUv;
          void main() {
            vH = position.y / 110.0 + 0.5;
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          varying float vH;
          varying vec2 vUv;
          void main() {
            float fade = pow(1.0 - vH, 1.6);
            float bands = 0.55 + 0.45 * sin((vH * 9.0 - uTime * 3.0) * 6.2831);
            float a = fade * (0.35 + 0.4 * bands);
            gl_FragColor = vec4(uColor * a * 1.4, 1.0);
          }`,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.suddenWall.position.y = 55;
    this.suddenWall.visible = false;
    scene.add(this.suddenWall);

    this.outside = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_R + 10, 96),
      new THREE.ShaderMaterial({
        uniforms: { uR: { value: ARENA_R } },
        vertexShader: /* glsl */ `
          varying vec2 vPos;
          void main() {
            vPos = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uR;
          varying vec2 vPos;
          void main() {
            float a = smoothstep(uR, uR + 8.0, length(vPos)) * 0.72;
            gl_FragColor = vec4(0.09, 0.0, 0.02, a);
          }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.outside.rotation.x = -Math.PI / 2;
    this.outside.position.y = 1;
    this.outside.visible = false;
    scene.add(this.outside);

    // Fog of war: a dark textured sheet just above the floor.
    this.fogTex.colorSpace = THREE.SRGBColorSpace;
    const fogPlane = new THREE.Mesh(
      // A disc (not a square) so the fog ends under the arena wall; UVs still span the mask.
      new THREE.CircleGeometry(FOG_EXTENT, 128),
      new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false }),
    );
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.y = 1.7;
    fogPlane.renderOrder = 1;
    scene.add(fogPlane);

    // Local aim previews
    this.aimLane = new THREE.Group();
    this.aimLaneMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.aimLaneMesh.rotation.x = -Math.PI / 2;
    this.aimLane.add(this.aimLaneMesh);
    this.aimLane.position.y = 1.2;
    this.aimLane.visible = false;
    scene.add(this.aimLane);
    this.aimCircle = new THREE.Mesh(
      new THREE.RingGeometry(METEOR.r - 4, METEOR.r, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.meteor, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }),
    );
    this.aimCircle.rotation.x = -Math.PI / 2;
    this.aimCircle.position.y = 1.4;
    this.aimCircle.visible = false;
    scene.add(this.aimCircle);
  }

  // ---------------------------------------------------------------- view

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.particles.material as THREE.ShaderMaterial).uniforms.uScale.value = (h * dpr) / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.fitCamera();
  }

  /** Pick distance and target so the whole arena fits between the HUD bars. */
  private fitCamera() {
    const cam = this.camera;
    const elev = THREE.MathUtils.degToRad(57);
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    const R = ARENA_R + 30;
    const pts = [
      new THREE.Vector3(0, 0, -R),
      new THREE.Vector3(0, 0, R),
      new THREE.Vector3(R, 0, 0),
      new THREE.Vector3(-R, 0, 0),
      new THREE.Vector3(0, 40, -R),
      new THREE.Vector3(R * 0.72, 0, R * 0.72),
      new THREE.Vector3(-R * 0.72, 0, R * 0.72),
    ];
    const top = 1 - (2 * (HUD_TOP + 4)) / this.h;
    const bottom = -1 + (2 * (HUD_BOTTOM + 4)) / this.h;
    const target = new THREE.Vector3();
    const v = new THREE.Vector3();

    const place = (tz: number, d: number) => {
      target.set(0, 0, tz);
      cam.position.copy(dir).multiplyScalar(d).add(target);
      cam.lookAt(target);
      cam.updateMatrixWorld();
    };
    const measure = () => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        v.copy(p).project(cam);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      return { minX, maxX, minY, maxY };
    };
    const fitDistance = (tz: number) => {
      let lo = 200;
      let hi = 12000;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        place(tz, mid);
        const m = measure();
        if (m.minX >= -0.97 && m.maxX <= 0.97 && m.minY >= bottom && m.maxY <= top) hi = mid;
        else lo = mid;
      }
      place(tz, hi);
      return measure();
    };

    // Moving the target towards the camera pushes the arena up the screen.
    const want = (top + bottom) / 2;
    let lo = -700;
    let hi = 700;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const m = fitDistance(mid);
      if ((m.minY + m.maxY) / 2 < want) lo = mid;
      else hi = mid;
    }
    fitDistance((lo + hi) / 2);
    this.camBase.copy(cam.position);
  }

  screenToWorld(sx: number, sy: number): Vec {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return { x: 0, y: 0 };
    return { x: hit.x, y: hit.z };
  }

  worldToScreen(x: number, y: number, h: number): Vec {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  render(prev: GameState, cur: GameState, alpha: number, fx: Fx, dt: number, opts: DrawOptions) {
    this.time += dt;
    for (const l of this.lights) l.intensity = 0;

    this.fog.update(opts.localId === null ? null : lerpPlayer(prev.players[opts.localId], cur.players[opts.localId], alpha));
    this.fogTex.needsUpdate = true;
    this.updateArena(cur);
    this.updateOrb(cur);
    this.updateChampions(prev, cur, alpha, dt, opts.localId);
    this.updateProjectiles(prev, cur, alpha, opts.localId);
    this.updateMeteors(cur);
    this.updateAim(cur, opts);
    this.updateFx(fx);

    const cam = this.camera;
    const s = fx.shake * 0.9;
    cam.position.set(this.camBase.x + (Math.random() - 0.5) * s, this.camBase.y + (Math.random() - 0.5) * s, this.camBase.z + (Math.random() - 0.5) * s);
    this.renderer.render(this.scene, cam);
    cam.position.copy(this.camBase);
    cam.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- arena

  private updateArena(s: GameState) {
    const t = this.time;
    for (const b of this.arena.braziers) {
      const f = 0.82 + 0.1 * Math.sin(t * 13 + b.seed) + 0.08 * Math.sin(t * 29 + b.seed * 3);
      b.light.intensity = 18000 * f;
      b.flame.scale.set(1, 0.85 + 0.25 * f, 1);
      b.glow.scale.setScalar(115 + 30 * f);
    }

    const sudden = s.roundFrame >= SUDDEN_DEATH_AT && s.phase !== 'countdown';
    this.suddenWall.visible = sudden;
    this.outside.visible = sudden;
    if (sudden) {
      this.suddenWall.scale.set(s.arenaR, 1, s.arenaR);
      (this.suddenWall.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (this.outside.material as THREE.ShaderMaterial).uniforms.uR.value = s.arenaR;
    }
  }

  private updateOrb(s: GameState) {
    const orb = s.orb;
    const inlay = this.arena.pedestalInlay.material as THREE.MeshBasicMaterial;
    this.orb.visible = orb.active;
    this.orbRing.visible = orb.active;
    if (!orb.active) {
      this.orbLight.intensity = 0;
      const charging = s.phase === 'fight' && orb.timer < 90;
      inlay.opacity = charging ? 0.4 + 0.5 * Math.abs(Math.sin(this.time * 10)) : 0.25;
      return;
    }
    inlay.opacity = 0.7;
    this.orb.position.set(0, 42 + Math.sin(this.time * 2.4) * 4, 0);
    this.orbGem.rotation.y += 0.02;
    this.orbGem.rotation.x = Math.sin(this.time * 0.8) * 0.3;
    this.orbLight.intensity = 9000 + Math.sin(this.time * 4) * 1500;
    if (orb.hp !== this.orbRingHp) {
      this.orbRingHp = orb.hp;
      this.orbRing.geometry.dispose();
      this.orbRing.geometry = new THREE.RingGeometry(ORB_R + 30, ORB_R + 35, 48, 1, Math.PI / 2, TAU * Math.max(0, orb.hp / ORB_HP));
    }
  }

  // ---------------------------------------------------------------- champions

  private ensureRigs(s: GameState) {
    for (let i = 0; i < 2; i++) {
      const champ = s.players[i].champ;
      if (this.rigChamps[i] === champ) continue;
      const old = this.champions[i];
      if (old) {
        this.scene.remove(old.root);
        old.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
      }
      const rig = buildChampion(champ, COLORS.players[i], this.glowTex);
      this.scene.add(rig.root);
      this.champions[i] = rig;
      this.rigChamps[i] = champ;
      this.anim[i] = { ghost: false, speed: 0, mx: 0, my: 0, phase: 0, deadT: 0, squash: 0 };
    }
  }

  private updateChampions(prev: GameState, cur: GameState, alpha: number, dt: number, localId: number | null) {
    this.ensureRigs(cur);
    for (let i = 0; i < 2; i++) {
      const rig = this.champions[i];
      const a = this.anim[i];
      const pc = cur.players[i];
      const pp = prev.players[i];
      const p = lerpPlayer(pp, pc, alpha);
      rig.root.position.set(p.x, 0, p.y);

      // Stealth: an enemy disappears completely; you (or anyone in attract mode) see a ghost.
      const stealthed = pc.stealthT > 0;
      rig.root.visible = localId === null || i === localId || canSee(cur, localId, i);
      if (stealthed !== a.ghost) {
        a.ghost = stealthed;
        setGhost(rig.root, stealthed);
      }

      // Movement estimate for bob and lean
      let dx = pc.x - pp.x;
      let dy = pc.y - pp.y;
      if (Math.abs(dx) > 60 || Math.abs(dy) > 60) dx = dy = 0;
      const sp = Math.hypot(dx, dy);
      const k = Math.min(1, dt * 12);
      a.speed += (sp - a.speed) * k;
      a.mx += (dx - a.mx) * k;
      a.my += (dy - a.my) * k;
      a.phase += sp * 60 * dt * 0.11;

      const yaw = Math.atan2(-p.fy, p.fx);
      rig.yaw.rotation.y = yaw;
      rig.pointer.rotation.y = yaw;

      const dead = pc.hp <= 0;
      a.deadT = dead ? a.deadT + dt : 0;
      const leapK = airborne(pc) ? 1 - (pc.dashT - alpha) / LEAP.ticks : -1;
      const lift = leapK >= 0 ? Math.sin(Math.min(1, leapK) * Math.PI) * 95 : 0;

      const axis = new THREE.Vector3();
      if (dead) {
        // Fall over in the direction of the final knockback.
        let kx = pc.vx;
        let ky = pc.vy;
        let kl = Math.hypot(kx, ky);
        if (kl < 0.01) {
          kx = -p.fx;
          ky = -p.fy;
          kl = 1;
        }
        axis.set(ky / kl, 0, -kx / kl);
        const fall = Math.min(1, a.deadT / 0.35);
        rig.lean.quaternion.setFromAxisAngle(axis, fall * fall * 1.45);
        rig.lean.position.y = -fall * 6;
        rig.body.position.y = 0;
      } else {
        const ml = Math.hypot(a.mx, a.my);
        const lean = Math.min(0.24, a.speed * 0.065);
        if (ml > 0.001) axis.set(a.my / ml, 0, -a.mx / ml);
        else axis.set(1, 0, 0);
        rig.lean.quaternion.setFromAxisAngle(axis, ml > 0.001 ? lean : 0);
        rig.lean.position.y = lift;
        const moving = a.speed > 0.5 && lift === 0;
        rig.body.position.y = moving ? Math.abs(Math.sin(a.phase)) * 3.2 : Math.sin(this.time * 2.2 + i) * 0.7;
      }
      rig.ring.visible = !dead;
      rig.pointer.visible = !dead;

      // Weapon: the staff points forward while casting; the axe winds up and swings.
      const def = pc.cast ? abilityOf(pc, pc.cast.ability) : null;
      const ck = pc.cast && def ? 1 - pc.cast.t / def.cast : 0;
      let twist = 0;
      if (pc.champ === CHAMP.WARRIOR) {
        const kit = CHAMPIONS[pc.champ].abilities;
        const slashCd = pc.cooldowns[SLOT.M1];
        const riftCd = pc.cooldowns[SLOT.R];
        let swing = -0.15;
        if (def?.id === 'slash' || def?.id === 'hook') {
          swing = -0.15 + ck * 1.25;
          twist = ck * 0.4;
        } else if (def?.id === 'rift' || def?.id === 'cry') {
          swing = -0.15 + ck * 1.6;
        } else if (slashCd > 0) {
          // Swing follow-through, driven by the short cooldown after the hit.
          const t = 1 - slashCd / kit[SLOT.M1].cooldown;
          swing = 1.1 - t * 2.6;
          twist = 0.4 - t * 0.9;
        } else if (riftCd > kit[SLOT.R].cooldown - 10) {
          swing = 1.45 - ((kit[SLOT.R].cooldown - riftCd) / 10) * 2.9;
        }
        if (pc.whirlT > 0) {
          swing = -1.5;
          twist = this.time * 22;
        }
        if (leapK >= 0) swing = 1.3 - Math.min(1, leapK) * 2.6;
        rig.weapon.rotation.z = swing;
      } else if (pc.champ === CHAMP.ASSASSIN) {
        // Draw back while winding up, stay extended right after the throw / during execute.
        const thrown = !pc.cast && pc.cooldowns[SLOT.M1] > 0;
        rig.weapon.rotation.z = pc.dashT > 0 && pc.dashKind === 2 ? -1.2 : thrown ? -0.7 : -0.2 + ck * 0.9;
        twist = def ? ck * 0.3 : 0;
      } else {
        rig.weapon.rotation.z = -0.22 - ck * 0.95;
      }
      rig.body.rotation.y = twist;
      rig.tip.scale.setScalar(1 + ck * 0.9);
      (rig.tipGlow.material as THREE.SpriteMaterial).color.set(def ? abilityColor(def.id, i) : COLORS.players[i]);
      rig.tipGlow.scale.setScalar(26 + ck * (def?.id === 'bolt' || def?.id === 'slash' ? 22 : 60));

      // Squash on hit, stretch on dash
      if (pc.hitT === 7) a.squash = 1;
      a.squash = Math.max(0, a.squash - dt * 6);
      const dash = pc.dashT > 0;
      const sx = dash ? 1.3 : 1 + a.squash * 0.12;
      const sy = dash ? 0.86 : 1 - a.squash * 0.14;
      rig.body.scale.set(sx, sy, dash ? 0.88 : 1 + a.squash * 0.12);

      // Hit flash / frost tint
      // hitT isn't ticked down after a KO, so a downed champion must not keep flashing.
      const flash = dead ? 0 : pc.hitT / 8;
      const slowed = pc.slowT > 0 && !dead;
      const poisoned = pc.poisonT > 0 && !dead;
      const pulse = poisoned ? 0.05 + 0.04 * Math.sin(this.time * 10) : 0;
      for (const m of rig.mats) {
        m.emissive.setRGB(flash + (slowed ? 0.1 : 0) + pulse * 0.4, flash + (slowed ? 0.25 : 0) + pulse, flash + (slowed ? 0.4 : 0));
      }
      rig.markSigil.visible = pc.markT > 0 && !dead;
      if (rig.markSigil.visible) {
        rig.markSigil.rotation.y += dt * 3;
        rig.markSigil.position.y = 92 + Math.sin(this.time * 4) * 3;
      }

      rig.shield.visible = pc.counterT > 0;
      if (rig.shield.visible) {
        rig.shield.rotation.y += dt * 2.2;
        rig.shield.scale.setScalar(1 + Math.sin(this.time * 25) * 0.025);
      }
      rig.slowRing.visible = slowed;
      if (slowed) rig.slowRing.rotation.z += dt * 1.5;
      const ringMat = rig.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = pc.hasteT > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 14)) : 0.75;
    }
  }

  // ---------------------------------------------------------------- projectiles

  private look(kind: ProjKind, owner: number): KindLook {
    const key = kind === 'bolt' ? `bolt${owner}` : kind;
    let l = this.looks.get(key);
    if (l) return l;
    const color = abilityColor(kind, owner);
    const size = PROJ[kind].r;
    const core =
      kind === 'blast'
        ? new THREE.IcosahedronGeometry(size * 0.75, 0)
        : kind === 'frost' || kind === 'hook'
          ? new THREE.OctahedronGeometry(size * 0.85, 0)
          : new THREE.SphereGeometry(size * 0.6, 12, 8);
    const sprite = (opacity: number) =>
      new THREE.SpriteMaterial({ map: this.glowTex, color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    l = {
      core,
      coreMat: new THREE.MeshBasicMaterial({ color: lighten(color, 0.6), toneMapped: false }),
      glowMat: sprite(1),
      trailMats: [0.7, 0.5, 0.36, 0.24, 0.14, 0.07].map(sprite),
      decalMat: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      size,
    };
    this.looks.set(key, l);
    return l;
  }

  private createProjView(pr: Projectile): ProjView {
    const l = this.look(pr.kind, pr.owner);
    const group = new THREE.Group();
    const core = new THREE.Mesh(l.core, l.coreMat);
    const glow = new THREE.Sprite(l.glowMat);
    glow.scale.setScalar(l.size * 6);
    const trail = l.trailMats.map((m, i) => {
      const s = new THREE.Sprite(m);
      s.scale.setScalar(l.size * (4.2 - i * 0.45));
      group.add(s);
      return s;
    });
    const decal = new THREE.Mesh(this.decalGeo, l.decalMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = -PROJ_H + 1;
    decal.scale.setScalar(l.size * 1.6);
    group.add(core, glow, decal);
    this.scene.add(group);
    let chain: THREE.Mesh | null = null;
    if (pr.kind === 'hook') {
      chain = new THREE.Mesh(this.chainGeo, this.chainMat);
      chain.castShadow = true;
      this.scene.add(chain);
    }
    return { group, core, trail, chain };
  }

  private updateProjectiles(prev: GameState, cur: GameState, alpha: number, localId: number | null) {
    const prevById = new Map<number, Projectile>();
    for (const pr of prev.projectiles) prevById.set(pr.id, pr);
    const alive = new Set<number>();
    let li = 0;

    for (const pr of cur.projectiles) {
      alive.add(pr.id);
      let v = this.projViews.get(pr.id);
      if (!v) {
        v = this.createProjView(pr);
        this.projViews.set(pr.id, v);
      }
      const old = prevById.get(pr.id);
      const x = old ? old.x + (pr.x - old.x) * alpha : pr.x;
      const y = old ? old.y + (pr.y - old.y) * alpha : pr.y;
      v.group.position.set(x, PROJ_H, y);
      // Enemy projectiles only show up once they fly into your vision.
      const seen = localId === null || pr.owner === localId || pointVisible(cur.players[localId], x, y);
      v.group.visible = seen;
      if (v.chain) v.chain.visible = seen;
      v.core.rotation.x += 0.15;
      v.core.rotation.y += 0.11;
      const age = pr.age + alpha;
      v.trail.forEach((s, i) => {
        const back = Math.min(age, (i + 1) * 0.9);
        s.position.set(-pr.vx * back, 0, -pr.vy * back);
      });

      if (v.chain) {
        const hand = this.champions[pr.owner].root.position;
        const from = new THREE.Vector3(hand.x, 32, hand.z);
        const dir = new THREE.Vector3(x, PROJ_H, y).sub(from);
        const len = dir.length();
        v.chain.position.copy(from).addScaledVector(dir, 0.5);
        v.chain.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
        v.chain.scale.set(len, 1.8, 1.8);
      }

      if (seen && li < this.lights.length) {
        const light = this.lights[li++];
        light.position.set(x, PROJ_H + 10, y);
        light.color.set(abilityColor(pr.kind, pr.owner));
        light.intensity = pr.kind === 'blast' ? 9000 : pr.kind === 'frost' ? 5000 : 2600;
      }
    }

    for (const [id, v] of this.projViews) {
      if (alive.has(id)) continue;
      this.scene.remove(v.group);
      if (v.chain) this.scene.remove(v.chain);
      this.projViews.delete(id);
    }
  }

  // ---------------------------------------------------------------- meteors

  private createMeteorView(m: Meteor): MeteorView {
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(METEOR.r, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.meteor, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(m.x, 1.3, m.y);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(METEOR.r - 5, METEOR.r, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.meteor, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(m.x, 1.4, m.y);

    const rock = new THREE.Group();
    const stoneMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(17, 0),
      new THREE.MeshStandardMaterial({ color: '#3b2a22', emissive: '#ff5a1a', emissiveIntensity: 1.3, roughness: 0.8, flatShading: true }),
    );
    rock.add(stoneMesh, glowSprite(this.glowTex, COLORS.meteor, 140, 0.9));
    for (let i = 1; i <= 5; i++) {
      const t = glowSprite(this.glowTex, COLORS.meteor, 110 - i * 14, 0.5 - i * 0.08);
      t.position.set(i * 26, i * 70, -i * 20);
      rock.add(t);
    }
    this.scene.add(fill, ring, rock);
    return { fill, ring, rock, sx: m.x + 260, sz: m.y - 200 };
  }

  private updateMeteors(cur: GameState) {
    const alive = new Set<number>();
    for (const m of cur.meteors) {
      alive.add(m.id);
      let v = this.meteorViews.get(m.id);
      if (!v) {
        v = this.createMeteorView(m);
        this.meteorViews.set(m.id, v);
      }
      const k = 1 - m.t / METEOR.delay;
      const e = Math.pow(k, 1.7);
      v.fill.scale.setScalar(Math.max(0.01, k));
      (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.4 * Math.abs(Math.sin(this.time * 12));
      v.rock.position.set(v.sx + (m.x - v.sx) * e, 760 * (1 - e) + 10, v.sz + (m.y - v.sz) * e);
      v.rock.children[0].rotation.x += 0.1;
      v.rock.children[0].rotation.z += 0.07;
    }
    for (const [id, v] of this.meteorViews) {
      if (alive.has(id)) continue;
      this.scene.remove(v.fill, v.ring, v.rock);
      this.meteorViews.delete(id);
    }
  }

  // ---------------------------------------------------------------- aim

  private updateAim(s: GameState, opts: DrawOptions) {
    this.aimLane.visible = false;
    this.aimCircle.visible = false;
    if (opts.localId === null || s.phase !== 'fight') return;
    const p = s.players[opts.localId];
    const id = p.cast ? abilityOf(p, p.cast.ability).id : null;
    if (id === 'blast' || id === 'frost' || id === 'hook' || id === 'rift') {
      const len = id === 'rift' ? RIFT.len : PROJ[id].range;
      const half = id === 'rift' ? RIFT.half : PROJ[id].r;
      this.aimLane.visible = true;
      this.aimLane.position.set(p.x, 1.2, p.y);
      this.aimLane.rotation.y = Math.atan2(-p.fy, p.fx);
      this.aimLaneMesh.position.set(PLAYER_R + len / 2, 0, 0);
      this.aimLaneMesh.scale.set(len, half * 2, 1);
      (this.aimLaneMesh.material as THREE.MeshBasicMaterial).color.set(abilityColor(id, p.id));
    } else if (id === 'meteor' && opts.cursor) {
      const w = this.screenToWorld(opts.cursor.x, opts.cursor.y);
      let dx = w.x - p.x;
      let dy = w.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > METEOR.range) {
        dx = (dx / d) * METEOR.range;
        dy = (dy / d) * METEOR.range;
      }
      this.aimCircle.visible = true;
      this.aimCircle.position.set(p.x + dx, 1.4, p.y + dy);
    }
  }

  // ---------------------------------------------------------------- fx

  private color(c: string): THREE.Color {
    let col = this.colorCache.get(c);
    if (!col) {
      col = new THREE.Color(c);
      this.colorCache.set(c, col);
    }
    return col;
  }

  private updateFx(fx: Fx) {
    for (let i = 0; i < this.rings.length; i++) {
      const mesh = this.rings[i];
      const r = fx.rings[i];
      mesh.visible = !!r;
      if (!r) continue;
      const k = 1 - r.life / r.max;
      const ease = 1 - (1 - k) * (1 - k);
      mesh.position.set(r.x, 1.5, r.y);
      mesh.scale.setScalar(Math.max(1, r.r0 + (r.r1 - r.r0) * ease));
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.color.copy(this.color(r.color));
      m.opacity = 1 - k;
    }

    const n = Math.min(MAX_PARTICLES, fx.particles.length);
    for (let i = 0; i < n; i++) {
      const p = fx.particles[i];
      const k = p.life / p.max;
      this.pPos[i * 3] = p.x;
      this.pPos[i * 3 + 1] = p.z;
      this.pPos[i * 3 + 2] = p.y;
      const c = this.color(p.color);
      this.pCol[i * 3] = c.r;
      this.pCol[i * 3 + 1] = c.g;
      this.pCol[i * 3 + 2] = c.b;
      this.pSize[i] = p.size * 3.2 * (0.4 + 0.6 * k);
      this.pAlpha[i] = k;
    }
    const g = this.particles.geometry;
    g.setDrawRange(0, n);
    for (const name of ['position', 'pcolor', 'size', 'alpha']) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
}


/** Switch every material under `root` between normal and see-through. */
function setGhost(root: THREE.Object3D, ghost: boolean) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // Outlines share one material across champions: hide them instead of fading.
    if (o.userData.outline) {
      o.visible = !ghost;
      return;
    }
    if (!mesh.isMesh && !(o as THREE.Sprite).isSprite) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const data = m.userData as { opacity?: number; transparent?: boolean };
      if (data.opacity === undefined) {
        data.opacity = m.opacity;
        data.transparent = m.transparent;
      }
      m.transparent = ghost || data.transparent!;
      m.opacity = ghost ? data.opacity * 0.3 : data.opacity;
      m.needsUpdate = true;
    }
    if (mesh.userData.castShadow === undefined) mesh.userData.castShadow = mesh.castShadow;
    mesh.castShadow = !ghost && mesh.userData.castShadow;
  });
}
