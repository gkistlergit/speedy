// Speedy network engine. All tests run against Cloudflare's free public
// speed endpoints (the same ones speed.cloudflare.com uses).
const CF = 'https://speed.cloudflare.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.random().toString(36).slice(2);
export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const toMbps = (bytes, ms) => (bytes * 8) / (ms / 1000) / 1e6;

// ---------- Who is my provider? ----------
const CELL_RE = /t-mobile|cellco|verizon wireless|at&t mobility|mobility llc|sprint|u\.?s\.? cellular|visible|cricket|boost|dish wireless|metro ?pcs|tracfone|mint mobile|google fi/i;
const PRETTY = [
  [/comcast/i, 'Xfinity'], [/charter|spectrum/i, 'Spectrum'], [/cellco|verizon wireless/i, 'Verizon Wireless'],
  [/verizon/i, 'Verizon'], [/t-mobile/i, 'T-Mobile'], [/at&t mobility/i, 'AT&T Wireless'], [/at&t|att-internet/i, 'AT&T'],
  [/metronet/i, 'Metronet'], [/cox/i, 'Cox'], [/frontier/i, 'Frontier'], [/centurylink|lumen/i, 'CenturyLink'],
  [/google fiber/i, 'Google Fiber'], [/starlink|spacex/i, 'Starlink'], [/wow|wide open west/i, 'WOW!'],
];
export function prettyIsp(org = '') {
  const clean = org.replace(/^AS\d+\s+/, '');
  for (const [re, name] of PRETTY) if (re.test(clean)) return name;
  return clean.replace(/,?\s+(LLC|Inc\.?|L\.L\.C\.|Corporation|Communications|Holdings).*$/i, '').trim() || 'Your network';
}
export function guessConnection(org = '') {
  const t = navigator.connection && navigator.connection.type;
  if (t === 'wifi' || t === 'ethernet') return 'wifi';
  if (t === 'cellular') return 'cellular';
  if (CELL_RE.test(org)) return 'cellular';
  return org ? 'wifi' : 'unknown';
}

async function getJSON(url, ms = 5000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: c.signal });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function networkInfo() {
  try {
    const m = await getJSON(`${CF}/meta`);
    if (m && (m.asOrganization || m.clientIp)) {
      const colo = m.colo && typeof m.colo === 'object' ? [m.colo.city, m.colo.iata && `(${m.colo.iata})`].filter(Boolean).join(' ') : m.colo;
      return { org: m.asOrganization || '', isp: prettyIsp(m.asOrganization), ip: m.clientIp, city: m.city, region: m.region, colo, source: 'cloudflare' };
    }
  } catch {}
  try {
    const m = await getJSON('https://ipinfo.io/json');
    return { org: m.org || '', isp: prettyIsp(m.org), ip: m.ip, city: m.city, region: m.region, colo: null, source: 'ipinfo' };
  } catch {}
  try {
    const m = await getJSON('https://ipapi.co/json/');
    return { org: m.org || '', isp: prettyIsp(m.org), ip: m.ip, city: m.city, region: m.region, colo: null, source: 'ipapi' };
  } catch {}
  return { org: '', isp: 'Your network', ip: null, city: null, region: null, colo: null, source: null };
}

// ---------- Latency ----------
let probes = 0;
async function probe(timeout = 3000) {
  const url = `${CF}/__down?bytes=0&r=${rnd()}`;
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), timeout);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: c.signal });
    await r.arrayBuffer();
    let ms = performance.now() - t0;
    const e = performance.getEntriesByName(url).pop();
    if (e && e.responseStart > 0 && e.requestStart > 0) ms = e.responseStart - e.requestStart;
    const st = r.headers.get('server-timing');
    const m = st && /dur=([\d.]+)/.exec(st);
    if (m) ms = Math.max(0.5, ms - parseFloat(m[1]));
    if (++probes % 100 === 0) performance.clearResourceTimings();
    return ms;
  } finally { clearTimeout(timer); }
}

export async function isOnline() {
  try { await probe(4000); return true; } catch {}
  try {
    await fetch(`https://www.google.com/favicon.ico?r=${rnd()}`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return true;
  } catch { return false; }
}

export async function idleLatency({ count = 20, onSample } = {}) {
  const samples = []; let lost = 0;
  try { await probe(); } catch {} // warm the connection
  for (let i = 0; i < count; i++) {
    try { const ms = await probe(); samples.push(ms); onSample && onSample(ms, i / count); }
    catch { lost++; }
    await sleep(40);
  }
  return { ping: median(samples), jitter: jitter(samples), samples, loss: lost / count };
}
function jitter(s) {
  if (s.length < 2) return null;
  let t = 0; for (let i = 1; i < s.length; i++) t += Math.abs(s[i] - s[i - 1]);
  return t / (s.length - 1);
}

// Pings every 400 ms while a transfer is running: latency under load.
function loadedPinger() {
  const samples = []; let on = true;
  (async () => {
    await sleep(800);
    while (on) {
      try { const ms = await probe(4000); if (on) samples.push(ms); } catch { if (on) samples.push(4000); }
      await sleep(400);
    }
  })();
  return { stop() { on = false; return samples; } };
}

// ---------- Throughput ----------
function ticker(getBytes, start, onTick, seconds) {
  const hist = [[start, 0]];
  const id = setInterval(() => {
    const now = performance.now(); const b = getBytes();
    hist.push([now, b]);
    let j = hist.length - 1; while (j > 0 && now - hist[j][0] < 1000) j--;
    const live = toMbps(b - hist[j][1], now - hist[j][0] || 1);
    onTick && onTick(live, Math.min(1, (now - start) / (seconds * 1000)));
  }, 100);
  return { stop() { clearInterval(id); return hist; } };
}
// Steady-state speed: skip the ramp-up, then average 500 ms windows,
// ignoring the slowest fifth (TCP hiccups) the way most testers do.
function steady(hist, warmFrac = 0.25) {
  const t0 = hist[0][0], t1 = hist[hist.length - 1][0];
  const warm = t0 + (t1 - t0) * warmFrac;
  const win = [];
  let a = hist.findIndex((h) => h[0] >= warm); if (a < 0) a = 0;
  for (let i = a; i < hist.length; i++) {
    let j = i; while (j < hist.length && hist[j][0] - hist[i][0] < 500) j++;
    if (j >= hist.length) break;
    win.push(toMbps(hist[j][1] - hist[i][1], hist[j][0] - hist[i][0]));
    i = j - 1;
  }
  if (!win.length) { const last = hist[hist.length - 1]; return toMbps(last[1], last[0] - t0); }
  win.sort((x, y) => x - y);
  const keep = win.slice(Math.floor(win.length * 0.2));
  return keep.reduce((s, v) => s + v, 0) / keep.length;
}

export async function download({ seconds = 10, streams = 6, onTick, signal } = {}) {
  const ctrl = new AbortController();
  signal && signal.addEventListener('abort', () => ctrl.abort());
  let bytes = 0; const start = performance.now();
  const pinger = loadedPinger();
  const tick = ticker(() => bytes, start, onTick, seconds);
  const worker = async (delay) => {
    await sleep(delay);
    while (!ctrl.signal.aborted) {
      try {
        const r = await fetch(`${CF}/__down?bytes=50000000&r=${rnd()}`, { cache: 'no-store', signal: ctrl.signal });
        const rd = r.body.getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; }
      } catch { if (ctrl.signal.aborted) break; await sleep(250); }
    }
  };
  const ws = Array.from({ length: streams }, (_, i) => worker(i * 120));
  await Promise.race([sleep(seconds * 1000), new Promise((r) => ctrl.signal.addEventListener('abort', r))]);
  ctrl.abort();
  const hist = tick.stop(); const loaded = pinger.stop();
  await Promise.allSettled(ws);
  if (signal && signal.aborted) throw new DOMException('cancelled', 'AbortError');
  return { mbps: steady(hist), bytes, loaded: median(loaded), loadedSamples: loaded };
}

let payload;
function getPayload() {
  if (payload) return payload;
  const size = 16 * 1024 * 1024; const buf = new Uint8Array(size);
  for (let i = 0; i < size; i += 65536) crypto.getRandomValues(buf.subarray(i, Math.min(size, i + 65536)));
  return (payload = buf);
}
export async function upload({ seconds = 10, streams = 4, onTick, signal } = {}) {
  const ctrl = new AbortController();
  signal && signal.addEventListener('abort', () => ctrl.abort());
  const data = getPayload();
  let bytes = 0; let chunk = 256 * 1024; const start = performance.now();
  const pinger = loadedPinger();
  const tick = ticker(() => bytes, start, onTick, seconds);
  const worker = async (delay) => {
    await sleep(delay);
    while (!ctrl.signal.aborted) {
      const size = chunk; const t0 = performance.now();
      try {
        const body = new Blob([data.subarray(0, size)], { type: 'text/plain' });
        const r = await fetch(`${CF}/__up?r=${rnd()}`, { method: 'POST', body, cache: 'no-store', signal: ctrl.signal });
        await r.arrayBuffer();
        bytes += size;
        const took = performance.now() - t0;
        // aim for ~1 s per request so progress stays smooth
        if (took < 700) chunk = Math.min(data.length, chunk * 2);
        else if (took > 2500 && chunk > 128 * 1024) chunk = chunk >> 1;
      } catch { if (ctrl.signal.aborted) break; await sleep(250); }
    }
  };
  const ws = Array.from({ length: streams }, (_, i) => worker(i * 150));
  await Promise.race([sleep(seconds * 1000), new Promise((r) => ctrl.signal.addEventListener('abort', r))]);
  ctrl.abort();
  const hist = tick.stop(); const loaded = pinger.stop();
  await Promise.allSettled(ws);
  if (signal && signal.aborted) throw new DOMException('cancelled', 'AbortError');
  return { mbps: steady(hist, 0.3), bytes, loaded: median(loaded), loadedSamples: loaded };
}

// Bufferbloat grade from how much lag grows when the line is busy.
export function bloatGrade(idle, loadedDown, loadedUp) {
  if (idle == null) return null;
  const worst = Math.max(loadedDown ?? idle, loadedUp ?? idle);
  const inc = Math.max(0, worst - idle);
  const grade = inc < 5 ? 'A+' : inc < 30 ? 'A' : inc < 60 ? 'B' : inc < 200 ? 'C' : inc < 400 ? 'D' : 'F';
  return { grade, increase: inc };
}

// ---------- Video streaming test ----------
// Plays simulated 2-second video segments at each quality's real-world
// bitrate, the way a streaming player does, and checks whether each one
// arrives faster than it would play (no buffering).
export const LADDER = [
  { q: '360p', mbps: 0.75 }, { q: '480p', mbps: 1.2 }, { q: '720p', mbps: 2.5 },
  { q: '1080p', mbps: 5 }, { q: '1440p', mbps: 10 }, { q: '4K', mbps: 20 },
];
export async function videoTest({ onStep, signal } = {}) {
  const SEG = 2; const out = []; let totalBytes = 0;
  for (const rung of LADDER) {
    if (signal && signal.aborted) throw new DOMException('cancelled', 'AbortError');
    const segBytes = Math.round((rung.mbps * 1e6 * SEG) / 8);
    const times = []; let fails = 0; let startup = null;
    onStep && onStep({ rung, phase: 'start' });
    for (let s = 0; s < 4; s++) {
      const t0 = performance.now();
      try {
        const r = await fetch(`${CF}/__down?bytes=${segBytes}&r=${rnd()}`, { cache: 'no-store', signal });
        await r.arrayBuffer();
      } catch (e) { if (signal && signal.aborted) throw e; fails += 2; break; }
      const ms = performance.now() - t0; totalBytes += segBytes;
      if (startup == null) startup = ms;
      times.push(ms);
      if (ms > SEG * 1000 * 0.9) fails++;
      onStep && onStep({ rung, phase: 'segment', ms, throughput: toMbps(segBytes, ms) });
      if (fails >= 2) break;
    }
    const ok = fails < 2;
    const res = { q: rung.q, mbps: rung.mbps, ok, startup, buffering: fails, avgMs: times.length ? times.reduce((a, b) => a + b) / times.length : null };
    out.push(res);
    onStep && onStep({ rung, phase: 'done', res });
    if (!ok) break;
  }
  const best = [...out].reverse().find((r) => r.ok);
  return { rungs: out, best: best ? best.q : 'None', startup: out[0] && out[0].startup, bytes: totalBytes };
}

// ---------- Service status ----------
export async function checkService(svc) {
  const res = { id: svc.id, at: Date.now(), reach: null, ms: null, official: null, incident: null };
  const t0 = performance.now();
  try {
    await fetch(`https://${svc.host}/favicon.ico?r=${rnd()}`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(7000) });
    res.reach = true; res.ms = Math.round(performance.now() - t0);
  } catch { res.reach = false; }
  if (svc.statuspage) {
    try {
      const s = await getJSON(`https://${svc.statuspage}/api/v2/summary.json`, 7000);
      res.official = (s.status && s.status.indicator) || 'none';
      const inc = (s.incidents || [])[0];
      if (inc) res.incident = inc.name;
      else if (res.official !== 'none') res.incident = s.status.description;
    } catch { res.official = 'unknown'; }
  }
  return res;
}
