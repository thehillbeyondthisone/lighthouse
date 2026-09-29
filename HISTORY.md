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
- **See the game** without a GPU. `npm run shots` finds the driver itself; flags are in
  `tools/shots/shots.mjs`. A run takes 5–20 min and writes PNGs plus a contact sheet to `shots/`:

  ```sh
  npm run shots -- --views=beach,aerial --styles=photoreal,poster,albumen --times=12.4,14.8 \
                   --adapt --params="setting=flannan&lite" --w=640 --h=360 --frames=24
  ```

## 2026-09-29: the Style Lab's first build

- **The post chain and the compute passes fit WebGPU's default limits** (16 sampled / 4 storage textures
  per stage: software renderers, many mobile GPUs). Before this, the haze, beauty, environment-mip,
  ocean-mip, caustics-mip and underwater-light passes failed validation there. The world materials still
  don't fit: the water reads 24 sampled textures, the terrain 17, the village stall 19. The fix:
  - bindings no entry point reaches get no layout entry (`composeShader` / `BindingSet` in
    `src/engine/gpu/Shader.js`);
  - the mip kernels split their work to fit the storage-texture limit.

  The post chain and the engine smoke renders are pixel-identical before and after.
  `WEBGPU_DEFAULT_LIMITS=1` makes any Node engine test run with those limits.
- **The real sky** (`src/sky/Setting.js`, `?setting=flannan`): latitude and date give the sun and a real
  moon. On 15 December 1900 at the Flannans the noon sun stands at 8.4°, and a waning moon, about a
  third lit, rises after midnight. The moon disc shows its phase, and moonless nights are nearly dark.
- **The Style Lab** (`src/style`, `?style=`, a Style tab in the panel; docs/PLAN.md §4):
  - *Poster*, the Firewatch lineage: ramped fog, a painted sky with flat two-tone clouds, banded light
    with tinted shadows, and a grade;
  - *Albumen* and *Cyanotype*, a print of 1900: blue-sensitive film, halation, Petzval swirl, paper,
    dust, toning;
  - *Photoreal*, unchanged.

  Colours are authored as display hex, blend in sRGB like paint (keys, gradients, fog ramps, fog
  opacity), and reach scene radiance through the inverse tone curve per pixel
  (`styleScene` in `src/engine/render/wgsl/common.js`). The first build converted them to scene
  radiance and blended there, so a bright horizon swamped the zenith: the sky came out peach from top
  to bottom. It also banded N·L against the sun's full strength, so the winter sun's weak light left
  everything in the bottom band. `lightShape.gamma` lifts it. The flat clouds now fade out near the
  horizon.
- **Screenshots of the real game** in this container: `npm run shots` (`tools/shots`).
  - The whole app runs in Node on Dawn, with SwiftShader when there is no GPU, behind a small browser
    stand-in (`tools/shots/browser.mjs`: inert DOM, fetch from `public/`, PNG and JPEG decoding through
    `jpeg-js`, a new dev dependency). It goes through the app's own `?bench&shots` path
    (`startBench` in `src/core/Bench.js`, shared with `src/main.js`).
  - Loading takes about 75 s, and each frame 2–5 s at 640 × 360. Peak memory is about 3.6 GB.
  - `--styles=a,b --times=h1,h2` repeat the views per style and time of day in one run. `--adapt`
    lets the exposure settle at dusk and night.
  - Example:
    `npm run shots -- --views=beach,aerial --styles=photoreal,poster --params="setting=flannan" --adapt`.
  - `tools/shots/diff.mjs` compares two PNGs.
  - `STYLE=poster REAL_SKY=15.5 W=800 H=400 node test/post-chain.mjs air out.png` renders a style
    through the full post chain in about 30 s.
- **Why not Chromium.** Headless Chromium on SwiftShader holds the adapter to WebGPU's default limits
  (16 sampled textures per stage), and the water shader reads 24. No flag changes that. Dawn in Node
  reports the driver's own limits (48).
- **A shader that took SwiftShader minutes and 12 GB.** "Wake Rows" (`src/ocean/WakeSim.js`) had about
  50 short-circuit `&&` / `||` in a row inside a loop, once inlined. Each one is a branch, and
  SwiftShader's control-flow walk (`Spirv::Function::ExistsPath`) is exponential in consecutive
  branches. The fix uses `&` / `|` / `all()` / `any()`, which give the same values with no branch, in
  the wake helpers and `terrainHeightAt`. The old kernel passed 4 GB in 55 s; the new one compiles at
  once. Tools for next time:
  - `--compile=serial` (`?serialPipelines`) times each pipeline;
  - the shots tool stops a run past `--maxmem`;
  - a layout over a per-stage limit now logs its bindings by name.
- **Flags that leave out the tropical systems:** `?noReef`, `?noWhale`, `?noWildlife`, `?noSnow`,
  `?noCaustics`, or `?lite` for all of them (docs/PLAN.md §5.1).
- **Clouds in the shots.** With the clock stopped (the bench's `dt = 0`) the volumetric clouds'
  temporal reconstruction (a quarter-rate lattice) is still blocky after 24 frames. With the clock
  running it's clean in 24. `npm run shots` now steps the clock by 1/60 s per frame by default; `--dt=0`
  still gives pixel-comparable stills. The root cause in `SkyProClouds.js` isn't found yet. It isn't
  stale light: the clouds already reset their history when the key light moves more than about 2.6°.
- **Where the looks stand**, judged on the beach and aerial views at noon (sun at 8°) and 14:48 (sun at
  1°):
  - *Poster* reads as a painted winter noon: a slate zenith, a pale gold horizon, flat cream clouds, gold
    glitter.
  - At dusk it becomes a violet-to-peach sunset, with lavender-blue shadows and long graphic shadow
    shapes.
  - *Albumen* reads as a print of the period.
  - At night (16:00 blue hour; 05:00 under the real crescent moon):
    - Photoreal is a dark, moonlit winter night;
    - Poster turns lavender, then indigo;
    - Albumen goes black, as a plate of 1900 would. It's a look for photographs and menus, not for
      night play.
  - Weak spots:
    - Poster's sea is still the physical water reflecting the painted sky (it needs its own mode);
    - the tropical island's turquoise shallows and palms;
    - the clouds' blockiness with the clock stopped (above);
    - a darker disc around the moon in Poster's night sky, still to look at.

  Next steps are in docs/PLAN.md §8.

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
