const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';

// ---------- Particle swirl (video test backdrop) ----------
// A slowly precessing vortex: three depth layers of comets spiral into a warm
// core, with tapered trails, bokeh in the foreground, nebula light, a breathing
// core glow, vignette and film grain. Speed follows the test's throughput.
export function createSwirl(canvas) {
  const ctx = canvas.getContext('2d');
  const PALETTE = [[201, 183, 156], [176, 122, 85], [143, 163, 130], [216, 199, 168], [166, 94, 63], [230, 220, 200], [111, 132, 102], [196, 154, 58]];
  const CORE = [255, 236, 206];
  let W = 0, H = 0, R = 0, parts = [], bokeh = [], raf = 0, intensity = 0.35, target = 0.35, t = 0, flare = 0, last = 0;
  let vignette = null, grain = null;
  const smooth = (e0, e1, x) => { const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  function spawn(anywhere) {
    const z = Math.random() < 0.55 ? 0.35 + Math.random() * 0.25 : Math.random() < 0.8 ? 0.65 + Math.random() * 0.2 : 0.9 + Math.random() * 0.1;
    return {
      r: anywhere ? Math.sqrt(Math.random()) * R : R * (0.85 + Math.random() * 0.25),
      a: Math.random() * Math.PI * 2,
      w: (0.35 + Math.random()) * 0.012,
      c: PALETTE[(Math.random() * PALETTE.length) | 0],
      s: 0.4 + Math.random() * 1.4,
      z, tw: Math.random() * Math.PI * 2,
      spark: Math.random() < 0.18,
    };
  }
  function makeGrain() {
    const g = document.createElement('canvas'); g.width = g.height = 128;
    const gx = g.getContext('2d'), img = gx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = (Math.random() * 255) | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    gx.putImageData(img, 0, 0);
    return ctx.createPattern(g, 'repeat');
  }
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight; R = Math.hypot(W, H) / 1.7;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(1000, (W * H) / 360));
    parts = Array.from({ length: n }, () => spawn(true));
    bokeh = Array.from({ length: 14 }, () => ({ r: R * (0.35 + Math.random() * 0.75), a: Math.random() * Math.PI * 2, w: 0.0006 + Math.random() * 0.0012, size: 14 + Math.random() * 34, c: PALETTE[(Math.random() * PALETTE.length) | 0] }));
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vignette.addColorStop(0, 'rgba(10,8,6,0)'); vignette.addColorStop(1, 'rgba(10,8,6,0.78)');
    if (!grain) grain = makeGrain();
  }
  function frame(now) {
    const k = last ? Math.min(3, (now - last) / 16.667) : 1; last = now;
    t += (0.004 + intensity * 0.01) * k;
    intensity += (target - intensity) * 0.03 * k;
    flare *= Math.pow(0.965, k);
    const cx = W * 0.5 + Math.sin(t * 0.7) * W * 0.05;
    const cy = H * 0.48 + Math.cos(t * 0.5) * H * 0.035;
    const tilt = 0.8 + Math.sin(t * 0.31) * 0.07, rot = Math.sin(t * 0.17) * 0.35;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const proj = (a, r) => { const x = Math.cos(a) * r, y = Math.sin(a) * r * tilt; return [cx + x * cr - y * sr, cy + x * sr + y * cr]; };

    // deep background, warm toward the core
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, '#2b231c'); bg.addColorStop(0.45, '#1d1915'); bg.addColorStop(1, '#100d0b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    // nebula light
    const blobs = [['176,122,85', 0], ['111,132,102', 2.1], ['201,183,156', 4.2]];
    for (const [rgb, off] of blobs) {
      const bx = cx + Math.cos(t + off) * W * 0.28, by = cy + Math.sin(t * 1.1 + off) * H * 0.22;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(W, H) * 0.5);
      g.addColorStop(0, `rgba(${rgb},${0.05 + intensity * 0.04})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // far-side bokeh (soft, slow)
    for (const b of bokeh) {
      b.a += b.w * (0.6 + intensity * 2) * k;
      const [x, y] = proj(b.a, b.r);
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.size);
      g.addColorStop(0, `rgba(${b.c},0.07)`); g.addColorStop(0.7, `rgba(${b.c},0.04)`); g.addColorStop(1, `rgba(${b.c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.size, 0, Math.PI * 2); ctx.fill();
    }

    // comets
    const spin = 0.5 + intensity * 2.6, pull = 0.12 + intensity * 1.3, trail = 12 + intensity * 20;
    ctx.lineCap = 'round';
    for (const p of parts) {
      const da = p.w * spin * (1 + 60 / (p.r + 30)) * p.z, dr = pull * (0.25 + (p.r / R) * 1.4) * p.z;
      p.a += da * k; p.r -= dr * k;
      if (p.r < 4) { Object.assign(p, spawn(false)); continue; }
      const fade = smooth(4, R * 0.1, p.r) * smooth(R * 1.1, R * 0.85, p.r);
      if (fade < 0.01) continue;
      const heat = 1 - smooth(0, R * 0.35, p.r); // warms to white near the core
      const col = p.c.map((v, i) => Math.round(v + (CORE[i] - v) * heat * 0.8)).join(',');
      const [hx, hy] = proj(p.a, p.r);
      const [mx, my] = proj(p.a - da * trail * 0.5, p.r + dr * trail * 0.5);
      const [tx, ty] = proj(p.a - da * trail, p.r + dr * trail);
      const lw = p.s * (0.45 + p.z * 0.9) * (1 + heat * 0.9), al = (0.22 + p.z * 0.6) * fade;
      ctx.strokeStyle = `rgba(${col},${al * 0.45})`; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(mx, my, hx, hy); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},${al})`; ctx.lineWidth = lw * 1.15;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(hx, hy); ctx.stroke();
      if (p.spark) {
        const tw = 0.55 + 0.45 * Math.sin(t * 9 + p.tw);
        ctx.fillStyle = `rgba(255,246,232,${(0.5 + p.z * 0.5) * tw * fade})`;
        ctx.beginPath(); ctx.arc(hx, hy, 0.7 + p.z * 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }

    // breathing core glow + flare
    const pulse = 0.85 + Math.sin(t * 3) * 0.15, core = R * (0.16 + intensity * 0.1 + flare * 0.25);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
    cg.addColorStop(0, `rgba(255,236,206,${(0.22 + intensity * 0.3 + flare * 0.5) * pulse})`);
    cg.addColorStop(0.35, `rgba(211,155,116,${(0.07 + intensity * 0.08 + flare * 0.2) * pulse})`);
    cg.addColorStop(1, 'rgba(211,155,116,0)');
    ctx.fillStyle = cg; ctx.fillRect(cx - core, cy - core, core * 2, core * 2);

    // cinematic finish: vignette + grain
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.045; ctx.save(); ctx.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0);
    ctx.fillStyle = grain; ctx.fillRect(-128, -128, W + 256, H + 256); ctx.restore(); ctx.globalAlpha = 1;
    if (raf) raf = requestAnimationFrame(frame);
  }
  const ro = new ResizeObserver(() => { resize(); if (!raf) { last = 0; frame(performance.now()); } });
  return {
    start() {
      if (raf) return; ro.observe(canvas); resize(); last = 0;
      if (reduceMotion()) { target = intensity = 0.1; frame(performance.now()); return; }
      raf = requestAnimationFrame(frame);
    },
    stop() { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); },
    set(v) { target = Math.max(0, Math.min(1, v)); },
    burst() { flare = 1; },
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
