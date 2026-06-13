# consciousness dot

An independent replication of the [Global Consciousness Project Dot](https://global-mind.org/gcpdot/), built with public quantum random number generator APIs.

## How it works

Every 60 seconds the page fetches random bytes from two independent hardware entropy sources:

- **[ANU Quantum RNG](https://qrng.anu.edu.au)** — quantum vacuum fluctuations, Australian National University
- **[HotBits](https://www.fourmilab.ch/hotbits/)** — radioactive decay, fourmilab.ch

It then runs the same core statistic the GCP uses — **network variance** (Stouffer Z) — measuring how much the two sources correlate with each other rather than drifting independently. The result is mapped to a p-value and displayed as a colored dot.

| Color | Meaning | p-value |
|-------|---------|---------|
| 🔵 Blue | Deeply coherent | > 0.95 |
| 🟢 Green | Slightly coherent | 0.90–0.95 |
| ⚪ Gray | Normal / random | 0.40–0.90 |
| 🟡 Yellow | Slightly elevated | 0.10–0.40 |
| 🟠 Orange | Strongly elevated | 0.05–0.10 |
| 🔴 Red | Broadly coherent | < 0.05 |

## Caveats

With only 2 sources and 64 bytes per sample, the statistics are much noisier than the real GCP (which uses 65+ eggs and decades of data). The dot will jump around more. This is a faithful architectural replication, not a scientific equivalent.

## Hosting on GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to `main` branch, `/ (root)`
4. Your dot will be live at `https://yourusername.github.io/repo-name`

No build step, no dependencies, no server needed.

## Adding more sources

To add random.org as a third source (requires a free API key):

```js
async function fetchRandomOrg(n, apiKey) {
  const r = await fetch('https://api.random.org/json-rpc/4/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'generateIntegers', id: 1,
      params: { apiKey, n, min: 0, max: 255, replacement: true }
    })
  });
  const j = await r.json();
  return j.result.random.data;
}
```

## Credits

Inspired by the [Global Consciousness Project](https://global-mind.org) and the original [GCP Dot](https://global-mind.org/gcpdot/) by belisoful.
