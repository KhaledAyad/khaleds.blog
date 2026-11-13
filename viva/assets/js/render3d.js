/* Freight City Viva v3: the 3D city on three.js 0.187.0. Poster toon look (3-step toon ramp, ink hulls, halftone in the
   darkest band), districts that turn from grey to colour in a 2.4 s wave when their act clears, landmarks and vehicles
   modelled in code, painted sky domes by time of day, rain, leaves and Blank Quarter fog, Kerb Inspectors with amber
   beacons at 1.5 Hz, tiers that step down on slow frames, and bloom on the High tier. 10 sim units are 1 m. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const FCV = window.FCV;
const U = 0.1; /* sim units to metres */
const INK = 0x15101f;
const ACT_COL = { 1: 0xff8a3d, 2: 0x2bb3a6, 3: 0x7a5cff, 4: 0xe2456f, 5: 0xffb000, 6: 0xe6332a, 7: 0x16a0d8 };
const HEIGHT = { 1: [10, 18], 2: [14, 24], 3: [12, 20], 4: [16, 26], 5: [8, 14], 6: [9, 16], 7: [20, 34] };

let lastCam = [0, 0, 0];
let R = null, scene, camera, renderer, composer, bloom, labelR, city, tier = 'high', canvas, lost = 0;
let grad, toonCache = {}, districts = {}, dyn = {}, cam = { x: 0, z: 0, tx: 0, tz: 0 }, raycaster = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let sky, skyTex = {}, sun, hemi, rain, leaves, fog, frames = [], lastStep = 0, wave = {}, labels = {}, portraitMat = {}, lastFlags = {}, cine = null, clockHands = null, domeLamps = [], lockerDoors = [];

function toonGradient() {
  const c = document.createElement('canvas'); c.width = 3; c.height = 1; const g = c.getContext('2d');
  [[0, '#616161'], [1, '#b8b8b8'], [2, '#ffffff']].forEach(([i, col]) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); });
  const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
}
/* Toon material with a grey-mix uniform (the colour wave) and a halftone dot screen in the darkest band. */
function toon(color, opts = {}) {
  const key = color + ':' + (opts.vertexColors ? 1 : 0) + ':' + (opts.emissive || 0) + ':' + (opts.district || '');
  if (toonCache[key] && !opts.unique) return toonCache[key];
  const m = new THREE.MeshToonMaterial({ color, gradientMap: grad, vertexColors: !!opts.vertexColors, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissive ? 1 : 0 });
  m.userData.uGrey = { value: opts.grey || 0 }; m.userData.uDots = { value: tier === 'low' ? 0 : 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrey = m.userData.uGrey; sh.uniforms.uDots = m.userData.uDots;
    sh.fragmentShader = 'uniform float uGrey; uniform float uDots;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      `float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum * 0.92 + 0.04), uGrey);
       if (uDots > 0.5 && lum < 0.28) { vec2 p = gl_FragCoord.xy / 5.0; vec2 q = fract(vec2(p.x + p.y, p.x - p.y) * 0.7071) - 0.5; if (length(q) < 0.22) gl_FragColor.rgb *= 0.7; }
       #include <dithering_fragment>`);
  };
  if (!opts.unique) toonCache[key] = m;
  return m;
}
/* Inverted-hull ink outline: the same geometry, back faces, pushed out along the normals. */
function hullMat(px) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.userData.uT = { value: px };
  m.onBeforeCompile = (sh) => { sh.uniforms.uT = m.userData.uT; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * uT;'); };
  return m;
}
let HULL = null;
/* round 4 (item 65b): buildings between the camera and the player or the next marker fade to about 25 per cent (a screen-door
   cutout, so there is no sorting trouble). Each building's vertices carry bid = its index + 1; uFade lists up to 8 faded ids. */
const FADE = { value: new Float32Array(8).fill(-1) };
let BOXES = [], fadedNow = [];
function addFade(m) {
  const prev = m.onBeforeCompile, prevKey = prev ? String(prev) : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uFade = FADE;
    sh.vertexShader = 'attribute float bid;\nuniform float uFade[8];\nvarying float vFade;\n' + sh.vertexShader.replace('void main() {', 'void main() {\n  vFade = 0.0; for (int q = 0; q < 8; q++) { if (bid > 0.5 && abs(bid - uFade[q]) < 0.5) vFade = 1.0; }');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vFade > 0.5) { vec2 fc = floor(gl_FragCoord.xy); if (mod(fc.x, 2.0) + mod(fc.y, 2.0) > 0.5) discard; }');
  };
  m.customProgramCacheKey = () => 'fade|' + m.type + '|' + prevKey;
  return m;
}
function bidAttr(geo, id) { const n = geo.attributes.position.count, a = new Float32Array(n).fill(id); geo.setAttribute('bid', new THREE.BufferAttribute(a, 1)); return geo; }
/* segment a to b (metres) against the building boxes: the ids of the buildings it passes through */
function segHits(a, b, out) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  for (let k = 0; k < BOXES.length; k++) {
    const bx = BOXES[k]; let t0 = 0.001, t1 = 0.985, ok = true;
    const ax = [[a[0], d[0], bx.x0, bx.x1], [a[1], d[1], 0, bx.y1], [a[2], d[2], bx.z0, bx.z1]];
    for (let q = 0; q < 3 && ok; q++) { const [oa, da, lo, hi] = ax[q]; if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) ok = false; } else { let u = (lo - oa) / da, v = (hi - oa) / da; if (u > v) { const w = u; u = v; v = w; } t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) ok = false; } }
    if (ok) { if (!out) return true; if (out.indexOf(bx.id) < 0) out.push(bx.id); }
  }
  return out ? out.length > 0 : false;
}
function withHull(geo, mat, parent) {
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = tier === 'high'; mesh.receiveShadow = true; parent.add(mesh);
  if (tier !== 'low') { const h = new THREE.Mesh(geo, HULL); parent.add(h); mesh.userData.hull = h; }
  return mesh;
}
function colorAttr(geo, hex) { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
function box(w, h, d, x, y, z, hex) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colorAttr(g.toNonIndexed(), hex); }
function cyl(rt, rb, h, x, y, z, hex, seg = 12) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return colorAttr(g.toNonIndexed(), hex); }
function shade(hex, f) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, f); return c.getHex(); }

/* A facade atlas drawn once at boot: windows only, no letters. */
function facadeTex(night) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = night ? '#000' : '#fff'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) { const lit = night ? Math.random() < 0.55 : true; g.fillStyle = night ? (lit ? '#ffd98a' : '#000') : '#cfd8e6'; g.fillRect(14 + x * 40, 10 + y * 31, 22, 18); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* QAR12-01, QAR13-02: every act's drop box stands clear of the scenery, its body and lid in view wherever the box is on
   screen. The camera (frame()) looks north from the south, 65 degrees down, with a 30 degree field of view, so scenery hides
   a box only by standing within reach of it or south of it under the sight lines from the box to the camera. Family mode
   and a narrow screen only move the camera along its line, so the lines depend only on where the box is on screen: through
   screen row y (camera units, -tan 15 at the bottom to tan 15 at the top) a line rises (sin 65 - y cos 65) / (cos 65 +
   y sin 65) m for each metre south of the box (1.19 m at the top row) and, on a screen up to 1.6 wide per 1 high (1440x900,
   1180x820 and 390x844), spreads at most 1.6 tan 15 / (cos 65 + y sin 65) m either way (0.64 m at the top row). CLEAR.rows
   holds 41 rows from the bottom to the top. Round 12 took only the lines with the bike within 20 m (1.5 m and 0.45 m); from
   further south the south-west building's lower wing hid the box's foot.
   QAR14-01: the Top view (T) looks straight down from above the bike (89.5 degrees), so a sight line from a box leans
   towards the middle of the screen, wherever the box is on it: on a screen up to 1.6 wide per 1 high it rises at least
   1 / (1.6 tan 15) m for each metre east or west (2.33 m) and 1 / tan 15 m for each metre north or south (3.73 m), less 4 per
   cent for the 0.5 degree tilt (CLEAR.ex and CLEAR.ez). A solid Lx m east or west of a box and Lz m north or south of it
   (past the 0.3 m gap) stays under every such line when it stands no taller than the larger of Lx / ex and Lz / ez.
   clearTop(x0, x1, z0, z1) is the tallest a solid with that footprint (metres) may stand in both views: Infinity where no box
   is seen across it, 0 within 0.3 m of a box. Buildings step down there (clearParts) and trees there are smaller; no
   building or tree needs more for the Top view. The landmarks stand behind their boxes, clear of both views (landmarks). */
const BOX_DX = 4.6; /* the drop box stands 4.6 m east of its marker point: frame() builds it there and the pick finds it there */
const CLEAR = { gap: 0.3, rows: [], ex: 1.6 * Math.tan(15 * Math.PI / 180) * 1.04, ez: Math.tan(15 * Math.PI / 180) * 1.04 }, INKW = 0.22; /* INKW: the ink line's width on the High tier */
{ const p = 65 * Math.PI / 180, t = Math.tan(15 * Math.PI / 180); for (let k = 0; k <= 40; k++) { const y = t * (k / 20 - 1), s = Math.cos(p) + y * Math.sin(p); CLEAR.rows.push({ rise: (Math.sin(p) - y * Math.cos(p)) / s, spread: 1.6 * t / s }); } }
let DROPS = [];
function clearTop(x0, x1, z0, z1) {
  let top = Infinity; const g = CLEAR.gap;
  DROPS.forEach(b => {
    if (x1 > b.x0 - g && x0 < b.x1 + g && z1 > b.z0 - g && z0 < b.z1 + g) { top = 0; return; }
    const lat = Math.max(0, b.x0 - g - x1, x0 - b.x1 - g);
    top = Math.min(top, Math.max(lat / CLEAR.ex, Math.max(0, b.z0 - g - z1, z0 - b.z1 - g) / CLEAR.ez)); /* QAR14-01: the Top view */
    if (z1 <= b.z0 - g) return; /* behind the box */
    CLEAR.rows.forEach(r => { const zIn = Math.max(z0, b.z0 + lat / r.spread); if (zIn < z1) top = Math.min(top, r.rise * Math.max(0, zIn - b.z1)); });
  });
  return top;
}
/* a building b (sim units) of height h as parts [x, w, h]: the part in front of a drop box steps down under the sight lines
   (its roof cap overhangs 0.3 m and tops out 1.1 m above h, and the ink line adds 0.22 m); a step of 5 m or less lowers the
   whole building instead, and a tall remainder under 4 m wide goes down with the step. QAR14-02: with a 3 m step, round 13
   put the west part of Returns Desk, Gate House and Key Cutter (3.8 to 4.5 m above its 9.62 m wing) back up in front of its
   act's side-mission ring; with 5 m each stands whole at 9.62 m, under round 12's height, and no other building changes */
function clearParts(b, h) {
  const G = 0.3 + INKW, T = 1.1 + INKW, z0 = b.y * U - G, z1 = (b.y + b.h) * U + G;
  const allowed = (xa, xb) => Math.max(0, clearTop(xa * U - G, xb * U + G, z0, z1) - T);
  const low = allowed(b.x, b.x + b.w); if (h <= low) return [[b.x, b.w, h]];
  if (h - low <= 5) return [[b.x, b.w, low]];
  /* QAR13-02: each tall end keeps its height as far as every sight line passes over it (0.1 m steps) */
  let a = b.x, c = b.x + b.w; while (a < c && allowed(b.x, a + 1) >= h) a++; while (c > a && allowed(c - 1, b.x + b.w) >= h) c--;
  if (a - b.x < 40) a = b.x; if (b.x + b.w - c < 40) c = b.x + b.w;
  return [[b.x, a - b.x, h], [a, c - a, allowed(a, c)], [c, b.x + b.w - c, h]].filter(p => p[1] > 0);
}

function buildCity() {
  const root = new THREE.Group(); scene.add(root);
  DROPS = city.markers.filter(m => m.slot === 'drop').map(m => ({ x0: m.x * U + BOX_DX - POST.w, x1: m.x * U + BOX_DX + POST.w, z0: m.y * U - POST.d, z1: m.y * U + POST.d }));
  /* ground: roads everywhere, then pavements and cells */
  const roadG = new THREE.PlaneGeometry(city.W * U + 200, city.H * U + 200); roadG.rotateX(-Math.PI / 2); roadG.translate(city.W * U / 2, -0.05, city.H * U / 2);
  const road = new THREE.Mesh(roadG, toon(0x3a3348)); road.receiveShadow = true; root.add(road);
  /* lane markings: dashed boxes along the road grid, merged */
  const dash = [];
  for (let k = 0; k < 4; k++) { const z = (k * (city.CH + city.R) + city.R / 2) * U; for (let x = 0; x < city.W * U; x += 6) dash.push(box(3, 0.05, 0.4, x, 0.01, z, 0xffd166)); }
  for (let j = 0; j < 5; j++) { const x = (j * (city.CW + city.R) + city.R / 2) * U; for (let z = 0; z < city.H * U; z += 6) dash.push(box(0.4, 0.05, 3, x, 0.01, z, 0xffd166)); }
  root.add(new THREE.Mesh(mergeGeometries(dash), toon(0xffffff, { vertexColors: true })));
  /* zebras at each district's road corners */
  const zeb = []; city.cells.forEach(c => { for (let i = 0; i < 6; i++) zeb.push(box(0.6, 0.06, 4, (c.x + c.w / 2) * U - 4 + i * 1.4, 0.02, (c.y + c.h) * U + 4, 0xfff3e0)); });
  root.add(new THREE.Mesh(mergeGeometries(zeb), toon(0xffffff, { vertexColors: true })));
  /* water */
  city.water.forEach(w => { const g = new THREE.PlaneGeometry(w.w * U, w.h * U); g.rotateX(-Math.PI / 2); g.translate((w.x + w.w / 2) * U, 0.02, (w.y + w.h / 2) * U); const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: 0x1f7fb8, gradientMap: grad, emissive: 0x0a2a44 })); root.add(m); });
  const dayTex = facadeTex(false), nightTex = facadeTex(true);
  /* cells: each district its own merged meshes so the colour wave can run per district */
  city.cells.forEach(cell => {
    const key = cell.kind === 'act' ? 'act' + cell.act : cell.kind + cell.x;
    const parts = [], tops = [];
    parts.push(box(cell.w * U + 2.4, 0.3, cell.h * U + 2.4, (cell.x + cell.w / 2) * U, 0.12, (cell.y + cell.h / 2) * U, 0xbfb2a0));
    const fill = cell.kind === 'act' ? shade(ACT_COL[cell.act], 0.25) : cell.kind === 'park' ? 0x58b56f : cell.kind === 'harbour' ? 0x9aa3ad : cell.kind === 'locker' ? 0x3a2f4d : 0x3a2c52;
    parts.push(box(cell.w * U, 0.32, cell.h * U, (cell.x + cell.w / 2) * U, 0.14, (cell.y + cell.h / 2) * U, fill));
    const grp = new THREE.Group(); root.add(grp);
    const groundMat = toon(0xffffff, { vertexColors: true, unique: true, grey: cell.kind === 'act' ? 1 : 0 });
    const gm = new THREE.Mesh(mergeGeometries(parts), groundMat); gm.receiveShadow = true; grp.add(gm);
    const blds = city.buildings.filter(b => b.x >= cell.x - 1 && b.x < cell.x + cell.w && b.y >= cell.y - 1 && b.y < cell.y + cell.h);
    const bg = [], wg = [];
    blds.forEach((b, i) => {
      const hr = cell.act ? HEIGHT[cell.act] : b.viva ? [14, 14] : [8, 12], h = hr[0] + ((FCV.hash32(b.label || String(i)) % 100) / 100) * (hr[1] - hr[0]);
      const col = b.act ? ACT_COL[b.act] : parseInt(String(b.colour || '#888888').slice(1), 16);
      const bid = city.buildings.indexOf(b) + 1;
      /* QAR12-01: each part of the building (one, unless it stands in front of a drop box) */
      clearParts(b, h).forEach(([px, pw, ph]) => {
        BOXES.push({ id: bid, x0: px * U, x1: (px + pw) * U, z0: b.y * U, z1: (b.y + b.h) * U, y1: ph + 1.1 });
        bg.push(bidAttr(box(pw * U, ph, b.h * U, (px + pw / 2) * U, ph / 2 + 0.3, (b.y + b.h / 2) * U, col), bid));
        /* QAR14-02: a part stepped down for a drop box has its roof cap flush with its walls: lowered, a cap's 0.3 m overhang
           (and its ink line) stood in sight lines from the markers beside it that passed over the taller building */
        const ov = ph < h ? 0 : 0.6;
        bg.push(bidAttr(box(pw * U + ov, 0.8, b.h * U + ov, (px + pw / 2) * U, ph + 0.7, (b.y + b.h / 2) * U, shade(col, -0.18)), bid));
        /* window band planes on the south face */
        const wp = new THREE.PlaneGeometry(pw * U * 0.86, ph * 0.8); wp.translate((px + pw / 2) * U, ph * 0.5 + 0.3, (b.y + b.h) * U + 0.06);
        const uv = wp.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * pw * U / 8, uv.getY(q) * ph / 6); wg.push(bidAttr(wp, bid));
      });
    });
    if (bg.length) {
      const bm = withHull(mergeGeometries(bg), addFade(toon(0xffffff, { vertexColors: true, unique: true, grey: cell.kind === 'act' ? 1 : 0 })), grp);
      const wm = new THREE.Mesh(mergeGeometries(wg), addFade(new THREE.MeshToonMaterial({ map: dayTex, gradientMap: grad, emissiveMap: nightTex, emissive: 0xffd98a, emissiveIntensity: 0 })));
      grp.add(wm); districts[key] = { ground: groundMat, bld: bm.material, win: wm.material, cell };
    } else districts[key] = { ground: groundMat, cell };
  });
  /* trees: instanced cones and trunks */
  const trees = city.decor.filter(d => d.kind === 'tree');
  const cone = new THREE.ConeGeometry(1, 2.4, 7); cone.translate(0, 2.4, 0);
  const tm = new THREE.InstancedMesh(cone, toon(0x2f9a55), trees.length); const mtx = new THREE.Matrix4();
  /* QAR12-01: a tree in front of a drop box is a smaller tree: its cone (radius r at 1.2 r up, the tip at 3.6 r) under the
     sight lines */
  const fits = (x, z, r) => { for (let q = 0; q <= 24; q++) { const y = (1.2 + q * 0.1) * r, rho = (3.6 * r - y) / 2.4; if (y > clearTop(x - rho, x + rho, z - rho, z + rho)) return false; } return true; };
  trees.forEach((t, i) => { let s = t.s * U * 1.6; while (s > 0.5 && !fits(t.x * U, t.y * U, s)) s *= 0.97; mtx.compose(new THREE.Vector3(t.x * U, 0, t.y * U), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); tm.setMatrixAt(i, mtx); });
  tm.castShadow = tier === 'high'; root.add(tm);
  landmarks(root);
}
/* Landmarks modelled in code: Freight FM mast, Archive stacks, Method Works and the Academy, Witness Court, the Receiver's
   Clock, the red-cell kiosk, Rooftops, the Locker with ten doors, and the Viva Hall dome ringed by five link lamps. */
function landmarks(root) {
  const cellOf = n => city.cells.filter(c => c.act === n)[0];
  const ctr = c => [(c.x + c.w / 2) * U, (c.y + c.h / 2) * U];
  const g = [];
  let [x, z] = ctr(cellOf(1)); g.push(cyl(0.6, 1.2, 34, x + 18, 17, z - 6, 0xff8a3d, 6)); g.push(cyl(2.5, 2.5, 1, x + 18, 34, z - 6, 0xffd166));
  /* QAR12-01: the Archive stacks end behind (north of) the Act 2 drop box; 12 m deep, they stood across it. QAR14-01: 3 m
     further north (4.1 m behind the box), under the Top view's sight lines */
  [x, z] = ctr(cellOf(2)); for (let i = 0; i < 5; i++) g.push(box(3, 8 + i * 2, 4, x - 10 + i * 4, 4 + i, z - 7, 0x8a6a3a));
  [x, z] = ctr(cellOf(3)); g.push(box(16, 10, 10, x + 14, 5, z + 8, 0xb5412f)); g.push(box(17, 1.2, 11, x + 14, 10.6, z + 8, 0x7a2a20)); g.push(cyl(0.2, 0.2, 5, x + 14, 13.5, z + 8, 0xffd166, 4));
  /* QAR12-01: the Witness Court stands north of the square, behind the Act 4 drop box; south of it, its beam hid the box.
     QAR14-01: its beam is 2.4 m deep (was 6), still centred on the columns, so it ends 3.9 m behind the box */
  [x, z] = ctr(cellOf(4)); for (let i = 0; i < 6; i++) g.push(cyl(0.7, 0.7, 10, x - 8 + i * 3.2, 5, z - 6, 0xfff3e0, 8)); g.push(box(22, 1.5, 2.4, x + 0, 10.7, z - 6, 0xe2456f));
  /* QAR14-01: the Receiver's Clock tower stands 7.2 m east of the Act 5 drop box, so in the Top view it may stand 14.4 m tall
     (was 22), its clock face (2 m in radius, was 2.4) lower with it, inside the ink line of the tower as it stood */
  const c5 = cellOf(5); [x, z] = ctr(c5); g.push(box(4, 14.4, 4, x, 7.2, z, 0xffb000));
  [x, z] = ctr(cellOf(6)); g.push(box(4, 4, 4, x + 6, 2, z - 4, 0xe6332a)); g.push(box(4.6, 0.6, 4.6, x + 6, 4.3, z - 4, 0x15101f));
  /* QAR14-01: the Rooftops mast stands over the far (north-west) end of the Aerial Mast's roof (was by its south-east corner,
     10 m north of the Act 7 drop box), clear of the Top view's sight lines from the box, and 26 m or more from every marker,
     so that no sight line from one meets it at its height (34 to 52 m) */
  [x, z] = ctr(cellOf(7)); g.push(cyl(0.3, 0.5, 18, x - 35, 34 + 9, z - 32, 0x16a0d8, 6));
  const merged = mergeGeometries(g.filter(Boolean)); withHull(merged, toon(0xffffff, { vertexColors: true }), root);
  /* the Receiver's Clock: a face and two hands that follow the game time */
  const face = new THREE.Mesh(new THREE.CircleGeometry(2, 24), toon(0xfff3e0)); face.position.set(x = ctr(c5)[0], 10.8, ctr(c5)[1] + 2.05); root.add(face);
  clockHands = new THREE.Group(); clockHands.position.copy(face.position).add(new THREE.Vector3(0, 0, 0.05));
  const hh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.05), new THREE.MeshBasicMaterial({ color: INK })); hh.geometry.translate(0, 0.7, 0);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.1, 0.05), new THREE.MeshBasicMaterial({ color: INK })); mh.geometry.translate(0, 1.05, 0);
  clockHands.add(hh, mh); clockHands.userData = { hh, mh }; root.add(clockHands);
  /* the Locker: ten doors, green once secured */
  const lk = city.cells.filter(c => c.kind === 'locker')[0];
  const rooms = FCV.data.script.evidence_locker.rooms;
  rooms.forEach((r, i) => { const d = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 0.3), toon(0x5a4775, { unique: true })); d.position.set((lk.x + 60) * U + i * 3, 1.9, (lk.y + lk.h) * U - 2); d.userData.room = r.id; root.add(d); lockerDoors.push(d); });
  /* the Viva Hall dome and five link lamps (link 5 hollow) */
  const vb = city.buildings.filter(b => b.viva)[0];
  if (vb) {
    const vx = (vb.x + vb.w / 2) * U, vz = (vb.y + vb.h / 2) * U;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xffd166)); dome.position.set(vx, 14.6, vz); root.add(dome);
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.45, lamp = new THREE.Mesh(i === 4 ? new THREE.TorusGeometry(1, 0.28, 8, 16) : new THREE.SphereGeometry(1, 12, 8), new THREE.MeshToonMaterial({ color: 0x5b5266, gradientMap: grad, emissive: 0x000000 })); lamp.position.set(vx + Math.cos(a) * 15, 20, vz + Math.sin(a) * 15 + 18); root.add(lamp); domeLamps.push(lamp); }
  }
}
/* The courier on a cargo bike, built from primitives; Docket rides in the box in family mode. */
function buildBike() {
  const g = new THREE.Group();
  const add = (geo, col, x, y, z) => { const m = new THREE.Mesh(geo, toon(col)); m.position.set(x, y, z); m.castShadow = tier === 'high'; g.add(m); return m; };
  add(new THREE.TorusGeometry(0.45, 0.12, 6, 14), INK, -0.9, 0.5, 0).rotation.y = Math.PI / 2;
  add(new THREE.TorusGeometry(0.45, 0.12, 6, 14), INK, 1.0, 0.5, 0).rotation.y = Math.PI / 2;
  add(new THREE.BoxGeometry(1.0, 0.7, 0.9), 0xff8a3d, 1.0, 1.1, 0);
  add(new THREE.CapsuleGeometry(0.33, 0.7, 4, 8), 0x19c2b0, -0.4, 1.6, 0);
  add(new THREE.SphereGeometry(0.28, 10, 8), 0xc98e62, -0.3, 2.35, 0);
  add(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 10), 0xff8a3d, -0.3, 2.55, 0);
  const dk = add(new THREE.BoxGeometry(0.5, 0.45, 0.4), 0xd9c3a0, 1.0, 1.65, 0); dk.visible = false; g.userData.docket = dk;
  /* item 59: a sticker on the cargo box for each act cleared */
  g.userData.stickers = [1, 2, 3, 4, 5, 6, 7].map(n => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.04), new THREE.MeshBasicMaterial({ color: ACT_COL[n] })); m.position.set(0.66 + ((n - 1) % 4) * 0.23, 1.25 + Math.floor((n - 1) / 4) * 0.25, 0.47); m.visible = false; g.add(m); return m; });
  /* SD-05: the courier 1.5 times larger, standing in a bright ring that shows through walls, so a child can find the bike */
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.16, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: false }));
  halo.rotation.x = Math.PI / 2; halo.position.set(0.05, 0.08, 0); halo.renderOrder = 999; g.add(halo); g.userData.halo = halo;
  g.scale.setScalar(1.5);
  scene.add(g); return g;
}
function buildDynamic() {
  dyn.bike = buildBike();
  const van = new THREE.BoxGeometry(5.2, 2.4, 2.4); van.translate(0, 1.4, 0);
  dyn.cars = new THREE.InstancedMesh(van, toon(0xffffff), 40); dyn.cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dyn.cars.castShadow = tier === 'high'; scene.add(dyn.cars);
  const bean = new THREE.CapsuleGeometry(0.35, 0.8, 3, 8); bean.translate(0, 0.8, 0);
  dyn.peds = new THREE.InstancedMesh(bean, toon(0xffffff), 80); dyn.peds.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(dyn.peds);
  const pbox = new THREE.BoxGeometry(1.1, 0.9, 1.1); pbox.translate(0, 0.6, 0);
  dyn.parcels = new THREE.InstancedMesh(pbox, toon(0xc9a46a), 200); dyn.parcels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(dyn.parcels);
  const ring = new THREE.TorusGeometry(3.4, 0.35, 8, 28); ring.rotateX(Math.PI / 2); ring.translate(0, 0.3, 0);
  dyn.markers = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff }), 80); dyn.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(dyn.markers);
  const pin = new THREE.ConeGeometry(0.9, 1.8, 4); pin.rotateX(Math.PI); pin.translate(0, 9, 0);
  dyn.pins = new THREE.InstancedMesh(pin, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, emissive: 0x332200 }), 80); dyn.pins.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(dyn.pins);
  const scoot = new THREE.BoxGeometry(2.6, 1.4, 1.2); scoot.translate(0, 0.9, 0);
  dyn.insp = new THREE.InstancedMesh(scoot, toon(0xe8f7f2), 6); scene.add(dyn.insp);
  const bcn = new THREE.SphereGeometry(0.35, 8, 6); bcn.translate(0, 1.9, 0);
  dyn.beacons = new THREE.InstancedMesh(bcn, new THREE.MeshBasicMaterial({ color: 0xffb000 }), 6); scene.add(dyn.beacons);
  const an = new THREE.BoxGeometry(6, 3, 2.8); an.translate(0, 1.7, 0);
  /* the Big Fierce Animal: an armoured, rhino-shaped van (a horn on the bonnet, two round headlights), never a plain box */
  dyn.animal = new THREE.Group();
  const anBody = new THREE.Mesh(an, toon(0x6b4a2b)); anBody.castShadow = tier === 'high'; dyn.animal.add(anBody);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 2.6), toon(0x7d5a36)); cab.position.set(3.6, 1.4, 0); dyn.animal.add(cab);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 10), toon(0xf3e2c0)); horn.rotation.z = -Math.PI / 2.6; horn.position.set(4.7, 2.4, 0); dyn.animal.add(horn);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  [-0.8, 0.8].forEach(z => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lampM); l.position.set(4.55, 1.2, z); dyn.animal.add(l); });
  const plateM = toon(0x4a3320);
  [-1.6, 0, 1.6].forEach(x => { const pl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 3.0), plateM); pl.position.set(x, 3.3, 0); dyn.animal.add(pl); });
  scene.add(dyn.animal);
  const route = new THREE.BufferGeometry(); route.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
  dyn.route = new THREE.Line(route, new THREE.LineDashedMaterial({ color: 0x19c2b0, dashSize: 2, gapSize: 1.4 })); scene.add(dyn.route);
  const tgt = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 20), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide })); tgt.rotation.x = -Math.PI / 2; dyn.target = tgt; scene.add(tgt);
  /* round 4 (item 65a): every marker, parcel and drop box is a beacon that shows through walls: a light pillar, the ring drawn
     a second time without depth at 40 per cent (the seen-through-wall look) and a floating icon. */
  const pil = new THREE.CylinderGeometry(1.2, 1.2, 40, 12, 6, true); pil.translate(0, 20, 0);
  /* the light fades out towards the top (additive black is invisible), so the pillar glows without a glare */
  { const pp = pil.attributes.position, ca = new Float32Array(pp.count * 3); for (let q = 0; q < pp.count; q++) { const k = Math.pow(1 - pp.getY(q) / 40, 1.6); ca[q * 3] = ca[q * 3 + 1] = ca[q * 3 + 2] = k; } pil.setAttribute('color', new THREE.BufferAttribute(ca, 3)); }
  dyn.pillars = new THREE.InstancedMesh(pil, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 320);
  dyn.pillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dyn.pillars.renderOrder = 999; dyn.pillars.frustumCulled = false; scene.add(dyn.pillars);
  dyn.ringsX = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false }), 80);
  dyn.ringsX.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dyn.ringsX.renderOrder = 998; dyn.ringsX.frustumCulled = false; scene.add(dyn.ringsX);
  /* the drop box itself: a post box with a lid that flaps when a parcel goes in (item 46) */
  dyn.dropBoxes = {};
}
/* floating icons: one canvas texture per kind, drawn over everything */
const ICON = { main: '!', side: '+', corner: '?', room: 'D', viva: 'V', kiosk: '#', drop: 'IN', methods: 'A', waiting: '...', parcel: 'P' };
const iconMat = {};
function iconMaterial(kind, col) {
  const k = kind + ':' + col; if (iconMat[k]) return iconMat[k];
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  const hex = '#' + new THREE.Color(col).getHexString();
  g.fillStyle = 'rgba(21,16,31,.92)'; g.beginPath(); g.arc(48, 48, 44, 0, 6.29); g.fill();
  g.lineWidth = 7; g.strokeStyle = hex; g.beginPath(); g.arc(48, 48, 40, 0, 6.29); g.stroke();
  g.fillStyle = hex; g.strokeStyle = hex; g.lineWidth = 6; g.lineJoin = 'round';
  if (kind === 'parcel' || kind === 'drop') {
    /* a brown parcel box (a drop box adds a slot) */
    g.fillStyle = '#c9a46a'; g.fillRect(26, 34, 44, 34); g.strokeStyle = '#15101f'; g.lineWidth = 3; g.strokeRect(26, 34, 44, 34);
    g.fillStyle = '#8a6a3a'; g.fillRect(44, 34, 8, 34);
    if (kind === 'drop') { g.fillStyle = '#15101f'; g.fillRect(30, 24, 36, 7); }
  } else if (kind === 'main') { g.beginPath(); for (let q = 0; q < 10; q++) { const r = q % 2 ? 15 : 32, a = -Math.PI / 2 + q * Math.PI / 5; g.lineTo(48 + Math.cos(a) * r, 48 + Math.sin(a) * r); } g.closePath(); g.fill(); }
  else if (kind === 'room') { g.fillRect(32, 22, 32, 50); g.fillStyle = '#15101f'; g.beginPath(); g.arc(57, 48, 3.5, 0, 6.29); g.fill(); }
  else if (kind === 'viva') { g.beginPath(); g.arc(48, 58, 24, Math.PI, 0); g.closePath(); g.fill(); g.fillRect(22, 58, 52, 8); }
  else { g.font = '800 46px "Atkinson Hyperlegible", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ICON[kind] || '!', 48, 51); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  iconMat[k] = new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true });
  return iconMat[k];
}
const icons = [];
function iconAt(n, kind, col, x, y, z, sc) {
  let sp = icons[n]; if (!sp) { sp = new THREE.Sprite(iconMaterial(kind, col)); sp.renderOrder = 1000; icons[n] = sp; scene.add(sp); }
  sp.material = iconMaterial(kind, col); sp.visible = true; sp.position.set(x, y, z); sp.scale.set(sc, sc, 1);
}
function buildWeather() {
  const n = 1800, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 120 - 60; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = Math.random() * 120 - 60; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.18, transparent: true, opacity: 0.7 })); rain.visible = false; scene.add(rain);
  const lg = g.clone(); leaves = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xd9822b, size: 0.5 })); leaves.visible = false; scene.add(leaves);
  const c1 = city.cells.filter(c => c.act === 1)[0];
  const fg = new THREE.BoxGeometry(c1.w * U, 10, c1.h * U); fg.translate((c1.x + c1.w / 2) * U, 5, (c1.y + c1.h / 2) * U);
  fog = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xe6e1f0, transparent: true, opacity: 0.32, depthWrite: false })); scene.add(fog);
}
function loadSky() {
  const loader = new THREE.TextureLoader();
  ['TS27', 'TS28', 'TS29', 'TS30'].forEach(k => { const u = FCV.assetUrl(k); if (u) loader.load(u, t => { t.colorSpace = THREE.SRGBColorSpace; skyTex[k] = t; }); });
  sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, side: THREE.BackSide, fog: false, depthWrite: false })); scene.add(sky);
}
function timeLook(t) {
  /* sun, light and sky by story time (hours) */
  const day = t >= 7 && t < 19, golden = t >= 16 && t < 20, night = t >= 20 || t < 6;
  const skyKey = t >= 5 && t < 9 ? 'TS27' : t >= 16 && t < 19 ? 'TS28' : t >= 19 && t < 21 ? 'TS29' : t >= 21 || t < 5 ? 'TS30' : null;
  if (skyKey && skyTex[skyKey]) { sky.material.map = skyTex[skyKey]; sky.material.color.set(0xffffff); } else { sky.material.map = null; sky.material.color.set(night ? 0x1b1530 : 0x8ccfff); }
  sky.material.needsUpdate = true;
  const a = ((t - 6) / 12) * Math.PI; sun.position.set(Math.cos(a) * 200, Math.max(20, Math.sin(a) * 220), 120);
  sun.intensity = night ? 0.35 : golden ? 1.4 : 2.2; sun.color.set(golden ? 0xffb070 : night ? 0x8090ff : 0xfff3e0);
  hemi.intensity = night ? 0.55 : 1.0; hemi.color.set(night ? 0x5060a0 : 0xfff3e0);
  scene.fog.color.set(night ? 0x1b1530 : golden ? 0xf3b38a : 0xcfe6ff);
  Object.values(districts).forEach(d => { if (d.win) d.win.emissiveIntensity = night ? 1.4 : golden ? 0.4 : 0; });
  return { night };
}
function setTierInternal(t) {
  tier = t || 'high';
  const dpr = Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'medium' ? 1.5 : 1);
  renderer.setPixelRatio(dpr); renderer.shadowMap.enabled = tier === 'high';
  if (HULL) HULL.userData.uT.value = tier === 'high' ? 0.22 : 0.16;
  Object.values(toonCache).forEach(m => { m.userData.uDots.value = tier === 'low' ? 0 : 1; });
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h); if (labelR) labelR.setSize(w, h);
}
function portraitSprite(who) {
  if (portraitMat[who] !== undefined) return portraitMat[who];
  const key = who === 'viva' ? 'img-17' : FCV.portrait(who), u = key && FCV.assetUrl(key);
  if (!u) { portraitMat[who] = null; return null; }
  const t = new THREE.TextureLoader().load(u); t.colorSpace = THREE.SRGBColorSpace;
  portraitMat[who] = new THREE.SpriteMaterial({ map: t, depthTest: true }); return portraitMat[who];
}
const MCOL = { main: 0xffd166, side: 0x19c2b0, corner: 0xb48cff, room: 0xff5fa2, viva: 0xff3d5c, kiosk: 0x25c2b0, drop: 0xc9a46a, methods: 0x9be15d, waiting: 0xffd166 };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3(), tmpC = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
const sprites = [];
/* QAR10-01 and QAR11-01/02: what each marker drew in the last frame (its ring, floating icon, portrait, pin, post box), for
   picking a tap where each part is drawn */
let drawn = [], labelFor = null;
const prj = (x, h, y) => { const v = new THREE.Vector3(x * U, h, y * U).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z }; };
/* a camera-facing sprite of side sc metres centred h metres up: its centre and half side on the screen in px (a sprite
   keeps its size across the view, so it is measured along the camera's own up, not the world's) */
const camV = new THREE.Vector3(), camT = new THREE.Vector3();
function spriteAt(x, h, y, sc) {
  camV.set(x * U, h, y * U).applyMatrix4(camera.matrixWorldInverse); if (camV.z > -camera.near) return null;
  camT.copy(camV); camT.y += sc / 2; camV.applyMatrix4(camera.projectionMatrix); camT.applyMatrix4(camera.projectionMatrix);
  return { x: (camV.x + 1) / 2 * innerWidth, y: (1 - camV.y) / 2 * innerHeight, z: camV.z, half: Math.abs(camT.y - camV.y) / 2 * innerHeight };
}
/* the outline on the screen of a solid's corners (its convex hull), and the signed px distance from a point to an outline
   or a rectangle: below 0 inside, above 0 outside */
function hullOf(pts) {
  pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y); const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function polyGap(sx, sy, poly) {
  let pos = 0, neg = 0, d = Infinity;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ey = b.y - a.y, L = ex * ex + ey * ey, t = L ? Math.max(0, Math.min(1, ((sx - a.x) * ex + (sy - a.y) * ey) / L)) : 0, cr = ex * (sy - a.y) - ey * (sx - a.x); d = Math.min(d, Math.hypot(sx - a.x - t * ex, sy - a.y - t * ey)); if (cr > 0) pos++; else if (cr < 0) neg++; }
  return pos && neg || poly.length < 3 ? d : -d;
}
function rectGap(sx, sy, l, t, r, b) { const dx = Math.max(l - sx, 0, sx - r), dy = Math.max(t - sy, 0, sy - b); return dx || dy ? Math.hypot(dx, dy) : -Math.min(sx - l, r - sx, sy - t, b - sy); }
const POST = { w: 1.2, d: 0.9, h: 2.625 }; /* half width, half depth and height of the drop box as built (body and lid) */
const box3 = new THREE.Box3(), hitP = new THREE.Vector3();
/* every drawn part of every marker under or near (sx, sy): { id, part, layer, z, gap, slack }. layer 3 is the name label (a
   page element over the canvas), 2 the floating icons (drawn without depth), 1 what is depth tested; z is the depth there.
   With all, every part on the screen, however far (for measuring how far a point is from other markers) */
function partsAt(sx, sy, all) {
  const out = [], add = (id, part, layer, z, gap, slack) => { if (gap !== null && (all || gap <= slack)) out.push({ id, part, layer, z, gap, slack }); };
  if (labelFor && labels.obj.visible && labels.el.isConnected) { const r = labels.el.getBoundingClientRect(); if (r.width > 2) add(labelFor, 'label', 3, -1, rectGap(sx, sy, r.left, r.top, r.right, r.bottom), 4); }
  const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera);
  const gp = new THREE.Vector3(), w = raycaster.ray.intersectPlane(ground, gp) ? { x: gp.x / U, y: gp.z / U } : null;
  drawn.forEach(m => {
    /* the icon's disc fills 44/48 of its half side; a far, small one still takes a tap within 10 px of its centre (+4) */
    if (m.icon) { const c = spriteAt(m.x, m.icon.y, m.y, m.icon.sc); if (c) { const r = c.half * 44 / 48; add(m.id, 'icon', 2, c.z, Math.hypot(sx - c.x, sy - c.y) - r, Math.max(10, r) + 4 - r); } }
    if (m.face) { const c = spriteAt(m.x, m.face.y, m.y, m.face.sc); if (c) add(m.id, 'portrait', 1, c.z, rectGap(sx, sy, c.x - c.half, c.y - c.half, c.x + c.half, c.y + c.half), Math.max(10, c.half) + 4 - c.half); }
    /* the pin: an upside-down four-sided cone 8.1 to 9.9 m up, bobbing */
    if (m.pin) { const b = m.pinY || 0, pts = [prj(m.x, 8.1 + b, m.y), prj(m.x, 9.9 + b, m.y - 9), prj(m.x + 9, 9.9 + b, m.y), prj(m.x, 9.9 + b, m.y + 9), prj(m.x - 9, 9.9 + b, m.y)]; if (pts.every(q => q.z <= 1)) add(m.id, 'pin', 1, prj(m.x, 9 + b, m.y).z, polyGap(sx, sy, hullOf(pts)), 6); }
    /* the post box where it is built (4.6 m east of the marker point): ON it when the tap's ray meets the box */
    if (m.box) {
      const bx = m.box.x, bz = m.box.z; box3.min.set(bx - POST.w, 0, bz - POST.d); box3.max.set(bx + POST.w, POST.h, bz + POST.d);
      const pts = []; for (const ax of [-1, 1]) for (const az of [-1, 1]) for (const ay of [0, POST.h]) pts.push(prj((bx + ax * POST.w) / U, ay, (bz + az * POST.d) / U));
      if (pts.every(q => q.z <= 1)) { const on = raycaster.ray.intersectBox(box3, hitP), g = polyGap(sx, sy, hullOf(pts)); add(m.id, 'post', 1, on ? hitP.clone().project(camera).z : prj(bx / U, POST.h / 2, bz / U).z, on ? Math.min(g, -0.01) : Math.max(g, 0.01), 6); }
    }
    /* the ground ring (and the ground inside it), drawn to 3.75 m out; a tap within 10 units (1 m) of it is a near miss */
    if (w) {
      const R = m.ring * 3.75 / 3.4 / U, d = Math.hypot(w.x - m.x, w.y - m.y), ux = d ? (w.x - m.x) / d : 1, uy = d ? (w.y - m.y) / d : 0;
      const e = prj(m.x + ux * R, 0.3, m.y + uy * R), e2 = prj(m.x + ux * (R + 10), 0.3, m.y + uy * (R + 10)), px = Math.hypot(sx - e.x, sy - e.y), z = prj(w.x, 0.3, w.y).z;
      add(m.id, 'ring', 1, z, d <= R ? -Math.max(px, 0.01) : px, Math.hypot(e2.x - e.x, e2.y - e.y));
    }
  });
  return out;
}
function pickMarker(sx, sy) {
  /* a tap ON a drawn part always beats a near miss on another marker's part. Among the parts it is on, the one drawn in front
     wins: the name label, then the floating icons (the nearest on top), then the nearest of the portraits, pins, post boxes
     and rings. With only near misses, the part whose outline is nearest the tap wins */
  const all = partsAt(sx, sy), on = all.filter(p => p.gap <= 0), front = (a, b) => b.layer - a.layer || a.z - b.z;
  const best = on.length ? on.sort(front)[0] : all.sort((a, b) => a.gap - b.gap || front(a, b))[0];
  return best ? { id: best.id, part: best.part, layer: best.layer, z: best.z, on: best.gap <= 0 } : null;
}
function frame(s) {
  const t = s.t / 1000, P = s.player, reduce = s.reduceMotion;
  /* flags drive the story states */
  const f = s.flags;
  for (let n = 1; n <= 7; n++) { const d = districts['act' + n]; if (!d) continue; const target = f.actsDone[n] ? 0 : 1; if (!(n in wave)) wave[n] = target; if (wave[n] !== target) { wave[n] += (target - wave[n]) * Math.min(1, (reduce ? 1 : 1 / 2.4) * 0.016 * 6); if (Math.abs(wave[n] - target) < 0.01) wave[n] = target; } d.ground.userData.uGrey.value = wave[n]; if (d.bld) d.bld.userData.uGrey.value = wave[n]; }
  if (fog) { const tgt = f.fogLifted ? 0 : 0.32; fog.material.opacity += (tgt - fog.material.opacity) * 0.02; fog.visible = fog.material.opacity > 0.01; }
  domeLamps.forEach((l, i) => { const lit = i < 4 ? i < f.domeLinks : f.domeHollow; l.material.color.set(lit ? 0xffd166 : 0x5b5266); l.material.emissive.set(lit ? (i === 4 ? 0x332200 : 0x664400) : 0x000000); });
  lockerDoors.forEach(d => { const ok = f.roomSecured[d.userData.room]; d.material.color.set(ok ? 0x3ddc84 : (f.lockerGrey ? 0x6b6276 : 0x5a4775)); });
  /* time of day and weather per act */
  const w = s.world, look = timeLook(w.time);
  if (s.family) hemi.intensity *= 1.18; /* family mode: no frame under the 30 per cent brightness floor (the Hall plaza) */
  /* round 3: the Hall approach was still 25 per cent in family mode; near the Hall the sky light lifts further, with a warm lamp */
  if (s.family && s.markers) {
    const vm = s.markers.find(m => m.kind === 'viva'), dH = vm ? Math.hypot(vm.x - P.x, vm.y - P.y) : 1e9, k = Math.max(0, Math.min(1, (700 - dH) / 300));
    if (k > 0) { hemi.intensity *= 1 + 0.55 * k; sun.intensity *= 1 + 0.2 * k; }
    if (vm) { if (!dyn.hallLamp) { dyn.hallLamp = new THREE.PointLight(0xffc98a, 0, 90 * U * 10, 1.4); scene.add(dyn.hallLamp); } dyn.hallLamp.position.set(vm.x * U, 18, (vm.y + 80) * U); dyn.hallLamp.intensity = 900 * k; }
  }
  if (clockHands) { const hrs = w.time + (t / 60) % 1 / 60; clockHands.userData.hh.rotation.z = -((hrs % 12) / 12) * Math.PI * 2; clockHands.userData.mh.rotation.z = -((hrs % 1)) * Math.PI * 2; }
  rain.visible = /rain/.test(w.weather) && w.act === 5 && tier !== 'low'; leaves.visible = /leaves/.test(w.weather) && tier !== 'low';
  [rain, leaves].forEach(p => { if (!p.visible) return; p.position.set(P.x * U, 0, P.y * U); const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - (p === rain ? 0.8 : 0.08); if (y < 0) y = 40; a.setY(i, y); } a.needsUpdate = true; });
  /* bike */
  const bike = dyn.bike; bike.position.set(P.x * U, 0, P.y * U); bike.rotation.y = -P.face; bike.rotation.x = reduce ? 0 : P.lean * 0.5; bike.userData.docket.visible = !!P.docket;
  if (bike.userData.halo) { const hs = reduce ? 1 : 1 + Math.sin(t * 3) * 0.08; bike.userData.halo.scale.set(hs, hs, hs); }
  if (bike.userData.stickers && s.state) bike.userData.stickers.forEach((m, q) => { m.visible = !!(s.flags && s.flags.actsDone && s.flags.actsDone[q + 1]); });
  /* traffic */
  let i = 0; s.cars.forEach(c => { if (i >= 40) return; tmpP.set(c.x * U, 0, c.y * U); tmpQ.setFromAxisAngle(up, -Math.atan2(c.dy, c.dx)); tmpS.set(c.van ? 1.1 : 0.85, 1, 1); tmpM.compose(tmpP, tmpQ, tmpS); dyn.cars.setMatrixAt(i, tmpM); dyn.cars.setColorAt(i, tmpC.set(c.c)); i++; });
  dyn.cars.count = i; dyn.cars.instanceMatrix.needsUpdate = true; if (dyn.cars.instanceColor) dyn.cars.instanceColor.needsUpdate = true;
  i = 0; s.peds.forEach(p => { if (i >= 80) return; tmpP.set(p.x * U, reduce ? 0 : Math.abs(Math.sin(t * 6 + p.x)) * 0.15, p.y * U); tmpQ.identity(); tmpS.set(1, 1, 1); tmpM.compose(tmpP, tmpQ, tmpS); dyn.peds.setMatrixAt(i, tmpM); dyn.peds.setColorAt(i, tmpC.set(p.c)); i++; });
  dyn.peds.count = i; dyn.peds.instanceMatrix.needsUpdate = true; if (dyn.peds.instanceColor) dyn.peds.instanceColor.needsUpdate = true;
  i = 0; s.parcels.forEach(p => { if (i >= 200) return; tmpP.set(p.x * U, reduce ? 0 : Math.sin(t * 3 + p.x) * 0.2, p.y * U); tmpQ.setFromAxisAngle(up, t + p.x); tmpS.set(1.4, 1.4, 1.4); tmpM.compose(tmpP, tmpQ, tmpS); dyn.parcels.setMatrixAt(i, tmpM); dyn.parcels.setColorAt(i, tmpC.set(p.hot ? 0xff6a3d : (p.col || 0xc9a46a))); i++; });
  dyn.parcels.count = i; dyn.parcels.instanceMatrix.needsUpdate = true; if (dyn.parcels.instanceColor) dyn.parcels.instanceColor.needsUpdate = true;
  /* markers: rings, pins and portrait sprites; only the nearest is labelled */
  i = 0; let si = 0, pi = 0, ii = 0; const pulse = reduce ? 1 : 1 + Math.sin(t * 4) * 0.08, glow = reduce ? 1 : 0.8 + Math.sin(t * 3) * 0.2;
  const pillar = (x, y, col, rad, hgt, dim) => { if (pi >= 320) return; tmpP.set(x * U, 0, y * U); tmpQ.identity(); tmpS.set(rad, hgt, rad); tmpM.compose(tmpP, tmpQ, tmpS); dyn.pillars.setMatrixAt(pi, tmpM); dyn.pillars.setColorAt(pi, tmpC.set(col).multiplyScalar(dim)); pi++; };
  const seenDrops = {}; drawn = [];
  s.markers.forEach(m => {
    if (i >= 80) return; const col = m.kind === 'room' && m.done ? 0x3ddc84 : m.kind === 'viva' && m.locked ? 0x7a6a88 : MCOL[m.kind] || 0x8a7f99;
    tmpP.set(m.x * U, 0, m.y * U); tmpQ.identity(); tmpS.set(pulse, 1, pulse); tmpM.compose(tmpP, tmpQ, tmpS); dyn.markers.setMatrixAt(i, tmpM); dyn.markers.setColorAt(i, tmpC.set(col));
    dyn.ringsX.setMatrixAt(i, tmpM); dyn.ringsX.setColorAt(i, tmpC.set(col));
    const quiet = m.done || m.inert || (m.kind === 'viva' && m.locked), isObj = s.objective && s.objective.id === m.id;
    if (!m.quiet) pillar(m.x, m.y, col, isObj ? 1.5 : 1, isObj ? 1 : 0.8, (quiet ? 0.35 : 1) * (isObj ? glow * 1.25 : 1));
    const dP = Math.hypot(m.x - P.x, m.y - P.y);
    const dw = { id: m.id, x: m.x, y: m.y, ring: 3.4 * pulse, pin: m.kind === 'main' || !!m.obj, box: null }; drawn.push(dw);
    if (!m.quiet && (isObj || dP < 1300) && ii < 48) { dw.icon = { y: (isObj ? 15 : 13) + (reduce ? 0 : Math.sin(t * 2 + m.x) * 0.4), sc: isObj ? 5.4 : 4.2 }; iconAt(ii++, m.kind, col, m.x * U, dw.icon.y, m.y * U, dw.icon.sc); }
    if (m.kind === 'drop') { seenDrops[m.id] = 1; let db = dyn.dropBoxes[m.id]; if (!db) { db = new THREE.Group(); const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 1.6), toon(0xc9a46a)); bodyM.position.y = 1.2; db.add(bodyM); const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 1.8), toon(ACT_COL[m.act] || 0x8a6a3a)); lid.geometry.translate(0, 0, 0.9); lid.position.set(0, 2.5, -0.9); db.add(lid); db.userData.lid = lid; db.userData.act = m.act; scene.add(db); dyn.dropBoxes[m.id] = db; } db.visible = true; db.position.set(m.x * U + BOX_DX, 0, m.y * U); dw.box = { x: db.position.x, z: db.position.z }; const fl = db.userData.flapAt ? (performance.now() - db.userData.flapAt) / 900 : 1; db.userData.lid.rotation.x = fl < 1 ? -Math.sin(fl * Math.PI) * 1.1 : 0; }
    tmpP.y = reduce ? 0 : Math.sin(t * 3 + m.x) * 0.6; dw.pinY = tmpP.y; tmpS.set(m.kind === 'main' || m.obj ? 1 : 0.0001, 1, 1); tmpM.compose(tmpP, tmpQ, tmpS); dyn.pins.setMatrixAt(i, tmpM); dyn.pins.setColorAt(i, tmpC.set(col)); i++;
    const near = Math.hypot(m.x - P.x, m.y - P.y) < 900;
    if (near && (m.who || m.kind === 'viva') && m.kind !== 'drop' && si < 24) {
      const mat = portraitSprite(m.kind === 'viva' ? 'viva' : m.who); if (mat) { let sp = sprites[si]; if (!sp) { sp = new THREE.Sprite(mat); sprites[si] = sp; scene.add(sp); } sp.material = mat; sp.visible = true; sp.position.set(m.x * U, 6.2 + (reduce ? 0 : Math.sin(t * 2 + m.y) * 0.3), m.y * U); sp.scale.set(4.2, 4.2, 1); si++; dw.face = { y: sp.position.y, sc: 4.2 }; }
    }
  });
  for (let k = si; k < sprites.length; k++) sprites[k].visible = false;
  Object.keys(dyn.dropBoxes).forEach(id => { if (!seenDrops[id]) dyn.dropBoxes[id].visible = false; });
  /* parcels: a short pillar each and an icon when near */
  s.parcels.forEach(p => { const pc = p.hot ? 0xff6a3d : (p.col ? new THREE.Color(p.col).getHex() : 0xc9a46a); pillar(p.x, p.y, pc, 0.6, 0.5, 0.9); if (Math.hypot(p.x - P.x, p.y - P.y) < 800 && ii < 64) iconAt(ii++, 'parcel', pc, p.x * U, 6.5 + (reduce ? 0 : Math.sin(t * 2.5 + p.y) * 0.3), p.y * U, 3.2); });
  for (let k = ii; k < icons.length; k++) icons[k].visible = false;
  dyn.pillars.count = pi; dyn.pillars.instanceMatrix.needsUpdate = true; if (dyn.pillars.instanceColor) dyn.pillars.instanceColor.needsUpdate = true;
  dyn.ringsX.count = i; dyn.ringsX.instanceMatrix.needsUpdate = true; if (dyn.ringsX.instanceColor) dyn.ringsX.instanceColor.needsUpdate = true;
  dyn.markers.count = i; dyn.pins.count = i; dyn.markers.instanceMatrix.needsUpdate = true; dyn.pins.instanceMatrix.needsUpdate = true;
  if (dyn.markers.instanceColor) dyn.markers.instanceColor.needsUpdate = true; if (dyn.pins.instanceColor) dyn.pins.instanceColor.needsUpdate = true;
  const nm = s.markers.filter(m => m.id === s.nearest)[0];
  if (nm && Math.hypot(nm.x - P.x, nm.y - P.y) < 260 && nm.label) { labels.el.textContent = nm.label; labels.obj.position.set(nm.x * U, 3.2, nm.y * U + 4.6); labels.obj.visible = true; labelFor = nm.id; } else { labels.obj.visible = false; labelFor = null; }
  /* Kerb Inspectors: amber beacons at 1.5 Hz (no faster than 3 a second) */
  i = 0; const blink = reduce ? 1 : (Math.floor(t * 3) % 2);
  s.inspectors.forEach(p => { if (i >= 6) return; tmpP.set(p.x * U, 0, p.y * U); tmpQ.setFromAxisAngle(up, -p.a); tmpS.set(1, 1, 1); tmpM.compose(tmpP, tmpQ, tmpS); dyn.insp.setMatrixAt(i, tmpM); tmpS.setScalar(blink ? 1 : 0.001); tmpM.compose(tmpP, tmpQ, tmpS); dyn.beacons.setMatrixAt(i, tmpM); i++; });
  dyn.insp.count = i; dyn.beacons.count = i; dyn.insp.instanceMatrix.needsUpdate = true; dyn.beacons.instanceMatrix.needsUpdate = true;
  /* the Animal by state */
  if (s.animal) { const sz = s.animal.size === 'big' ? 2 : 1; dyn.animal.position.set(s.animal.x * U, 0, s.animal.y * U); dyn.animal.scale.set(sz, sz, sz); dyn.animal.rotation.y = -(s.animal.face || 0); }
  /* route and target */
  const rp = dyn.route.geometry.attributes.position, route = s.route || [];
  for (let k = 0; k < 10; k++) { const p = route[Math.min(k, route.length - 1)]; rp.setXYZ(k, p ? p.x * U : 0, 0.4, p ? p.y * U : 0); }
  rp.needsUpdate = true; dyn.route.visible = route.length > 1; if (dyn.route.visible) dyn.route.computeLineDistances();
  dyn.target.visible = !!s.target; if (s.target) dyn.target.position.set(s.target.x * U, 0.3, s.target.y * U);
  /* camera: 30 degree FOV, 54 degree pitch, north up, damped follow with look-ahead; family mode 1.25x closer */
  const dist = (s.family ? 120 : 150) * Math.max(1, Math.min(1.7, 0.95 / Math.max(0.3, camera.aspect))), look2 = reduce ? 0 : 0.6;
  cam.tx = P.x * U + Math.cos(P.face) * Math.min(P.speed, 400) * U * look2 * 0.06; cam.tz = P.y * U + Math.sin(P.face) * Math.min(P.speed, 400) * U * look2 * 0.06;
  const k = reduce ? 1 : 0.08; cam.x += (cam.tx - cam.x) * k; cam.z += (cam.tz - cam.z) * k;
  /* round 4 (item 65d): a 65 degree pitch by default (fewer markers behind buildings); T gives the straight-down view */
  const topDown = !!(s.state && s.state.settings && s.state.settings.topDown), pitch = (topDown ? 89.5 : 65) * Math.PI / 180, dd = topDown ? dist * 1.2 : dist;
  let cx = cam.x, cz = cam.z, h = dd * Math.sin(pitch), back = dd * Math.cos(pitch);
  if (cine) { const p = Math.min(1, (performance.now() - cine.t0) / cine.ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; cx = cine.fx + (cine.tx - cine.fx) * e; cz = cine.fz + (cine.tz - cine.fz) * e; h += Math.sin(p * Math.PI) * 120; if (p >= 1) cine = null; }
  camera.position.set(cx, h, cz + back); camera.lookAt(cx, 0, cz);
  /* item 65b: fade what stands between the camera and the player or the next marker */
  const fadeIds = [], cp = [cx, h, cz + back];
  segHits(cp, [P.x * U, 1.2, P.y * U], fadeIds);
  if (s.objective) segHits(cp, [s.objective.x * U, 0.6, s.objective.y * U], fadeIds);
  for (let q = 0; q < 8; q++) FADE.value[q] = q < fadeIds.length ? fadeIds[q] : -1;
  fadedNow = fadeIds.slice(0, 8); lastCam = cp;
  sun.target.position.set(cx, 0, cz); sun.position.add(new THREE.Vector3(cx, 0, cz)); sun.shadow.camera.updateProjectionMatrix();
  sky.position.set(cx, 0, cz);
  /* render */
  renderer.info.reset();
  if (tier === 'high' && composer) { bloom.strength = look.night ? 0.75 : 0.55; composer.render(); } else renderer.render(scene, camera);
  labelR.domElement.style.visibility = s.paused ? 'hidden' : '';
  if (!s.paused) {
    labelR.render(scene, camera);
    /* round 3: the nearest marker's label never runs off the edge of a phone screen */
    if (labels.obj && labels.obj.visible) { const r = labels.el.getBoundingClientRect(), dx = Math.min(0, window.innerWidth - 8 - r.right) + Math.max(0, 8 - r.left); if (dx) labels.el.style.transform += ' translateX(' + Math.round(dx) + 'px)'; }
  }
  autoTier(!!s.paused);
}
/* Tier: only frames drawn while the city is live count (behind a sheet the loop draws at 30 fps on purpose).
   Two slow windows in a row step down; about 20 s of fast windows step back up, never above the starting tier. */
let slowWins = 0, fastSince = 0, wasPaused = true, tierCap = 'high', tierLog = [], lowSlowMs = 0;
function autoTier(paused) {
  const now = performance.now(), dt = now - lastStep; lastStep = now;
  if (paused) { wasPaused = true; frames = []; return; }
  if (wasPaused) { wasPaused = false; return; } /* the first live frame after a sheet carries the 33 ms gap */
  if (dt > 0 && dt < 500) frames.push(dt); if (frames.length < 240) return;
  const sorted = frames.slice().sort((a, b) => a - b), p90 = sorted[Math.floor(sorted.length * 0.9)], winMs = frames.reduce((a, b) => a + b, 0); frames = [];
  const pref = window.Game && Game.state && Game.state.settings.graphics;
  if (pref && pref !== 'auto') return;
  const order = ['high', 'medium', 'low'], idx = order.indexOf(tier);
  /* QAD3-m11: already on Low and still slower than 20 fps (p90 over 50 ms) for 10 s: Simple graphics for this session
     (not saved: the same save on a Mac keeps its 3D city) */
  if (tier === 'low' && p90 > 50) { lowSlowMs += winMs; if (lowSlowMs >= 10000 && window.Game && Game.autoSimple) { lowSlowMs = 0; tierLog.push(Math.round(now / 1000) + 's low>simple p90 ' + p90.toFixed(1)); Game.autoSimple(); return; } } else lowSlowMs = 0;
  if (p90 > 22) { fastSince = 0; slowWins++; if (slowWins >= 2 && idx < 2) { slowWins = 0; tierLog.push(Math.round(now / 1000) + 's ' + tier + '>' + order[idx + 1] + ' p90 ' + p90.toFixed(1)); setTierInternal(order[idx + 1]); } return; }
  slowWins = 0;
  if (p90 < 14 && idx > order.indexOf(tierCap)) {
    if (!fastSince) fastSince = now;
    else if (now - fastSince >= 20000) { fastSince = 0; tierLog.push(Math.round(now / 1000) + 's ' + tier + '>' + order[idx - 1] + ' p90 ' + p90.toFixed(1)); setTierInternal(order[idx - 1]); }
  } else fastSince = 0;
}

R = {
  name: '3d',
  async init(cv, c, opts = {}) {
    canvas = cv; city = c; tier = opts.tier || 'high'; tierCap = tier;
    const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no WebGL2');
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.info.autoReset = false; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xcfe6ff, 140, 420);
    camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
    grad = toonGradient(); HULL = addFade(hullMat(0.22)); BOXES = []; fadedNow = []; toonCache = {}; districts = {}; wave = {}; domeLamps = []; lockerDoors = [];
    hemi = new THREE.HemisphereLight(0xfff3e0, 0x4a3366, 1.0); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff3e0, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 600 }); scene.add(sun, sun.target);
    loadSky(); buildCity(); buildDynamic(); buildWeather();
    labelR = new CSS2DRenderer(); labelR.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1'; labelR.domElement.setAttribute('aria-hidden', 'true'); document.body.appendChild(labelR.domElement);
    const el = document.createElement('div'); el.style.cssText = 'background:rgba(21,16,31,.88);color:#fff3e0;font:700 15px "Atkinson Hyperlegible",sans-serif;padding:4px 10px;border-radius:6px;white-space:nowrap;max-width:min(360px, 92vw);overflow:hidden;text-overflow:ellipsis';
    labels.el = el; labels.obj = new CSS2DObject(el); scene.add(labels.obj);
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.4, 0.82); composer.addPass(bloom); composer.addPass(new OutputPass());
    setTierInternal(tier); window.addEventListener('resize', resize);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost++; if (window.Game) setTimeout(() => Game.contextLost(lost), 50); }, false);
    renderer.compile(scene, camera);
    return R;
  },
  frame(s) { frame(s); },
  cine(cmd) { if (cmd && cmd.kind === 'crane' && !(window.Game && Game.state.settings.reduceMotion)) cine = { fx: cam.x, fz: cam.z, tx: cmd.to.x * U, tz: cmd.to.y * U, ms: cmd.ms || 1600, t0: performance.now() }; },
  setTier(t) { const v = t === 'auto' || !t ? (Math.min(innerWidth, innerHeight) < 600 ? 'low' : 'high') : t === 'simple' ? 'low' : t; tierCap = v; slowWins = 0; fastSince = 0; setTierInternal(v); },
  tierLog() { return tierLog.slice(-6); },
  snapCam(x, y) { cam.x = cam.tx = x * U; cam.z = cam.tz = y * U; },
  toWorld(sx, sy) {
    const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera);
    const p = new THREE.Vector3(); raycaster.ray.intersectPlane(ground, p); return { x: p.x / U, y: p.z / U };
  },
  pick(sx, sy) { return pickMarker(sx, sy); },
  /* for the checks: a screen point where this marker's given part is what a tap picks (not covered by another's), or null */
  visiblePoint(id, which) {
    const m = drawn.find(x => x.id === id); if (!m) return null; const pts = [];
    const ring = (rad, h) => { for (let k = 0; k <= 3; k++) for (let a = 0; a < 16; a++) { const rr = rad * k / 3, an = a * Math.PI / 8; pts.push(prj(m.x + Math.cos(an) * rr, h, m.y + Math.sin(an) * rr)); } };
    const sprite = (h, sc) => { const c = spriteAt(m.x, h, m.y, sc); if (!c) return; const r = c.half * 0.8; for (let k = 0; k <= 3; k++) for (let a = 0; a < 12; a++) pts.push({ x: c.x + Math.cos(a * Math.PI / 6) * r * k / 3, y: c.y + Math.sin(a * Math.PI / 6) * r * k / 3, z: c.z }); };
    if (which === 'icon' && m.icon) sprite(m.icon.y, m.icon.sc);
    else if (which === 'portrait' && m.face) sprite(m.face.y, m.face.sc);
    else if (which === 'post' && m.box) { for (let h = 0.3; h <= 2.5; h += 0.4) for (const dx of [0, -0.6, 0.6, -1, 1]) pts.push(prj((m.box.x + dx) / U, h, (m.box.z + POST.d) / U)); for (const dz of [0, -0.5, 0.5]) pts.push(prj(m.box.x / U, POST.h, (m.box.z + dz) / U)); }
    else if (which === 'pin' && m.pin) for (let h = 8.6; h <= 9.8; h += 0.3) pts.push(prj(m.x, h + (m.pinY || 0), m.y));
    else if (which === 'ring') ring(m.ring / U, 0.3);
    else if (which === 'label' && labelFor === id && labels.obj.visible) { const r = labels.el.getBoundingClientRect(); for (let i = 1; i < 6; i++) pts.push({ x: r.left + r.width * i / 6, y: (r.top + r.bottom) / 2, z: 0 }); }
    /* of the points a tap there picks this part on, the one clearest of every other marker's drawn part (up to 24 px), then the
       deepest inside the part: a floating icon bobs and a ring pulses, so a point at the edge of another marker's part can be
       that marker's a moment later */
    let best = null;
    for (const q of pts) {
      if (q.z > 1 || q.x < 6 || q.y < 60 || q.x > innerWidth - 6 || q.y > innerHeight - 6) continue; const el = document.elementFromPoint(q.x, q.y); if (el && el.tagName !== 'CANVAS' && which !== 'label') continue;
      const h = pickMarker(q.x, q.y); if (!(h && h.id === id && h.part === which)) continue;
      let clear = 24, own = 0; for (const p of partsAt(q.x, q.y, true)) { if (p.id !== id) clear = Math.min(clear, p.gap); else if (p.part === which) own = p.gap; }
      const score = [h.on ? 1 : 0, Math.round(clear), -own];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && (score[1] > best.score[1] || (score[1] === best.score[1] && score[2] > best.score[2])))) best = { x: q.x, y: q.y, score };
    }
    return best ? { x: best.x, y: best.y } : null;
  },
  partsOf(id) { const m = drawn.find(x => x.id === id); if (!m) return null; const o = { ring: prj(m.x, 0, m.y) }; if (m.icon) o.icon = prj(m.x, m.icon.y, m.y); if (m.face) o.portrait = prj(m.x, m.face.y, m.y); if (m.box) o.post = prj(m.box.x / U, POST.h / 2, m.box.z / U); if (m.pin) o.pin = prj(m.x, 9 + (m.pinY || 0), m.y); if (labelFor === id && labels.obj.visible) { const r = labels.el.getBoundingClientRect(); o.label = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; } return o; },
  labelRect() { if (!labels.obj || !labels.obj.visible || !labels.el || !labels.el.isConnected) return null; const r = labels.el.getBoundingClientRect(); return r.width > 2 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; },
  toScreen(x, y, yUp) { const v = new THREE.Vector3(x * U, yUp || 0, y * U).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1 }; },
  /* item 65c: is the ring at (x, y) hidden behind a building from the camera? */
  occluded(x, y) { return segHits(lastCam, [x * U, 0.6, y * U]); },
  fadeState() { return { faded: fadedNow.slice(), boxes: BOXES.length, pillars: dyn.pillars ? dyn.pillars.count : 0, ringsX: dyn.ringsX ? dyn.ringsX.count : 0, icons: icons.filter(x => x.visible).length, pillarDepthTest: dyn.pillars ? dyn.pillars.material.depthTest : null, iconDepthTest: icons[0] ? icons[0].material.depthTest : null, cam: lastCam.slice() }; },
  flapDrop(act) { Object.keys(dyn.dropBoxes || {}).forEach(id => { const db = dyn.dropBoxes[id]; if (db.userData.act === act || act === 'all') db.userData.flapAt = performance.now(); }); },
  screenshot() { try { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); } catch (e) { return null; } },
  stats() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tier }; },
  tier() { return tier; },
  dispose() {
    window.removeEventListener('resize', resize);
    if (labelR && labelR.domElement.parentNode) labelR.domElement.parentNode.removeChild(labelR.domElement);
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
    renderer.dispose(); sprites.length = 0; icons.length = 0; Object.keys(iconMat).forEach(k => delete iconMat[k]);
  }
};
export default R;
