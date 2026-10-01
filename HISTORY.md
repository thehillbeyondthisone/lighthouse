# History

Context for new sessions: what this repository is, what changed recently, and where things stand. Newest
entries first.

## Start here

- **What this is.** The repository began as *Tidewater*, a WebGPU island fishing game on a hand-written
  WGSL engine (see `README.md`). It is being turned into *Seven Hunters* (working title, codename
  `lighthouse`): an eerie, isolated, Firewatch-style narrative game on Eilean Mòr in the Flannan Isles, in
  the winter of 1900–01. The master plan is [`docs/PLAN.md`](docs/PLAN.md). Its §8 lists the phases and the
  next tasks, and its §10 lists the decisions still open.
- **The demo.** The default page is now Seven Hunters' first night (`src/story`); `?setting=tidewater` is the
  fishing game, `?nostory` the Flannans to walk freely. See the newest entry below.
- **Branch.** The demo was built on `claude/beautiful-bell-1cb1e6` (the planning and the first Flannan work on
  `claude/firewatch-style-game-framework-iurrd1`, merged as PR 1).
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

## 2026-10-01: a playable demo, the first night

The user agreed the plan for a playable demo (one night, 20-30 minutes) and asked for it to replace the public
link, in whatever look is easiest: Photoreal. Seven Hunters is now the default page; the Pages workflow
publishes `main`.

- **The night** (`src/story/Story.js`, the words in `Script.js`): Thursday 3rd January 1901, a real
  Thursday, with a full moon rising over Lewis at sunset (15.09). From the east landing at 13.40: up to the
  station, the keepers' room and the Board's letter (the tutorial, in the fiction), light the lamp at sunset,
  wind the machine, the slate at six and nine, the Watcher at dusk, the haar from the west at 20.36, a light
  on Eilean Tighe seen from the walkway, the gate found moved, "keep the watch until dawn", the lamp out, the
  journal written and signed, and the end page. The clock runs 1 game minute in 2.5 s before the lamp is lit
  and a minute a second after (a quarter of that while she sends), stops while a page is open, and skips
  with "keep the watch". The weather is scripted (`weatherAt`): 60 km visibility at dusk, 1.3 km in the
  haar. Saved in `localStorage` (`sevenhunters.night1.v1`); reloading offers to continue.
- **The Watcher** (`Watcher.js`): Ceit Macleod's lamp on Gallan Head. Steady while she watches, the call,
  then her messages in real Morse timing (a 45 ms unit), read letter by letter only while you watch through
  the telescope (right mouse, after you take it from the lantern's sill) or stand at the signal lamp on the
  walkway. Your answers come from the Board's code book (quick) or are spelled out (slow); each costs the
  clock. The haar loses her mid-message. Saying the island's name ("good night from Flannan"), against her
  advice, brings the haar sooner and changes a line in the journal.
- **The station inside** (`Station.js`): the keepers' room off the yard (one room of the house; the rest is
  walled off), the tower's doorway from it, 88 stone treads round the weight tube, a landing, a railed hatch
  and an iron stair into the lantern, the lens on its pedestal with the rotation machine and its crank, and
  a door through the lantern onto the walkway facing Gallan Head. The east gate has leaves. The lens,
  crank, doors, gate, telescope and the lantern's glass are moving parts (`assembleStation`).
- **Colliders** gained round walls with doorway gaps (`addRing`) and walkable height functions
  (`addSurface`, the spiral stair). The landing flights' steps are no longer solid (a 45° flight has treads
  shorter than the walker is wide: the solid boxes ahead blocked it), and the ground is cut under them after
  the tracks' grading, which had lifted it through the top of the east flight: the flight was never
  climbable before.
- **The light** (`src/station/Lamp.js`): the burner warms up over 18 s; the clockwork runs down over 3 game
  hours, its bell rings below 6 %; the lens turns once a minute with two pairs of bullseyes 25° apart, which
  gives the real character, Fl(2) W 30s (flashes 4.2 s apart). The lens material (`StationMaterials.js`)
  draws prism rings and bullseyes that blaze as they sweep past you.
- **Beams and far lights** (`src/station/Beams.js`, in `AirHaze`'s composite under `HZ_BEAMS`): the four
  beams as Gaussian tubes whose single scattering in the haze is integrated analytically at the view ray's
  closest approach (faint in clear air, sweeping shafts in the haar), and points of light dimmed by the haze
  and dropped by the curvature. Intensities are tuned on the shots (`dBeams`, `dBeamsClear`, `dLantern`).
- **Interiors**: `installUnderwaterLighting` takes `interiors` (boxes and cylinders) and cuts the sky's
  ambient inside them (generated WGSL; none in Tidewater, whose shaders are unchanged in effect).
- **Sound**: `SoundScape` has a `flannan` mode (no palms, crickets, songbirds, terns or beach surf; the sea
  bed placed off the cliffs; indoors muffled, your steps not). `src/audio/StationSound.js` synthesises the
  escapement, bell, ratchet, burner, doors, shutter and the wind in the glazing, and booms the sea in the geos
  from the surf recordings.
- **Shipping**: the loader, title, brand, start screen and help are Seven Hunters' unless
  `?setting=tidewater`; the reef, whale, wildlife (tropical birds), marine snow and caustics are off at the
  Flannans by default; the "flashlight" is a keeper's hand lamp there. The README leads with the demo.
- **Tests** (no GPU): `test/demo-walk.mjs` walks the real Player from the landing stage up the tower and out
  onto the walkway (68 s); `test/demo-story.mjs` plays the whole night through with scripted page answers
  (`--say` for the other ending line). Both are in `npm test`.
- **Review views** for the demo's spaces: `dRoom`, `dStair`, `dLantern`, `dBeams` (the haar), `dBeamsClear`,
  `dWalkway`, `dLanding`, `dYardMoon`, `dRoomNight`; `?lamp` lights the lamp for them.

Not yet seen on a real GPU: performance, the pointer-lock flow between pages, and the audio. The demo has no
key art of its own yet (the loader falls back to a dark gradient if `public/ui/keyart-flannan.jpg` is absent).

## 2026-09-29 (later): Eilean Mòr, the light station and the far shore

The user asked for "the lighthouse station and distant other side you can only look across to, and only
when the weather is clear". `?setting=flannan` now loads a different world: the real island, the station
on it, and Lewis, Harris and St Kilda across the sea.

- **Real elevation data.** `node tools/terrain/flannan.mjs` bakes `public/terrain/flannan/` (about
  185 KB) from the Copernicus GLO-30 DEM (the land) and the AWS terrarium tiles (the seabed). Both come
  from S3, which is reachable from this container; OSM, Canmore and HES are not. The grids are in the
  engine's frame: an azimuthal equidistant projection centred on the light, x east, z south.
  - `island`: Eilean Mòr, Eilean Tighe and the seabed, 2 km at 8 m;
  - `flannans`: the other Seven Hunters, 9 km at 20 m;
  - `hebrides`: Lewis and Harris, 18–98 km east, at 150 m;
  - `stkilda`: St Kilda, 71–78 km south-west (Boreray, Hirta), at 40 m;
  - `uig`: the Uig coast of Lewis facing the Flannans (Gallan Head, 33 km) at the DEM's own 30 m, for
    the telescope.

  `tools/terrain/cog.mjs` reads the Cloud Optimized GeoTIFFs (DEFLATE and the floating-point predictor)
  with no dependencies. `src/world/flannan/FlannanData.js` loads the grids in the browser.
- **The walkable island** (`src/world/flannan/FlannanTerrain.js`, a `TerrainData` subclass; the base
  class takes `{ generate: false }`).
  - The DEM is upsampled to 1 m and the land lifted 15 %: the 30 m surface model rounds off the summit,
    and the light's focal plane is 101 m on a 23 m tower.
  - Sheer, ledged cliffs all round: near the coast the ground takes the plateau height (a max filter),
    then drops to the sea.
  - Two landing geos, east and west. Each has a flight graded up the cliff at no more than 45°: the east
    flight rises 71 m over an 81 m run, the west flight 35 m over 42 m.
  - The seabed shelves to about 50 m, with boulders at the cliff foot.
- **The station** (`src/world/flannan/Station.js`), built with the village's GeoBuilder, materials and
  merged draws. `Village` takes a `build` option and skips its tropical layout.
  - The tower: an ochre base, a white shaft, the corbelled walkway with iron railings, the cast-iron deck
    and a diamond-latticed lantern under a black cupola.
  - The one-storey, flat-roofed L-plan keepers' house, with the tower at its north-east corner.
    Limewashed, with the Northern Lighthouse Board's ochre margins, long-and-short quoins, base course
    and blocking course. Sash windows and doors come from `Buildings.js`, now exported.
  - The boundary wall with gatepiers, and an oil store.
  - The two landings: a concrete stage, a stepped flight with railings, and a derrick crane. On the
    west flight, the box of ropes sits 33 m up, the "110 feet" of Muirhead's report.
  - The tramways to the gates, the flagstaff, and St Flannan's drystone chapel 28 m south of the wall,
    to Canmore's measurements.

  Walls use continuous plaster uvs across their pieces. The stone material gained a plaster-cover and a
  peat-splash control in its spare vdata channels; existing uses are unchanged.
- **The far shore** (`src/world/flannan/FarShore.js`): a static mesh per grid, about 500k triangles.
  The cells under the finer Uig grid are left out of the coarse one. It is frustum-culled, with bounds
  that reach down as far as the curvature drops it.
- **Telescope views** (`fGallan`, `fHarris`, `fStKilda`) set their own field of view (`fov`) and
  visibility.
- **The Earth's curvature.** `frame.curvature` and `curvatureDrop( xz )` in `wgsl/common.js`, with
  refraction k = 0.13. The drop is 84 m at 35 km. The sea's vertices and the far shore's drop below the
  main camera; everywhere else it is zero, so Tidewater is unchanged. From the lantern the sea horizon
  lies 38 km out. The camera's far plane is 150 km at the Flannans, and the ocean LOD has one more
  level. The haze measures height above the curved surface (`hazeVy` in `AirHaze.js`). Without that, a
  far coast's foot sank into a marine layer far denser than at sea level and showed as a bright band.
- **Visibility.** `?vis=<km>` sets the haze (`hazeDensityForVisibility` in `AirHaze.js`, about
  21.5 / km). At the Flannans the default is 30 km, so Lewis only shows on clearer days. The Sky tab
  has a Visibility slider there, and a review view can carry its own (`vis: 90` in `fLewisClear`).
- **The ground.** The terrain material takes `maritime` (set at the Flannans): no forest band, no
  laterite, and winter turf instead of the tropical meadow.
- **Other wiring.** At the Flannans:
  - the vegetation, the fishing game and the summer air particles are left out;
  - the boat is hidden;
  - the sea has a winter south-westerly (9 m/s toward the north-east) over a west-south-west swell;
  - the player starts in the station's yard.
- **Review views:** `fStation`, `fYard`, `fChapel`, `fLewis`, `fEastSea`, `fWestLanding`, `fAerial`,
  `fDusk`. Views can now be given as a target point (`at`).
- **Camera cuts.** `App.cameraCut()`, called by `__view` and by the bench between review views, restarts
  the upscaler's history and the clouds'. The upscaler keeps the history of still pixels whose shading
  holds. Before this, one view could show the last view's sea in its sky: the aerial's glitter over
  the dusk.
- **Checking geometry without the GPU.** The scratch script (a small software rasterizer over the
  builder's batches) renders the station in seconds. A real run
  (`npm run shots -- --views=fStation,fYard --params="setting=flannan&lite" --adapt`) loads in about 55 s
  and takes about 2 min per view at 640 × 360.

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
