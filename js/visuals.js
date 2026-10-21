const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';

// ---------- Particle swirl (video test backdrop) ----------
// A 3D vortex filmed by a slowly orbiting camera: comets spiral down a thick,
// funnelled disc into a glowing core, circled by a tilted accretion ring whose
// near side crosses in front of the core. Real perspective, fog, soft near
// particles and foreground bokeh sell the depth. Speed follows the throughput.
// Cheap per frame: backdrop and vignette+grain are pre-rendered, glows are
// sprites, and comets are batched into one stroke per (depth side, width,
// alpha, colour) bucket, drawn far to near.
export function createSwirl(canvas) {
  const ctx = canvas.getContext('2d');
  const PALETTE = [[77, 141, 255], [124, 58, 237], [56, 189, 248], [167, 139, 250], [37, 99, 235], [226, 232, 240], [99, 102, 241], [148, 163, 184]];
  const CORE = [226, 236, 255];
  const RO = 2.6, YC = -0.5, FC = 0.3, RING = 0.42, BODY = 0.15, DIST = 2.7, EL = 0.85, TAU = Math.PI * 2; // world units
  const NW = 16, NA = 16, W0 = 0.45, A0 = 0.028, WS = 1.4, AS = 1.4, IW = 1 / Math.log(WS), IA = 1 / Math.log(AS);
  const WL = Array.from({ length: NW }, (_, i) => W0 * WS ** i), AL = Array.from({ length: NA }, (_, i) => Math.min(1, A0 * AS ** i));
  const mix = (c, d, f) => `rgb(${c.map((v, i) => Math.round(v + (d[i] - v) * f))})`;
  // the palette, then three white-hot tints shared near the core (few colours = few stroke batches), then spark white
  const COLS = PALETTE.map((c) => `rgb(${c})`).concat([0, 1, 2].map((i) => mix(PALETTE[i], CORE, 0.72)), 'rgb(240,245,255)');
  const HOT = [8, 9, 10, 9, 8, 10, 9, 8], SPARK = COLS.length - 1;
  const smooth = (e0, e1, x) => { const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
  const funnel = (r, h) => (YC * FC) / (r + FC) + 0.05 * r * r + h * (0.03 + 0.1 * r); // a bowl that sinks into a throat at the core, thicker outside
  const layer = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return [c, c.getContext('2d')]; };
  function sprite(size, stops) {
    const [c, g] = layer(size, size), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
  }
  const HALO = sprite(128, [[0, 'rgba(226,236,255,0.9)'], [0.12, 'rgba(170,180,255,0.5)'], [0.4, 'rgba(99,102,241,0.16)'], [1, 'rgba(99,102,241,0)']]);
  const BODYS = sprite(128, [[0, 'rgba(250,252,255,1)'], [0.35, 'rgba(214,222,255,1)'], [0.7, 'rgba(140,146,236,0.9)'], [0.88, 'rgba(84,80,190,0.5)'], [1, 'rgba(60,50,160,0)']]);
  const BOKEH = PALETTE.map((c) => sprite(64, [[0, `rgba(${c},0.55)`], [0.72, `rgba(${c},0.7)`], [0.86, `rgba(${c},0.45)`], [1, `rgba(${c},0)`]]));
  let W = 0, H = 0, F = 0, M = 0, parts = [], ring = [], bokeh = [], raf = 0, intensity = 0.35, target = 0.35, t = 0, ct = 0, flare = 0, last = 0;
  let back = null, over = null, keys = new Uint32Array(0), P = new Float32Array(0), px = 0, py = 0, pz = 0;
  const band = new Float32Array(49 * 3), tilt = { x: 0, y: 0, tx: 0, ty: 0, b0: null };
  function spawn(p, anywhere) {
    p.r = RO * Math.sqrt(anywhere ? Math.random() * 1.1 : 0.2 + Math.random() * 0.9); p.f = anywhere ? 1 : 0;
    p.a = Math.random() * TAU; p.h = Math.random() + Math.random() - 1;
    p.w = (0.35 + Math.random()) * 0.008; p.v = 0.7 + Math.random() * 0.6;
    p.c = (Math.random() * PALETTE.length) | 0; p.s = 0.4 + Math.random() * 1.4; p.b = Math.random();
    p.tw = Math.random() * TAU; p.spark = Math.random() < 0.18;
    return p;
  }
  function makeBackdrop() { // deep background, lighter toward the core, with nebula light; oversized for parallax
    const [b, g] = layer(W + 2 * M, H + 2 * M), x = W / 2 + M, y = H * 0.48 + M, R = Math.hypot(W, H) / 1.5;
    let gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, '#161c2b'); gr.addColorStop(0.45, '#0f131c'); gr.addColorStop(1, '#07090d');
    g.fillStyle = gr; g.fillRect(0, 0, b.width, b.height);
    g.globalCompositeOperation = 'lighter';
    for (const [rgb, ox, oy] of [['176,122,85', -0.32, -0.26], ['111,132,102', 0.34, 0.06], ['201,183,156', -0.12, 0.3]]) {
      const bx = x + ox * W, by = y + oy * H; gr = g.createRadialGradient(bx, by, 0, bx, by, Math.max(W, H) * 0.5);
      gr.addColorStop(0, `rgba(${rgb},0.07)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, b.width, b.height);
    }
    return b;
  }
  function makeOverlay() { // vignette with film grain baked in; drawn a few px off each frame so the grain shimmers
    const [o, g] = layer(W + 4, H + 4), v = g.createRadialGradient(W / 2 + 2, H / 2 + 2, Math.min(W, H) * 0.3, W / 2 + 2, H / 2 + 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(6,8,12,0)'); v.addColorStop(1, 'rgba(6,8,12,0.78)');
    g.fillStyle = v; g.fillRect(0, 0, o.width, o.height);
    const [n, nx] = layer(128, 128), img = nx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = (Math.random() * 255) | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    nx.putImageData(img, 0, 0);
    g.globalAlpha = 0.045; g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, o.width, o.height);
    return o;
  }
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!W || !H) return;
    F = Math.max(W * 1.1, H * 0.6); M = Math.round(Math.max(W, H) * 0.12);
    const n = Math.round(Math.min(1000, (W * H) / 360)), nr = Math.round(n * 0.12);
    parts = Array.from({ length: n }, () => spawn({}, true));
    ring = Array.from({ length: nr }, () => ({ a: Math.random() * TAU, r: RING * (0.85 + Math.random() * 0.35), h: (Math.random() - 0.5) * 0.04, w: 0.012 + Math.random() * 0.01, c: [0, 2, 3, 5][(Math.random() * 4) | 0], s: 0.5 + Math.random(), b: Math.random(), tw: Math.random() * TAU, spark: Math.random() < 0.3 }));
    bokeh = Array.from({ length: 18 }, () => ({ r: 0.5 + Math.random() * 2.2, a: Math.random() * TAU, y: -0.4 + Math.random() * 1.6, w: 0.0006 + Math.random() * 0.0012, size: 0.05 + Math.random() * 0.1, c: (Math.random() * PALETTE.length) | 0 }));
    keys = new Uint32Array((n + nr) * 3); P = new Float32Array((n + nr) * 6);
    back = makeBackdrop(); over = makeOverlay();
  }
  const onTilt = (e) => {
    if (e.beta == null || e.gamma == null) return;
    tilt.b0 = tilt.b0 == null ? e.beta : tilt.b0 + (e.beta - tilt.b0) * 0.02; // slowly re-centre on how the phone is held
    tilt.tx = clamp(e.gamma / 40) * 0.3; tilt.ty = clamp((e.beta - tilt.b0) / 30) * 0.14;
  };
  function frame(now) {
    const k = last ? Math.min(3, (now - last) / 16.667) : 1; last = now;
    t += (0.004 + intensity * 0.01) * k; ct += k / 60;
    intensity += (target - intensity) * 0.03 * k;
    flare *= Math.pow(0.965, k);
    tilt.x += (tilt.tx - tilt.x) * 0.05 * k; tilt.y += (tilt.ty - tilt.y) * 0.05 * k;
    if (!W || !H) { if (raf) raf = requestAnimationFrame(frame); return; }

    // camera: orbits and tilts around a slowly wandering look-at point, with a little roll
    const az = 0.7 * Math.sin(ct * 0.045) + 0.25 * Math.sin(ct * 0.11 + 1) + tilt.x, el = EL + 0.13 * Math.sin(ct * 0.07) + tilt.y;
    const roll = 0.12 * Math.sin(ct * 0.05 + 2), cr = Math.cos(roll), sr = Math.sin(roll);
    const sa = Math.sin(az), ca = Math.cos(az), se = Math.sin(el), ce = Math.cos(el);
    const lx = Math.sin(ct * 0.09) * 0.08, ly = YC * 0.6, lz = Math.cos(ct * 0.07) * 0.08;
    const ex = lx + DIST * ce * sa, ey = ly + DIST * se, ez = lz + DIST * ce * ca;
    const fx = -ce * sa, fy = -se, fz = -ce * ca; // forward; right = (ca, 0, -sa), up = (-sa se, ce, -ca se), rolled:
    const rx = ca * cr + sa * se * sr, ry = -ce * sr, rz = -sa * cr + ca * se * sr;
    const ux = ca * sr - sa * se * cr, uy = ce * cr, uz = -sa * sr - ca * se * cr;
    const SX = W / 2, SY = H * 0.48;
    const proj = (x, y, z) => { x -= ex; y -= ey; z -= ez; pz = x * fx + y * fy + z * fz; const s = F / pz; px = SX + (x * rx + y * ry + z * rz) * s; py = SY - (x * ux + y * uy + z * uz) * s; };
    proj(0, YC, 0); const kx = px, ky = py, kz = pz, ks = F / pz; // the core on screen
    const pulse = 0.85 + Math.sin(t * 3) * 0.15;

    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineCap = 'round';
    ctx.drawImage(back, clamp(-az * M * 0.55, -M, M) - M, clamp((el - EL) * M * 2.5, -M, M) - M, W + 2 * M, H + 2 * M);

    // comets and ring particles -> sort keys: side of the core | width | alpha | colour | index | part
    const spin = 0.5 + intensity * 2.6, pull = 0.12 + intensity * 1.3, trail = 12 + intensity * 20;
    let m = 0;
    const emit = (i, front, lw, al, col, part) => {
      const ai = Math.min(NA - 1, Math.round(Math.log(al / A0) * IA)); if (ai < 0) return;
      const wi = lw <= W0 ? 0 : Math.min(NW - 1, Math.round(Math.log(lw / W0) * IW));
      keys[m++] = (((((front * NW + wi) * NA + ai) << 6) | col) << 13) | (i << 2) | part;
    };
    // writes tail, mid, head into P; false if any is behind the camera
    const put = (o, x0, y0, z0, x1, y1, z1, x2, y2, z2) => {
      proj(x0, y0, z0); if (pz < 0.2) return false; P[o] = px; P[o + 1] = py;
      proj(x1, y1, z1); if (pz < 0.2) return false; P[o + 2] = px; P[o + 3] = py;
      proj(x2, y2, z2); if (pz < 0.2) return false; P[o + 4] = px; P[o + 5] = py; return true;
    };
    // depth cues: perspective size, fog toward the far side, near particles soft (wider and fainter)
    const look = (i, p, front, rel, lw, al, col, near) => {
      al *= Math.min(1.2, rel * rel) * smooth(0.2, 0.7, near);
      const soft = Math.max(0, rel - 1.6) * 1.3; if (soft) { lw *= 1 + soft; al /= (1 + soft) ** 1.5; }
      if (soft || lw < 0.7) emit(i, front, lw, al * 0.7, col, 0); // out of focus or tiny: one stroke will do
      else { emit(i, front, lw, al * 0.45, col, 0); emit(i, front, lw * 1.15, al, col, 1); } // tapered: faint tail, brighter head
      if (p.spark) emit(i, front, (1.4 + p.b * 1.8) * Math.min(rel, 2), al * 1.5 * (0.55 + 0.45 * Math.sin(t * 9 + p.tw)), SPARK, 2);
    };
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const da = p.w * spin * (1 + 0.25 / (p.r + 0.12)), dr = pull * (0.3 + (p.r / RO) * 0.9) * p.v * 0.0016 * RO;
      p.a += da * k; p.r -= dr * k; p.f = Math.min(1, p.f + 0.02 * k);
      if (p.r < 0.02) { spawn(p, false); continue; }
      const fade = smooth(0.02, 0.22, p.r) * smooth(RO * 1.1, RO * 0.85, p.r) * p.f; if (fade < 0.01) continue;
      const a1 = p.a - da * trail * 0.5, r1 = p.r + dr * trail * 0.5, a2 = p.a - da * trail, r2 = p.r + dr * trail;
      if (!put(i * 6, Math.cos(a2) * r2, funnel(r2, p.h), Math.sin(a2) * r2, Math.cos(a1) * r1, funnel(r1, p.h), Math.sin(a1) * r1, Math.cos(p.a) * p.r, funnel(p.r, p.h), Math.sin(p.a) * p.r)) continue;
      const rel = DIST / pz, heat = 1 - smooth(0, 0.6, p.r); // brightens to white near the core
      look(i, p, pz < kz ? 1 : 0, rel, p.s * 0.85 * rel * (1 + heat * 0.9), (0.3 + p.b * 0.5) * fade, heat > 0.45 ? HOT[p.c] : p.c, pz);
    }
    // accretion ring: fixed in the world, tilted off the disc so the camera sees it nearly edge-on
    const psi = 0.3 * Math.sin(ct * 0.05), rho = EL - 0.2 + 0.08 * Math.sin(ct * 0.06), cp = Math.cos(psi), sp = Math.sin(psi), cR = Math.cos(rho), sR = Math.sin(rho);
    const Vx = -cR * sp, Vy = sR, Vz = cR * cp; // U = (cp, 0, sp)
    const rx_ = (a, r) => Math.cos(a) * r * cp + Math.sin(a) * r * Vx, ry_ = (a, r, h) => YC + h + Math.sin(a) * r * Vy, rz_ = (a, r) => Math.cos(a) * r * sp + Math.sin(a) * r * Vz;
    for (let j = 0, n = parts.length; j < ring.length; j++) {
      const p = ring[j], da = p.w * spin, r = p.r; p.a += da * k;
      const a0 = p.a - da * trail * 0.7, a1 = p.a - da * trail * 0.35;
      if (!put((n + j) * 6, rx_(a0, r), ry_(a0, r, p.h), rz_(a0, r), rx_(a1, r), ry_(a1, r, p.h), rz_(a1, r), rx_(p.a, r), ry_(p.a, r, p.h), rz_(p.a, r))) continue;
      look(n + j, p, pz < kz ? 1 : 0, DIST / pz, p.s * (DIST / pz) * 1.1, 0.3 + p.b * 0.45, HOT[p.c], pz);
    }
    for (let j = 0; j <= 48; j++) { const a = (j / 48) * TAU; proj(rx_(a, RING), ry_(a, RING, 0), rz_(a, RING)); band[j * 3] = px; band[j * 3 + 1] = py; band[j * 3 + 2] = pz; }
    keys.subarray(0, m).sort(); // depth-ordered buckets: behind the core first, then thin (far) to wide (near)
    let split = 0; while (split < m && keys[split] < 1 << 27) split++;
    const strokes = (i0, i1) => {
      let cur = -1, wi = -1, ai = -1, ci = -1;
      for (let j = i0; j < i1; j++) {
        const e = keys[j], key = e >>> 13;
        if (key !== cur) {
          if (cur >= 0) ctx.stroke();
          cur = key; const c = key & 63, a = (key >> 6) & 15, w = (key >> 10) & 15;
          if (w !== wi) ctx.lineWidth = WL[(wi = w)];
          if (a !== ai) ctx.globalAlpha = AL[(ai = a)];
          if (c !== ci) ctx.strokeStyle = COLS[(ci = c)];
          ctx.beginPath();
        }
        const o = ((e >> 2) & 2047) * 6, part = e & 3;
        if (part === 0) { ctx.moveTo(P[o], P[o + 1]); ctx.quadraticCurveTo(P[o + 2], P[o + 3], P[o + 4], P[o + 5]); }
        else if (part === 1) { ctx.moveTo(P[o + 2], P[o + 3]); ctx.lineTo(P[o + 4], P[o + 5]); }
        else { ctx.moveTo(P[o + 4], P[o + 5]); ctx.lineTo(P[o + 4] + 0.1, P[o + 5]); } // round cap = dot
      }
      if (cur >= 0) ctx.stroke();
    };
    const ringBand = (front) => { // the ring's continuous glow, split into the halves behind and in front of the core
      ctx.beginPath();
      for (let j = 0, open = false; j < 48; j++) {
        const o = j * 3, f = band[o + 2] + band[o + 5] < 2 * kz;
        if (f !== front) { open = false; continue; }
        if (!open) ctx.moveTo(band[o], band[o + 1]);
        ctx.lineTo(band[o + 3], band[o + 4]); open = true;
      }
    };
    const glow = (img, r, a) => { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(img, kx - r, ky - r, r * 2, r * 2); };
    const bokehs = (front) => {
      for (const b of bokeh) {
        if (!front) b.a += b.w * (0.6 + intensity * 2) * k;
        proj(Math.cos(b.a) * b.r, b.y, Math.sin(b.a) * b.r);
        if (pz < 0.35 || pz < kz !== front) continue;
        const s = Math.min(140, (b.size * F) / pz);
        ctx.globalAlpha = 0.11 * Math.min(1, (24 / s) ** 0.6) * Math.min(1, DIST / pz) * smooth(0.35, 0.8, pz);
        ctx.drawImage(BOKEH[b.c], px - s, py - s, s * 2, s * 2);
      }
    };
    const bw = ks * 0.02 * (1 + flare);

    ctx.globalCompositeOperation = 'lighter';
    glow(HALO, ks * (0.85 + intensity * 0.45 + flare * 1.2), (0.3 + intensity * 0.35 + flare * 0.6) * pulse); // outer halo
    bokehs(false);
    strokes(0, split);
    ringBand(false); ctx.strokeStyle = 'rgb(150,190,255)'; ctx.lineWidth = bw * 4; ctx.globalAlpha = 0.07 + flare * 0.1; ctx.stroke();
    ctx.strokeStyle = 'rgb(220,232,255)'; ctx.lineWidth = bw; ctx.globalAlpha = 0.35 + flare * 0.3; ctx.stroke();
    // the core has volume: an opaque body hides what's behind it, glow layers sit on top
    ctx.globalCompositeOperation = 'source-over';
    glow(BODYS, ks * BODY * (1 + intensity * 0.25 + flare * 0.5), 0.92);
    ctx.globalCompositeOperation = 'lighter';
    glow(HALO, ks * BODY * (2.4 + intensity + flare * 2), (0.22 + intensity * 0.25 + flare * 0.5) * pulse);
    glow(HALO, ks * BODY * 0.8, 0.4 * pulse + flare * 0.5);
    // near half of the ring: a dusty lane across the core, then its bright edge
    ringBand(true);
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgb(10,12,26)'; ctx.lineWidth = bw * 2.6; ctx.globalAlpha = 0.5; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgb(150,190,255)'; ctx.lineWidth = bw * 4; ctx.globalAlpha = 0.08 + flare * 0.1; ctx.stroke();
    ctx.strokeStyle = 'rgb(232,240,255)'; ctx.lineWidth = bw * 1.1; ctx.globalAlpha = 0.6 + flare * 0.3; ctx.stroke();
    strokes(split, m);
    bokehs(true);

    // cinematic finish: vignette + grain
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(over, -((Math.random() * 4) | 0), -((Math.random() * 4) | 0));
    if (raf) raf = requestAnimationFrame(frame);
  }
  const ro = new ResizeObserver(() => { resize(); if (!raf) { last = 0; frame(performance.now()); } });
  return {
    start() {
      if (raf) return; ro.observe(canvas); resize(); last = 0;
      if (reduceMotion()) { target = intensity = 0.1; frame(performance.now()); return; }
      addEventListener('deviceorientation', onTilt); // only fires where no permission prompt is needed
      raf = requestAnimationFrame(frame);
    },
    stop() { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); removeEventListener('deviceorientation', onTilt); },
    set(v) { target = Math.max(0, Math.min(1, v)); },
    burst() { flare = 1; },
  };
}

// ---------- Display refresh rate ----------
// Times requestAnimationFrame. lock() takes the median interval of the frames so
// far as the refresh period, snapped to a common panel rate, so a few janky frames
// can't skew it. Call it after a quiet window: under heavy rendering, frames land
// on multiples of the period and the median reads the render rate, not the panel.
// From then on, intervals well past one period count as dropped frames.
// Nothing is drawn, so it's fine under prefers-reduced-motion.
const RATES = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360];
export function createFrameMeter() {
  let gaps = [], raf = 0, last = 0, hz = 0, raw = 0;
  const tick = (t) => { if (last && !document.hidden) gaps.push(t - last); last = t; raf = requestAnimationFrame(tick); };
  const resync = () => { last = 0; }; // a hidden tab pauses rAF: that's not a dropped frame
  const clean = () => gaps.filter((x) => x > 1 && x < 500); // duplicate stamps and long stalls (tab switch, sleep)
  function lock() {
    const g = clean(); gaps = [];
    if (g.length < 20) return 0;
    raw = 1000 / [...g].sort((a, b) => a - b)[g.length >> 1];
    const near = RATES.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    return (hz = Math.abs(near - raw) / near < 0.06 ? near : Math.round(raw));
  }
  return {
    start() { if (raf) return; gaps = []; last = 0; hz = 0; document.addEventListener('visibilitychange', resync); raf = requestAnimationFrame(tick); },
    lock,
    clear() { gaps = []; },
    stop() {
      cancelAnimationFrame(raf); raf = 0; document.removeEventListener('visibilitychange', resync);
      const g = clean(); if (!hz && !lock()) return null;
      const period = 1000 / hz, dropped = g.reduce((n, x) => n + Math.max(0, Math.round(x / period) - 1), 0), frames = g.length + dropped;
      return { hz, raw: +raw.toFixed(1), frames, dropped, smooth: frames > 0 && dropped / frames < 0.02 };
    },
  };
}

// ---------- Speed dial ----------
const STOPS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];
const A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
function frac(v) {
  if (v <= 0) return 0;
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i]) return (i - 1 + (v - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1])) / (STOPS.length - 1);
  }
  return 1;
}
export function createGauge(canvas) {
  const ctx = canvas.getContext('2d');
  let shown = 0, target = 0, kindNow = 'down', raf = 0, S = 0;
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    S = canvas.clientWidth; canvas.width = S * dpr; canvas.height = S * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function draw() {
    shown += (target - shown) * 0.12;
    const c = S / 2, r = S * 0.4, lw = S * 0.028;
    const track = cssVar('--surface-2'), fill = cssVar(kindNow === 'up' ? '--up' : '--down'), ink = cssVar('--fg'), muted = cssVar('--dim');
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round';
    ctx.lineWidth = lw; ctx.strokeStyle = track;
    ctx.beginPath(); ctx.arc(c, c, r, A0, A0 + SWEEP); ctx.stroke();
    const f = frac(shown);
    if (f > 0.002) { ctx.strokeStyle = fill; ctx.beginPath(); ctx.arc(c, c, r, A0, A0 + SWEEP * f); ctx.stroke(); }
    // ticks
    for (let i = 0; i < STOPS.length; i++) {
      const a = A0 + (SWEEP * i) / (STOPS.length - 1);
      ctx.strokeStyle = f >= i / (STOPS.length - 1) - 0.001 && shown > 0 ? fill : track; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * (r - lw * 1.4), c + Math.sin(a) * (r - lw * 1.4)); ctx.lineTo(c + Math.cos(a) * (r - lw * 2.3), c + Math.sin(a) * (r - lw * 2.3)); ctx.stroke();
    }
    ctx.font = `400 ${Math.round(S * 0.038)}px Geist, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    STOPS.forEach((v, i) => {
      const a = A0 + (SWEEP * i) / (STOPS.length - 1), rr = r - lw * 4;
      ctx.fillStyle = f >= i / (STOPS.length - 1) - 0.001 && shown > 0 ? ink : muted;
      ctx.fillText(v, c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    });
    const a = A0 + SWEEP * f, nl = r - lw * 2.8;
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, S * 0.007);
    ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * S * 0.04, c + Math.sin(a) * S * 0.04); ctx.lineTo(c + Math.cos(a) * nl, c + Math.sin(a) * nl); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(c, c, S * 0.014, 0, Math.PI * 2); ctx.fill();
    if (Math.abs(target - shown) > 0.01 || raf) raf = requestAnimationFrame(draw);
  }
  const ro = new ResizeObserver(() => { size(); draw(); });
  ro.observe(canvas);
  return {
    set(v, kind) {
      target = Math.max(0, v || 0);
      if (kind) kindNow = kind;
      if (!raf) raf = requestAnimationFrame(draw);
    },
    reset() { target = shown = 0; size(); draw(); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}

// ---------- Small charts ----------
export function lineChart(canvas, series, { plan, h = 180 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = canvas.clientWidth; canvas.width = W * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { l: 36, r: 10, t: 12, b: 22 };
  const all = series.flatMap((s) => s.points.map((p) => p[1]));
  if (plan) all.push(plan);
  const max = Math.max(10, ...all) * 1.1;
  const n = Math.max(...series.map((s) => s.points.length), 2);
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / (n - 1);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  ctx.font = '11px Geist, system-ui, sans-serif'; ctx.fillStyle = cssVar('--dim');
  ctx.strokeStyle = cssVar('--line'); ctx.lineWidth = 1;
  const step = niceStep(max / 4);
  for (let v = 0; v <= max; v += step) {
    ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(W - pad.r, y(v)); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(Math.round(v), pad.l - 6, y(v));
  }
  if (plan) {
    ctx.setLineDash([3, 4]); ctx.strokeStyle = cssVar('--muted');
    ctx.beginPath(); ctx.moveTo(pad.l, y(plan)); ctx.lineTo(W - pad.r, y(plan)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cssVar('--muted'); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('Plan', pad.l + 4, y(plan) - 2);
  }
  for (const s of series) {
    if (!s.points.length) continue;
    const g = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    g.addColorStop(0, s.color + '33'); g.addColorStop(1, s.color + '00');
    ctx.beginPath(); s.points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p[1])) : ctx.moveTo(x(i), y(p[1]))));
    ctx.lineTo(x(s.points.length - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); s.points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p[1])) : ctx.moveTo(x(i), y(p[1]))));
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    const li = s.points.length - 1;
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x(li), y(s.points[li][1]), 3.5, 0, Math.PI * 2); ctx.fill();
  }
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export function barChart(canvas, values, { labels, color = '#22d3ee', h = 120, highlightMin = true } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = canvas.clientWidth; canvas.width = W * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vals = values.map((v) => v ?? 0); const max = Math.max(1, ...vals);
  const present = values.filter((v) => v != null); const min = present.length ? Math.min(...present) : null;
  const bw = W / vals.length; const top = 8, bot = 18;
  ctx.font = '10px Geist, system-ui, sans-serif'; ctx.textAlign = 'center';
  vals.forEach((v, i) => {
    const bh = (h - top - bot) * (v / max);
    ctx.fillStyle = values[i] == null ? cssVar('--surface-2') : highlightMin && v === min ? cssVar('--up') : color;
    const bx = i * bw + bw * 0.18, by = h - bot - Math.max(values[i] == null ? 2 : 3, bh);
    roundRect(ctx, bx, by, bw * 0.64, Math.max(values[i] == null ? 2 : 3, bh), 3); ctx.fill();
    if (labels && labels[i]) { ctx.fillStyle = cssVar('--dim'); ctx.fillText(labels[i], i * bw + bw / 2, h - 5); }
  });
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function sparkline(canvas, values, color) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (values.length < 2) { ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(0, H - 2); ctx.lineTo(W, H - 2); ctx.stroke(); return; }
  const max = Math.max(...values, 1);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  values.forEach((v, i) => { const x = (W * i) / (values.length - 1), y = H - 2 - (H - 4) * (v / max); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
}

// ---------- Runner (idle Speed tab) ----------
// A baserunner in side view, posed every frame from sprinting-gait joint angles:
// hip, knee and ankle curves for each leg, arms pumping against the legs with
// bent elbows, a forward lean, the dip at mid-stance and a flight phase. The
// stance foot stays planted while the base path scrolls under it at the same
// speed. Drawn on canvases with a ballpark (see createBallpark) that fills the
// Speed tab: as one SVG the whole scene was redrawn on every change, which ran
// at ~4 fps on iPhone; here only the runner, the crowd's bounce and the dirt move.
export function createRunner(root, stage = root) {
  const CYCLE = 0.675;                        // seconds per stride (two steps), ~178 steps/min
  const GROUND = 104, HIP_X = 57, LEAN = 11;  // lean in degrees, top tilted forward
  const L = { thigh: 19.5, shin: 19, torso: 22.5, neck: 3.2, upper: 13.5, fore: 12 };
  const STANCE = 0.34;                        // fraction of the cycle a foot is on the ground

  // Joint angle keyframes over one cycle for one leg (0 = foot strike).
  // Hip: thigh angle from vertical, + forward. Knee: flexion. Ankle: + toes up.
  // The foot lands just ahead of the hip, the heel folds up under the hip in swing
  // and the knee drives high and forward before the next strike.
  const HIP = [[0, 26], [0.1, 12], [0.2, -4], [0.28, -15], [0.34, -20], [0.45, -12], [0.55, 8], [0.65, 30], [0.75, 45], [0.85, 47], [0.93, 37]];
  const KNEE = [[0, 24], [0.08, 37], [0.15, 41], [0.25, 30], [0.34, 20], [0.42, 55], [0.52, 100], [0.6, 120], [0.7, 104], [0.8, 70], [0.9, 36]];
  const ANKLE = [[0, 4], [0.1, 16], [0.18, 20], [0.28, 2], [0.34, -28], [0.45, -20], [0.6, -6], [0.8, 6], [0.92, 4]];
  // Near arm: pumps against the near leg, forward hand to chin height, back hand past the hip.
  const SHOULDER = [[0, -20], [0.15, 18], [0.3, 38], [0.5, 6], [0.8, -48]];
  const ELBOW = [[0, 82], [0.15, 96], [0.3, 104], [0.55, 90], [0.8, 74]];
  // Hips and shoulders counter-rotate: the near hip swings forward with the near leg, the near shoulder back.
  const twist = (p) => Math.cos(2 * Math.PI * (p - 0.8));

  // Periodic Catmull-Rom through keyframes, so every curve is smooth and loops.
  const curve = (keys) => (p) => {
    p = ((p % 1) + 1) % 1;
    const n = keys.length;
    let i = n - 1; while (i > 0 && keys[i][0] > p) i--;
    const k = (j) => { const m = ((j % n) + n) % n; return [keys[m][0] + Math.floor(j / n), keys[m][1]]; };
    const [t1, v1] = k(i), [t2, v2] = k(i + 1), [, v0] = k(i - 1), [, v3] = k(i + 2);
    const s = (p - t1) / (t2 - t1), s2 = s * s, s3 = s2 * s;
    return 0.5 * (2 * v1 + (-v0 + v2) * s + (2 * v0 - 5 * v1 + 4 * v2 - v3) * s2 + (-v0 + 3 * v1 - 3 * v2 + v3) * s3);
  };
  const hip = curve(HIP), knee = curve(KNEE), ankle = curve(ANKLE), shoulder = curve(SHOULDER), elbow = curve(ELBOW);
  const rad = (d) => d * Math.PI / 180;
  const along = (o, deg, len) => [o[0] + Math.sin(rad(deg)) * len, o[1] + Math.cos(rad(deg)) * len]; // deg from straight down, + forward
  const rot = (o, deg, [x, y]) => { const a = rad(deg), c = Math.cos(a), s = Math.sin(a); return [o[0] + x * c - y * s, o[1] + x * s + y * c]; };

  // Smooth closed outline through points (Catmull-Rom as cubic Béziers), as SVG path data for Path2D.
  const f = (v) => v.toFixed(2);
  function outline(pts) {
    const n = pts.length; let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + 'Z';
  }
  // A body segment from a to b: stations [t, front width, back width] along it, rounded ends.
  function limb(a, b, stations) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const u = [dx / len, dy / len], n = [u[1], -u[0]]; // n points to the body's front when the segment hangs down
    const at = (t, w) => [a[0] + dx * t + n[0] * w, a[1] + dy * t + n[1] * w];
    const first = stations[0], last = stations[stations.length - 1];
    const cap = (o, w, dir) => [o[0] + u[0] * w * dir, o[1] + u[1] * w * dir];
    const front = stations.map(([t, w]) => at(t, w));
    const back = stations.map(([t, , w]) => at(t, -w)).reverse();
    const endR = (last[1] + last[2]) / 2, startR = (first[1] + first[2]) / 2;
    return outline([...front, cap(at(last[0], (last[1] - last[2]) / 2), endR, 1), ...back, cap(at(first[0], (first[1] - first[2]) / 2), startR, -1)]);
  }
  // The same for a segment that points up (torso, neck): stations still run from a, front stays in front.
  const limbUp = (a, b, stations) => limb(b, a, stations.map(([t, fw, bw]) => [1 - t, fw, bw]).reverse());
  // A flat band across a segment between points a and b on its axis (a sleeve cuff, a belt, a glove strap).
  function band(a, b, wf, wb) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, n = [dy / len, -dx / len];
    const pt = (o, w) => `${f(o[0] + n[0] * w)} ${f(o[1] + n[1] * w)}`;
    return `M${pt(a, wf)}L${pt(b, wf)}L${pt(b, -wb)}L${pt(a, -wb)}Z`;
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const line = (pts) => 'M' + pts.map((pt) => `${f(pt[0])} ${f(pt[1])}`).join('L');

  // Leg pose with the hip at the origin; the foot is drawn in its own frame
  // (x toward the toes, y toward the sole) with the ankle at the origin.
  const SHOE = [[-3.4, -1.6], [-4.0, 0.6], [-3.4, 3.0], [1, 3.3], [6.4, 3.2], [8.2, 2.4], [7.6, 1.1], [4.6, 0.1], [1.6, -1.4], [0.8, -2.6], [-2.2, -2.5]];
  const SOLE = [[-3.6, 2.4], [1, 2.7], [6.6, 2.6], [8.1, 2.3], [7.9, 3.1], [6.4, 3.6], [1, 3.7], [-3.3, 3.4]];
  const SPIKES = new Path2D([-2.8, -0.9, 3.2, 5.0, 6.7].map((x) => `M${x - 0.55} 3.5L${x} 4.5L${x + 0.55} 3.5Z`).join('')); // in the foot frame
  function legAt(th, kn, an, o) {
    const sh = th - kn, foot = -sh - an; // foot: rotation of the foot frame, degrees clockwise
    const k = along(o, th, L.thigh), a = along(k, sh, L.shin);
    return { o, k, a, foot, toe: rot(a, foot, [8.2, 3.2]), heel: rot(a, foot, [-3.6, 3.2]) };
  }
  const legPose = (p, o) => legAt(hip(p), knee(p), ankle(p), o);
  // How far below the hip the lowest point of each foot sits, sampled over a cycle.
  const lowest = (p) => { const g = legPose(p, [0, 0]); return Math.max(g.toe[1], g.heel[1]); };

  // Hip height: the stance foot's sole rests on the ground; between stances the
  // body floats on a short arc. Ground speed matches the planted foot.
  const N = 240, hipY = new Float32Array(N);
  const stanceDepth = (p) => { const q = ((p % 0.5) + 0.5) % 0.5; return q <= STANCE ? lowest(q) : NaN; };
  for (let i = 0; i < N; i++) hipY[i] = GROUND - stanceDepth(i / N);
  for (const start of [STANCE, 0.5 + STANCE]) { // fill the two flight phases
    const i0 = Math.round(start * N), i1 = Math.round((start - STANCE + 0.5) * N) % N;
    const y0 = hipY[i0 - 1], y1 = hipY[i1], span = (i1 - i0 + N) % N;
    for (let j = 0; j < span; j++) { const s = j / span; hipY[(i0 + j) % N] = y0 + (y1 - y0) * s - 3 * Math.sin(Math.PI * s); }
  }
  const footX = (p) => legPose(p, [0.9 * twist(p), 0]).a[0];
  const speed = (footX(0.02) - footX(STANCE - 0.02)) / ((STANCE - 0.04) * CYCLE); // units per second
  const hipAt = (p) => { const x = ((p % 1) + 1) % 1 * N, i = Math.floor(x), s = x - i; return hipY[i % N] * (1 - s) + hipY[(i + 1) % N] * s; };

  // One frame's drawing, back to front: [colour key, path data, far side?, stroke width?].
  // Uniform: cream jersey and pants with red piping, red belt, socks and helmet,
  // red cleats with black soles and spikes, navy batting gloves with red straps.
  let ops = [];
  const fill = (key, d, far) => ops.push([key, d, far]);
  const stroke = (key, d, far, w) => ops.push([key, d, far, w]);
  function drawLeg(g, far) {
    // High-cuffed baseball pants end below the knee; red socks run from the cuff to the cleat.
    const cuff = lerp(g.k, g.a, 0.5);
    fill('red', limb(lerp(g.k, g.a, 0.35), g.a, [[0, 2.4, 3.3], [0.45, 1.9, 2.5], [1, 1.5, 1.65]]), far);
    ops.push(['spike', g, far]);
    fill('red', outline(SHOE.map((pt) => rot(g.a, g.foot, pt))), far);
    fill('sole', outline(SOLE.map((pt) => rot(g.a, g.foot, pt))), far);
    fill('cream', limb(g.o, g.k, [[0, 4.9, 5.3], [0.45, 4.4, 4.3], [1, 3.3, 3.4]]), far);
    fill('cream', limb(g.k, cuff, [[0, 3.3, 3.4], [0.55, 2.8, 3.7], [1, 2.5, 3.3]]), far);
    stroke('red', line([lerp(g.o, g.k, 0.12), g.k, lerp(g.k, cuff, 0.9)]), far, 0.55);
  }
  const armAt = (s, sh, el) => { const e = along(s, sh, L.upper), fa = sh + el, w = along(e, fa, L.fore); return { s, e, w, h: along(w, fa + 12, 2.6), sh, fa }; };
  function drawArm({ s, e, w, h, sh, fa }, far) {
    fill('skin', limb(s, e, [[0, 2.7, 2.9], [0.5, 2.2, 2.4], [1, 1.75, 1.85]]), far);
    fill('skin', limb(e, w, [[0, 1.8, 1.9], [0.35, 1.9, 2.1], [1, 1.25, 1.3]]), far);
    fill('glove', limb(along(w, fa, -1.1), h, [[0, 1.45, 1.5], [0.5, 1.75, 1.7], [0.8, 2.1, 2.0], [1, 1.7, 1.6]]), far);
    fill('red', band(along(w, fa, -0.9), along(w, fa, -0.1), 1.6, 1.65), far);
    fill('cream', limb(s, along(s, sh, L.upper * 0.5), [[0, 3.5, 3.6], [1, 3.0, 3.0]]), far);
    fill('red', band(along(s, sh, L.upper * 0.47), along(s, sh, L.upper * 0.53), 3.0, 3.0), far);
  }

  // A whole-body pose J: hip height y, trunk lean, each leg's hip/knee/ankle angles (n = near,
  // f = far), each arm's shoulder/elbow, the hip-shoulder twist and the head's tilt (clockwise).
  const KEYS = ['y', 'lean', 'hn', 'kn', 'an', 'hf', 'kf', 'af', 'sn', 'en', 'sf', 'ef', 'tw', 'head'];
  function gaitJ(p) {
    const lean = LEAN + 1.4 * Math.cos(4 * Math.PI * (p - 0.1)); // trunk dips forward slightly each step
    return { y: hipAt(p), lean, hn: hip(p), kn: knee(p), an: ankle(p), hf: hip(p + 0.5), kf: knee(p + 0.5), af: ankle(p + 0.5),
      sn: shoulder(p), en: elbow(p), sf: shoulder(p + 0.5), ef: elbow(p + 0.5), tw: twist(p), head: -lean * 0.6 }; // the head stays steadier than the trunk
  }
  const mix = (a, b, s) => { const o = {}; for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * s; return o; };
  function bones(J) {
    const o = [HIP_X, J.y], lean = J.lean, tw = J.tw;
    const top = along(o, 180 - lean, L.torso), base = along(o, -lean, 2.5);
    const sh = along(o, 180 - lean, L.torso - 2.6); // shoulder joint, a little below the top of the torso
    const nb = along(top, 180 - lean - 6, 0.8), nt = along(nb, 180 - lean - 12, L.neck + 1.2);
    return { o, lean, top, base, nb, nt,
      legN: legAt(J.hn, J.kn, J.an, [o[0] + 0.9 * tw, o[1]]), legF: legAt(J.hf, J.kf, J.af, [o[0] - 0.9 * tw, o[1]]),
      armN: armAt(along(sh, 90 - lean, 0.6 - 0.7 * tw), J.sn, J.en), armF: armAt(along(sh, 90 - lean, -0.6 + 0.7 * tw), J.sf, J.ef) };
  }
  // How far below the hip the lowest part of the body reaches (soles, knees, hands, elbows, chest, back, head).
  function depth(J) {
    const B = bones({ ...J, y: 0 }), u = [(B.top[0] - B.base[0]) / L.torso, (B.top[1] - B.base[1]) / L.torso], n = [-u[1], u[0]];
    const pts = [[B.legN.toe, 0], [B.legN.heel, 0], [B.legF.toe, 0], [B.legF.heel, 0], [B.legN.k, 3.4], [B.legF.k, 3.4],
      [B.armN.h, 1.8], [B.armF.h, 1.8], [B.armN.e, 2], [B.armF.e, 2], [rot(B.nt, J.head, [0.5, -5.5]), 5.2]];
    for (const t of [0.1, 0.5, 0.85]) { const c = lerp(B.base, B.top, t); pts.push([[c[0] + n[0] * 5.2, c[1] + n[1] * 5.2], 0], [[c[0] - n[0] * 4.6, c[1] - n[1] * 4.6], 0]); }
    return Math.max(...pts.map(([pt, r]) => pt[1] + r));
  }
  function pose(J) {
    ops = [];
    const B = bones(J), { o, lean, top, base, nb, nt } = B;
    const lift = Math.min(6, Math.max(0, GROUND - J.y - depth(J)));
    ops.push(['shadow', (o[0] + top[0]) / 2 + 2, 15 + Math.abs(top[0] - o[0]) * 0.5 - lift * 0.6]); // shrinks as the body rises
    drawArm(B.armF, true);
    drawLeg(B.legF, true);
    const chest = [[0, 4.8, 5.4], [0.35, 4.4, 4.1], [0.72, 5.4, 4.6], [0.92, 4.5, 4.5], [1, 3.4, 3.8]];
    fill('cream', limbUp(base, top, chest));
    // Placket piping: a red line just inside the front of the jersey, collar to belt.
    const u = [(top[0] - base[0]) / L.torso, (top[1] - base[1]) / L.torso], fwd = [-u[1], u[0]];
    const frontW = (t) => { let i = 0; while (chest[i + 1][0] < t) i++; const [t0, w0] = chest[i], [t1, w1] = chest[i + 1]; return w0 + (w1 - w0) * (t - t0) / (t1 - t0); };
    stroke('red', line([0.3, 0.45, 0.6, 0.75, 0.88].map((t) => { const c = lerp(base, top, t), w = frontW(t) - 1.1; return [c[0] + fwd[0] * w, c[1] + fwd[1] * w]; })), false, 0.55);
    fill('cream', limbUp(base, along(o, 180 - lean, 6.4), [[0, 4.9, 5.4], [1, 4.5, 4.2]]));
    fill('red', band(along(o, 180 - lean, 6.6), along(o, 180 - lean, 5.0), 4.55, 4.25));
    drawLeg(B.legN, false);

    fill('skin', limbUp(nb, nt, [[0, 2.2, 2.4], [1, 1.9, 2.0]]));
    // Head in its own frame: origin at the top of the neck, x forward, y down.
    const H = (pts) => outline(pts.map((pt) => rot(nt, J.head, pt)));
    fill('skin', H([[-4.4, -4.6], [-3.6, -8.4], [0, -10.4], [3.6, -9.2], [4.6, -6.6], [4.9, -5.2], [6.0, -3.6], [4.9, -3.0], [5.0, -2.0], [4.2, -0.6], [2.4, 0.2], [0.4, -0.2], [-2.2, -0.6], [-4.3, -2.2]]));
    fill('hair', H([[-4.9, -3.4], [-4.8, -6.6], [-2.6, -9.9], [0.6, -11.0], [3.6, -9.8], [4.7, -7.6], [3.4, -8.0], [1.0, -7.6], [-0.4, -6.4], [-1.6, -4.4], [-3.0, -2.6]]));
    // Batting helmet: hard shell with an ear flap over the near ear, a short bill and a glossy highlight.
    fill('red', H([[-5.0, -2.6], [-5.5, -5.8], [-4.4, -9.0], [-1.9, -11.0], [1.2, -11.4], [3.9, -10.3], [5.0, -8.5], [4.9, -7.3], [3.2, -7.1],
      [2.6, -5.8], [2.4, -3.6], [1.5, -1.9], [-0.5, -1.5], [-2.2, -2.0], [-3.4, -2.7]]));
    fill('red', H([[4.4, -8.3], [6.6, -8.1], [8.2, -7.4], [7.6, -6.8], [5.6, -6.8], [4.4, -7.0]]));
    fill('skin', H([[-0.9, -5.2], [0.4, -5.0], [0.6, -3.7], [-0.4, -3.2], [-1.2, -4.1]]), true);
    fill('shine', H([[-3.4, -8.4], [-1.5, -10.2], [1.3, -10.6], [3.0, -9.9], [1.1, -9.8], [-1.1, -9.3], [-2.8, -7.8]]));
    drawArm(B.armN, false);
    return B;
  }

  // Stumbles and falls. Every few bases (a fresh roll of 1-5 each time) a cleat catches the bag.
  // Usually he stumbles: pitches forward, arms flung out, losing some speed for a second. Sometimes
  // he goes down: dives, lands on his belly in a puff of dust, slides to a stop, lies there a beat,
  // pushes up to hands and knees, comes up on one knee, rises into a crouch and sprints off again.
  const FALL_CHANCE = 0.35, STUMBLE = 0.9, RISE = 1.4, RESUME_P = 0.82; // RESUME_P: the stride phase closest to the crouch
  const PRONE = { air: 0, lean: 88, hn: -86, kn: 18, an: -30, hf: -82, kf: 32, af: -30, sn: 100, en: 25, sf: 92, ef: 30, tw: 0, head: 55 };
  const FALL = [
    [0.3, { air: 6, lean: 42, hn: -22, kn: 35, an: -10, hf: 38, kf: 75, af: 0, sn: 75, en: 35, sf: 55, ef: 30, tw: 0, head: -18 }], // tripped, pitching forward
    [0.55, { air: 6, lean: 72, hn: -48, kn: 22, an: -25, hf: -30, kf: 45, af: -20, sn: 115, en: 15, sf: 105, ef: 20, tw: 0, head: 25 }], // diving, arms out
    [0.75, PRONE], [1.75, PRONE], // lands, slides, lies there
    [2.25, { air: 0, lean: 82, hn: -78, kn: 25, an: -30, hf: -74, kf: 35, af: -30, sn: -2, en: 4, sf: 2, ef: 4, tw: 0, head: 45 }], // pushes up on straight arms
    [2.8, { air: 0, lean: 82, hn: 2, kn: 95, an: -30, hf: 6, kf: 100, af: -30, sn: 2, en: 6, sf: 6, ef: 6, tw: 0, head: 40 }], // hands and knees
    [3.3, { air: 0, lean: 28, hn: 85, kn: 88, an: 2, hf: -8, kf: 100, af: -30, sn: 30, en: 60, sf: -20, ef: 55, tw: 0, head: 2 }], // up on one knee
    [3.75, { air: 0, lean: 32, hn: 42, kn: 62, an: 12, hf: -22, kf: 42, af: -12, sn: -14, en: 82, sf: 32, ef: 82, tw: 0, head: -8 }], // rising into a crouch
  ];
  const FALL_END = 3.95;
  const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // Ground speed as a share of full speed, s seconds into the current move.
  function pace(mode, s) {
    if (mode === 'stumble') return 1 - 0.4 * Math.sin(Math.PI * Math.min(1, s / STUMBLE));
    if (mode === 'fall') return s < 0.75 ? 1 - 0.15 * s / 0.75 : s < 1.3 ? 0.85 * (1 - (s - 0.75) / 0.55) ** 2 : 0; // slides to a stop
    if (mode === 'rise') return 0.15 + 0.85 * ease(s / RISE);
    return 1;
  }
  function stumbled(J, s) {
    const e = Math.sin(Math.PI * Math.min(1, s / STUMBLE));
    return { ...J, y: J.y + 4.5 * e, lean: J.lean + 30 * e, sn: J.sn + 55 * e, sf: J.sf + 45 * e, en: J.en - 40 * e, ef: J.ef - 35 * e, head: J.head - 10 * e };
  }

  // Colours come from CSS custom properties on the canvas (light and dark themes).
  // The far arm and leg are drawn noticeably darker so the legs read as near and far.
  let C = {};
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`; };
  function colours() {
    const cs = getComputedStyle(root), v = (n) => cs.getPropertyValue(n).trim();
    C = { skin: v('--skin'), hair: v('--hair'), cream: v('--cream'), red: v('--red'), glove: v('--navy'), sole: v('--sole'), spike: v('--spike'), shine: 'rgba(255,255,255,0.3)' };
    C.far = {};
    for (const k in C) C.far[k] = /^#[0-9a-f]{6}$/i.test(C[k]) ? shade(C[k], 0.74) : C[k];
    C.outline = v('--outline');
  }
  // A bold dark outline around the whole silhouette (every shape stroked first, then filled
  // over, so only the outer edge survives) plus a thin line round each part makes him pop
  // off the crowd and the grass and keeps his limbs distinct.
  function render(ctx) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const op of ops) if (typeof op[1] === 'string') op.path = new Path2D(op[1]);
    const all = new Path2D();
    for (const op of ops) if (op.path && !op[3] && op[0] !== 'shine') all.addPath(op.path);
    ctx.strokeStyle = C.outline; ctx.lineWidth = 1.3; ctx.stroke(all);
    for (const op of ops) {
      if (op[0] === 'shadow') { ctx.fillStyle = 'rgba(40,24,12,0.24)'; ctx.beginPath(); ctx.ellipse(op[1], GROUND + 0.8, op[2], 1.8, 0, 0, 2 * Math.PI); ctx.fill(); continue; }
      if (op[0] === 'spike') {
        const g = op[1]; ctx.save(); ctx.translate(g.a[0], g.a[1]); ctx.rotate(rad(g.foot)); ctx.fillStyle = C.spike; ctx.fill(SPIKES); ctx.restore(); continue;
      }
      const [key, , far, w] = op, path = op.path, col = (far ? C.far : C)[key];
      if (w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(path); continue; }
      ctx.fillStyle = col; ctx.fill(path);
      if (key !== 'shine') { ctx.strokeStyle = C.outline; ctx.lineWidth = 0.4; ctx.stroke(path); }
    }
  }

  const K = 0.6; // the runner's own 120-unit frame, scaled down onto the base path
  const park = createBallpark(root, stage, () => { colours(); draw(lastT); });
  // The stride follows the ground, not the clock (one stride per SL of ground), so his feet stay
  // planted as he slows and speeds up. Bases are placed so a cleat strike lands right on each one
  // (the near foot strikes at whole strides, the far foot at half strides).
  const step = speed * K * CYCLE / 2, SL = 2 * step, ox = park.runX - HIP_X * K;
  const strikeX = ox + (legPose(0, [HIP_X + 0.9 * twist(0), 0]).a[0] + 2) * K; // middle of the planted cleat
  const roll = () => 1 + Math.floor(Math.random() * 5);
  let raf = 0, t0 = 0, lastT = 0, dist = 0, pAt = 0, distAt = 0, baseX = null, toTrip = roll();
  let mode = 'run', mT = 0, keys = null, Jlast = null, puffed = 0;
  const phase = () => pAt + (dist - distAt) / SL;
  function draw(t) {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    if (mode === 'stumble' && t - mT >= STUMBLE) mode = 'run';
    if (mode === 'fall' && t - mT >= FALL_END) { mode = 'rise'; mT = t; pAt = RESUME_P; distAt = dist; }
    if (mode === 'rise' && t - mT >= RISE) mode = 'run';
    const p0 = phase(), moved = speed * K * pace(mode, t - mT) * dt;
    dist += moved; if (baseX !== null) baseX -= moved;
    const p = phase(), span = park.span(), running = mode === 'run' || mode === 'rise';
    // A cleat strike on the bag: impact and dust, and maybe the trip.
    if (running && raf && Math.floor(2 * p) !== Math.floor(2 * p0) && baseX !== null && Math.abs(baseX - strikeX) < 3) {
      park.dust(strikeX, t);
      if (--toTrip === 0) {
        toTrip = roll(); mT = t;
        if (Math.random() < FALL_CHANCE) {
          mode = 'fall'; puffed = 0;
          keys = [[0, gaitJ(p)], ...FALL.map(([at, k]) => [at, { ...k, y: GROUND - depth({ ...k, y: 0 }) - k.air }])];
        } else mode = 'stumble';
      }
    }
    // Bring on the next base once the last one has gone, timed to land under a future strike.
    if (running && (baseX === null || baseX < span[0] - 12)) {
      const A = span[1] + 8 - strikeX, next = ((0.5 - (((p % 0.5) + 0.5) % 0.5)) % 0.5) * SL;
      baseX = strikeX + next + Math.max(0, Math.ceil((A - next) / step)) * step;
    }
    let J;
    if (mode === 'fall') {
      const st = t - mT; let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= st) i++;
      const [a0, ja] = keys[i], [a1, jb] = keys[i + 1];
      J = Jlast = mix(ja, jb, ease((st - a0) / (a1 - a0)));
    } else {
      J = gaitJ(p);
      if (mode === 'stumble') J = stumbled(J, t - mT);
      if (mode === 'rise' && t - mT < 0.35) J = mix(Jlast, J, ease((t - mT) / 0.35));
    }
    const ctx = park.draw(dist, t, baseX ?? -1e4);
    if (!ctx) return;
    const B = pose(J);
    // Dust where he hits the ground, and along the slide.
    if (mode === 'fall') {
      const st = t - mT, chest = ox + lerp(B.base, B.top, 0.6)[0] * K;
      for (const [at, n] of [[0.75, 16], [0.95, 8], [1.15, 5]]) if (puffed < at && st >= at) { park.puff(chest, t, n, 7); puffed = at; }
    }
    ctx.save(); ctx.translate(ox, park.path - GROUND * K); ctx.scale(K, K);
    render(ctx); ctx.restore();
    park.front(ctx, dist, t);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!root.isConnected || !root.getClientRects().length) return; // idle view hidden: skip the work
    if (!t0) t0 = now - lastT * 1000;
    draw((now - t0) / 1000);
  }
  function start() { if (raf) return; if (reduceMotion()) { draw(0.25); return; } t0 = 0; raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  colours(); draw(0.25);
  start();
  return { start, stop };
}

// ---------- Ballpark (behind the runner) ----------
// A day game in light mode, a night game under the lights in dark mode: stands
// packed with Mii-style fans who bob and sway out of step, the outfield wall,
// grass, and the base path with its chalk line and a base coming by.
// It fills `root`; units 0-120 of its height line up with `stage` (anything
// below is more grass), and it's as wide as the screen's shape needs. Three
// stacked canvases keep each frame cheap: the sky, stands, wall and grass are
// painted once; the crowd strip is redrawn at screen resolution (soft, like a
// shallow depth of field) from one pre-rendered sprite per fan; and a strip
// holding the base path and the runner is redrawn at full sharpness.
function createBallpark(root, stage, onRebuild) {
  const PATH = 86, TILE = 24;
  // The base to scale with the runner (about 6 ft = 47 units, so ~0.65 units an inch): 18 in across, ~3 in thick.
  const BAG = 11.7, BH = 2.4;
  const CROWD = [11, 50.5], ACTION = [30, 96]; // world y-ranges of the redrawn strips
  // Five tiers of fans, back to front: [seat row y, fan scale]. Kept small so the stands read as far off.
  const TIERS = [[22, 0.28], [28, 0.33], [34.5, 0.39], [41.5, 0.46], [49, 0.54]];
  const layer = () => { const c = document.createElement('canvas'); root.appendChild(c); return { c, g: c.getContext('2d'), k: 1, top: 0 }; };
  root.textContent = '';
  const still = layer(), crowd = layer(), action = layer();
  let x0 = 0, y0 = 0, wU = 120, u = 1, tile = null, fans = [], C = {};
  const off = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const world = (L, sx = 0, sy = 0) => L.g.setTransform(L.k, 0, 0, L.k, (sx - x0) * L.k, (sy - L.top) * L.k); // world units → layer pixels
  const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  // Size a layer to cover world y [top, bottom] at `scale` device pixels per css pixel.
  function place(L, top, bottom, scale, cssW) {
    L.top = top; L.k = u * scale;
    const w = Math.round(cssW * scale), h = Math.round((bottom - top) * L.k);
    if (L.c.width !== w || L.c.height !== h) { L.c.width = w; L.c.height = h; }
    Object.assign(L.c.style, { position: 'absolute', left: 0, width: '100%', top: `${(top - y0) * u}px`, height: `${(bottom - top) * u}px` });
  }

  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  // Mii favourite colours, with a few home-team reds (not so many that the runner's red helmet blends in).
  const SHIRTS = ['#c41e3a', '#c41e3a', '#0c2340', '#0c2340', '#ffffff', '#89cff0', '#89cff0', '#f5c242', '#4caf50', '#f08a24', '#f48fb1', '#8e6ad8', '#9ccc65', '#3f7fd1', '#7b5a3c', '#e0e0e0'];
  const SKINS = ['#f6d7b8', '#eac39a', '#d9a77b', '#c08a64', '#9a6a48', '#6e4a32'];
  const HAIRS = ['#2b1d14', '#4a2f1e', '#7a4b2a', '#c98a3d', '#e0c27a', '#1a1a1a', '#8c8c8c'];
  const CAP = 'M-3.55 -9.3A3.55 3.55 0 0 1 3.55 -9.3C2.4 -10.7 -2.4 -10.7 -3.55 -9.3Z';
  const HAIR = {
    short: [CAP], long: ['M-3.8 -6.6V-9.6A3.8 3.8 0 0 1 3.8 -9.6V-6.6L2.9 -7V-9.3C2 -10.9 -2 -10.9 -2.9 -9.3V-7Z'],
    bun: [CAP, 'M1.4 -13.4A1.4 1.4 0 1 1 -1.4 -13.4A1.4 1.4 0 1 1 1.4 -13.4Z'], cap: ['M-3.6 -9.9A3.6 3.6 0 0 1 3.6 -9.9Z', 'M-4.1 -10.4H4.1V-9.3H-4.1Z'], none: [],
  };
  const ARMS = { up: [[-4.4, -10.8], [4.4, -10.8]], one: [[-3.6, -1.6], [4.6, -10.8]], clap: [[-0.5, -7.6], [0.5, -7.6]] };
  // One fan, drawn in its own frame: origin at the seat, about 16 units tall.
  function fanSprite(sc, face) {
    const shirt = pick(SHIRTS), skin = pick(SKINS), hair = pick(['short', 'short', 'long', 'bun', 'cap', 'cap', 'none']), arms = ARMS[pick(['up', 'up', 'up', 'one', 'clap'])];
    const hairCol = hair === 'cap' ? pick(['#0c2340', '#0c2340', '#c41e3a', '#89cff0']) : pick(HAIRS);
    const s = sc * crowd.k, c = off(12 * s, 17 * s), g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, 6 * s, 15.5 * s);
    g.lineCap = 'round'; g.strokeStyle = shirt; g.lineWidth = 1.5; g.fillStyle = skin;
    for (const [side, [hx, hy]] of [[-1, arms[0]], [1, arms[1]]]) {
      g.beginPath(); g.moveTo(2.3 * side, -5.2); g.lineTo(hx, hy); g.stroke();
      g.beginPath(); g.arc(hx, hy, 0.95, 0, 2 * Math.PI); g.fill();
    }
    g.fillStyle = shirt; rrect(g, -3, -6.4, 6, 7.4, 2.6); g.fill();
    g.fillStyle = skin; g.beginPath(); g.arc(0, -9.6, 3.5, 0, 2 * Math.PI); g.fill();
    g.fillStyle = hairCol; for (const d of HAIR[hair]) g.fill(new Path2D(d));
    if (face) {
      g.fillStyle = '#1d1d1f';
      for (const ex of [-1.15, 1.15]) { g.beginPath(); g.ellipse(ex, -9.7, 0.38, 0.6, 0, 0, 2 * Math.PI); g.fill(); }
      g.fill(new Path2D('M-1.15 -8.2Q0 -6.8 1.15 -8.2Z'));
    }
    return { img: c, sc, period: 0.55 + rnd() * 0.45, phase: rnd(), sway: (rnd() - 0.5) * 2 };
  }

  function rebuild() {
    const r = root.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if (!r.width || !r.height || !sr.height) return false;
    const dpr = Math.min(2, devicePixelRatio || 1);
    u = sr.height / 120; wU = r.width / u; x0 = 60 - wU / 2; y0 = (r.top - sr.top) / u;
    place(still, y0, y0 + r.height / u, dpr, r.width);
    place(crowd, CROWD[0], CROWD[1], 0.75, r.width); // below screen resolution: the stands sit out of focus
    place(action, ACTION[0], ACTION[1], dpr, r.width);
    const cs = getComputedStyle(root), v = (n) => cs.getPropertyValue(n).trim();
    C = { skyTop: v('--sky-top'), skyLow: v('--sky-low'), facade: v('--facade'), stands: v('--stands'), seats: v('--seats'), wall: v('--wall'), wallCap: v('--wall-cap'),
      grass: v('--grass'), track: v('--track'), dirt: v('--dirt'), pebble: v('--pebble'), chalk: v('--chalk'), bag: v('--bag'), bagTop: v('--bag-top'), haze: v('--haze'), dust: v('--dust'), scuff: v('--scuff'), lights: v('--lights') === '1' };

    // The still layer: sky, lights, upper deck, empty stands, wall and grass.
    const g = still.g; world(still);
    const sky = g.createLinearGradient(0, 0, 0, 60); sky.addColorStop(0, C.skyTop); sky.addColorStop(1, C.skyLow);
    g.fillStyle = sky; g.fillRect(x0, y0, wU, 60 - y0);
    if (C.lights) {
      const n = Math.max(2, Math.round(wU / 45));
      for (let i = 0; i < n; i++) {
        const x = x0 + wU * (i + 0.5) / n, glow = g.createRadialGradient(x, 6.5, 0, x, 6.5, 12);
        glow.addColorStop(0, 'rgba(255,246,216,0.55)'); glow.addColorStop(1, 'rgba(255,246,216,0)');
        g.fillStyle = glow; g.fillRect(x - 12, -6, 24, 25);
        g.fillStyle = '#fffbe8'; rrect(g, x - 4.5, 4, 9, 4.2, 0.6); g.fill();
        g.strokeStyle = '#c9c2a3'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(x - 3.4, 5.4); g.lineTo(x + 3.4, 5.4); g.moveTo(x - 3.4, 6.8); g.lineTo(x + 3.4, 6.8); g.stroke();
      }
    }
    g.fillStyle = C.facade; g.fillRect(x0, 11, wU, 5.5);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x0, 16.5, wU, 0.8);
    g.fillStyle = C.stands; g.fillRect(x0, 17.3, wU, 34);
    g.fillStyle = C.wall; g.fillRect(x0, 50, wU, 7);
    g.fillStyle = C.wallCap; g.fillRect(x0, 50, wU, 0.9);
    g.fillStyle = C.grass; g.fillRect(x0, 57, wU, Math.max(1, y0 + r.height / u - 57));
    g.fillStyle = C.track; g.globalAlpha = 0.55; g.fillRect(x0, 57, wU, 1.2); g.globalAlpha = 1;

    // The crowd: four tiers, back to front, from a fixed seed so it doesn't reshuffle.
    seed = 11; fans = [];
    for (const [y, sc] of TIERS) {
      const step = 7.4 * sc;
      for (let x = x0 - 4 + rnd() * step; x < x0 + wU + 4; x += step * (0.9 + rnd() * 0.25)) fans.push({ x, y, ...fanSprite(sc, sc > 0.42) });
    }

    // One tile of base path dirt with pebbles.
    tile = off(TILE * action.k, 15 * action.k); const t = tile.getContext('2d'); t.setTransform(action.k, 0, 0, action.k, 0, 0);
    t.fillStyle = C.dirt; t.fillRect(0, 0, TILE, 15); t.fillStyle = C.pebble;
    for (const [x, y, rr] of [[2, 1.5, 0.35], [7.5, 4.8, 0.45], [12, 2.2, 0.3], [16.5, 5.6, 0.4], [20.5, 1.2, 0.3], [5, 6.3, 0.25], [14, 0.6, 0.25], [22.5, 4, 0.35],
      [3.5, 9.5, 0.4], [9, 12.6, 0.3], [13.5, 8.4, 0.45], [18, 11.2, 0.3], [21.5, 13.8, 0.4], [6.8, 14.2, 0.25], [11, 10.4, 0.25], [23.2, 8.8, 0.3]]) { t.beginPath(); t.arc(x, y, rr, 0, 2 * Math.PI); t.fill(); }
    return true;
  }

  let ready = false, crowdAt = -1;
  function draw(d, t, bx) {
    if (!ready) ready = rebuild();
    if (!ready) return null;
    // Crowd strip (refreshed up to 40 times a second, plenty for a bounce): seat rows, then fans
    // hopping up (eased down) and swaying, each on their own beat, then haze.
    let g = crowd.g;
    if (Math.abs(t - crowdAt) >= 0.025) {
      crowdAt = t;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, crowd.c.width, crowd.c.height);
      world(crowd); g.fillStyle = C.seats;
      for (const [y, sc] of TIERS) g.fillRect(x0, y - 3.2 * sc, wU, 3.2 * sc);
      for (const fn of fans) {
        const ph = (t / fn.period + fn.phase) % 1, hop = Math.sin(Math.PI * ph) ** 2;
        world(crowd, fn.x, fn.y);
        g.translate(0, -3.4 * fn.sc * hop); g.rotate(0.06 * fn.sway * Math.sin(2 * Math.PI * ph));
        g.drawImage(fn.img, -6 * fn.sc, -15.5 * fn.sc, 12 * fn.sc, 17 * fn.sc);
      }
      world(crowd); g.fillStyle = C.haze; g.fillRect(x0, CROWD[0], wU, CROWD[1] - CROWD[0]); // aerial haze pushes the stands back
    }
    // Action strip: the base path scrolling under the runner, the chalk line and a base.
    g = action.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, action.c.width, action.c.height);
    world(action);
    const dm = ((d % TILE) + TILE) % TILE;
    for (let x = Math.floor((x0 + dm) / TILE) * TILE - dm; x < x0 + wU; x += TILE) g.drawImage(tile, x, PATH - 9, TILE + 2 / action.k, 15); // a pixel of overlap hides seams
    g.fillStyle = C.chalk; g.globalAlpha = 0.9; g.fillRect(x0, PATH + 3.2, wU, 0.9); g.globalAlpha = 1;
    if (bx > lastBx + 1) scuffed = false; // a fresh base came in from the right
    lastBx = bx;
    // The cleat's impact: the bag squashes and springs back with a damped wobble, gets a
    // small shove, a shock ring runs out across the dirt, and the bag keeps a scuff mark.
    const since = t - hitAt, live = since >= 0 && since < 0.6;
    const squash = live ? 0.32 * Math.exp(-since * 9) * Math.cos(since * 34) : 0;
    const shove = live ? -0.7 * Math.sin(Math.min(1, since * 6) * Math.PI / 2) * Math.exp(-since * 3) : 0;
    g.translate(bx, PATH - 0.6);
    if (live && since < 0.4) {
      const k = since / 0.4;
      g.strokeStyle = C.dust; g.globalAlpha = 0.45 * (1 - k); g.lineWidth = 0.5 * (1 - k) + 0.15;
      g.beginPath(); g.ellipse(0, 1.2, BAG / 2 + 7 * k, 0.8 + 1.1 * k, 0, 0, 2 * Math.PI); g.stroke(); g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(58,36,20,0.25)'; g.beginPath(); g.ellipse(0.6, 1.3, (BAG / 2 + 0.8) * (1 + squash * 0.4), 1, 0, 0, 2 * Math.PI); g.fill();
    g.translate(shove, 1.3); g.scale(1 + squash * 0.5, 1 - squash); g.translate(0, -1.3); // squash from the bottom edge
    g.fillStyle = C.bag; rrect(g, -BAG / 2, 1.3 - BH, BAG, BH, 0.6); g.fill();
    g.fillStyle = C.bagTop; rrect(g, -BAG / 2, 1.3 - BH, BAG, 0.8, 0.4); g.fill();
    if (scuffed) {
      g.fillStyle = C.scuff; g.beginPath(); g.ellipse(-0.4, -0.75, 2.6, 0.35, 0, 0, 2 * Math.PI); g.fill();
      for (const sx of [-2.2, -1, 0.4, 1.6]) { g.beginPath(); g.arc(sx, -0.55, 0.22, 0, 2 * Math.PI); g.fill(); }
    }
    world(action);
    return g;
  }
  // Dust kicked off the bag (and the impact above): chalky puffs that billow out, rise, spread and fade, and
  // drift back with the ground (they hang in the air while the runner moves on).
  let puffs = [], hitAt = -9, scuffed = false, lastBx = 0;
  const dust = (x, t) => { hitAt = t; scuffed = true; puff(x, t, 12, BAG * 0.42); };
  function puff(x, t, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.06 + 0.88 * rnd()), sp = 4 + rnd() * 8, side = rnd() < 0.5 ? -1 : 1;
      puffs.push({ x: x + side * (0.5 + rnd() * spread), y: PATH - 1 - rnd(), vx: Math.cos(a) * sp * side, vy: -Math.sin(a) * sp * 0.5, r: 0.6 + rnd() * 0.8, born: t, life: 0.45 + rnd() * 0.4, d0: null, c: rnd() < 0.65 ? C.dust : C.dirt });
    }
  }
  function front(g, d, t) {
    if (!puffs.length) return;
    puffs = puffs.filter((q) => t >= q.born && t - q.born < q.life);
    for (const q of puffs) {
      if (q.d0 === null) q.d0 = d;
      const age = (t - q.born) / q.life, e = 1 - (1 - age) ** 2; // fast out, slowing down
      const x = q.x + q.vx * e * q.life - (d - q.d0), y = q.y + q.vy * e * q.life - 1.2 * age;
      g.globalAlpha = 0.45 * (1 - age) ** 1.5; g.fillStyle = q.c;
      g.beginPath(); g.arc(x, y, q.r * (1 + 2 * age), 0, 2 * Math.PI); g.fill();
    }
    g.globalAlpha = 1;
  }
  const again = () => { ready = false; crowdAt = -1; onRebuild(); };
  if (window.ResizeObserver) { const ro = new ResizeObserver(again); ro.observe(root); if (stage !== root) ro.observe(stage); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', again);
  return { draw, front, dust, puff, span: () => [x0, x0 + wU], path: PATH, runX: 56 };
}
