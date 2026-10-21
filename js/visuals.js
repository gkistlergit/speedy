const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';

// ---------- Particle swirl (video test backdrop) ----------
// A slowly precessing vortex: three depth layers of comets spiral into a bright
// core, with tapered trails, bokeh in the foreground, nebula light, a breathing
// core glow, vignette and film grain. Speed follows the test's throughput.
export function createSwirl(canvas) {
  const ctx = canvas.getContext('2d');
  const PALETTE = [[77, 141, 255], [124, 58, 237], [56, 189, 248], [167, 139, 250], [37, 99, 235], [226, 232, 240], [99, 102, 241], [148, 163, 184]];
  const CORE = [226, 236, 255];
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
    vignette.addColorStop(0, 'rgba(6,8,12,0)'); vignette.addColorStop(1, 'rgba(6,8,12,0.78)');
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

    // deep background, lighter toward the core
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, '#161c2b'); bg.addColorStop(0.45, '#0f131c'); bg.addColorStop(1, '#07090d');
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
      const heat = 1 - smooth(0, R * 0.35, p.r); // brightens to white near the core
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
        ctx.fillStyle = `rgba(240,245,255,${(0.5 + p.z * 0.5) * tw * fade})`;
        ctx.beginPath(); ctx.arc(hx, hy, 0.7 + p.z * 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }

    // breathing core glow + flare
    const pulse = 0.85 + Math.sin(t * 3) * 0.15, core = R * (0.16 + intensity * 0.1 + flare * 0.25);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
    cg.addColorStop(0, `rgba(226,236,255,${(0.22 + intensity * 0.3 + flare * 0.5) * pulse})`);
    cg.addColorStop(0.35, `rgba(99,102,241,${(0.07 + intensity * 0.08 + flare * 0.2) * pulse})`);
    cg.addColorStop(1, 'rgba(99,102,241,0)');
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
  function legPose(p, o) {
    const th = hip(p), sh = th - knee(p), foot = -sh - ankle(p); // foot: rotation of the foot frame, degrees clockwise
    const k = along(o, th, L.thigh), a = along(k, sh, L.shin);
    return { o, k, a, foot, toe: rot(a, foot, [8.2, 3.2]), heel: rot(a, foot, [-3.6, 3.2]) };
  }
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
  const LOW = Math.max(...hipY);
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
  function drawArm(s, sh, el, far) {
    const e = along(s, sh, L.upper), fa = sh + el, w = along(e, fa, L.fore), h = along(w, fa + 12, 2.6);
    fill('skin', limb(s, e, [[0, 2.7, 2.9], [0.5, 2.2, 2.4], [1, 1.75, 1.85]]), far);
    fill('skin', limb(e, w, [[0, 1.8, 1.9], [0.35, 1.9, 2.1], [1, 1.25, 1.3]]), far);
    fill('glove', limb(along(w, fa, -1.1), h, [[0, 1.45, 1.5], [0.5, 1.75, 1.7], [0.8, 2.1, 2.0], [1, 1.7, 1.6]]), far);
    fill('red', band(along(w, fa, -0.9), along(w, fa, -0.1), 1.6, 1.65), far);
    fill('cream', limb(s, along(s, sh, L.upper * 0.5), [[0, 3.5, 3.6], [1, 3.0, 3.0]]), far);
    fill('red', band(along(s, sh, L.upper * 0.47), along(s, sh, L.upper * 0.53), 3.0, 3.0), far);
  }
  function pose(p) {
    p = ((p % 1) + 1) % 1; ops = [];
    const y = hipAt(p), o = [HIP_X, y];
    const lean = LEAN + 1.4 * Math.cos(4 * Math.PI * (p - 0.1)); // trunk dips forward slightly each step
    const top = along(o, 180 - lean, L.torso), base = along(o, -lean, 2.5);
    const sh = along(o, 180 - lean, L.torso - 2.6); // shoulder joint, a little below the top of the torso
    const tw = twist(p);
    ops.push(['shadow', 15 - Math.min(6, Math.max(0, LOW - y)) * 0.6]); // shrinks as the body rises
    drawArm(along(sh, 90 - lean, -0.6 + 0.7 * tw), shoulder(p + 0.5), elbow(p + 0.5), true);
    drawLeg(legPose(p + 0.5, [o[0] - 0.9 * tw, o[1]]), true);
    const chest = [[0, 4.8, 5.4], [0.35, 4.4, 4.1], [0.72, 5.4, 4.6], [0.92, 4.5, 4.5], [1, 3.4, 3.8]];
    fill('cream', limbUp(base, top, chest));
    // Placket piping: a red line just inside the front of the jersey, collar to belt.
    const u = [(top[0] - base[0]) / L.torso, (top[1] - base[1]) / L.torso], fwd = [-u[1], u[0]];
    const frontW = (t) => { let i = 0; while (chest[i + 1][0] < t) i++; const [t0, w0] = chest[i], [t1, w1] = chest[i + 1]; return w0 + (w1 - w0) * (t - t0) / (t1 - t0); };
    stroke('red', line([0.3, 0.45, 0.6, 0.75, 0.88].map((t) => { const c = lerp(base, top, t), w = frontW(t) - 1.1; return [c[0] + fwd[0] * w, c[1] + fwd[1] * w]; })), false, 0.55);
    fill('cream', limbUp(base, along(o, 180 - lean, 6.4), [[0, 4.9, 5.4], [1, 4.5, 4.2]]));
    fill('red', band(along(o, 180 - lean, 6.6), along(o, 180 - lean, 5.0), 4.55, 4.25));
    drawLeg(legPose(p, [o[0] + 0.9 * tw, o[1]]), false);

    const nb = along(top, 180 - lean - 6, 0.8), nt = along(nb, 180 - lean - 12, L.neck + 1.2);
    fill('skin', limbUp(nb, nt, [[0, 2.2, 2.4], [1, 1.9, 2.0]]));
    // Head in its own frame: origin at the top of the neck, x forward, y down; it stays steadier than the trunk.
    const tilt = -lean * 0.6, H = (pts) => outline(pts.map((pt) => rot(nt, tilt, pt)));
    fill('skin', H([[-4.4, -4.6], [-3.6, -8.4], [0, -10.4], [3.6, -9.2], [4.6, -6.6], [4.9, -5.2], [6.0, -3.6], [4.9, -3.0], [5.0, -2.0], [4.2, -0.6], [2.4, 0.2], [0.4, -0.2], [-2.2, -0.6], [-4.3, -2.2]]));
    fill('hair', H([[-4.9, -3.4], [-4.8, -6.6], [-2.6, -9.9], [0.6, -11.0], [3.6, -9.8], [4.7, -7.6], [3.4, -8.0], [1.0, -7.6], [-0.4, -6.4], [-1.6, -4.4], [-3.0, -2.6]]));
    // Batting helmet: hard shell with an ear flap over the near ear, a short bill and a glossy highlight.
    fill('red', H([[-5.0, -2.6], [-5.5, -5.8], [-4.4, -9.0], [-1.9, -11.0], [1.2, -11.4], [3.9, -10.3], [5.0, -8.5], [4.9, -7.3], [3.2, -7.1],
      [2.6, -5.8], [2.4, -3.6], [1.5, -1.9], [-0.5, -1.5], [-2.2, -2.0], [-3.4, -2.7]]));
    fill('red', H([[4.4, -8.3], [6.6, -8.1], [8.2, -7.4], [7.6, -6.8], [5.6, -6.8], [4.4, -7.0]]));
    fill('skin', H([[-0.9, -5.2], [0.4, -5.0], [0.6, -3.7], [-0.4, -3.2], [-1.2, -4.1]]), true);
    fill('shine', H([[-3.4, -8.4], [-1.5, -10.2], [1.3, -10.6], [3.0, -9.9], [1.1, -9.8], [-1.1, -9.3], [-2.8, -7.8]]));
    drawArm(along(sh, 90 - lean, 0.6 - 0.7 * tw), shoulder(p), elbow(p), false);
  }

  // Colours come from CSS custom properties on the canvas (light and dark themes).
  // The far arm and leg are drawn noticeably darker so the legs read as near and far.
  let C = {};
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`; };
  function colours() {
    const cs = getComputedStyle(root), v = (n) => cs.getPropertyValue(n).trim();
    C = { skin: v('--skin'), hair: v('--hair'), cream: v('--cream'), red: v('--red'), glove: v('--navy'), sole: v('--sole'), spike: v('--spike'), seam: v('--seam'), shine: 'rgba(255,255,255,0.3)' };
    C.far = {};
    for (const k in C) C.far[k] = /^#[0-9a-f]{6}$/i.test(C[k]) ? shade(C[k], 0.74) : C[k];
    C.outline = v('--outline');
  }
  // A dark outline around the whole silhouette makes him pop off the crowd and the grass:
  // every shape is stroked first, then filled over, so only the outer edge survives.
  function render(ctx) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const op of ops) if (typeof op[1] === 'string') op.path = new Path2D(op[1]);
    const all = new Path2D();
    for (const op of ops) if (op.path && !op[3] && op[0] !== 'shine') all.addPath(op.path);
    ctx.strokeStyle = C.outline; ctx.lineWidth = 1.6; ctx.stroke(all);
    for (const op of ops) {
      if (op[0] === 'shadow') { ctx.fillStyle = 'rgba(40,24,12,0.24)'; ctx.beginPath(); ctx.ellipse(HIP_X + 2, GROUND + 0.8, op[1], 1.8, 0, 0, 2 * Math.PI); ctx.fill(); continue; }
      if (op[0] === 'spike') {
        const g = op[1]; ctx.save(); ctx.translate(g.a[0], g.a[1]); ctx.rotate(rad(g.foot)); ctx.fillStyle = C.spike; ctx.fill(SPIKES); ctx.restore(); continue;
      }
      const [key, , far, w] = op, path = op.path, col = (far ? C.far : C)[key];
      if (w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(path); continue; }
      ctx.fillStyle = col; ctx.fill(path);
      if (key === 'cream' && C.seam !== 'transparent') { ctx.strokeStyle = C.seam; ctx.lineWidth = 0.35; ctx.stroke(path); }
    }
  }

  const K = 0.6; // the runner's own 120-unit frame, scaled down onto the base path
  const park = createBallpark(root, stage, () => { colours(); draw(lastT); });
  // Bases are timed to his steps: one comes by every few strides and a foot lands right on it
  // (the near foot strikes at whole cycles, the far foot at half cycles; ground moves `step` per strike).
  const step = speed * K * CYCLE / 2, ox = park.runX - HIP_X * K;
  const strikeX = ox + (legPose(0, [HIP_X + 0.9 * twist(0), 0]).a[0] + 2) * K; // middle of the planted cleat
  let raf = 0, t0 = 0, lastT = 0, lastBase = -1;
  function draw(t) {
    lastT = t;
    const d = t * speed * K, span = park.span(), G = Math.ceil((span[1] - span[0] + 24) / step) * step;
    const A = span[1] + 8 - strikeX, bx = strikeX + A - (((d + A) % G) + G) % G;
    const n = Math.floor(d / G);
    if (n !== lastBase && lastBase !== -1 && raf) park.dust(strikeX, t); // the cleat hits the bag
    lastBase = n;
    const ctx = park.draw(d, t, bx);
    if (!ctx) return;
    pose(t / CYCLE);
    ctx.save(); ctx.translate(ox, park.path - GROUND * K); ctx.scale(K, K);
    render(ctx); ctx.restore();
    park.front(ctx, d, t);
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
  const CROWD = [11, 50.5], ACTION = [30, 96]; // world y-ranges of the redrawn strips
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
    place(crowd, CROWD[0], CROWD[1], 1, r.width);
    place(action, ACTION[0], ACTION[1], dpr, r.width);
    const cs = getComputedStyle(root), v = (n) => cs.getPropertyValue(n).trim();
    C = { skyTop: v('--sky-top'), skyLow: v('--sky-low'), facade: v('--facade'), stands: v('--stands'), seats: v('--seats'), wall: v('--wall'), wallCap: v('--wall-cap'),
      grass: v('--grass'), track: v('--track'), dirt: v('--dirt'), pebble: v('--pebble'), chalk: v('--chalk'), bag: v('--bag'), bagTop: v('--bag-top'), haze: v('--haze'), dust: v('--dust'), lights: v('--lights') === '1' };

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
    for (const [y, sc] of [[24, 0.36], [31, 0.44], [39, 0.54], [48, 0.68]]) {
      const step = 7.4 * sc;
      for (let x = x0 - 4 + rnd() * step; x < x0 + wU + 4; x += step * (0.9 + rnd() * 0.25)) fans.push({ x, y, ...fanSprite(sc, sc > 0.5) });
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
      for (const [y, sc] of [[24, 0.36], [31, 0.44], [39, 0.54], [48, 0.68]]) g.fillRect(x0, y - 3.2 * sc, wU, 3.2 * sc);
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
    g.translate(bx, PATH - 0.6);
    g.fillStyle = 'rgba(58,36,20,0.25)'; g.beginPath(); g.ellipse(0.6, 1.3, 5.2, 1, 0, 0, 2 * Math.PI); g.fill();
    g.fillStyle = C.bag; rrect(g, -4.4, -1.1, 8.8, 2.4, 0.6); g.fill();
    g.fillStyle = C.bagTop; rrect(g, -4.4, -1.1, 8.8, 0.8, 0.4); g.fill();
    world(action);
    return g;
  }
  // Dust kicked off the bag: chalky puffs that billow out, rise, spread and fade, and
  // drift back with the ground (they hang in the air while the runner moves on).
  let puffs = [];
  function dust(x, t) {
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.06 + 0.88 * rnd()), sp = 4 + rnd() * 8, side = rnd() < 0.5 ? -1 : 1;
      puffs.push({ x: x + side * (0.5 + rnd() * 3.5), y: PATH - 1 - rnd(), vx: Math.cos(a) * sp * side, vy: -Math.sin(a) * sp * 0.5, r: 0.6 + rnd() * 0.8, born: t, life: 0.45 + rnd() * 0.4, d0: null, c: rnd() < 0.65 ? C.dust : C.dirt });
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
  return { draw, front, dust, span: () => [x0, x0 + wU], path: PATH, runX: 56 };
}
