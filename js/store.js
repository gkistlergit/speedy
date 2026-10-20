// Everything Speedy saves stays on this device (IndexedDB), with an
// in-memory fallback for private browsing.
const NAME = 'speedy';
let dbp;
const mem = { kv: new Map(), results: new Map(), outages: new Map() };

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('kv');
        d.createObjectStore('results', { keyPath: 'id' });
        d.createObjectStore('outages', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}

async function run(store, mode, fn, memFn) {
  const d = await open();
  if (!d) return memFn(mem[store]);
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = () => rej(t.error);
  });
}

export const kv = {
  get: (k) => run('kv', 'readonly', (s) => s.get(k), (m) => m.get(k)),
  set: (k, v) => run('kv', 'readwrite', (s) => s.put(v, k), (m) => void m.set(k, v)),
  del: (k) => run('kv', 'readwrite', (s) => s.delete(k), (m) => void m.delete(k)),
};

function table(name) {
  return {
    all: () => run(name, 'readonly', (s) => s.getAll(), (m) => [...m.values()]),
    put: (r) => run(name, 'readwrite', (s) => s.put(r), (m) => void m.set(r.id, r)),
    del: (id) => run(name, 'readwrite', (s) => s.delete(id), (m) => void m.delete(id)),
    clear: () => run(name, 'readwrite', (s) => s.clear(), (m) => void m.clear()),
  };
}
export const results = table('results');
export const outages = table('outages');

export const DEFAULT_SETTINGS = {
  planDown: null, planUp: null, monthlyCost: null, ispName: '',
  duration: 10, connMode: 'auto', saveLocation: false, badge: true,
  room: null, rooms: [], favorites: ['netflix', 'youtube', 'psn', 'xfinity'],
  watch: false, customServices: [],
};
export async function loadSettings() {
  const s = (await kv.get('settings')) || {};
  return { ...DEFAULT_SETTINGS, ...s };
}
export const saveSettings = (s) => kv.set('settings', s);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
