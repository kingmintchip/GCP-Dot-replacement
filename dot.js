'use strict';

const PROXY = 'https://corsproxy.io/?url=';
const SAMPLE_SIZE = 64;
const INTERVAL_MS = 60000;

const COLORS = {
  blue:   { hex: '#2176d9', label: 'deeply coherent',   desc: 'index > 95% — rare strong signal' },
  green:  { hex: '#3ea87a', label: 'slightly coherent', desc: 'index 90–95%' },
  white:  { hex: '#9a9a8e', label: 'normal / random',   desc: 'index 40–90% — expected behavior' },
  yellow: { hex: '#c9a820', label: 'slightly elevated', desc: 'index 10–40%' },
  orange: { hex: '#d06820', label: 'strongly elevated', desc: 'index 5–10%' },
  red:    { hex: '#c43030', label: 'broadly coherent',  desc: 'index < 5% — widely shared coherence' },
};

function pToColor(p) {
  if (p > 0.95) return 'blue';
  if (p > 0.90) return 'green';
  if (p > 0.40) return 'white';
  if (p > 0.10) return 'yellow';
  if (p > 0.05) return 'orange';
  return 'red';
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
  const r = await fetch(PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(12000), cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.success || !j.data) throw new Error('ANU returned no data');
  return j.data;
}

async function fetchHotBits(n) {
  const url = `https://www.fourmilab.ch/cgi-bin/Hotbits?nbytes=${n}&fmt=json&apikey=Pseudorandom&_=${Date.now()}`;
  const r = await fetch(PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(12000), cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.data) throw new Error('HotBits returned no data');
  return j.data;
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

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logs.unshift(`${t} ${msg}`);
  if (logs.length > 8) logs.pop();
  $('debug-log').textContent = logs.join('\n');
}

async function run() {
  const btn = $('sample-btn');
  btn.disabled = true;
  $('status-text').textContent = 'sampling…';
  $('index-text').textContent = 'querying quantum sources';

  setSourceState('anu', 'loading', 'fetching…');
  setSourceState('hb', 'loading', 'fetching…');
  log('→ starting fetch from ANU + HotBits');

  const [anuResult, hbResult] = await Promise.allSettled([
    fetchANU(SAMPLE_SIZE),
    fetchHotBits(SAMPLE_SIZE),
  ]);

  const zArrays = [];

  if (anuResult.status === 'fulfilled') {
    zArrays.push(bytesToZscores(anuResult.value));
    const mean = (anuResult.value.reduce((a, b) => a + b, 0) / anuResult.value.length).toFixed(1);
    setSourceState('anu', 'ok', `mean ${mean}/255 · ${anuResult.value.length} bytes · quantum vacuum`);
    log(`✓ ANU ok · mean ${mean}`);
  } else {
    setSourceState('anu', 'err', `unavailable: ${anuResult.reason.message.slice(0, 40)}`);
    log(`✗ ANU failed: ${anuResult.reason.message.slice(0, 50)}`);
  }

  if (hbResult.status === 'fulfilled') {
    zArrays.push(bytesToZscores(hbResult.value));
    const mean = (hbResult.value.reduce((a, b) => a + b, 0) / hbResult.value.length).toFixed(1);
    setSourceState('hb', 'ok', `mean ${mean}/255 · ${hbResult.value.length} bytes · radioactive decay`);
    log(`✓ HotBits ok · mean ${mean}`);
  } else {
    setSourceState('hb', 'err', `unavailable: ${hbResult.reason.message.slice(0, 40)}`);
    log(`✗ HotBits failed: ${hbResult.reason.message.slice(0, 50)}`);
  }

  if (zArrays.length < 2) {
    $('status-text').textContent = 'insufficient sources';
    $('index-text').textContent = 'need at least 2 sources online to compute coherence';
    $('stat-p').textContent = '—';
    $('stat-z').textContent = '—';
    $('stat-n').textContent = `${zArrays.length}/2 online`;
    btn.disabled = false;
    return;
  }

  const { stoufferZ, len } = networkVariance(zArrays);
  const pOneTail = normCDF(stoufferZ);
  const p = stoufferZ >= 0 ? pOneTail : 1 - pOneTail;

  const colorKey = pToColor(p);
  const c = COLORS[colorKey];

  setDotColor(c.hex);
  $('status-text').textContent = c.label;
  $('index-text').textContent = c.desc;
  $('stat-p').textContent = p.toFixed(4);
  $('stat-z').textContent = stoufferZ.toFixed(3);
  $('stat-n').textContent = `${len} bytes`;

  const now = new Date();
  $('timestamp').textContent = `last sampled ${now.toLocaleTimeString()} · next in 60s`;

  btn.disabled = false;

  clearInterval(timer);
  timer = setInterval(run, INTERVAL_MS);
}

window.addEventListener('DOMContentLoaded', run);
