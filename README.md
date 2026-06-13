# consciousness dot

An independent replication of the [Global Consciousness Project Dot](https://global-mind.org/gcpdot/), built with public random number generator APIs.

## How it works

Every 60 seconds the page fetches random bytes from three independent public entropy sources:

- **[ANU Quantum RNG](https://qrng.anu.edu.au)** — quantum vacuum fluctuations, Australian National University
- **[drand quicknet](https://drand.love)** — League of Entropy distributed beacon, fresh round every 3 seconds
- **[drand default chain](https://drand.love)** — League of Entropy distributed beacon, fresh round every 30 seconds

It then runs the same core statistic the GCP uses — **network variance** (Stouffer Z) — measuring how much the sources correlate with each other rather than drifting independently, across all 3 pairwise combinations. The result is mapped to a p-value and displayed as a colored dot.

| Color | Meaning | p-value |
|-------|---------|---------|
| 🔵 Blue | Deeply coherent | > 0.95 |
| 🟢 Green | Slightly coherent | 0.90–0.95 |
| ⚪ Gray | Normal / random | 0.40–0.90 |
| 🟡 Yellow | Slightly elevated | 0.10–0.40 |
| 🟠 Orange | Strongly elevated | 0.05–0.10 |
| 🔴 Red | Broadly coherent | < 0.05 |

The dot itself uses a continuous color gradient anchored to these same thresholds, so it shifts hue smoothly with every sample rather than jumping between 6 discrete colors.

## Caveats

With 3 sources and 64 bytes per sample (32 for the drand chains), the statistics are still much noisier than the real GCP (which uses 65+ eggs and decades of data). The dot will jump around more. This is a faithful architectural replication, not a scientific equivalent. If any source is temporarily unavailable, the calculation proceeds with whichever sources succeeded (minimum 2 required).

Note on random.org: an earlier version included random.org as a fourth source, but its free API enforces a per-IP quota that gets exhausted quickly when accessed through shared public CORS proxies, causing persistent 429 errors. It was removed rather than requiring users to supply their own API key.

## CORS proxies

Since these APIs don't allow direct browser requests, fetches go through a chain of public CORS proxies (`allorigins.win`, `codetabs.com`, `corsproxy.io`). If one proxy is down, rate-limited, or returns a bad response, the code automatically falls through to the next.

## Hosting on GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch** → `main` branch, `/ (root)`
4. Your dot will be live at `https://yourusername.github.io/repo-name`

No build step, no dependencies, no server needed.

## Cache busting

`index.html` references `dot.js?v=N` and `style.css?v=N`. Bump the `N` whenever either file changes, so browsers and GitHub Pages' CDN don't serve a stale cached copy.

## Credits

Inspired by the [Global Consciousness Project](https://global-mind.org) and the original [GCP Dot](https://global-mind.org/gcpdot/) by belisoful.
