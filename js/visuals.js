const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';

// ---------- Test-footage player (video test) ----------
// Renders a looping dusk scene with the Speedy runner into an offscreen
// frame at the quality being tested (360 px tall for 360p, and so on),
// then scales it to the player, so low qualities really look soft.
// Stalls (freezes) while buffering, like a real player.
const lerpKeys = (keys, p) => {
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) { const [p0, v0] = keys[i - 1], [p1, v1] = keys[i]; return v0 + ((p - p0) / (p1 - p0)) * (v1 - v0); }
  }
  return keys[keys.length - 1][1];
};
const THIGH = [[0, -38], [0.5, 36], [1, -38]];
const SHIN = [[0, 12], [0.3, 18], [0.55, 40], [0.75, 105], [1, 12]];
const ridge = (x, seed, amp) => (Math.sin(x * 1.3 + seed) * 0.5 + Math.sin(x * 2.9 + seed * 2.1) * 0.3 + Math.sin(x * 6.1 + seed * 0.7) * 0.2) * amp;
const R = { jersey: '#e6d6bb', cap: '#7d9472', skin: '#d6a47a', pants: '#e2d8c8', sock: '#b07a55', shoe: '#a07a5c', ink: '#1a1612' };

function drawRunner(c, phase) {
  // Same figure as the idle-screen runner, in its 120-unit box (hip at 60,74).
  const limb = (x0, y0, x1, y1, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const leg = (p, dim) => {
    c.save(); c.translate(60, 74); c.rotate((lerpKeys(THIGH, p) * Math.PI) / 180); limb(0, 0, 0, 14, 7.5, R.pants);
    c.translate(0, 14); c.rotate((lerpKeys(SHIN, p) * Math.PI) / 180); limb(0, 0, 0, 11, 5.5, R.sock);
    c.fillStyle = R.shoe; c.beginPath(); c.ellipse(3, 12.5, 5, 2.6, 0, 0, Math.PI * 2); c.fill(); c.restore();
    if (dim) { /* dimmed via globalAlpha by caller */ }
  };
  const arm = (p) => {
    const a = 48 - 100 * (0.5 - 0.5 * Math.cos(p * Math.PI * 2));
    c.save(); c.translate(60, 52); c.rotate((a * Math.PI) / 180); limb(0, 0, 0, 11, 6, R.jersey);
    c.translate(0, 11); c.rotate((-80 * Math.PI) / 180); limb(0, 0, 0, 9, 4.6, R.skin); c.restore();
  };
  const back = (phase + 0.5) % 1;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.translate(0, -3 * Math.pow(Math.sin(phase * Math.PI * 2), 2));
  c.translate(60, 74); c.rotate((9 * Math.PI) / 180); c.translate(-60, -74);
  c.filter = 'brightness(0.8)'; arm(back); leg(back); c.filter = 'none';
  c.fillStyle = R.jersey; c.strokeStyle = R.ink; c.lineWidth = 1.6;
  c.beginPath(); c.roundRect(51.5, 45, 17, 31, 7); c.fill(); c.stroke();
  limb(52, 66, 68, 66, 2.4, R.sock);
  c.fillStyle = R.skin; c.lineWidth = 1.6; c.beginPath(); c.arc(62, 36, 8.5, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = R.cap; c.lineWidth = 1.2; c.beginPath(); c.arc(62, 35, 8.6, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(69.5, 33.6, 9.4, 3.2, 1.6); c.fill(); c.stroke();
  leg(phase); arm(phase);
  c.restore();
}

function drawScene(c, w, h, t) {
  // sky
  const sky = c.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, '#2c2f3c'); sky.addColorStop(0.5, '#8a6a63'); sky.addColorStop(1, '#e8bf8f');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  // sun + glow
  const sx = w * 0.68, sy = h * 0.5, sr = h * 0.085;
  const glow = c.createRadialGradient(sx, sy, sr * 0.5, sx, sy, h * 0.6);
  glow.addColorStop(0, 'rgba(255,224,170,0.55)'); glow.addColorStop(1, 'rgba(255,224,170,0)');
  c.fillStyle = glow; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fbe6bd'; c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
  // clouds
  c.fillStyle = 'rgba(255,236,214,0.18)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 0.31 + 0.1 - t * 0.004 * (1 + i * 0.3)) % 1.3 + 1.3) % 1.3 * w - w * 0.15, cy = h * (0.14 + i * 0.07);
    c.beginPath(); c.ellipse(cx, cy, w * 0.11, h * 0.018, 0, 0, Math.PI * 2); c.ellipse(cx + w * 0.05, cy - h * 0.012, w * 0.06, h * 0.016, 0, 0, Math.PI * 2); c.fill();
  }
  // three ridge layers, parallax
  const layers = [[0.6, 0.06, '#7c6a72', 0.01, 1.1], [0.67, 0.07, '#6f8466', 0.03, 2.3], [0.75, 0.06, '#3e4a3d', 0.07, 3.7]];
  for (const [base, amp, col, speed, seed] of layers) {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w + 8; x += Math.max(4, w / 160)) c.lineTo(x, h * (base + ridge(x / w * 3 + t * speed * 3, seed, amp)));
    c.lineTo(w, h); c.closePath(); c.fill();
  }
  // haze over the ridges
  const haze = c.createLinearGradient(0, h * 0.55, 0, h * 0.8);
  haze.addColorStop(0, 'rgba(232,191,143,0.22)'); haze.addColorStop(1, 'rgba(232,191,143,0)');
  c.fillStyle = haze; c.fillRect(0, h * 0.5, w, h * 0.3);
  // track
  const gy = h * 0.8;
  c.fillStyle = '#2a2420'; c.fillRect(0, gy, w, h - gy);
  c.fillStyle = '#b07a55'; c.fillRect(0, gy, w, h * 0.012);
  c.strokeStyle = 'rgba(237,230,218,0.5)'; c.lineWidth = Math.max(1, h * 0.006); c.setLineDash([w * 0.05, w * 0.05]);
  c.lineDashOffset = (t * w * 0.42) % (w * 0.1); c.beginPath(); c.moveTo(0, gy + h * 0.09); c.lineTo(w, gy + h * 0.09); c.stroke(); c.setLineDash([]);
  // fence posts whipping past
  c.fillStyle = '#4a3c33';
  const gap = w * 0.22, off = (t * w * 0.42) % gap;
  for (let x = -off; x < w + gap; x += gap) { c.fillRect(x, gy - h * 0.07, Math.max(2, w * 0.006), h * 0.07); }
  c.fillRect(0, gy - h * 0.055, w, Math.max(1, h * 0.004));
  // runner, with speed lines
  const k = (h * 0.42) / 77;
  c.save(); c.translate(w * 0.3 - 60 * k, gy - 101 * k); c.scale(k, k);
  c.strokeStyle = 'rgba(255,240,220,0.45)'; c.lineWidth = 2; c.lineCap = 'round';
  for (const [y, len, ph] of [[54, 16, 0], [64, 22, 0.33], [74, 12, 0.66]]) {
    const a = 0.5 + 0.5 * Math.sin((t * 2.2 + ph) * Math.PI * 2); c.globalAlpha = 0.25 + a * 0.6;
    c.beginPath(); c.moveTo(34 - a * 6, y); c.lineTo(34 - a * 6 - len, y); c.stroke();
  }
  c.globalAlpha = 1;
  drawRunner(c, (t / 0.45) % 1);
  c.restore();
  // vignette
  const v = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
}

export function createPlayer(canvas, ambient) {
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas'); const octx = off.getContext('2d');
  const amb = ambient ? ambient.getContext('2d') : null;
  let raf = 0, t = 0, last = 0, quality = 1080, stalled = false, dim = 0, frameN = 0;
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
    if (ambient) { ambient.width = 48; ambient.height = 27; }
  }
  function render() {
    if (!canvas.width) size();
    const oh = Math.max(90, Math.min(quality, canvas.height)), ow = Math.round((oh * 16) / 9);
    if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh; }
    drawScene(octx, ow, oh, t);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = oh < canvas.height * 0.6 ? 'low' : 'high';
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    if (dim > 0.01) { ctx.fillStyle = `rgba(16,13,10,${dim})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (amb && frameN++ % 6 === 0) amb.drawImage(off, 0, 0, 48, 27);
  }
  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    if (!stalled) t += dt;
    dim += ((stalled ? 0.35 : 0) - dim) * 0.15;
    render();
    raf = requestAnimationFrame(frame);
  }
  const ro = new ResizeObserver(() => { size(); if (!raf) render(); });
  return {
    start() { if (raf) return; ro.observe(canvas); size(); last = 0; if (reduceMotion()) { t = 0.2; render(); return; } raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); },
    quality(px) { quality = px; if (!raf) render(); },
    stall(on) { stalled = !!on; },
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
