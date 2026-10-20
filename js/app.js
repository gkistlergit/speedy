import * as net from './net.js';
import { kv, results, outages, loadSettings, saveSettings, uid } from './store.js';
import { createSwirl, createFrameMeter, createGauge, createRunner, lineChart, barChart, sparkline, cssVar } from './visuals.js';
import { SERVICES } from './services.js';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v) => (v == null || isNaN(v) ? '–' : v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const fmtMs = (v) => (v == null || isNaN(v) ? '–' : Math.round(v).toString());
const fmtBytes = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : Math.round(b / 1e6) + ' MB');
const fmtDur = (s) => { s = Math.round(s); if (s < 60) return s + ' sec'; const m = Math.round(s / 60); if (m < 60) return m + ' min'; const h = Math.floor(m / 60); return h + ' hr' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); };
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = net.median;
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' hr ago'; return dateFmt.format(ts);
}
const ICON = {
  wifi: '<svg viewBox="0 0 24 24"><path d="M2.5 9.2a14 14 0 0 1 19 0M5.8 12.6a9.3 9.3 0 0 1 12.4 0M9.1 16a4.6 4.6 0 0 1 5.8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="19.2" r="1.3" fill="currentColor"/></svg>',
  cellular: '<svg viewBox="0 0 24 24"><path d="M5 19v-3M10 19v-6M15 19V9M20 19V5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  unknown: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16" r="1.1" fill="currentColor"/></svg>',
  issues: '<svg viewBox="0 0 24 24"><path d="M12 4.2l8.3 14.6H3.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.4" r="1" fill="currentColor"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.4 12.2l2.5 2.5 4.8-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pending: '<svg viewBox="0 0 24 24"><circle cx="7" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="17" cy="12" r="1.4" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
};

// ---------- state ----------
const S = {
  settings: null, info: null, results: [], outages: [], tab: 'speed',
  running: false, abort: null, last: null,
  status: { last: {}, hist: {} }, statusOpen: null, statusQuery: '',
  hist: { seg: 'speed', conn: 'all', range: 30 }, placing: null,
  video: { state: 'idle', result: null },
};
let gauge, swirl;

// ---------- boot ----------
async function boot() {
  createRunner($('.runner'), $('.speed-stage'));
  S.settings = await loadSettings();
  S.results = ((await results.all()) || []).sort((a, b) => a.ts - b.ts);
  S.outages = ((await outages.all()) || []).sort((a, b) => a.start - b.start);
  S.status = (await kv.get('status')) || S.status;
  gauge = createGauge($('#gauge'));
  swirl = createSwirl($('#swirl'));
  wire();
  renderInfo();
  const hashTab = (location.hash || '').slice(1);
  show(['speed', 'video', 'status', 'map', 'history'].includes(hashTab) ? hashTab : 'speed');
  loadInfo();
  closeStaleOutage();
  if (S.settings.watch) startWatch();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // When an update takes over, reload once so the new version shows (never mid-test).
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      const go = () => { if (!S.running) { reloaded = true; location.reload(); } else setTimeout(go, 2000); };
      go();
    });
  }
  // Speedy never starts a test by itself. Drop a leftover ?go / #go from old one-tap links.
  if (/[?&]go\b/.test(location.search) || hashTab === 'go') { try { history.replaceState(null, '', location.pathname + (hashTab && hashTab !== 'go' ? '#' + hashTab : '')); } catch {} }
}

async function loadInfo() {
  S.info = await net.networkInfo();
  renderInfo();
  $('#statusFrom').textContent = S.info.isp;
}
const conn = () => (S.settings.connMode === 'auto' ? net.guessConnection(S.info?.org) : S.settings.connMode);
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'This device';
}
const roomName = (id) => S.settings.rooms.find((r) => r.id === id)?.name;

function renderInfo() {
  const c = conn();
  $('#connIcon').innerHTML = ICON[c] || ICON.unknown;
  $('#ispName').textContent = S.settings.ispName || S.info?.isp || 'Finding your provider…';
  $('#deviceName').textContent = deviceName();
  const rn = roomName(S.settings.room);
  $('#roomChip').innerHTML = `${rn ? '📍 ' + esc(rn) : 'Room: none'} ▾`;
  $('#roomChip').classList.toggle('on', !!rn);
  const label = { wifi: 'Wi-Fi', cellular: 'Cellular', unknown: 'Unknown' }[c];
  $('#connChip').innerHTML = `${label}${S.settings.connMode === 'auto' ? ' (auto)' : ''} ▾`;
  const where = S.info?.colo ? `Server ${S.info.colo}` : S.info?.city ? `Near ${S.info.city}` : 'Cloudflare';
  $('#serverChip').textContent = where;
  $('#vConn').innerHTML = ICON[c] || ICON.unknown;
}

// ---------- navigation ----------
function show(tab) {
  if (S.running && tab !== S.tab && S.tab === 'video') { toast('Finish or cancel the video test first'); return; }
  S.tab = tab;
  $$('.tab').forEach((el) => (el.hidden = el.dataset.tab !== tab));
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'video') { swirl.start(); renderVideo(); } else swirl.stop();
  if (tab === 'status') { renderStatus(); autoCheckFavorites(); }
  if (tab === 'map') renderMap();
  if (tab === 'history') renderHistory();
  try { history.replaceState(null, '', location.pathname + location.search + (tab === 'speed' ? '' : '#' + tab)); } catch {}
}

function wire() {
  $('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
  $('#goBtn').addEventListener('click', runSpeed);
  $('#cancelBtn').addEventListener('click', () => S.abort && S.abort.abort());
  $('#menuBtn').addEventListener('click', openSettings);
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#scrim').addEventListener('click', closeSheet);
  $('#roomChip').addEventListener('click', openRoomPicker);
  $('#connChip').addEventListener('click', openConnPicker);
  $('#statusSearch').addEventListener('input', (e) => { S.statusQuery = e.target.value.trim().toLowerCase(); renderStatus(); });
  $('#checkAllBtn').addEventListener('click', () => checkServices(allServices()));
  $('#addSvcBtn').addEventListener('click', openAddService);
  $('#statusList').addEventListener('click', onStatusClick);
  $('#addRoomBtn').addEventListener('click', () => startPlacing(null));
  $('#planFile').addEventListener('change', onFloorPlan);
  $('#floor').addEventListener('click', onFloorClick);
  $('#roomList').addEventListener('click', onRoomListClick);
  $('#histSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.hist.seg = b.dataset.v; $$('#histSeg button').forEach((x) => x.classList.toggle('on', x === b)); renderHistory(); });
  $('#histBody').addEventListener('click', onHistoryClick);
  $('#histBody').addEventListener('change', onHistoryChange);
  $('#videoOverlay').addEventListener('click', (e) => { if (e.target.closest('[data-act="video"]')) runVideo(); if (e.target.closest('[data-act="vcancel"]')) S.abort && S.abort.abort(); });
  $('#resultView').addEventListener('click', (e) => { if (e.target.closest('[data-act="again"]')) runSpeed(); if (e.target.closest('[data-act="settings"]')) openSettings(); });
  window.addEventListener('online', () => S.settings.watch && watchTick());
  window.addEventListener('offline', () => S.settings.watch && watchTick());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.settings.watch) watchTick(); });
  let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.tab === 'history') renderHistory(); if (S.tab === 'status') drawSparks(); }, 150); });
}

// ---------- speed test ----------
function setMetric(id, v, f = fmt) { $(id).textContent = f(v); }
async function runSpeed() {
  if (S.running) return;
  if (S.tab !== 'speed') show('speed');
  S.running = true; S.abort = new AbortController();
  const signal = S.abort.signal;
  $('#idleView').hidden = true; $('#resultView').hidden = true; $('#runView').hidden = false; $('#metrics').hidden = false;
  ['#mDown', '#mUp', '#mPing', '#mPingDown', '#mPingUp'].forEach((id) => ($(id).textContent = '–'));
  gauge.reset();
  let wake; try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  const dur = S.settings.duration || 10;
  const prog = (p) => ($('#prog').style.width = (p * 100).toFixed(1) + '%');
  const phase = (t) => ($('#phase').textContent = t);
  try {
    if (!S.info) await loadInfo();
    phase('Ping'); $('#live').textContent = '–'; prog(0);
    const lat = await net.idleLatency({ count: 16, onSample: (ms, p) => { $('#live').textContent = fmtMs(ms) ; prog(p * 0.08); } });
    if (signal.aborted) throw new DOMException('', 'AbortError');
    if (lat.ping == null) throw new Error('offline');
    setMetric('#mPing', lat.ping, fmtMs);
    phase('Download');
    const d = await net.download({ seconds: dur, signal, onTick: (v, p) => { gauge.set(v, 'down'); $('#live').textContent = fmt(v); $('#mDown').textContent = fmt(v); prog(0.08 + p * 0.46); } });
    setMetric('#mDown', d.mbps); setMetric('#mPingDown', d.loaded, fmtMs);
    gauge.set(0, 'up'); await sleep(400);
    phase('Upload');
    const u = await net.upload({ seconds: dur, signal, onTick: (v, p) => { gauge.set(v, 'up'); $('#live').textContent = fmt(v); $('#mUp').textContent = fmt(v); prog(0.54 + p * 0.46); } });
    setMetric('#mUp', u.mbps); setMetric('#mPingUp', u.loaded, fmtMs);
    const bloat = net.bloatGrade(lat.ping, d.loaded, u.loaded);
    const r = {
      id: uid(), ts: Date.now(), type: 'speed',
      down: d.mbps, up: u.mbps, ping: lat.ping, jitter: lat.jitter, loss: lat.loss,
      loadedDown: d.loaded, loadedUp: u.loaded, bloat: bloat?.grade, bloatInc: bloat?.increase,
      bytes: d.bytes + u.bytes, isp: S.settings.ispName || S.info?.isp, org: S.info?.org, colo: S.info?.colo,
      city: S.info?.city, conn: conn(), room: S.settings.room || null,
    };
    const pos = await maybeLocation(); if (pos) Object.assign(r, pos);
    await results.put(r); S.results.push(r); S.last = r;
    showResult(r);
    afterResult(r);
  } catch (e) {
    $('#runView').hidden = true; $('#metrics').hidden = true; $('#idleView').hidden = false;
    if (e.name === 'AbortError') toast('Test cancelled');
    else toast("Couldn't reach the test server. Check that you're online and try again.");
  } finally {
    gauge.stop(); S.running = false; S.abort = null;
    try { wake && wake.release(); } catch {}
  }
}

async function maybeLocation() {
  if (!S.settings.saveLocation || !navigator.geolocation) return null;
  return new Promise((res) => navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }), () => res(null), { timeout: 5000, maximumAge: 600000 }));
}

function afterResult(r) {
  if (S.settings.badge && navigator.setAppBadge) navigator.setAppBadge(Math.round(r.down)).catch(() => {});
  const plan = S.settings.planDown;
  if (plan && r.down < plan * 0.5 && r.conn !== 'cellular') {
    const msg = `Download was ${Math.round((r.down / plan) * 100)}% of your ${plan} Mbps plan`;
    toast(msg, 4000);
    if (window.Notification && Notification.permission === 'granted' && document.hidden) navigator.serviceWorker?.ready.then((reg) => reg.showNotification('Speedy', { body: msg, icon: 'icons/icon-192.png' }));
  }
}

const gradeClass = (g) => (!g ? 'g-ok' : /A/.test(g) ? 'g-good' : g === 'B' || g === 'C' ? 'g-ok' : 'g-bad');
const BLOAT_TEXT = {
  'A+': 'Lag barely moves when the line is busy. Calls and games stay smooth even while someone downloads.',
  A: 'Lag barely moves when the line is busy. Calls and games stay smooth even while someone downloads.',
  B: 'A little extra lag when the line is busy. Usually fine.',
  C: 'Noticeable lag when someone is downloading or uploading. Video calls may stutter.',
  D: "Heavy lag under load (bufferbloat). Turning on SQM or 'Smart QoS' in your router's settings usually fixes it.",
  F: "Severe lag under load (bufferbloat). Turning on SQM or 'Smart QoS' in your router's settings usually fixes it.",
};
function usesFor(r) {
  const goodBloat = r.bloat && ['A+', 'A', 'B'].includes(r.bloat);
  const lvl = (ok, meh) => (ok ? 'ok' : meh ? 'meh' : 'no');
  const mark = { ok: '✓', meh: '~', no: '✕' };
  const rows = [
    ['4K streaming', lvl(r.down >= 25, r.down >= 15)],
    ['HD video calls', lvl(r.up >= 3 && r.down >= 3 && goodBloat, r.up >= 1.5)],
    ['Online gaming', lvl(r.ping < 40 && goodBloat, r.ping < 80)],
    ['Several people at once', lvl(r.down >= 100, r.down >= 50)],
  ];
  const game = fmtDur((50e9 * 8) / (r.down * 1e6));
  const backup = fmtDur((10e9 * 8) / (r.up * 1e6));
  return `<div class="uses">${rows.map(([t, l]) => `<div class="use"><span class="${l}">${mark[l]}</span>${t}</div>`).join('')}</div>
    <p>A 50 GB game downloads in about <b>${game}</b>. Backing up 10 GB of photos takes about <b>${backup}</b>.</p>`;
}
function planCard(r) {
  const p = S.settings.planDown, pu = S.settings.planUp;
  if (!p) return `<div class="card"><h4>Your plan</h4><p>Add your internet plan's speed to see if you're getting what you pay for.</p><button class="text-btn" data-act="settings" style="align-self:flex-start;padding-left:0">Add my plan</button></div>`;
  const pct = r.down / p; const cls = pct >= 0.8 ? 'var(--good)' : pct >= 0.5 ? 'var(--warn)' : 'var(--bad)';
  const verdict = pct >= 0.8 ? "You're getting what you pay for." : pct >= 0.5 ? 'A bit below your plan.' : 'Well below your plan.';
  const wifiNote = pct < 0.8 && r.conn === 'wifi' ? ' Wi-Fi is often the bottleneck. Test right next to the router (or plugged in) to tell Wi-Fi from your provider.' : '';
  const upLine = pu ? `<p>Upload: ${fmt(r.up)} of ${pu} Mbps (${Math.round((r.up / pu) * 100)}%)</p>` : '';
  return `<div class="card"><h4>Your plan</h4><b class="big">${Math.round(pct * 100)}% of ${p} Mbps</b>
    <div class="bar"><i style="width:${Math.min(100, pct * 100)}%;background:${cls}"></i></div><p>${verdict}${wifiNote}</p>${upLine}</div>`;
}
function showResult(r) {
  $('#runView').hidden = true;
  const v = $('#resultView');
  v.hidden = false;
  setMetric('#mDown', r.down); setMetric('#mUp', r.up); setMetric('#mPing', r.ping, fmtMs);
  setMetric('#mPingDown', r.loadedDown, fmtMs); setMetric('#mPingUp', r.loadedUp, fmtMs);
  const rn = roomName(r.room);
  v.innerHTML = `
    <button class="again" data-act="again" aria-label="Test again" title="Test again"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19.8 3.8v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <div class="card"><h4>Lag when busy</h4>
      <div class="grade-row"><div class="grade ${gradeClass(r.bloat)}">${esc(r.bloat || '?')}</div>
      <p>Ping goes from <b>${fmtMs(r.ping)} ms</b> to <b>${fmtMs(Math.max(r.loadedDown ?? 0, r.loadedUp ?? 0))} ms</b> under load. ${BLOAT_TEXT[r.bloat] || ''}</p></div>
    </div>
    ${planCard(r)}
    <div class="card"><h4>Good enough for</h4>${usesFor(r)}</div>
    <div class="card"><h4>Details</h4><div class="kv">
      <span>Provider</span><span>${esc(r.isp || '–')}</span>
      <span>Connection</span><span>${r.conn === 'cellular' ? 'Cellular' : r.conn === 'wifi' ? 'Wi-Fi' : 'Unknown'}</span>
      ${rn ? `<span>Room</span><span>${esc(rn)}</span>` : ''}
      <span>Jitter</span><span>${fmtMs(r.jitter)} ms</span>
      <span>Dropped pings</span><span>${Math.round((r.loss || 0) * 100)}%</span>
      <span>Test server</span><span>Cloudflare${r.colo ? ' ' + esc(r.colo) : ''}</span>
      <span>Data used</span><span>${fmtBytes(r.bytes || 0)}</span>
      <span>Time</span><span>${dateFmt.format(r.ts)}</span>
    </div></div>`;
  $('#tab-speed').scrollTop = 0;
}

// ---------- video test ----------
// Which ladder qualities the panel shows at native resolution, and the frame
// rate it can show them at (streaming video tops out at 60 fps).
const QH = { '360p': 360, '480p': 480, '720p': 720, '1080p': 1080, '1440p': 1440, '4K': 2160 };
function displayInfo(d) {
  if (!d) return null;
  const dpr = devicePixelRatio || 1, w = Math.round(screen.width * dpr), h = Math.round(screen.height * dpr), short = Math.min(w, h);
  const fit = net.LADDER.filter((r) => QH[r.q] <= short * 1.05);
  return { ...d, panel: `${Math.max(w, h)}×${short}`, maxQ: (fit.at(-1) || net.LADDER[0]).q, fps: Math.min(60, d.hz) };
}
const dropText = (d) => (d.dropped ? `${d.dropped} of ${d.frames} frames dropped` : `${d.frames} frames, none dropped`);
const displayLadder = (d) => (d ? `<div class="ladder">
    <div class="rung"><b>Display</b><span class="st">${d.hz} Hz · ${dropText(d)}</span><span class="${d.smooth ? 'ok' : 'no'}">${d.smooth ? '✓ Smooth' : '✕ Drops frames'}</span></div>
    <div class="rung"><b>Screen</b><span class="st">${d.panel} · ${d.smooth ? `${d.maxQ} and below at full ${d.fps} fps` : `up to ${d.maxQ}, but ${d.fps} fps video may stutter`}</span><span class="${d.smooth ? 'ok' : 'no'}">${d.maxQ}</span></div>
  </div>` : '');
function renderVideo() {
  const o = $('#videoOverlay'); const st = S.video.state;
  $('#videoStatus').hidden = st !== 'running';
  if (st === 'running') { o.innerHTML = '<button class="text-btn" data-act="vcancel" style="position:absolute;top:10px;left:12px">✕ Cancel</button>'; o.style.background = 'none'; return; }
  o.style.background = '';
  if (st === 'done' && S.video.result) {
    const v = S.video.result.video;
    o.innerHTML = `<p style="text-transform:uppercase;letter-spacing:.12em;font-size:12px">Smooth streaming up to</p>
      <div class="best">${esc(v.best)}</div>
      <p>Video starts in about <b>${v.startup ? (v.startup / 1000).toFixed(1) : '–'} s</b>. Used ${fmtBytes(v.bytes)}.</p>
      <div class="ladder">${v.rungs.map((r) => `<div class="rung"><b>${r.q}</b><span class="st">${r.mbps} Mbps stream · loads in ${r.startup ? (r.startup / 1000).toFixed(2) + ' s' : '–'}</span><span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓ Smooth' : '✕ Buffers'}</span></div>`).join('')}</div>
      ${displayLadder(v.display)}
      <button class="play" data-act="video" aria-label="Test again" style="width:84px">${ICON.play}</button>`;
    return;
  }
  o.innerHTML = `<h2>Video test</h2><p>Plays video at every quality from 360p to 4K, the way Netflix or YouTube would, and shows which ones stream without buffering.</p>
    <button class="play" data-act="video" aria-label="Start video test">${ICON.play}</button>
    <p style="font-size:13px;color:var(--muted)">Uses about 30–60 MB of data. Also checks your screen's refresh rate.</p>${displayLadder(S.video.display)}`;
}
async function runVideo() {
  if (S.running) return;
  S.running = true; S.abort = new AbortController(); S.video.state = 'running'; renderVideo();
  swirl.set(0.25);
  let wake; try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  const total = net.LADDER.length; let idx = 0;
  // Refresh rate is read in a quiet second first, with the swirl paused: on slow
  // GPUs the swirl alone can drop frames, and the meter would read its frame rate
  // instead of the panel's. Dropped frames are then counted during the stream,
  // under real playback load. The meter's rAF callback is trivial and fetch bodies
  // arrive off the main thread, so it doesn't skew the bitrate results.
  const meter = createFrameMeter();
  try {
    $('#vText').textContent = 'Checking your display…'; $('#vprog').style.width = '2%';
    swirl.stop(); meter.start(); await sleep(1000); meter.lock(); swirl.start();
    $('#vText').textContent = 'Testing adaptive bitrate…';
    await sleep(400); meter.clear(); // don't count the swirl's own restart as dropped frames
    const v = await net.videoTest({
      signal: S.abort.signal,
      onStep: ({ rung, phase, throughput }) => {
        if (phase === 'start') { idx = net.LADDER.indexOf(rung); $('#vText').textContent = `Testing ${rung.q}…`; }
        if (phase === 'segment' && throughput) swirl.set(Math.min(1, 0.2 + Math.log10(1 + throughput) / 3));
        $('#vprog').style.width = (((idx + (phase === 'done' ? 1 : 0.5)) / total) * 100).toFixed(0) + '%';
      },
    });
    v.display = S.video.display = displayInfo(meter.stop());
    const r = { id: uid(), ts: Date.now(), type: 'video', video: v, isp: S.settings.ispName || S.info?.isp, conn: conn(), room: S.settings.room || null };
    await results.put(r); S.results.push(r);
    S.video = { state: 'done', result: r, display: v.display };
    swirl.burst();
  } catch (e) {
    S.video.display = displayInfo(meter.stop());
    S.video.state = S.video.result ? 'done' : 'idle';
    toast(e.name === 'AbortError' ? 'Video test cancelled' : "Couldn't reach the test server. Check that you're online.");
  } finally {
    S.running = false; S.abort = null; swirl.set(0.35);
    try { wake && wake.release(); } catch {}
    renderVideo();
  }
}

// ---------- status ----------
const allServices = () => [...SERVICES, ...(S.settings.customServices || [])];
function svcState(r) {
  if (!r) return 'pending';
  if (r.reach === false || r.official === 'major' || r.official === 'critical') return 'down';
  if (r.official === 'minor' || r.official === 'maintenance' || (r.ms && r.ms > 2500)) return 'issues';
  return 'ok';
}
const ORDER = { down: 0, issues: 1, ok: 2, pending: 3 };
function svcRow(s) {
  const r = S.status.last[s.id]; const st = svcState(r); const fav = S.settings.favorites.includes(s.id);
  const open = S.statusOpen === s.id;
  const reachTxt = !r ? 'Not checked yet' : r.reach ? `Reachable from your network in <b>${r.ms} ms</b>` : "<b style=\"color:var(--bad)\">Couldn't reach it from your network</b>";
  const off = !s.statuspage ? 'No public status page, so Speedy checks it directly.' : !r ? '' : r.official === 'unknown' ? "Official status page didn't answer." : r.official === 'none' ? 'Official status: all systems operational.' : `Official status: <b>${esc(r.incident || r.official)}</b>`;
  return `<div class="svc" data-id="${esc(s.id)}">
    <div class="svc-row">
      <button class="star ${fav ? 'on' : ''}" data-act="fav" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${ICON.star}</button>
      <button class="svc-name" data-act="open" style="text-align:left">${esc(s.name)}</button>
      <span class="sicon ${st}" title="${st}">${ICON[st]}</span>
      <canvas class="spark" data-spark="${esc(s.id)}" data-color="${st === 'down' ? '--bad' : st === 'issues' ? '--warn' : st === 'ok' ? '--good' : '--dim'}"></canvas>
    </div>
    ${open ? `<div class="svc-detail"><span>${reachTxt}</span>${off ? `<span>${off}</span>` : ''}${r ? `<span>Checked ${ago(r.at)}</span>` : ''}
      <div class="links"><button class="text-btn" data-act="check" style="padding-left:0">Check now</button>
      ${s.statuspage ? `<a href="https://${esc(s.statuspage)}" target="_blank" rel="noopener">Status page ↗</a>` : ''}
      ${s.dd ? `<a href="https://downdetector.com/status/${esc(s.dd)}/" target="_blank" rel="noopener">Reports on Downdetector ↗</a>` : ''}
      ${s.custom ? '<button class="text-btn" data-act="remove" style="color:var(--bad)">Remove</button>' : ''}</div></div>` : ''}
  </div>`;
}
function renderStatus() {
  const q = S.statusQuery;
  const list = allServices().filter((s) => !q || s.name.toLowerCase().includes(q));
  const sort = (a, b) => ORDER[svcState(S.status.last[a.id])] - ORDER[svcState(S.status.last[b.id])] || a.name.localeCompare(b.name);
  const favs = list.filter((s) => S.settings.favorites.includes(s.id)).sort(sort);
  const rest = list.filter((s) => !S.settings.favorites.includes(s.id)).sort(sort);
  let html = `<div class="group-label"><span style="color:var(--up);display:grid">${ICON.star}</span>Favorites</div>`;
  html += favs.length ? favs.map(svcRow).join('') : '<p class="sub" style="padding:10px 16px">Tap a star to keep a service here. Favorites are checked each time you open this tab.</p>';
  html += `<div class="group-label" style="margin-top:12px">All services</div>` + (rest.length ? rest.map(svcRow).join('') : '<p class="sub" style="padding:10px 16px">No matches.</p>');
  $('#statusList').innerHTML = html;
  const times = Object.values(S.status.last).map((r) => r.at);
  $('#checkedAt').textContent = times.length ? 'Updated ' + ago(Math.max(...times)) : '';
  drawSparks();
}
function drawSparks() {
  $$('canvas[data-spark]').forEach((c) => {
    const h = S.status.hist[c.dataset.spark] || [];
    sparkline(c, h.map((x) => (x == null ? 7000 : x)), cssVar(c.dataset.color));
  });
}
let checking = false;
async function checkServices(list) {
  if (checking) return; checking = true;
  $('#checkAllBtn').textContent = 'Checking…';
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      const r = await net.checkService(s);
      S.status.last[s.id] = r;
      const h = (S.status.hist[s.id] ||= []); h.push(r.reach ? r.ms : null); if (h.length > 40) h.shift();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  kv.set('status', S.status);
  checking = false; $('#checkAllBtn').textContent = 'Check all';
  if (S.tab === 'status') renderStatus();
  const down = list.filter((s) => svcState(S.status.last[s.id]) === 'down');
  if (down.length && down.length === list.length && list.length > 2) toast("Nothing is reachable. Your own connection may be down.", 4000);
}
function autoCheckFavorites() {
  const favs = allServices().filter((s) => S.settings.favorites.includes(s.id));
  const stale = favs.filter((s) => !S.status.last[s.id] || Date.now() - S.status.last[s.id].at > 120000);
  if (stale.length) checkServices(stale);
}
async function onStatusClick(e) {
  const row = e.target.closest('.svc'); if (!row) return;
  const id = row.dataset.id; const act = e.target.closest('[data-act]')?.dataset.act;
  const svc = allServices().find((s) => s.id === id);
  if (act === 'fav') {
    const f = S.settings.favorites; const i = f.indexOf(id);
    i >= 0 ? f.splice(i, 1) : f.push(id);
    await saveSettings(S.settings); renderStatus();
    if (i < 0 && !S.status.last[id]) checkServices([svc]);
  } else if (act === 'check') {
    await checkServices([svc]);
  } else if (act === 'remove') {
    S.settings.customServices = S.settings.customServices.filter((s) => s.id !== id);
    S.settings.favorites = S.settings.favorites.filter((f) => f !== id);
    await saveSettings(S.settings); S.statusOpen = null; renderStatus();
  } else if (act === 'open' || !act) {
    S.statusOpen = S.statusOpen === id ? null : id; renderStatus();
    if (S.statusOpen && !S.status.last[id]) checkServices([svc]);
  }
}
function openAddService() {
  openSheet('Add a service', `
    <label class="field"><span>Name</span><input id="svcName" placeholder="e.g. My bank"></label>
    <label class="field"><span>Website</span><input id="svcHost" inputmode="url" placeholder="e.g. www.chase.com" autocapitalize="off"></label>
    <label class="field"><span>Status page (optional)</span><input id="svcStatus" inputmode="url" placeholder="e.g. status.example.com" autocapitalize="off"></label>
    <p class="sub" style="margin:0">Status pages hosted by Atlassian Statuspage (most status.something.com sites) show their official status here.</p>
    <button class="btn primary" id="svcSave">Add service</button>`, (body) => {
    $('#svcSave', body).addEventListener('click', async () => {
      const clean = (v) => v.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const name = $('#svcName', body).value.trim(); const host = clean($('#svcHost', body).value);
      if (!name || !host) { toast('Add a name and a website'); return; }
      const s = { id: 'c_' + uid(), name, host, statuspage: clean($('#svcStatus', body).value) || undefined, custom: true };
      S.settings.customServices.push(s); S.settings.favorites.push(s.id);
      await saveSettings(S.settings); closeSheet(); renderStatus(); checkServices([s]);
    });
  });
}

// ---------- map / rooms ----------
function roomStats(id) {
  const rs = S.results.filter((r) => r.type === 'speed' && r.room === id);
  return { n: rs.length, down: median(rs.map((r) => r.down)), up: median(rs.map((r) => r.up)), ping: median(rs.map((r) => r.ping)), last: rs[rs.length - 1] };
}
function roomColor(st, ref) {
  if (!st.n) return 'var(--dim)';
  const k = st.down / ref;
  return k >= 0.75 ? 'var(--good)' : k >= 0.4 ? 'var(--warn)' : 'var(--bad)';
}
async function renderMap() {
  const img = await kv.get('floorplan');
  const fi = $('#floorImg');
  if (img) { fi.src = img; fi.hidden = false; $('#floor').classList.add('has-img'); } else { fi.hidden = true; $('#floor').classList.remove('has-img'); }
  const rooms = S.settings.rooms;
  const stats = Object.fromEntries(rooms.map((r) => [r.id, roomStats(r.id)]));
  const best = Math.max(0, ...Object.values(stats).map((s) => s.down || 0));
  const ref = S.settings.planDown || best || 1;
  $('#pins').innerHTML = rooms.filter((r) => r.x != null).map((r) => {
    const st = stats[r.id];
    return `<button class="pin" data-room="${r.id}" style="left:${r.x * 100}%;top:${r.y * 100}%;color:${roomColor(st, ref)}"><span class="lbl">${esc(r.name)}${st.n ? ` · <b>${fmt(st.down)}</b>` : ''}</span><span class="dotp"></span></button>`;
  }).join('');
  $('#floor').classList.toggle('placing', !!S.placing);
  $('#placeBanner').hidden = !S.placing;
  const tested = rooms.filter((r) => stats[r.id].n);
  let callout = '';
  if (tested.length >= 2) {
    const sorted = [...tested].sort((a, b) => stats[a.id].down - stats[b.id].down);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    const drop = 1 - stats[lo.id].down / stats[hi.id].down;
    if (drop > 0.25) callout = `<div class="card callout"><h4>Weakest spot</h4><p><b style="color:var(--fg)">${esc(lo.name)}</b> is ${Math.round(drop * 100)}% slower than ${esc(hi.name)}. A mesh point or moving the router toward it would help most.</p></div>`;
    else callout = `<div class="card callout" style="border-color:var(--good)"><h4>Even coverage</h4><p>Your rooms are within ${Math.round(drop * 100)}% of each other. No real dead spots.</p></div>`;
  }
  $('#roomCallout').innerHTML = callout;
  $('#roomList').innerHTML = rooms.length ? rooms.map((r) => {
    const st = stats[r.id];
    return `<div class="card room-card" data-room="${r.id}">
      <div class="room-name"><i style="background:${roomColor(st, ref)}"></i>${esc(r.name)}</div>
      <div class="row-btns"><button class="text-btn" data-act="test">Test here</button><button class="text-btn" data-act="edit" style="color:var(--muted)">Edit</button></div>
      <div class="stats">${st.n ? `<span>↓ <b>${fmt(st.down)}</b> Mbps</span><span>↑ <b>${fmt(st.up)}</b> Mbps</span><span>Ping <b>${fmtMs(st.ping)}</b> ms</span><span>${st.n} test${st.n > 1 ? 's' : ''}</span>` : '<span>No tests yet</span>'}${r.x == null ? '<span>Not on the map</span>' : ''}</div>
    </div>`;
  }).join('') : `<div class="empty"><b>No rooms yet</b><span>Add the rooms you use most (living room, bedroom, office), then run a test from each.</span><button class="btn primary" data-act="add">Add a room</button></div>`;
}
function startPlacing(roomId) {
  S.placing = { roomId };
  if (S.tab !== 'map') show('map'); else renderMap();
  $('#floor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function onFloorClick(e) {
  const pin = e.target.closest('.pin');
  if (!S.placing) { if (pin) openRoomSheet(pin.dataset.room); return; }
  const rect = $('#floor').getBoundingClientRect();
  const x = Math.min(0.97, Math.max(0.03, (e.clientX - rect.left) / rect.width));
  const y = Math.min(0.97, Math.max(0.06, (e.clientY - rect.top) / rect.height));
  const { roomId } = S.placing; S.placing = null;
  if (roomId) {
    const r = S.settings.rooms.find((x) => x.id === roomId); Object.assign(r, { x, y });
    saveSettings(S.settings); renderMap();
  } else openRoomSheet(null, { x, y });
}
function onRoomListClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act; const id = e.target.closest('[data-room]')?.dataset.room;
  if (act === 'add') startPlacing(null);
  if (act === 'edit') openRoomSheet(id);
  if (act === 'test') { S.settings.room = id; saveSettings(S.settings); renderInfo(); show('speed'); runSpeed(); }
}
function openRoomSheet(id, pos) {
  const r = id ? S.settings.rooms.find((x) => x.id === id) : null;
  const st = r ? roomStats(r.id) : null;
  openSheet(r ? r.name : 'New room', `
    <label class="field"><span>Room name</span><input id="roomName" value="${esc(r?.name || '')}" placeholder="e.g. Bedroom" maxlength="30"></label>
    ${st && st.n ? `<div class="kv"><span>Typical download</span><span>${fmt(st.down)} Mbps</span><span>Typical upload</span><span>${fmt(st.up)} Mbps</span><span>Last tested</span><span>${ago(st.last.ts)}</span></div>` : ''}
    <button class="btn primary" id="roomSave">${r ? 'Save' : 'Add room'}</button>
    ${r ? `<div class="btn-row"><button class="btn" id="roomMove">${r.x == null ? 'Place on map' : 'Move pin'}</button><button class="btn danger" id="roomDel">Delete</button></div>` : ''}`, (body) => {
    const name = $('#roomName', body); setTimeout(() => name.focus(), 250);
    $('#roomSave', body).addEventListener('click', async () => {
      const n = name.value.trim(); if (!n) { toast('Give the room a name'); return; }
      if (r) r.name = n;
      else { const nr = { id: uid(), name: n, x: pos?.x ?? null, y: pos?.y ?? null }; S.settings.rooms.push(nr); S.settings.room = nr.id; }
      await saveSettings(S.settings); closeSheet(); renderMap(); renderInfo();
      if (!r) toast(`Tests will be tagged "${n}" until you change the room`, 3500);
    });
    r && $('#roomMove', body).addEventListener('click', () => { closeSheet(); startPlacing(r.id); });
    r && $('#roomDel', body).addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to delete'; return; }
      S.settings.rooms = S.settings.rooms.filter((x) => x.id !== r.id);
      if (S.settings.room === r.id) S.settings.room = null;
      await saveSettings(S.settings); closeSheet(); renderMap(); renderInfo();
    });
  });
}
async function onFloorPlan(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
  const img = new Image(); img.src = url; await img.decode();
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  await kv.set('floorplan', c.toDataURL('image/jpeg', 0.82));
  e.target.value = ''; renderMap(); toast('Floor plan saved. Tap + Room to drop pins.');
}
function openRoomPicker() {
  const rooms = S.settings.rooms; const cur = S.settings.room;
  openSheet('Where are you testing?', `<div class="pick">
    <button data-id="" class="${!cur ? 'on' : ''}">No room<span>${!cur ? '✓' : ''}</span></button>
    ${rooms.map((r) => `<button data-id="${r.id}" class="${cur === r.id ? 'on' : ''}">${esc(r.name)}<span>${cur === r.id ? '✓' : ''}</span></button>`).join('')}
    </div><button class="btn" id="pickAdd">+ Add a room</button>`, (body) => {
    $('.pick', body).addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      S.settings.room = b.dataset.id || null; await saveSettings(S.settings); renderInfo(); closeSheet();
    });
    $('#pickAdd', body).addEventListener('click', () => { closeSheet(); openRoomSheet(null); });
  });
}
function openConnPicker() {
  const cur = S.settings.connMode; const guess = net.guessConnection(S.info?.org);
  const opts = [['auto', `Automatic (looks like ${guess === 'cellular' ? 'cellular' : 'Wi-Fi'})`], ['wifi', 'Wi-Fi'], ['cellular', 'Cellular']];
  openSheet('Connection', `<p class="sub" style="margin:0">Web apps on iPhone can't see whether you're on Wi-Fi or cellular, so Speedy guesses from your provider's name. Pick one if the guess is wrong.</p>
    <div class="pick">${opts.map(([v, t]) => `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${t}<span>${cur === v ? '✓' : ''}</span></button>`).join('')}</div>`, (body) => {
    $('.pick', body).addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      S.settings.connMode = b.dataset.v; await saveSettings(S.settings); renderInfo(); closeSheet();
    });
  });
}

// ---------- history ----------
function filtered(type) {
  const since = S.hist.range ? Date.now() - S.hist.range * 86400000 : 0;
  return S.results.filter((r) => r.type === type && r.ts >= since && (S.hist.conn === 'all' || r.conn === S.hist.conn));
}
function renderHistory() {
  const body = $('#histBody');
  if (S.hist.seg === 'outages') return renderOutages(body);
  const chips = `<div class="filters">
    ${[['all', 'All'], ['wifi', 'Wi-Fi'], ['cellular', 'Cellular']].map(([v, t]) => `<button class="chip ${S.hist.conn === v ? 'on' : ''}" data-conn="${v}">${t}</button>`).join('')}
    ${[[7, '7 days'], [30, '30 days'], [0, 'All time']].map(([v, t]) => `<button class="chip ${S.hist.range === v ? 'on' : ''}" data-range="${v}">${t}</button>`).join('')}
  </div>`;
  if (S.hist.seg === 'video') {
    const vs = filtered('video').reverse();
    body.innerHTML = chips + (vs.length ? `<div class="list">${vs.map((r) => `<button class="rrow" data-id="${r.id}"><span class="when">${dateFmt.format(r.ts)}<small>${esc(roomName(r.room) || r.isp || '')}</small></span><span></span><span>${r.video.display ? r.video.display.hz + ' Hz' : ''}</span><b class="d">${esc(r.video.best)}</b></button>`).join('')}</div>`
      : emptyState('No video tests yet', 'Run one from the Video tab to see which quality you can stream.'));
    return;
  }
  const rs = filtered('speed');
  if (!rs.length) { body.innerHTML = chips + emptyState('No speed tests here yet', S.results.length ? 'Try a different filter.' : 'Run a test from the Speed tab. Results stay on this device.'); return; }
  const md = median(rs.map((r) => r.down)), mu = median(rs.map((r) => r.up)), mp = median(rs.map((r) => r.ping));
  const plan = S.settings.planDown;
  const planPct = plan ? rs.filter((r) => r.down >= plan * 0.8).length / rs.length : null;
  const cost = S.settings.monthlyCost && md ? S.settings.monthlyCost / md : null;
  // by time of day (3-hour buckets)
  const buckets = Array.from({ length: 8 }, () => []);
  rs.forEach((r) => buckets[Math.floor(new Date(r.ts).getHours() / 3)].push(r.down));
  const bvals = buckets.map((b) => median(b));
  const blabels = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];
  const filled = bvals.map((v, i) => [v, i]).filter(([v]) => v != null);
  const slow = filled.length >= 3 ? filled.reduce((a, b) => (b[0] < a[0] ? b : a)) : null;
  // wifi vs cellular
  const all = S.results.filter((r) => r.type === 'speed' && (!S.hist.range || r.ts >= Date.now() - S.hist.range * 86400000));
  const w = all.filter((r) => r.conn === 'wifi'), c = all.filter((r) => r.conn === 'cellular');
  const vs = w.length && c.length ? `<div class="card"><h4>Wi-Fi vs cellular</h4><div class="vs">
      <span class="h"></span><span class="h">↓ Mbps</span><span class="h">↑ Mbps</span><span class="h">Ping</span>
      <span>Wi-Fi <small>(${w.length})</small></span><b>${fmt(median(w.map((r) => r.down)))}</b><b>${fmt(median(w.map((r) => r.up)))}</b><b>${fmtMs(median(w.map((r) => r.ping)))}</b>
      <span>Cellular <small>(${c.length})</small></span><b>${fmt(median(c.map((r) => r.down)))}</b><b>${fmt(median(c.map((r) => r.up)))}</b><b>${fmtMs(median(c.map((r) => r.ping)))}</b>
    </div><p>${median(w.map((r) => r.down)) >= median(c.map((r) => r.down)) ? 'Wi-Fi is faster here.' : 'Cellular is beating your Wi-Fi. Worth checking your router or where you sit.'}</p></div>` : '';
  const list = [...rs].reverse().slice(0, 100);
  body.innerHTML = chips + `<div class="stack">
    <div class="stat-grid"><div class="stat"><span>Typical ↓</span><b style="color:var(--down-ink)">${fmt(md)}</b><span>Mbps</span></div>
      <div class="stat"><span>Typical ↑</span><b style="color:var(--up)">${fmt(mu)}</b><span>Mbps</span></div>
      <div class="stat"><span>Typical ping</span><b>${fmtMs(mp)}</b><span>ms</span></div></div>
    ${plan ? `<div class="card"><h4>Getting what you pay for?</h4><b class="big">${Math.round(planPct * 100)}% of tests hit 80%+ of your ${plan} Mbps plan</b>
      <div class="bar"><i style="width:${planPct * 100}%;background:${planPct >= 0.8 ? 'var(--good)' : planPct >= 0.5 ? 'var(--warn)' : 'var(--bad)'}"></i></div>
      ${cost ? `<p>You pay about <b>$${cost.toFixed(2)}</b> per Mbps you actually get ($${S.settings.monthlyCost}/month).</p>` : ''}</div>` : ''}
    <div class="card"><div class="section-head"><h4>Speed over time</h4><div class="legend"><span><i style="background:var(--down)"></i>Download</span><span><i style="background:var(--up)"></i>Upload</span></div></div><canvas class="chart" id="hChart"></canvas></div>
    ${filled.length >= 3 ? `<div class="card"><h4>By time of day</h4><canvas class="chart" id="hHours"></canvas><p>${slow ? `Slowest around <b style="color:var(--fg)">${blabels[slow[1]]}–${blabels[(slow[1] + 1) % 8]}</b>, when neighbors are online too.` : ''}</p></div>` : ''}
    ${vs}
    <div class="card"><div class="section-head"><h4>All tests</h4><button class="text-btn" data-act="csv">Export CSV</button></div>
      <div class="list">${list.map((r) => `<button class="rrow" data-id="${r.id}"><span class="when">${dateFmt.format(r.ts)}<small>${r.conn === 'cellular' ? 'Cellular' : 'Wi-Fi'}${roomName(r.room) ? ' · ' + esc(roomName(r.room)) : ''}</small></span><b class="d">${fmt(r.down)}</b><b class="u">${fmt(r.up)}</b><b>${fmtMs(r.ping)}<small> ms</small></b></button>`).join('')}</div></div>
  </div>`;
  const pts = rs.slice(-60);
  lineChart($('#hChart'), [{ color: cssVar('--down'), points: pts.map((r) => [r.ts, r.down]) }, { color: cssVar('--up'), points: pts.map((r) => [r.ts, r.up]) }], { plan });
  if ($('#hHours')) barChart($('#hHours'), bvals, { labels: blabels, color: cssVar('--down') });
}
const emptyState = (t, s) => `<div class="empty"><b>${t}</b><span>${s}</span></div>`;
function onHistoryChange(e) {
  if (e.target.id === 'watchToggle') { S.settings.watch = e.target.checked; saveSettings(S.settings); S.settings.watch ? startWatch() : stopWatch(); renderHistory(); }
  if (e.target.id === 'wakeToggle') { S.keepAwake = e.target.checked; applyWake(); }
}
function onHistoryClick(e) {
  const chip = e.target.closest('[data-conn],[data-range]');
  if (chip) { if (chip.dataset.conn) S.hist.conn = chip.dataset.conn; if (chip.dataset.range != null) S.hist.range = +chip.dataset.range; renderHistory(); return; }
  if (e.target.closest('[data-act="csv"]')) return exportCSV();
  if (e.target.closest('[data-act="clearOut"]')) return clearOutages(e.target.closest('button'));
  const row = e.target.closest('.rrow[data-id]'); if (row) openResult(row.dataset.id);
}
function openResult(id) {
  const r = S.results.find((x) => x.id === id); if (!r) return;
  const body = r.type === 'video'
    ? `<div class="kv"><span>Best smooth quality</span><span>${esc(r.video.best)}</span><span>Video start time</span><span>${r.video.startup ? (r.video.startup / 1000).toFixed(2) + ' s' : '–'}</span>${r.video.rungs.map((x) => `<span>${x.q}</span><span>${x.ok ? '✓ Smooth' : '✕ Buffers'}</span>`).join('')}${r.video.display ? `<span>Display</span><span>${r.video.display.hz} Hz · ${r.video.display.smooth ? 'smooth' : 'drops frames'}</span><span>Frames</span><span>${dropText(r.video.display)}</span><span>Screen</span><span>${r.video.display.panel} · up to ${r.video.display.maxQ} at ${r.video.display.fps} fps</span>` : ''}<span>Data used</span><span>${fmtBytes(r.video.bytes)}</span></div>`
    : `<div class="kv"><span>Download</span><span>${fmt(r.down)} Mbps</span><span>Upload</span><span>${fmt(r.up)} Mbps</span><span>Ping (idle)</span><span>${fmtMs(r.ping)} ms</span>
      <span>Ping while downloading</span><span>${fmtMs(r.loadedDown)} ms</span><span>Ping while uploading</span><span>${fmtMs(r.loadedUp)} ms</span><span>Lag-when-busy grade</span><span>${esc(r.bloat || '–')}</span>
      <span>Jitter</span><span>${fmtMs(r.jitter)} ms</span><span>Provider</span><span>${esc(r.isp || '–')}</span><span>Connection</span><span>${r.conn === 'cellular' ? 'Cellular' : 'Wi-Fi'}</span>
      ${roomName(r.room) ? `<span>Room</span><span>${esc(roomName(r.room))}</span>` : ''}${r.lat ? `<span>Location</span><span><a style="color:var(--down-ink)" target="_blank" rel="noopener" href="https://maps.apple.com/?ll=${r.lat},${r.lon}&q=Speed%20test">${r.lat}, ${r.lon} ↗</a></span>` : ''}
      <span>Data used</span><span>${fmtBytes(r.bytes || 0)}</span></div>`;
  openSheet(dateFmt.format(r.ts), body + `<button class="btn danger" id="delRes">Delete this result</button>`, (b) => {
    $('#delRes', b).addEventListener('click', async (ev) => {
      const btn = ev.currentTarget; if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = 'Tap again to delete'; return; }
      await results.del(id); S.results = S.results.filter((x) => x.id !== id); closeSheet(); renderHistory();
    });
  });
}
async function exportCSV() {
  const rows = [['date', 'type', 'download_mbps', 'upload_mbps', 'ping_ms', 'jitter_ms', 'ping_loaded_down_ms', 'ping_loaded_up_ms', 'bufferbloat_grade', 'best_video', 'display_hz', 'frames_dropped', 'frames_total', 'screen_max_video', 'connection', 'room', 'provider', 'server', 'lat', 'lon']];
  for (const r of S.results) rows.push([new Date(r.ts).toISOString(), r.type, r.down?.toFixed(2), r.up?.toFixed(2), r.ping?.toFixed(1), r.jitter?.toFixed(1), r.loadedDown?.toFixed(1), r.loadedUp?.toFixed(1), r.bloat, r.video?.best, r.video?.display?.hz, r.video?.display?.dropped, r.video?.display?.frames, r.video?.display?.maxQ, r.conn, roomName(r.room), r.isp, r.colo, r.lat, r.lon]);
  const csv = rows.map((r) => r.map((v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
  const file = new File([csv], `speedy-results-${new Date().toISOString().slice(0, 10)}.csv`, { type: 'text/csv' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Speedy results' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- outage log ----------
let watchTimer = null, fails = 0, openOutage = null, wakeLock = null;
function startWatch() { stopWatch(); watchTick(); watchTimer = setInterval(watchTick, 15000); }
function stopWatch() { clearInterval(watchTimer); watchTimer = null; }
async function watchTick() {
  if (document.hidden) return;
  const ok = navigator.onLine && (await net.isOnline());
  kv.set('lastSeen', Date.now());
  if (!ok) {
    fails++;
    if (fails >= 2 && !openOutage) {
      openOutage = { id: uid(), start: Date.now() - 15000, end: null, isp: S.info?.isp };
      S.outages.push(openOutage); await outages.put(openOutage); toast('Connection lost. Logging the outage.', 3000);
    }
  } else {
    fails = 0;
    if (openOutage) {
      openOutage.end = Date.now(); await outages.put(openOutage);
      toast(`Back online after ${fmtDur((openOutage.end - openOutage.start) / 1000)}`, 3500); openOutage = null;
    }
  }
  if (S.tab === 'history' && S.hist.seg === 'outages') renderHistory();
}
async function closeStaleOutage() {
  const stale = S.outages.find((o) => !o.end);
  if (!stale) return;
  stale.end = (await kv.get('lastSeen')) || stale.start; stale.cut = true;
  await outages.put(stale);
}
async function applyWake() {
  try { if (S.keepAwake && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); else if (!S.keepAwake && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch { toast("This device won't keep the screen on"); }
}
function renderOutages(body) {
  const since = Date.now() - 30 * 86400000;
  const list = [...S.outages].filter((o) => o.start >= since).reverse();
  const total = list.reduce((s, o) => s + ((o.end || Date.now()) - o.start), 0) / 1000;
  const status = !S.settings.watch ? ['off', 'Not watching'] : openOutage ? ['bad', 'Offline right now'] : ['', 'Online · checking every 15 seconds'];
  body.innerHTML = `<div class="stack">
    <div class="card"><div class="watch"><div><b class="big" style="font-size:17px">Watch for outages</b><p><span class="pulse ${status[0]}"></span>${status[1]}</p></div>
      <label class="switch"><input type="checkbox" id="watchToggle" ${S.settings.watch ? 'checked' : ''} aria-label="Watch for outages"><span></span></label></div>
      <p>Web apps can only check while they're open. To log around the clock, leave Speedy open on a Mac or a spare phone on its charger.</p>
      ${S.settings.watch && 'wakeLock' in navigator ? `<div class="watch"><span>Keep screen on while watching</span><label class="switch"><input type="checkbox" id="wakeToggle" ${S.keepAwake ? 'checked' : ''} aria-label="Keep screen on"><span></span></label></div>` : ''}
    </div>
    <div class="stat-grid" style="grid-template-columns:1fr 1fr"><div class="stat"><span>Outages (30 days)</span><b>${list.length}</b></div><div class="stat"><span>Time offline</span><b>${list.length ? fmtDur(total) : '0 min'}</b></div></div>
    ${list.length ? `<div class="card"><h4>Log</h4><div class="list">${list.map((o) => `<div class="rrow" style="grid-template-columns:1fr auto"><span class="when">${dateFmt.format(o.start)}<small>${o.end ? 'until ' + timeFmt.format(o.end) : 'ongoing'}${o.cut ? ' (Speedy was closed before it came back)' : ''}</small></span><b>${fmtDur(((o.end || Date.now()) - o.start) / 1000)}</b></div>`).join('')}</div>
      <button class="text-btn" data-act="clearOut" style="align-self:flex-start;color:var(--muted);padding-left:0">Clear log</button></div>` : emptyState('No outages logged', S.settings.watch ? "Speedy will note any time your internet drops while it's open." : 'Turn on watching to start logging drops.')}
  </div>`;
}
async function clearOutages(btn) {
  if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = 'Tap again to clear'; return; }
  await outages.clear(); S.outages = openOutage ? [openOutage] : []; if (openOutage) outages.put(openOutage); renderHistory();
}

// ---------- settings ----------
function openSettings() {
  const s = S.settings;
  openSheet('Settings', `
    <div class="group"><h4>Your internet plan</h4>
      <div class="field-row"><label class="field"><span>Download (Mbps)</span><input id="planDown" type="number" inputmode="decimal" min="0" value="${s.planDown ?? ''}" placeholder="e.g. 400"></label>
      <label class="field"><span>Upload (Mbps)</span><input id="planUp" type="number" inputmode="decimal" min="0" value="${s.planUp ?? ''}" placeholder="e.g. 20"></label></div>
      <div class="field-row"><label class="field"><span>Monthly price ($)</span><input id="cost" type="number" inputmode="decimal" min="0" value="${s.monthlyCost ?? ''}" placeholder="e.g. 70"></label>
      <label class="field"><span>Provider name</span><input id="ispName" value="${esc(s.ispName)}" placeholder="${esc(S.info?.isp || 'Auto')}"></label></div>
    </div>
    <div class="group"><h4>Tests</h4>
      <label class="field"><span>Test length</span><select id="duration">
        ${[[6, 'Quick (about 15 sec, less data)'], [10, 'Standard (about 25 sec)'], [15, 'Thorough (about 35 sec)']].map(([v, t]) => `<option value="${v}" ${s.duration === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="setting"><div><span>Save location with results</span><small>Stored only on this device</small></div><label class="switch"><input type="checkbox" id="saveLoc" ${s.saveLocation ? 'checked' : ''} aria-label="Save location"><span></span></label></div>
    </div>
    <div class="group"><h4>Home screen</h4>
      <div class="setting"><div><span>Show last download speed on the app icon</span><small>Needs notification permission on iPhone</small></div><label class="switch"><input type="checkbox" id="badge" ${s.badge ? 'checked' : ''} aria-label="App icon badge"><span></span></label></div>
      <p class="sub" style="margin:0"><b style="color:var(--fg)">Install:</b> on iPhone, tap Share → Add to Home Screen. On a Mac, in Safari choose File → Add to Dock.</p>
    </div>
    <div class="group"><h4>Your data</h4>
      <p class="sub" style="margin:0">${S.results.length} result${S.results.length === 1 ? '' : 's'} saved on this device. Nothing is uploaded anywhere.</p>
      <div class="btn-row"><button class="btn" id="setCsv">Export CSV</button><button class="btn danger" id="wipe">Delete all</button></div>
    </div>
    <p class="sub" style="margin:0">Speed tests run against Cloudflare's free public test servers, which see each test like any speed test site would. Your provider name comes from Cloudflare (or ipinfo.io as a backup). Status checks contact each service and its public status page directly.</p>
    <button class="btn primary" id="saveSettings">Save</button>`, (b) => {
    const num = (id) => { const v = parseFloat($(id, b).value); return isNaN(v) || v <= 0 ? null : v; };
    $('#badge', b).addEventListener('change', async (e) => {
      if (e.target.checked && window.Notification && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
      if (!e.target.checked && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    });
    $('#setCsv', b).addEventListener('click', exportCSV);
    $('#wipe', b).addEventListener('click', async (e) => {
      const btn = e.currentTarget; if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = 'Tap again to delete everything'; return; }
      await results.clear(); await outages.clear(); S.results = []; S.outages = []; closeSheet(); toast('All results deleted');
    });
    $('#saveSettings', b).addEventListener('click', async () => {
      Object.assign(S.settings, { planDown: num('#planDown'), planUp: num('#planUp'), monthlyCost: num('#cost'), ispName: $('#ispName', b).value.trim(), duration: +$('#duration', b).value, saveLocation: $('#saveLoc', b).checked, badge: $('#badge', b).checked });
      await saveSettings(S.settings); closeSheet(); renderInfo(); toast('Saved');
      if (S.last && !$('#resultView').hidden) showResult(S.last);
      if (S.tab === 'history') renderHistory();
    });
  });
}

// ---------- sheet + toast ----------
function openSheet(title, html, mount) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false; $('#scrim').hidden = false;
  mount && mount($('#sheetBody'));
}
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; $('#sheetBody').innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
let toastT;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}

boot();
