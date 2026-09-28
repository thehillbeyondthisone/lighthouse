# History

Context for new sessions: what this repository is, what changed recently, and where things stand. Newest
entries first.

## Start here

- **What this is.** The repository began as *Tidewater*, a WebGPU island fishing game on a hand-written
  WGSL engine (see `README.md`). It is being turned into *Seven Hunters* (working title, codename
  `lighthouse`): an eerie, isolated, Firewatch-style narrative game on Eilean Mòr in the Flannan Isles, in
  the winter of 1900–01. The master plan is [`docs/PLAN.md`](docs/PLAN.md). Its §8 lists the phases and the
  next tasks, and its §10 lists the decisions still open.
- **Branch.** Work happens on `claude/firewatch-style-game-framework-iurrd1`.
- **Run it.** `npm install`, then `npm run dev` (http://127.0.0.1:5189) or `npm test`.
- **GPU tests in a cloud container with no GPU.** Point Dawn at the SwiftShader driver that ships with
  Playwright's Chromium:

  ```sh
  export VK_ICD_FILENAMES=/opt/pw-browsers/chromium-1194/chrome-linux/vk_swiftshader_icd.json
  node test/engine-smoke.mjs out.png                 # ~2 s
  W=800 H=400 node test/post-chain.mjs air out.png   # full post chain, ~30 s
  ```

  Without that variable, `npm test` passes the game-logic tests and then fails with "No WebGPU adapter
  found". If the path has changed, look for `vk_swiftshader_icd.json` under `/opt/pw-browsers/`.

## 2026-09-28: the plan

- Added `docs/PLAN.md`, which covers:
  - the setting research (the Flannan Isles disappearance of December 1900, the island, the sky at 58°N,
    the folklore, winter wildlife) and the alternatives considered;
  - the game design (the keeper's routine, the Watcher on Gallan Head, the logbook, the Brownie camera,
    the mystery);
  - the Style Lab: shader experiments for complete style conversions, with exact file and line hook
    points;
  - a keep / transform / cut table for every system, and the new systems to build;
  - sound, the roadmap, risks, and the open decisions.
- Added this file.
- Checked:
  - the game-logic tests pass;
  - the GPU tests render on SwiftShader (above);
  - the engine's sun model gives a noon sun of 8.4° and 6.4 h of daylight for the Flannans in
    mid-December.
- No game code has changed yet. Tidewater still runs exactly as before.

## Inherited from Tidewater (2026-09-23 to 2026-09-24)

These are Daniel Greenheck's 48 commits, up to `4811ba4`:

- a three.js/TSL version, then a port to raw WebGPU and WGSL: the engine core, then every system (ocean,
  sky, post, world, life, player, UI);
- the fishing game;
- a performance sweep of many small GPU savings;
- the `?bench` harness;
- TAA work: an FSR2-style accumulation, then SMAA + TAA, with 4× as the default;
- fixes to the water refraction, the lens flare and the swash film.

`docs/PORTING.md` is the engine's API map from the port (the three.js concepts and their engine
equivalents).
