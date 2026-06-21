'use strict';

const PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://corsproxy.io/?url=',
];
const SAMPLE_SIZE = 64;
const INTERVAL_MS = 60000;

// Fetch JSON, trying a direct request first (some public APIs serve
// permissive CORS headers, letting us skip proxies entirely for those
// sources — fewer hops, and avoids security software flagging repeated
// calls to generic proxy domains). Falls back to the proxy chain if the
// direct request fails (CORS block, network error, non-JSON, etc).
async function fetchJsonViaProxy(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (r.ok) {
      const text = await r.text();
      try { return JSON.parse(text); } catch { /* fall through */ }
    }
  } catch { /* CORS or network error — fall through */ }

  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const r = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        lastErr = new Error('invalid JSON from proxy');
        continue;
      }
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error('all proxies failed');
}

const COLORS = {
  blue:   { hex: '#3b7ddd', label: 'deeply coherent',   desc: 'index > 95% — rare strong signal' },
  cyan:   { hex: '#4fd1d9', label: 'slightly coherent', desc: 'index 90–95%' },
  green:  { hex: '#4caf50', label: 'normal / random',   desc: 'index 40–90% — expected behavior' },
  yellow: { hex: '#f0c419', label: 'slightly elevated', desc: 'index 10–40%' },
  orange: { hex: '#f08a24', label: 'strongly elevated', desc: 'index 5–10%' },
  red:    { hex: '#e0473e', label: 'broadly coherent',  desc: 'index < 5% — widely shared coherence' },
};

function pToColor(p) {
  if (p > 0.95) return 'blue';
  if (p > 0.90) return 'cyan';
  if (p > 0.40) return 'green';
  if (p > 0.10) return 'yellow';
  if (p > 0.05) return 'orange';
  return 'red';
}

// Continuous color gradient anchored to the same thresholds as COLORS,
// following the original GCP dot's red→orange→yellow→green→cyan→blue
// spectrum (green = normal, not gray) so the dot stays lively even in
// the common case.
const GRADIENT_STOPS = [
  { p: 0.00, rgb: [224, 71, 62] },   // red
  { p: 0.05, rgb: [240, 138, 36] },  // orange
  { p: 0.10, rgb: [240, 196, 25] },  // yellow
  { p: 0.40, rgb: [150, 190, 60] },  // yellow-green
  { p: 0.65, rgb: [76, 175, 80] },   // green (center of normal band)
  { p: 0.90, rgb: [70, 190, 160] },  // green-cyan
  { p: 0.95, rgb: [79, 209, 217] },  // cyan
  { p: 1.00, rgb: [59, 125, 221] },  // blue
];

function pToRgb(p) {
  p = Math.max(0, Math.min(1, p));
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    const a = GRADIENT_STOPS[i], b = GRADIENT_STOPS[i + 1];
    if (p >= a.p && p <= b.p) {
      const t = (p - a.p) / (b.p - a.p || 1);
      return a.rgb.map((v, idx) => Math.round(v + (b.rgb[idx] - v) * t));
    }
  }
  return GRADIENT_STOPS[GRADIENT_STOPS.length - 1].rgb;
}

function pToGradientHex(p) {
  const [r, g, b] = pToRgb(p);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

const $ = id => document.getElementById(id);

function setDotColor(hex) {
  ['dot', 'ring1', 'ring2', 'ring3'].forEach(id => {
    $(id).style.background = hex;
  });
}

function setSourceState(key, state, detail) {
  const ind = $(`ind-${key}`);
  ind.className = 'source-indicator ' + state;
  if (detail) $(`detail-${key}`).textContent = detail;
}

async function fetchANU(n) {
  const url = `https://qrng.anu.edu.au/API/jsonI.php?length=${n}&type=uint8&_=${Date.now()}`;
  const j = await fetchJsonViaProxy(url);
  if (!j.success || !j.data) throw new Error('ANU returned no data');
  return j.data;
}

const DRAND_QUICKNET = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const DRAND_DEFAULT = '8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce';

async function fetchDrandChain(chainHash, n) {
  const url = `https://api.drand.sh/${chainHash}/public/latest?_=${Date.now()}`;
  const j = await fetchJsonViaProxy(url);
  const hex = j?.randomness;
  if (!hex) throw new Error('drand returned no data');
  const bytes = [];
  for (let i = 0; i < hex.length && bytes.length < n; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  if (bytes.length === 0) throw new Error('drand parse failed');
  return { bytes, round: j.round };
}

async function fetchDrand(n) {
  return fetchDrandChain(DRAND_QUICKNET, n);
}

async function fetchDrandDefault(n) {
  return fetchDrandChain(DRAND_DEFAULT, n);
}

function bytesToZscores(bytes) {
  const mean = 127.5;
  const sd = Math.sqrt((256 * 256 - 1) / 12);
  return bytes.map(b => (b - mean) / sd);
}

function networkVariance(zArrays) {
  const N = zArrays.length;
  const len = Math.min(...zArrays.map(a => a.length));
  let sumCovar = 0;
  let count = 0;

  for (let t = 0; t < len; t++) {
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        sumCovar += zArrays[i][t] * zArrays[j][t];
        count++;
      }
    }
  }

  const meanCovar = count > 0 ? sumCovar / count : 0;
  const stoufferZ = count > 0 ? meanCovar * Math.sqrt(count) : 0;
  return { stoufferZ, count, len };
}

function normCDF(z) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

let timer = null;
const logs = [];

// History: store up to 24hrs of 1-min samples = 1440 points
const MAX_HISTORY = 1440;
const history = []; // {ts, p} objects

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logs.unshift(`${t} ${msg}`);
  if (logs.length > 8) logs.pop();
  $('debug-log').textContent = logs.join('\n');
}

function pToHex(p) {
  return pToGradientHex(p);
}

function drawChart() {
  const canvas = $('history-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssHeight = 120;
  canvas.style.height = cssHeight + 'px';
  canvas.width = rect.width * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = cssHeight;
  const PAD = 4;

  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = '#13131a';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 8);
  ctx.fill();

  // threshold lines
  const thresholds = [
    { p: 0.95, color: 'rgba(59,125,221,0.15)' },
    { p: 0.90, color: 'rgba(79,209,217,0.15)' },
    { p: 0.10, color: 'rgba(240,196,25,0.15)' },
    { p: 0.05, color: 'rgba(240,138,36,0.15)' },
  ];
  thresholds.forEach(({ p, color }) => {
    const y = PAD + (1 - p) * (H - PAD * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  if (history.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '11px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('building history…', W / 2, H / 2);
    return;
  }

  // draw colored line segments
  for (let i = 1; i < history.length; i++) {
    const x1 = PAD + ((i - 1) / (MAX_HISTORY - 1)) * (W - PAD * 2);
    const x2 = PAD + (i / (MAX_HISTORY - 1)) * (W - PAD * 2);
    const y1 = PAD + (1 - history[i - 1].p) * (H - PAD * 2);
    const y2 = PAD + (1 - history[i].p) * (H - PAD * 2);

    ctx.strokeStyle = pToHex(history[i].p);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // dot at latest point
  const last = history[history.length - 1];
  const lx = PAD + ((history.length - 1) / (MAX_HISTORY - 1)) * (W - PAD * 2);
  const ly = PAD + (1 - last.p) * (H - PAD * 2);
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fillStyle = pToHex(last.p);
  ctx.fill();

  // update time label
  if (history.length > 0) {
    const oldest = new Date(history[0].ts);
    $('chart-time-start').textContent = oldest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

async function run() {
  const btn = $('sample-btn');
  btn.disabled = true;
  $('status-text').textContent = 'sampling…';
  $('index-text').textContent = 'querying quantum sources';

  const sources = [
    { key: 'anu', label: 'ANU ok', fetch: () => fetchANU(SAMPLE_SIZE), info: bytes => `${bytes.length} bytes · quantum vacuum` },
    { key: 'drand-q', label: 'drand-quicknet ok', fetch: () => fetchDrand(SAMPLE_SIZE), info: (bytes, extra) => `${bytes.length} bytes · round #${extra.round}` },
    { key: 'drand-d', label: 'drand-default ok', fetch: () => fetchDrandDefault(SAMPLE_SIZE), info: (bytes, extra) => `${bytes.length} bytes · round #${extra.round}` },
  ];

  sources.forEach(s => setSourceState(s.key, 'loading', 'fetching…'));
  log('→ starting fetch from 3 sources');

  const results = await Promise.allSettled(sources.map(s => s.fetch()));

  const zArrays = [];

  results.forEach((result, i) => {
    const s = sources[i];
    if (result.status === 'fulfilled') {
      const value = result.value;
      const bytes = Array.isArray(value) ? value : value.bytes;
      zArrays.push(bytesToZscores(bytes));
      const mean = (bytes.reduce((a, b) => a + b, 0) / bytes.length).toFixed(1);
      const extra = Array.isArray(value) ? {} : value;
      setSourceState(s.key, 'ok', `mean ${mean}/255 · ${s.info(bytes, extra)}`);
      log(`✓ ${s.label} · mean ${mean}`);
    } else {
      setSourceState(s.key, 'err', `unavailable: ${result.reason.message.slice(0, 40)}`);
      log(`✗ ${s.key} failed: ${result.reason.message.slice(0, 50)}`);
    }
  });

  if (zArrays.length < 2) {
    $('status-text').textContent = 'insufficient sources';
    $('index-text').textContent = 'need at least 2 sources online to compute coherence';
    $('stat-p').textContent = '—';
    $('stat-z').textContent = '—';
    $('stat-n').textContent = `${zArrays.length}/3 online`;
    btn.disabled = false;
    return;
  }

  const { stoufferZ, len } = networkVariance(zArrays);
  // Probability-integral transform of the network Stouffer Z. Under random
  // data this is ~uniform on [0,1], so the dot roams the full red↔blue
  // spectrum. (Do NOT fold negatives back above 0.5 — that pins p in
  // [0.5,1.0] and makes the entire yellow/orange/red half unreachable.)
  const p = normCDF(stoufferZ);

  const colorKey = pToColor(p);
  const c = COLORS[colorKey];

  setDotColor(pToGradientHex(p));
  $('status-text').textContent = c.label;
  $('index-text').textContent = c.desc;
  $('stat-p').textContent = p.toFixed(4);
  $('stat-z').textContent = stoufferZ.toFixed(3);
  $('stat-n').textContent = `${len} bytes`;

  // record to history and redraw chart
  history.push({ ts: Date.now(), p });
  if (history.length > MAX_HISTORY) history.shift();
  drawChart();

  const now = new Date();
  $('timestamp').textContent = `last sampled ${now.toLocaleTimeString()} · next in 60s`;

  btn.disabled = false;

  clearInterval(timer);
  timer = setInterval(run, INTERVAL_MS);
}

window.addEventListener('DOMContentLoaded', () => {
  drawChart();
  run();
});
