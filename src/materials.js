// Procedural PBR materials. All textures generated on the fly via Canvas so
// nothing needs to be downloaded.  Albedo + normal + roughness + AO per material.

import * as THREE from 'three';

const cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// ---- noise helpers ------------------------------------------------------

function valueNoise(size, scale, seed = 1) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const cells = Math.max(2, Math.floor(size / scale));
  const grid = new Float32Array(cells * cells);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < grid.length; i++) {
    s = (s * 9301 + 49297) % 233280;
    grid[i] = s / 233280;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const a = lerp(grid[y0 * cells + x0], grid[y0 * cells + x1], tx);
      const b = lerp(grid[y1 * cells + x0], grid[y1 * cells + x1], tx);
      const v = lerp(a, b, ty);
      const i = (y * size + x) * 4;
      const g = Math.floor(v * 255);
      data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function fbm(size, seed = 1, octaves = 4) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.5;
  let scale = 8;
  for (let o = 0; o < octaves; o++) {
    ctx.globalCompositeOperation = o === 0 ? 'source-over' : 'overlay';
    ctx.globalAlpha = 0.6 / (o + 1);
    ctx.drawImage(valueNoise(size, scale, seed + o * 17), 0, 0);
    scale *= 0.5;
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  return c;
}

// Derive a normal map from a grayscale height canvas (Sobel).
function normalFromHeight(src, strength = 1.2) {
  const size = src.width;
  const sctx = src.getContext('2d');
  const h = sctx.getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => {
    x = (x + size) % size; y = (y + size) % size;
    return h[(y * size + x) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y),                         r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i]     = Math.floor((nx * 0.5 + 0.5) * 255);
      d[i + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      d[i + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function toTexture(c, repeat = 1, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function toLinearTexture(c, repeat = 1, aniso = 8) {
  const t = toTexture(c, repeat, aniso);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---- texture generators -------------------------------------------------

function panelConcrete(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  // Base concrete color with blotches
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#b9b2a4');
  grad.addColorStop(1, '#9a9283');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
  // Mottle
  ctx.globalAlpha = 0.35;
  ctx.drawImage(fbm(size, 3, 5), 0, 0);
  ctx.globalAlpha = 1;
  // Panel seams (soviet prefab panel house): horizontal every row, vertical segments
  ctx.strokeStyle = '#3d372c'; ctx.lineWidth = 3;
  const rows = 4, cols = 3;
  for (let r = 1; r < rows; r++) {
    const y = (r * size / rows) | 0;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? size / (cols * 2) : 0;
    for (let v = 0; v <= cols; v++) {
      const x = (offset + v * size / cols) % size;
      const y0 = (r * size / rows) | 0, y1 = ((r + 1) * size / rows) | 0;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    }
  }
  // Stains near seams
  ctx.globalAlpha = 0.25;
  for (let r = 1; r < rows; r++) {
    const y = (r * size / rows) | 0;
    const g = ctx.createLinearGradient(0, y, 0, y + 40);
    g.addColorStop(0, 'rgba(45,40,30,0.55)');
    g.addColorStop(1, 'rgba(45,40,30,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y, size, 40);
  }
  ctx.globalAlpha = 1;
  return c;
}

function plasterTexture(size = 512, tint = '#c8b897') {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = tint; ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(fbm(size, 7, 3), 0, 0);
  ctx.globalAlpha = 0.18;
  ctx.drawImage(valueNoise(size, 2, 11), 0, 0); // fine grain
  ctx.globalAlpha = 1;
  // Weathering stains
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * size, y = Math.random() * size * 0.4;
    const r = 60 + Math.random() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(60,50,40,0.6)');
    g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  return c;
}

function brickTexture(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#5a3a2f'; ctx.fillRect(0, 0, size, size); // mortar
  const rows = 16, bw = size / 8, bh = size / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) ? bw / 2 : 0;
    for (let x = -bw; x < size + bw; x += bw) {
      const shade = 140 + Math.random() * 55;
      const red = shade, g = shade * 0.55, b = shade * 0.45;
      ctx.fillStyle = `rgb(${red|0},${g|0},${b|0})`;
      ctx.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  ctx.globalAlpha = 0.35;
  ctx.drawImage(fbm(size, 5, 4), 0, 0);
  ctx.globalAlpha = 1;
  return c;
}

function asphaltTexture(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a2c'; ctx.fillRect(0, 0, size, size);
  // Speckle (aggregate)
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    d[i]     = Math.max(0, Math.min(255, d[i]     + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  // Cracks
  ctx.strokeStyle = 'rgba(10,10,10,0.6)'; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    const steps = 8 + Math.random() * 10;
    for (let s = 0; s < steps; s++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Oil stains
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 30 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,8,6,0.55)');
    g.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

function dirtTexture(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#5b4a36'; ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.55; ctx.drawImage(fbm(size, 4, 7), 0, 0);
  ctx.globalAlpha = 1;
  return c;
}

function grassGroundTexture(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#3f5a2a'; ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 50;
    d[i]     = Math.max(30, Math.min(120, d[i]     + n));
    d[i + 1] = Math.max(60, Math.min(160, d[i + 1] + n));
    d[i + 2] = Math.max(20, Math.min(90,  d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.2; ctx.drawImage(fbm(size, 3, 3), 0, 0);
  return c;
}

function leafAlphaTexture(size = 128) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  // Cluster of 20-30 tiny leaf blobs, alpha tested
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 6 + Math.random() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = 90 + Math.random() * 30;
    const l = 30 + Math.random() * 15;
    g.addColorStop(0, `hsla(${hue}, 55%, ${l + 10}%, 1)`);
    g.addColorStop(0.7, `hsla(${hue}, 55%, ${l}%, 0.9)`);
    g.addColorStop(1, 'hsla(100, 50%, 20%, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

function grassBladeTexture(size = 64) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const w = size / 4;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = `hsl(${95 + Math.random() * 20}, 55%, ${30 + Math.random() * 15}%)`;
    ctx.beginPath();
    const bx = size / 2 + (i - 1) * w * 0.8;
    ctx.moveTo(bx - w / 2, size);
    ctx.lineTo(bx + w / 2, size);
    ctx.lineTo(bx + (Math.random() - 0.5) * 10, size * 0.1);
    ctx.closePath(); ctx.fill();
  }
  return c;
}

// ---- public material factories -----------------------------------------

export function getPanelMaterial() {
  if (cache.has('panel')) return cache.get('panel');
  const h = panelConcrete(512);
  const n = normalFromHeight(h, 1.4);
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(h, 1),
    normalMap: toLinearTexture(n, 1),
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.88,
    metalness: 0.02,
  });
  cache.set('panel', mat); return mat;
}

export function getPlasterMaterial(tint) {
  const key = 'plaster_' + (tint || 'default');
  if (cache.has(key)) return cache.get(key);
  const h = plasterTexture(512, tint);
  const n = normalFromHeight(h, 0.9);
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(h, 1),
    normalMap: toLinearTexture(n, 1),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.95, metalness: 0.0,
  });
  cache.set(key, mat); return mat;
}

export function getBrickMaterial() {
  if (cache.has('brick')) return cache.get('brick');
  const h = brickTexture(512);
  const n = normalFromHeight(h, 1.8);
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(h, 1),
    normalMap: toLinearTexture(n, 1),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.92, metalness: 0.0,
  });
  cache.set('brick', mat); return mat;
}

export function getAsphaltMaterial(repeat = 8) {
  const key = 'asphalt_' + repeat;
  if (cache.has(key)) return cache.get(key);
  const h = asphaltTexture(512);
  const n = normalFromHeight(h, 0.6);
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(h, repeat),
    normalMap: toLinearTexture(n, repeat),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.82, metalness: 0.03,
  });
  cache.set(key, mat); return mat;
}

export function getDirtMaterial(repeat = 4) {
  const key = 'dirt_' + repeat;
  if (cache.has(key)) return cache.get(key);
  const h = dirtTexture(256);
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(h, repeat), roughness: 0.98, metalness: 0.0,
  });
  cache.set(key, mat); return mat;
}

export function getGrassGroundMaterial(repeat = 6) {
  const key = 'grass_' + repeat;
  if (cache.has(key)) return cache.get(key);
  const h = grassGroundTexture(256);
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(h, repeat), roughness: 0.97, metalness: 0.0, color: 0xffffff,
  });
  cache.set(key, mat); return mat;
}

export function getWindowMaterial(envMap) {
  if (cache.has('window')) return cache.get('window');
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x223344, roughness: 0.1, metalness: 0.1,
    envMap: envMap || null, envMapIntensity: 1.0,
    transmission: 0.0, clearcoat: 0.3, clearcoatRoughness: 0.1,
  });
  cache.set('window', mat); return mat;
}

export function makeCarBodyMaterial(color, envMap) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.8, roughness: 0.3,
    envMap: envMap || null, envMapIntensity: 1.0,
    clearcoat: 0.6, clearcoatRoughness: 0.25,
  });
}

export function makeCarGlassMaterial(envMap) {
  return new THREE.MeshPhysicalMaterial({
    color: 0x222a33, metalness: 0.05, roughness: 0.05,
    transmission: 0.85, thickness: 0.2, ior: 1.45,
    transparent: true, opacity: 0.5,
    envMap: envMap || null, envMapIntensity: 1.0,
  });
}

export function getLeafMaterial() {
  if (cache.has('leaf')) return cache.get('leaf');
  const tex = toTexture(leafAlphaTexture(128), 1);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, alphaTest: 0.4,
    side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
    color: 0xffffff,
  });
  cache.set('leaf', mat); return mat;
}

export function getGrassBladeMaterial() {
  if (cache.has('blade')) return cache.get('blade');
  const tex = toTexture(grassBladeTexture(64), 1);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, alphaTest: 0.5,
    side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
  });
  cache.set('blade', mat); return mat;
}

export function getBarkMaterial() {
  if (cache.has('bark')) return cache.get('bark');
  const h = fbm(256, 4, 5);
  const n = normalFromHeight(h, 1.5);
  // darken bark
  const c = canvas(256), ctx = c.getContext('2d');
  ctx.fillStyle = '#4a3525'; ctx.fillRect(0, 0, 256, 256);
  ctx.globalAlpha = 0.5; ctx.drawImage(h, 0, 0); ctx.globalAlpha = 1;
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(c, 1),
    normalMap: toLinearTexture(n, 1),
    roughness: 0.95, metalness: 0,
  });
  cache.set('bark', mat); return mat;
}

export function getMetalMaterial(color = 0x888888) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.8 });
}

export function getRoofMaterial() {
  if (cache.has('roof')) return cache.get('roof');
  const h = fbm(256, 3, 4);
  const c = canvas(256), ctx = c.getContext('2d');
  ctx.fillStyle = '#484038'; ctx.fillRect(0, 0, 256, 256);
  ctx.globalAlpha = 0.5; ctx.drawImage(h, 0, 0); ctx.globalAlpha = 1;
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(c, 2), roughness: 0.75, metalness: 0.3,
  });
  cache.set('roof', mat); return mat;
}

export function getCurbMaterial() {
  if (cache.has('curb')) return cache.get('curb');
  const mat = new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.8, metalness: 0.05 });
  cache.set('curb', mat); return mat;
}
