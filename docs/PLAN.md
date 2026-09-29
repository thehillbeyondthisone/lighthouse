# Seven Hunters: the plan

*Working title. Codename `lighthouse`.* A first-person, eerie, isolated narrative game in the lineage of
*Firewatch*, set on Eilean Mòr in the Flannan Isles, Outer Hebrides, in the winter of 1900–01. It is built
on the Tidewater WebGPU engine that this repository started as.

**Status:** planning. No game code has changed yet. This is a living document: update it as decisions
land, and record what changed in [`HISTORY.md`](../HISTORY.md).

| | |
|---|---|
| [1. The pitch](#1-the-pitch) | what the game is and how it relates to Firewatch |
| [2. The setting](#2-the-setting-eilean-mòr-flannan-isles-19001901) | the history, the island, the sky and the folklore, all fact-checked |
| [3. The game](#3-the-game) | premise, structure, the keeper's routine, the Watcher, the mystery |
| [4. The Style Lab](#4-the-style-lab-shader-experiments) | the shader experiments for complete style conversions, with exact hook points |
| [5. Converting the world](#5-converting-the-world) | keep / transform / cut for every system, terrain, buildings, ocean, sky, wildlife |
| [6. New systems](#6-new-systems) | what has to be built from scratch |
| [7. Sound](#7-sound) | the eerie soundscape on the existing audio engine |
| [8. Roadmap](#8-roadmap) | phases, exit criteria, the next five tasks |
| [9. Risks](#9-risks) | and what to do about them |
| [10. Decisions for you](#10-decisions-for-you) | open questions |
| [11. Sources](#11-sources) | where the facts come from |

---

## 1. The pitch

> **15 December 1900.** The new light on Eilean Mòr, twenty miles west of Lewis, goes dark. On Boxing Day
> the relief boat finds the station empty: the gate shut, the lamp trimmed and ready, one set of oilskins
> still hanging. Three keepers are never found.
>
> **January 1901.** The Northern Lighthouse Board needs the light kept. You are put ashore with the stores,
> and the swell turns the boat back before the other two men can land. *"Keep her lit. We'll be back
> within the fortnight."*
>
> The only other person you can reach is a watcher on Gallan Head, eighteen miles across the sea, paid eight
> pounds a year to look for your light. On clear nights you can see her lamp. On the other nights you are
> alone on the island that the old fowlers would not call by its name.

### Pillars

1. **Keep the light.** A real keeper's routine is the heartbeat: light the lamp at sunset, wind the
   clockwork, trim the wick, log the weather every three hours, clean the lens at dawn. If you neglect it,
   someone eighteen miles away notices.
2. **A voice across the water.** The Firewatch relationship, rebuilt with 1900 technology: Morse flashed by
   lamp at night, boards read through a telescope by day. The weather decides when you can talk at all.
3. **The record and the rumour.** The official documents are real. The legends that grew around them (the
   invented log entries, the overturned chair) arrive in newspapers. You learn to tell them apart, and then
   you stop being sure.
4. **The sea is the monster.** There are no creatures and no jump scares. The ocean, the surf on the cliffs
   and the weather are the antagonist. The climax is the "extra large sea" of the official report, staged
   for real.
5. **A painted winter.** A stylized look in the Firewatch lineage (graphic silhouettes, fog that ramps
   through colour, a low sun), rebuilt for a Hebridean winter: 6½ hours of daylight, a sun that never
   climbs above 8½°, 17 hours of lamplight, sea mist and the aurora.

### What we borrow from Firewatch, and what we change

| Firewatch (Wyoming, 1989) | Seven Hunters (Flannan Isles, 1901) |
|---|---|
| Fire lookout tower | Lighthouse: tower, lantern, Fresnel lens, clockwork |
| Delilah on the walkie-talkie, one button away | The Watcher on Gallan Head, by lamp Morse, reachable only when the air is clear |
| Reporting what you see | Weather observations every three hours; signalling ships and events |
| A disposable camera, developed at the end | A Kodak Brownie (on sale from February 1900); the film is developed when the relief finally comes |
| Summer, with the fire as the clock | Winter, with storms and the overdue relief boat as the clock |
| A mystery with a grounded answer | A mystery with a grounded answer (the sea) that stays uncanny (the taboos) |
| Paper map and compass, no HUD map | The Board's survey plan and a pocket compass, no HUD map |
| Text-choice prologue | Text-choice prologue on the crossing out |

---

## 2. The setting: Eilean Mòr, Flannan Isles, 1900–1901

### 2.1 Why here

- **The repository is called `lighthouse`.** A lighthouse is the ocean-world version of a fire lookout: a
  tower you keep alone, from which you watch and report.
- **It plays to the engine's strongest systems:** the FFT ocean (it already has a Storm preset), surf,
  spray, rock shading, seabirds, the physically based sky, aerial haze with sun shafts, and cascaded
  shadows at low sun angles.
- **The history is real, archived and unsolved,** and it is niche outside mystery circles. Superintendent
  Muirhead's report survives in the National Records of Scotland.
- **The Delilah counterpart is historical.** With no radio, the Board paid an observer on Gallan Head to
  watch the light. On the nights that mattered, the island was hidden in haze.
- **The island has its own recorded folklore** (the fowlers' customs, written down in 1703), an early
  Christian chapel beside the lighthouse wall, and the ruins of monks' cells.

### 2.2 The record

Checked against the sources in §11. Anything not yet confirmed is marked *verify*.

| When | What happened |
|---|---|
| 1895–1899 | The light is built by George Lawson of Rutherglen to David Alan Stevenson's design for the Northern Lighthouse Board (NLB), for £1,899 including the landings, stairs and railway. |
| 7 Dec 1899 | First lit. A 23 m tower with a focal height of 101 m. Today the optic is listed as a 3rd-order Fresnel lens with a range of 20 nautical miles, and the character as Fl(2) W 30s (two white flashes every 30 s). *Verify* that the optic and the character were the same in 1900. |
| 1900 | The crew on the rock: James Ducat (Principal Keeper), Thomas Marshall (Assistant) and Donald MacArthur (Occasional Keeper). Joseph Moore (Assistant) was ashore on leave. The families' shore station was at Breasclete on Lewis. |
| 1900 | With no radio link, Roderick MacKenzie, a gamekeeper, was paid £8 a year to watch the light from Gallan Head and report any failure by telegram to Edinburgh. |
| 7 Dec 1900 | The last relief. The light is seen from Lewis that night for the last time. The record says the tower itself was not seen, "even with the assistance of a powerful telescope", between the 7th and the 29th. |
| 15 Dec 1900 | The last entries on the slate. That night the passing steamer *Archtor* sees no light. |
| 20–26 Dec | The relief, due on the 20th, is held back by the weather. On the 26th the tender *Hesperus* (Captain Jim Harvie) arrives, and Moore climbs to an empty station. |
| 26 Dec | Moore, Buoymaster MacDonald and Seamen Lamont and Campbell volunteer to stay and keep the light. |
| 29 Dec | Superintendent Robert Muirhead investigates. In the station, "the lamp was trimmed, the oil fountains and canteens were filled up and the lens and machinery cleaned", which proved that the work of the 15th had been done. The entrance gate and the main door were closed, and the east landing was in order. At the west landing, the iron railings round the crane platform and up from the tramway were displaced and twisted, and the heavy wooden box of mooring ropes, kept in a crevice about 110 ft above the sea, had been washed away entirely. One set of oilskins remained: MacArthur went out in his shirtsleeves. Muirhead concluded that an extra large sea came up the cliff and swept the men away as they secured the gear. |
| Later | Sensational "log entries" (the storm, a man crying, "God is over all") appear in the press. There is no evidence they ever existed (Mike Dash's research). Later retellings also added details such as an overturned chair and an untouched meal, which the official report does not support. |
| 1925 | One of the first Scottish lights to receive messages from the shore by wireless. |

### 2.3 The island

- **Where:** 58.288°N 7.588°W. The group lies about 21 miles (34 km) north-west of Gallan Head; the NLB-era
  sources say 18 miles to the light.
- **Eilean Mòr** is about 17.5 ha (43 acres), with its highest point at 88 m and cliffs well over 60 m. The
  whole group, "the Seven Hunters", is about 59 ha over seven or more islands, with a gannetry on Roaireim.
- **What stands on it:**
  - the tower, the keepers' building and the enclosure wall with its gate;
  - the East and West landings, with stairs, cranes, railings and the railway up to the station;
  - **Teampull Beannachadh** (St Flannan's chapel, "the chapel of the blessing"), a drystone corbelled
    oratory only 5 ft × 7¾ ft inside, on level ground 28 m south of the enclosure wall;
  - **Bothain Chlann 'ic Phàil**, the bothies of the Clan MacPhail, on the headland of Maol nam Both: the
    remains of early monks' cells, used for centuries as fowlers' shelters;
  - sheep: from at least the 17th century the islands went with holdings in Uig parish on Lewis, and
    people came out once a year to fleece the sheep and take seabirds.
- **Scale fit:** Eilean Mòr sits comfortably inside the engine's 2048 m × 2048 m heightfield at 1 m texels
  (`WORLD.terrainSize`, `RES` in `src/world/TerrainData.js:23`). The other Hunters become far silhouettes in
  the fog, which is exactly where a graphic style looks best.

### 2.4 Sky and sea at 58°N in winter

These numbers come from the engine's own sun model, `sunDirectionFromTime( hours, latitudeDeg, declinationDeg )`
(`src/sky/Sky.js:258`). The app currently calls it with its tropical defaults (`src/App.js:443`).

| | Tidewater today | Eilean Mòr, 15 December |
|---|---|---|
| Latitude / solar declination | 24° / +6° | 58.29° / −23.3° |
| Sun elevation at noon | 72° | **8.4°** |
| Sunrise – sunset (local solar time) | | 08:47 – 15:13, **6.4 h of daylight** |
| End of civil twilight | | 16:05 |
| Lamp hours | | about 17½ h |

- **The moon** (mean-phase estimate): a waning crescent, about 36 % lit, on the night of 15 December 1900; a
  young crescent, about 25 %, on 26 December. The app currently puts the moon opposite the sun
  (`src/App.js:450`); it should come from the date.
- **What this means for the look:** the sun never climbs, so every daylight hour has long shadows and
  low-sun colour. Night takes up most of the day, so the night palette and the lamp beam are the main look,
  not an afterthought.
- **Weather:** Atlantic winter gales, showers of rain, hail and sleet, sea mist (the historical reason the
  light went unseen), and clear frosty nights with the aurora.

### 2.5 Folklore

- **Martin Martin, *A Description of the Western Islands of Scotland* (1703).** The fowlers who sailed to
  the Flannans would not call the islands by their name, only "the country". On reaching the plateau they
  uncovered their heads and turned sunwise. It was unlawful to kill a bird after evening prayers. Everyday
  words had to be replaced: water became "burn", a rock "cruey", the shore "vah", sour "gaire", and
  slippery "soft".
- **Na Fir Chlis, "the nimble men".** The Gaelic name for the aurora: faerie warriors whose blood gathers in
  a red cloud below the lights, "the pool of blood", and falls to earth as bloodstone.
- **The Seven Hunters:** the islands' name among sailors.
- **Grey seals and the selkie tradition:** to be used lightly. *Verify* seal haul-outs on the Flannans in
  winter.

In the game, the taboo words become a mechanic (§3.4), the aurora becomes a sky feature (§4, §5.5), and the
chapel becomes a place (§5.3).

### 2.6 Winter-accurate wildlife and plants

The Flannans' breeding seabirds include puffins, fulmars, storm petrels, Leach's petrels, shags and
kittiwakes, with gannets on Roaireim. By December the puffins, petrels and kittiwakes are out at sea, so the
winter cast is:

- fulmars, which are on the cliffs for most of the year;
- shags, and great black-backed and herring gulls;
- the odd gannet offshore;
- wintering barnacle geese, which the Western Isles hold in numbers (*verify* on the Flannans themselves);
- sheep, and possibly seals (*verify*).

There are no trees. The ground is turf, thrift, sea campion and lichen, with wrack and kelp below the tide
line. The empty cliffs are themselves an eerie note.

### 2.7 Real people, handled with care

- The three keepers, their families and the observer were real. The protagonist and the Watcher are
  fictional. The real men appear only through the record (the report, the slate, their belongings, the
  newspapers), which is how they would appear to anyone who came after them.
- No invented crimes, madness or villainy are attributed to real people. The rumours that circulated at the
  time can appear, but only as newspaper rumour, clearly framed as such.
- An "About the history" screen separates fact from fiction and lists the sources.
- Consult the National Records of Scotland files and Lewis local historians. A Gaelic speaker reviews all
  Gaelic text.

### 2.8 Other settings considered

| Setting | Hook | Fit with the engine | Why it is not first |
|---|---|---|---|
| **Macquarie Island wireless relay, 1913** (the fallback) | The Wireless Hill station relayed Morse between Mawson's Antarctic base and Australia. In September 1913 Cape Denison's operator, Sidney Jeffryes, suffered a psychotic break and began sending messages, through Macquarie, accusing his companions of plotting to murder him. | Ocean, surf and birds, plus a radio relationship native to the period | No lighthouse; new fauna (penguins, elephant seals); a larger island |
| **Stac an Armin, 1727–28** | Three men and eight boys were marooned on a sea stack from August 1727 to May 1728, while an epidemic killed 94 people on Hirta. | Cliffs, sea and birds | A tiny playable space, with no voice |
| **Tillamook Rock, 1879–81** | The master mason John Trewavas was swept off the rock during the survey. The *Lupatia* was lost in fog with all 16 hands just before the light was first lit; only the ship's dog survived. | Storm ocean | A one-acre rock |
| **North Rona, 1884–85** | Two Lewis men went to live on Rona with the sheep and were found dead in April 1885. | Island, chapel | No lighthouse, no voice |
| *Clipperton Island, 1914–17* (rejected) | A lighthouse, an atoll and land crabs, a perfect fit for the tropical engine | Excellent | The history centres on sexual violence we would not make a game of |

---

## 3. The game

### 3.1 Premise and characters

- **You:** a fictional assistant keeper transferred from a mainland station. Working name: Walter Innes, 34,
  of Leith, a ship's engineer before he joined the Board. He is good with machines and knows nothing of the
  island's customs, so the player learns them with him. A text-and-choice prologue on the crossing (Firewatch
  also opens with text choices) sets his past and why he would take this posting.
- **The Watcher:** a fictional holder of the Gallan Head observer's post. Working name: Catriona "Ceit"
  Macleod. She is Gaelic-speaking, dry-humoured, and as isolated on her headland as you are on your rock. She
  is the reason you keep talking, and she carries a guilt grounded in the record: she did not see that the
  light was out in December. *"I told myself it was the weather."*
- **The absent three:** Ducat, Marshall and MacArthur, present through their rooms, tools, letters, the
  slate, a tobacco tin, and the oilskins on the peg.
- **The *Hesperus*:** the relief tender, and the game's clock. When will it come?

### 3.2 Structure

- **About 35–40 in-game days,** from 3 January to early February 1901, each announced by a dated card (the
  equivalent of Firewatch's "Day 1": "Thursday, 3rd January 1901"). A day is 20–40 minutes of play, and time
  skips over routine.
- **Calendar texture:** Queen Victoria dies on 22 January 1901, and the news reaches you days late through
  the Watcher. Old New Year in mid-January (*verify* the practice on Lewis), and Là Fhèill Brìde on
  1 February.
- **Act I, *The Keeping* (days 1–7):** the landing, the routine, exploring the station and the island, first
  contact with Gallan Head, the Board's instructions, the empty rooms.
- **Act II, *The Haar* (days 8–24):** the weather closes in and contact comes and goes. The Watcher reads you
  the newspapers, and the rumour starts to compete with the record. Small things go wrong: a sheep where no
  sheep could be, a light on Eilean Tighe, words in the log you don't remember writing.
- **Act III, *The Extra Large Sea* (day 25 to the end):** the great gale, the west landing, the climax on the
  cliff 110 ft above the sea, and the relief.
- **Epilogue:** the Brownie film is developed on Lewis.

### 3.3 The keeper's routine

| Duty | When | Interaction | Built on | If neglected |
|---|---|---|---|---|
| Light the lamp | sunset (≈15:13 solar time in mid-December) | kindle the paraffin burner, open the lantern curtains | `LocalLights` plus the new beam (§6) | the Watcher sees the light is out |
| Wind the lens clockwork | through the night | hold to wind, release (the rod's hold-to-cast charge in `src/game/FishingRod.js`) | new `Lamp` | the flash character fails, and a ship could mistake the light |
| Trim the wick, watch the burner | through the night | inspect, adjust | new | smoke blackens the glass, and the light dims |
| Weather log | every 3 hours | read the barometer, judge the wind (Beaufort), sea state and visibility | reads the live simulation: FFT wind, haze density, clouds | gaps in the journal that the Board queries |
| Extinguish, draw the curtains | sunrise | close the curtains (the lens can focus the sun and start fires) | | a scorched lantern |
| Clean the lens and glazing | morning | wipe away the salt and soot | | a weaker light |
| Haul paraffin | daytime | carry cans up the railway from the landing | `Player` carry state (new) | the lamp runs dry |
| Water, repairs, painting | daytime | chores that unlock places and pace the day | | |
| Food | any time | stores, plus handline fishing from the rocks (§3.8) | the fishing systems | hunger is flavour, not a meter |

There is no game over. Failure shows up in the log, in the Watcher's replies and in the Board's letters.

### 3.4 The Watcher: talking with light

- **At night** you send Morse with a shuttered signal lamp on the gallery. **By day** you use signal boards
  on a mast, and you read hers through the telescope.
- **The codebook.** The Board's signal code gives quick numbered phrases that are cheap and formal. Anything
  personal has to be spelled out letter by letter, which is slow, costly and intimate. Choosing what to say
  plays the part of Firewatch's dialogue wheel, and the cost is time and the night's clear window.
- **Weather gating is literal.** Whether her lamp is visible depends on the same haze density, cloud and
  precipitation that the renderer uses (`AirHaze` density, clouds, rain). Sea mist means silence, as it did
  in December 1900.
- **The telescope** is a long lens (2–4° field of view) with a stylized vignette. Her lamp is a tiny point of
  light on the horizon eighteen miles away (a far point light plus bloom).
- **Imperfect contact:** Morse is garbled in poor visibility, she answers late, and you can choose not to
  reply.
- **The taboo words.** Martin Martin's substitute words are a mechanic. If you call "the country" by its
  name in a message, or kill a bird after evening prayers, things follow that you cannot prove: the fog
  comes in, and the log gains an entry. Players who learn the words from the Watcher can play "properly".

### 3.5 The logbook

- The station journal is both the save file and the narrative spine: weather columns, the times the lamp was
  lit and put out, and events.
- The entries you write are choices, and the Watcher's messages are transcribed in the margin.
- Newspaper clippings, some brought by the relief and some read out by the Watcher, carry the legends. The
  real report can be found on the island.
- Late in the game, entries appear that you didn't write. Or did you?

### 3.6 The Brownie

The Kodak Brownie went on sale in February 1900 for $1, taking 2¼-inch square pictures on No. 117 roll
film. You have one roll.

- Photos are rendered through the Albumen style (§4.4, S2).
- They stay undeveloped until the epilogue, as in Firewatch.
- Not all of them show what you remember.

### 3.7 The mystery

**Three explanations, all supported and none confirmed:**

1. **The sea,** as in Muirhead's report. The player witnesses how high the sea can climb at the west
   landing.
2. **People:** the pressure, the isolation and the work. This is framed only through period rumour, never
   asserted about the real men.
3. **The country:** the taboos, the chapel and the Nimble Men.

**Eerie beats, each with a possible rational cause:**

- seal song at night that sounds like voices;
- the beam sweeping through the mist;
- sheep found where they could not have climbed;
- a flash on Eilean Tighe;
- through the telescope, the Watcher's lamp is lit on a night she says she did not light it;
- the gate you shut stands open;
- the oilskins move from their peg;
- the log entry you didn't write.

**Rules:** no monsters, no gore, no jump scares. Sound and light do the work.

### 3.8 Handline fishing, reused

Keepers fished from the rocks. The existing rod, bite and fight systems (`FishingRod`, `Bites`,
`CatchMinigame`) become a handline, with no shop and no upgrades. The catch would be saithe, pollack, ling
and conger (*verify* the winter species).

### 3.9 Out of scope

Combat, crafting, inventory management, a quest log, a minimap, and voice chat.

---

## 4. The Style Lab: shader experiments

### 4.1 Principles

1. **Fog does the heavy lifting.** Firewatch's signature is that distance turns objects into flat colour
   with clean silhouettes. Campo Santo did this in post:
   - the fog colour comes from 1D gradient ramps sampled by distance;
   - a second ramp is blended in by sun direction at sunrise and sunset;
   - distant foliage has its alpha cutoff "puffed out", so the shapes simplify.

   Our haze pass already has every input this needs.
2. **Change the look at the few choke points the engine already has,** not in every material (§4.2).
3. **Every experiment is a switchable profile.** A/B comparison is instant (a URL parameter and a Style tab),
   and contact sheets are rendered headless from the same review cameras.
4. **Stylize on top of realism rather than replacing it.** The physically based light transport (shadows,
   haze scattering, the FFT motion) becomes the input to stylization. Artistic control comes from ramps and
   palettes.

### 4.2 Where the look lives today

```
materials (WGSL snippets) ─► shadeSurface() ─► scene HDR ─► GTAO ─► beauty: AO + hazeApply() + underwater ─► TAAU ─► bloom ─► final: grade + ACES + grain ─► canvas
      ▲                          ▲                                            ▲                                                    ▲
 palettes (srgb constants)   SceneLighting hooks                     fog colour = sky LUT                              saturation / contrast / warmth
```

| What | Where | Today | Style hook |
|---|---|---|---|
| Lighting of every lit material | `src/engine/render/wgsl/lighting.js:380` `shadeSurface`, hook defaults at `:42` | GGX + Lambert, PCSS sun shadows, IBL | a new hook, `styleLight` (ramped or banded diffuse, shaped specular, tinted shadow), installed with `SceneLighting.set()` like the others, with a neutral default so the photoreal path is unchanged |
| Sun shadow filter | `lighting.js:208` `_sunShadow` | contact-hardening PCSS | a graphic option: constant penumbra, shadow tint |
| Material palettes | `src/world/terrain/TerrainShading.js:48` `PALETTE`, and each system's `srgb()` constants | picked from photos | palette sets per style; detail fades with distance |
| Aerial perspective and fog | `src/post/AirHaze.js:345` `hazeApply`: fog colour at `:361`, blend at `:376` | exponential height layers, colour from the sky-view LUT | ramp textures by distance and height, blended between the sun side and the far side |
| Sky | `src/sky/Sky.js:192` `skyViewRadiance` | Hillaire atmosphere plus volumetric clouds | gradient sky, graphic sun, posterized clouds, aurora |
| Tone and grade | `src/post/PostFX.js:458` `_buildFinal`: grade at `:520`, ACES at `:536` | ACES filmic; saturation, contrast, warmth | 3D LUT, palette mapping, paper, print processes |
| Per-pixel material output | `src/engine/render/MeshShader.js:337` `materialOutput`; targets at engine `SceneRenderer.js:22` `SCENE_FORMATS` | velocity, water mask | a style-ID / outline-mask channel (only the water mask's `r` and `g` channels are read today) |
| Foliage alpha | `src/world/vegetation/VegMaterials.js:460`, `:682` (discard masks) | dithered LOD fades | the distance "puff" threshold |
| Water | `src/ocean/WaterMaterial.js` (debug views at `:79`) | physical water | banded depth colour, graphic foam |
| Sun path | `src/sky/Sky.js:258`, called at `src/App.js:443` | 24°N, +6° | 58.29°N, declination from the date |
| Controls | `src/ui/AppUI.js` (tabs from `:89`, Effects at `:200`) | sliders | a Style tab |
| Review cameras | `src/core/DebugViews.js:5` `VIEWS` | tropical views | Eilean Mòr views |

### 4.3 The StyleProfile architecture

- **`src/style/StyleProfile.js`:** a profile is a plain, serializable object with these sections:

  | Section | What it holds |
  |---|---|
  | `fog` | ramps keyed by time of day and weather; near and far distances; height falloff; the sun-side ramp blend |
  | `sky` | `physical` or `gradient`; gradient stops; sun disc size and softness; cloud posterize levels |
  | `light` | a ramp texture, or band count and softness; shadow tint; rim |
  | `palette` | the material palette set |
  | `grade` | `aces`, `lut`, `palette` or `print`; the LUT; palette colours; dither |
  | `edges` | depth and normal thresholds, width, colour, distance fade |
  | `paper` | texture and strength |
  | `foliage` | puff distance and threshold |
  | `water` | mode and bands |
  | `post` | bloom, grain, vignette |
  | `features` | systems to switch off (caustics, underwater, volumetric clouds) |
- **Uniforms and textures:** a `StyleParams` uniform block, plus:
  - a ramp atlas (N ramps × 256 px, rgba8, blended between time-of-day keys);
  - a 3D LUT (32³);
  - paper and hatch textures.
- **`styleModule`** (a `ShaderModule` with the prefix `style`):
  - `styleFogColor( dist, dir, height ) -> vec3f` and `styleFogAmount( dist, dir ) -> f32`
  - `styleLightRamp( ndl, shadow ) -> vec3f`
  - `styleSky( dir ) -> vec3f`
  - `styleGrade( c, uv, px ) -> vec3f`
  - `styleEdges( uv ) -> f32`
- **Wiring:**
  - `SceneLighting.set( 'styleLight', … )` uses a new entry in `HOOK_DEFAULTS` whose default leaves the
    photoreal result untouched.
  - `AirHaze`, `PostFX` and `Sky` take a `style` option and switch code with `#if STYLE_*` defines.
- **Switching:**
  - the `?style=poster` URL parameter;
  - the Style tab, with a preset select, the key sliders, and "export preset as JSON";
  - a switch rebuilds only the affected pipelines (material versions, post passes).
- **Colour script:** a `ColorScript` maps time of day × weather to a ramp row and a LUT, blended on the CPU
  every frame.

### 4.4 The experiments

Each experiment is a preset. The best one wins, or we build a hybrid (for example, S1 for the world, S2 for
photographs, and S3 for the logbook and newspapers).

**S0 Baseline.** The current photoreal renderer retuned for 58°N in winter. This is the reference for the
bake-off.

**S1 Poster (the Firewatch lineage).**
- *Fog:* two 256-texel ramps per key, one for toward the sun and one for away from it, blended by
  `dot( view, sun )` in the horizontal plane, and more strongly when the sun is low.
  - Distance is normalized with a near/far window and a gamma.
  - Height falls off exponentially above the sea.
  - The ramp's alpha is the fog opacity curve.
  - This replaces the fog colour at `AirHaze.js:361` and the transmittance at `:376`. The sun shafts stay,
    posterized.
- *Sky:* a 3–5 stop gradient by elevation, a warm glow around the sun with exponential falloff, and a
  graphic sun disc. The volumetric cloud alpha is thresholded into 2–3 flat layers with soft edges, at the
  point where `Sky` composites the clouds.
- *Light:* N·L drives a wrap ramp combined with the shadow, giving 2–3 soft bands. Shadows are tinted per key
  (for example a cool violet). The ambient light is a flat hemisphere from the ramps, with image-based
  lighting optional.
- *Materials:* flat stylized palettes, detail textures that fade with distance, and rock strata kept only as
  large shapes.
- *Foliage:* the grass alpha threshold rises with distance, so tufts merge into flat turf silhouettes.
- *Water:* keep the FFT motion. Shade it with three depth bands and a Fresnel ramp. Foam becomes crisp shapes
  (a thresholded mask). Reflections are simplified: SSR off, the gradient sky reflected.
- *Grade:* a gentle filmic curve plus a LUT authored from the colour script. Lighter sharpening, low grain.
  No outlines: Firewatch's silhouettes come from the fog.

**S2 Albumen (a photograph of 1900).**
- *Non-panchromatic response:* a channel mix weighted heavily toward blue, so skies burn white and reds go
  dark.
- *Halation:* a warm glow around highlights, done with a tinted bloom.
- *Lens:* Petzval-style swirl and field curvature toward the edges, a strong vignette, and slight softness.
- *Print:* sepia albumen or cyanotype toning, paper texture, dust and scratches, and silvering at the dark
  edges.
- *Shutter:* a longer motion-blur shutter (reuse `MotionBlur`).
- Always used for the Brownie photographs (render to texture), whichever style wins for the world.

**S3 Engraving (the *Illustrated London News* wood engraving and mezzotint).**
- *Tone to hatching:* luminance after lighting and fog selects hatch layers from a tonal art map. The lines
  are world-space or triplanar and follow the surface, which keeps them stable under TAA and camera motion
  and avoids the "shower door" effect.
- *The sea:* horizontal engraved lines modulated by the wave slope, taken from the FFT derivatives.
- *Ink edges:* depth and normal discontinuities (normals reconstructed from depth, as GTAO does), detected
  at output resolution after the TAA.
- *Palette:* off-white paper and black ink, with an optional single spot colour for lamplight.

**S4 McTaggart (Scottish seascape painting).**
- An anisotropic Kuwahara filter driven by a structure tensor, after the TAA (at half resolution, then
  upsampled).
- Edge darkening (wet-edge pigment pooling) from a difference of Gaussians.
- Paper texture, with pigment granulation in the darks.
- A loose sky and a vivid sea.

**S5 Nocturne,** the night grade for whichever style wins.
- A near-black blue sky with the stars, and the warm paraffin lamp against cold night.
- The beam through the haze, with rain streaks visible inside it.
- The tower silhouetted against the aurora.

**S6 Low-fi dread (a wildcard).**
- Vertex snapping in the mesh shader, affine UVs, a 320×180 render scaled up with nearest filtering, and a
  4×4 Bayer dither.
- It is a one-day test of how much eeriness a crude style buys. It will probably lose because it throws away
  what the engine is good at.

### 4.5 Build order

1. `?style=`, `StyleProfile` scaffolding and the Style tab, with no visual change. Verify that the baseline
   shots are identical.
2. The sun and moon from latitude and date (58.29°N, 15 December 1900) behind `?setting=flannan`. Every look
   depends on the low sun and the long night.
3. The ramp fog in `hazeApply` (S1): the biggest visual change for the least code.
4. The gradient sky and posterized clouds.
5. Modes for the final pass: LUT, palette and dither, and print (S2's channel mix, halation, lens, paper).
6. The `styleLight` hook: ramped diffuse, shadow tint, graphic penumbra.
7. The edge pass (depth and normals) at output resolution.
8. Hatching (S3) and Kuwahara (S4).
9. Per-material work: palette sets, detail fade, foliage puff, the stylized water mode.
10. Contact sheets for every preset × every review view × the eight colour keys (§4.8). Review them together
    with you, choose, and iterate.

### 4.6 The Style Lab harness

**Verified in this cloud container.** Headless WebGPU runs here without a GPU. Dawn (the `webgpu` npm
package) runs on the SwiftShader Vulkan driver that ships with the preinstalled Playwright Chromium:

```sh
export VK_ICD_FILENAMES=/opt/pw-browsers/chromium-1194/chrome-linux/vk_swiftshader_icd.json
node test/engine-smoke.mjs out.png                  # ~2 s
W=800 H=400 node test/post-chain.mjs air out.png    # the full post chain (GTAO, haze, TAAU, bloom, ACES), ~30 s
```

Without that variable, `npm test` gets through the game-logic tests and then stops at "No WebGPU adapter
found".

**Built (29 September): `npm run shots`** (`tools/shots`) renders the real game, in any style and at any
time of day, with no browser or GPU. The whole app runs in Node on Dawn behind a small browser stand-in, and
finds the SwiftShader driver by itself. Loading takes about 75 s; each frame 2–5 s at 640 × 360.

```sh
npm run shots -- --views=beach,aerial --styles=photoreal,poster,albumen --times=12.4,14.8 \
                 --adapt --params="setting=flannan&lite" --w=640 --h=360 --frames=24
```

This writes one PNG per view, style and time, plus a contact sheet with a row per time and style. Headless
Chromium can't do this: on a software adapter it holds WebGPU to its default limits (16 sampled textures
per stage), and the water shader reads 24.

**Still to build:** labels on the contact sheets, and a diff against a stored baseline per preset.

### 4.7 Judging the looks

Score each preset from 1 to 5 on:

| Criterion | Question |
|---|---|
| Silhouettes | Do shapes read at 50, 200 and 800 m? |
| Eeriness | Does it unsettle at night and in mist? |
| Consistency | Do water, sky, terrain and props look like one world? |
| Temporal stability | Does anything crawl, swim or shimmer under TAA and motion? |
| Legibility | Can you read the Watcher's lamp, the beam, the paths and the hazards? |
| Cost | GPU milliseconds and compile time against the baseline |
| Period feel | Does it feel like 1900? |
| Accessibility | Contrast, and colour-blind safety |

### 4.8 Colour script: starting keys

These are proposals for the first ramps, to be replaced by the bake-off.

| Key | Sky (zenith → horizon) | Fog (near → far) | Sea | Light | Shadow |
|---|---|---|---|---|---|
| Winter noon, clear (sun at 8°) | `#5d7896` → `#e3cfae` | `#b9ab93` → `#8c9aa6` | `#2f4656` | `#f2d6a8` | `#4b5068` |
| Low sun, 14:30 | `#4e5f86` → `#f1b77e` | `#c89a78` → `#7b7f99` | `#2b3a52` | `#ffc690` | `#3f3d5c` |
| Sunset, 15:15 | `#353f6b` → `#f08d5a` | toward the sun `#e59a6e`, away `#5a5d86` | `#262c47` | `#ff9f68` | `#33304f` |
| Blue hour, 15:50 | `#1c2444` → `#4f5f8f` | `#3b4670` | `#161c33` | lamp `#ffc27a` | `#1a1d33` |
| Lamp night, overcast | `#0a0e1a` | `#151b2b` | `#0c1220` | beam `#ffd79c` | `#07090f` |
| Aurora night | `#06101a` | green `#72f5a8`, violet `#7a5cc7`, "pool of blood" `#9c2f3b` | `#081018` | | |
| Gale, daytime | `#7d878b` | `#a3abaa` | `#3a4a4f`, foam `#eef1ed` | | rock `#34383c`, turf `#6b6a45` |
| Sea mist (haar) | | `#c7cbc6` → `#9aa4a3` | `#5b6868` | `#e6e2d6` | |

---

## 5. Converting the world

### 5.1 Keep, transform, cut

| System | Files | Action | Notes |
|---|---|---|---|
| Engine core | `src/engine/**` | **Keep** | |
| Post chain | `src/post/PostFX.js`, `TemporalUpscale`, `GTAO`, `MotionBlur`, `AntiAlias`, `LensFlare` | **Keep**, restyle | §4 |
| Air haze | `src/post/AirHaze.js` | **Transform** | the stylized fog, and the lamp beam's in-scatter |
| Lens droplets | `src/post/LensDroplets.js` | **Transform** | rain on the lantern glass and on the "eye" |
| Underwater | `src/post/Underwater.js`, `src/ocean/UnderwaterLighting.js`, `Caustics`, `src/fx/MarineSnow.js` | **Cut** | keep a minimal variant only if a dream or drowning sequence needs it; the January sea is lethal |
| Sky | `src/sky/Atmosphere.js`, `Sky`, `SkyProClouds`, `Environment` | **Keep**, retune | winter, 58°N; add the aurora and the stylized sky |
| Ocean | `OceanFFT`, `WaterSurface`, `WaterMaterial`, `SeaDetail`, `WaterQuery` | **Keep**, retune | North Atlantic presets (§5.4) |
| Shore | `ShoreWaves`, `Breakers`, `ShoreSim`, `SurfFoam` | **Transform** | tuned for a sandy bay; retune for cliffs and geos, plus the new `CliffSurge` |
| Boat | `WakeSim`, `src/player/BoatController.js`, `BoatSpray`, `src/world/boat/**` | **Transform** | no player boat; the *Hesperus*'s rowing boat as a scripted vehicle, and the steamer itself as a distant model |
| Spray | `src/fx/Spray.js` | **Keep** | cliff spray and spume |
| Air motes | `src/fx/AirMotes.js` | **Transform** | rain, sleet, snow, spindrift |
| Terrain | `TerrainData`, `terrain/IslandShape`, `TerrainGPU`, `Terrain`, `TerrainShading`, `DetailTextures` | **Transform** | Eilean Mòr (§5.2); gneiss and turf palettes (*verify* the geology with the BGS map) |
| Rocks | `src/world/Rocks.js` | **Keep**, retune | |
| Debris | `src/world/Debris.js`, `debris/**` | **Transform** | wrack, rope, wreckage from the west landing, driftwood (Poly Haven CC0), bird bones |
| Tropical plants | `Vegetation`, `vegetation/PlantGeometry`, `Scatter`, `Impostors` | **Cut** | no trees on the Flannans |
| Grass | `vegetation/GrassField.js` | **Keep**, retune | turf, thrift, sea campion |
| Village | `Village`, `village/**` (`Buildings`, `GeoBuilder`, `TextureBaker`) | **Transform** | the building kit makes the lighthouse complex (§5.3) |
| Pier | `src/world/Pier.js` | **Transform** | the landings: concrete platforms, steps, iron railings, cranes |
| Reef and fish | `Reef`, `reef/**`, `Fish`, `fish/**` | **Cut** the reef; **keep** `FishGeometry` | a few parametric fish for the handline |
| Whale | `src/world/marine/**`, `src/ocean/WhaleWater.js` | **Cut** for now | reskinning it as pilot whales or orca is a later option |
| Wildlife | `wildlife/Birds`, `Shorebirds`, `Crabs`, `Gulls`, `BirdBatch`, `Flight` | **Transform** | gulls, shags and fulmars (fulmars glide stiff-winged along cliffs); new sheep and seals |
| Player | `src/player/Player.js` | **Transform** | keep walking; swimming becomes a fade-out; cut boat driving; add interaction, stairs (the tower's spiral stair), carrying, telescope and lamp modes |
| Fishing game | `src/game/**` | **Transform** | cut the economy (`FishStand`, `Chandlery`, `Vendor`, `StallKit`, `Gear`, `CatchDisplay`, prices); keep `FishingRod`, `Bites` and `CatchMinigame`, simplified; `Guide` becomes diegetic notes; `Minimap` becomes the chart; `FishPortrait`'s studio renderer becomes object inspection |
| Audio | `src/audio/SoundScape.js`, `soundBank.js` | **Keep** the architecture | a new bank (§7) |
| UI | `src/ui/UI.js`, `ui.css`, `AppUI.js` | **Keep**, restyle | the loader, key art, and a Style tab |
| Characters | `src/engine/render/Skinning.js`, `loaders/GLTF.js`, `public/models/characters` | **Keep** the tech | the vendors go; perhaps the *Hesperus* crew in the epilogue |
| Tests and tools | `test/**`, `tools/**` | **Keep** | add the Style Lab; retire the tests of systems that are cut |

**The performance dividend.** The cut list (the reef, most of the fish code, the vendors and economy, the
whale, the underwater passes, tropical plants, crabs and shorebirds) is roughly 15,000 of the 81,000 lines
of `src/`. Fewer systems mean fewer pipelines, and the first load currently compiles "several hundred
shaders" and can take a minute or more.

### 5.2 Terrain from a real island

- **Data:**
  - OpenStreetMap coastline for the outline (ODbL, attribution required);
  - OS OpenData Terrain 50 (OGL) for the overall heights. A 50 m grid is far too coarse for a 17.5 ha
    island, so the rest is sculpted by hand;
  - photographs and charts for the cliffs, geos and landings;
  - the NLB station plans in the NRS archive for the buildings;
  - Copernicus GLO-30 as a cross-check.
- **Implementation:**
  - replace `RIDGES`, `SEA_STACKS` and `PATHS` (`src/world/terrain/IslandShape.js:8`) with an outline
    polygon and height control points;
  - keep `TerrainData`'s three-grid pipeline for the cliffs, the erosion and the rock and turf masks;
  - remove the sandy-bay special case (`beachZoneAt`), because the Flannans have no beach;
  - sketch the seabed from the Admiralty chart's soundings.
- **Layout:** `WORLD` (`src/world/WorldLayout.js:6`) swaps the pier, boat dock, village, reef and beach for
  the east and west landings, the station, the chapel and the bothies. You arrive at the east landing.

### 5.3 The lighthouse complex

| Piece | Details | Built with |
|---|---|---|
| Tower | 23 m masonry cylinder with a gallery and lantern, attached to the one-storey keepers' building; inside, the spiral stair and the service room | `lathePart`, `cylPart` and `slabPart` from `src/world/village/GeoBuilder.js` |
| Lantern and optic | 3rd-order Fresnel "clamshell" lens as listed today (*verify* the 1900 optic), paraffin burner, the rotation clockwork with its weights, curtains | a new lens material (prism rings, dispersion); `Lamp` (§6) |
| Keepers' building | kitchen and living room, bedrooms, oil store, workshop, the office with the log and the slate; the enclosure wall and gate | the building kit, new interiors |
| Landings | East and West, with stairs, iron railings and cranes; at the west landing, the crevice about 110 ft up where the rope box was kept | `Pier` transformed |
| Railway | from the landings up to the station | new: rails, bogies, the hauling gear (*verify* how it was worked in 1900) |
| Chapel | drystone corbelled oratory, 5 ft × 7¾ ft inside, 28 m south of the wall | kit parts, stone palette |
| Bothies | beehive ruins on Maol nam Both | kit parts |
| Signal mast and boards | for the day code (a plausible fiction) | kit parts |
| Tanks and stores | water tanks, store sheds | kit parts |

### 5.4 Ocean and weather

- **North Atlantic presets.** Extend the `SEA` table (`src/ui/AppUI.js:7`: Calm, Breezy, Choppy, Storm) with
  winter swell (a 14–16 s period), a gale, and a storm at force 10. The existing Storm preset (wind 20 m/s,
  fetch 900, period 12 s) is the starting point.
- **Cliff surf.** `Breakers` and `ShoreWaves` are tuned for depth-limited breaking on a sandy bay. On cliffs,
  waves reflect and explode. A new `CliffSurge` finds where the cliff foot meets the sea and drives spray
  sheets, green-water surges up the geos, and the audio booms.
- **The "extra large sea".** A scripted rogue event, either a focused wave group or an analytic packet added
  to the displacement, that climbs the west-landing geo to about 34 m (110 ft). This is the climax.
- **A weather timeline,** authored per day with noise on top, drives the FFT wind, fetch and swell, the
  cloud cover, the haze density, the precipitation, the lens droplets and the audio.
- **Tides.** `frame.seaLevel` is threaded through 24 source files but never animated. Audit it before moving
  the sea. Spring tides on this coast range over several metres, which would decide which landing is usable.
- **Precipitation:** rain streaks, hail, sleet and snow, and wet surfaces. The terrain's wetness hook in
  `App.js` already shows how.

### 5.5 Sky

- **The sun:** `sunDirectionFromTime( hours, 58.29, declination( date ) )`, which gives the numbers in §2.4.
- **The moon:** its real phase and position for the date, from a small ephemeris.
- **The aurora:** curtains of ray-marched noise bands at 100–300 km altitude in the sky view, green with a
  red upper fringe, and the folklore's red "pool of blood" beneath.
- **Winter clouds:** stratocumulus decks, shower cells, and low sea mist.

### 5.6 Life

- **Birds:** fulmars (the gliding modes in `Flight.js`), gulls (reused) and shags on the rocks. The absent
  summer seabirds are part of the mood.
- **Sheep:** a new critter on the `CritterBatch` pattern that grazes, wanders and flees. It is also the
  "wrong" sheep.
- **Seals:** hauled out in the geos (*verify*), singing at night.
- **Removed:** pelicans, frigatebirds, sanderlings and the tropical fish. Crabs stay only if the rock pools
  need them.

---

## 6. New systems

| System | Responsibility | Builds on | Size |
|---|---|---|---|
| `Lamp` (`src/station/`) | lens rotation and clockwork state (winding, running down), the Fl(2) 30 s character, burner state, the beam: a rotating spot in `LocalLights` plus an in-scatter term along the beam cone in the haze march, the lens material, the glint seen from afar | `LocalLights`, `AirHaze` march | L |
| `Duties` | the schedule, tasks, state and consequences of §3.3 | `Lamp`, `Weather`, the logbook | M |
| `Weather` (`src/world/`) | the daily timeline → simulation parameters | FFT, clouds, haze, precipitation | M |
| `Signals` and the Watcher (`src/story/`) | Morse encoding and decoding, the codebook, visibility gating, the telescope camera mode, the far lamp on Gallan Head, reply timing | haze density, clouds, bloom | L |
| Narrative runtime | data-driven dialogue graphs (JSON, or Ink via inkjs, MIT), triggers (place, look-at, time, weather, flags), day cards, save | `GameState`'s guarded `localStorage` pattern | L |
| `Logbook` | the journal pages, entry choices, clippings | the UI framework | M |
| Brownie and photos | render to texture through S2, the album, the epilogue reveal | `FishPortrait`'s private renderer, the post chain | M |
| Inspection | pick up and turn objects | `FishPortrait`'s studio-lit scene | S–M |
| Interaction | look-at targets, prompts, carrying, doors and the gate, stairs and ladders | `Player`, `Colliders` | M |
| Precipitation | GPU rain, hail, sleet and snow | the `AirMotes` and `Spray` patterns | M |
| Aurora | the sky feature of §5.5 | `Sky` | M |
| `CliffSurge` and the rogue wave | surf on the cliffs, and the climax | `Spray`, `ShoreWaves`, the FFT | L |
| Tides | an animated `seaLevel`, after the audit | `frame.seaLevel` | M |
| Chart | the paper survey plan, in the engraving style | `Minimap`'s terrain bake | S–M |
| Sheep and seals | critters | `CritterBatch`, `Kit` | M |
| Style | §4 | see §4.3 | L |

---

## 7. Sound

- **Keep the architecture of `SoundScape`:** HRTF panners, the mix table with LUFS targets, and event-driven
  surf. The Flannan version drives its surf events from `CliffSurge` instead of the beach waves.
- **A new bank,** again from CC0 Freesound recordings and credited in `public/audio/CREDITS.md`:

  | Group | Sounds |
  |---|---|
  | Weather | the gale in the lantern glazing and astragals; rain and hail on glass |
  | Sea | surf booming in the geos; distant surf |
  | Birds and animals | fulmar cackles, gulls, shag grunts, sheep, and grey seal moans (the "voices") |
  | The machinery | the clockwork (tick, falling weights, the winding ratchet), the paraffin burner's roar and hiss, the lens carriage's rumble |
  | The station | doors, the gate and latches; footsteps on stone, turf, iron and the wooden stair |
  | Contact | the *Hesperus*'s whistle and engine far off; the signal lamp's shutter clack; a pen on paper |
- **Music:** sparse, solo instruments or a drone. Lewis's Gaelic psalm singing, with its line-out precenting,
  is uniquely haunting, but use it only with consent and proper licensing.
- **Silence is a tool.** The mist days are the quietest.

---

## 8. Roadmap

Sizes: S is days, M is one to two weeks, L is two to four weeks, and XL is more than that. Sound (Phase 6)
can run in parallel from Phase 2 onward.

| Phase | Goal | Deliverables | Done when | Size |
|---|---|---|---|---|
| **0. Groundwork** | a safe base for experiments | this plan and `HISTORY.md`; flags that switch off the tropical systems (some exist: `noVeg`, `noSim`, `noCaustics`); the Style Lab harness; baseline load-time and frame-time numbers; rename the title, meta and README once the direction is confirmed | `npm run style-lab` makes a baseline contact sheet in a cloud container | S |
| **1. Style Lab** | pick the look | §4.5, steps 1–10 | you choose a direction or a hybrid; the colour script is locked for the eight keys; the cost is within budget | M–L |
| **2. The island** | Eilean Mòr, dressed | terrain, the station, landings, chapel and bothies, the 58°N sky, winter ocean and weather, turf, birds and sheep; the tropical systems cut | a walkable, dressed island at all eight keys in the chosen style; load time no worse than today | L |
| **3. Keeping the light** | the core loop | `Lamp`, `Duties`, interaction, logbook v1, save | a full day and night is playable and satisfying on its own | M–L |
| **4. The Watcher** | the relationship | `Signals`, the telescope, the far lamp, the narrative runtime, Act I's dialogue | a vertical slice: days 1–3 playable end to end | L |
| **5. The story** | the whole game | the script (writing is the long pole), all the days, the eerie beats, the Brownie, `CliffSurge` and the rogue-wave climax, the epilogue | a complete playthrough | XL |
| **6. Sound and music** | the soundscape | §7 | every space and weather has its sound | M |
| **7. Polish and ship** | release | performance; accessibility (subtitles for all Morse and Gaelic, colour-blind-safe palettes, motion options); the restyled UI, loader and key art; the fact-and-fiction screen; credits and licences; playtests; deploy (the existing Pages workflow publishes `main`) | shipped | M |

### Done so far (29 September)

- Phase 0:
  - the plan and `HISTORY.md`;
  - `?lite` and the `?no…` flags that leave out the tropical systems;
  - the harness (`npm run shots`, §4.6).
- The engine now runs on WebGPU's default limits for everything except the world materials (the water reads
  24 textures).
- Phase 1, §4.5 steps 1–6, in a first cut:
  - `?style=` with the StyleDirector and a Style tab;
  - `?setting=flannan`, with the real sun and moon;
  - Poster: ramp fog, a painted sky, flat clouds, banded light and tints;
  - Albumen and Cyanotype prints in the final pass.

### The next five tasks

1. The Poster colour script across all eight keys (§4.8), judged on contact sheets of the review views.
2. A stylized water mode. Poster's sea reflects the painted sky and needs its own ramp (§4.5 step 9), along
   with foliage puff and detail fade.
3. The edge pass (§4.5 step 7), then the palette and dither mode of the final pass.
4. Eilean Mòr's terrain from real elevation data (Phase 2, §5.2).
5. Behind `?setting=flannan`, cut the tropical systems for good: palms, the reef, turquoise shallows.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Writing and narrative design, not the technology, are the long pole | a vertical slice early; the script lives in data; a small cast; the days reuse spaces |
| Stylized land next to photoreal water looks like two games | post-driven looks first, then per system; the rubric in §4.7; one owner of the colour script |
| TAA fights stylization (dither crawl, swimming hatches, shimmering outlines) | quantize and dither after the TAA; world-space patterns; outlines at output resolution |
| Shader compile time is already long | cut systems; style features only behind defines; the existing `App.precompile()` path |
| WebGPU only runs in recent Chrome, Edge and Safari | accept it and document it (as the README does today) |
| A real tragedy, with real families | the rules in §2.7; the fact-and-fiction screen; a tone review |
| Mistakes in the Gaelic | a native speaker reviews it |
| Asset licences (Freesound CC0, Poly Haven CC0, OSM ODbL attribution, OS OGL) | keep `CREDITS.md` current for every asset |
| Cloud sessions have no GPU | the SwiftShader harness for shots; performance checked on a real GPU |
| Scope creep (the aurora, whales, tides) | flagged "later" in the phases; a cut list ready |

---

## 10. Decisions for you

1. **Setting:** the Flannan Isles, 1901 (recommended), or the Macquarie Island 1913 fallback?
2. **Framing:** the fictional replacement keeper in 1901 (recommended), or the last two weeks of December
   1900 seen by a fictional fourth man, ending on the night of the 15th?
3. **The first bake-off:** S1 Poster and S2 Albumen (recommended), with S3 and S4 as stretch goals?
4. **Title:** *Seven Hunters*, *The Country*, or something else?
5. **Length:** short (2–3 hours, about 15 days) or full (5–6 hours, about 35 days)?
6. **Handline fishing:** keep it as a quiet side activity?

---

## 11. Sources

**Firewatch's look**
- Jane Ng, "The Art of Firewatch", GDC 2015: [GDC Vault](https://gdcvault.com/play/1022295/The-Art-of),
  [YouTube](https://www.youtube.com/watch?v=ZYnS3kKTcGg)
- Jane Ng, "Making the World of Firewatch", GDC 2016: [GDC Vault](https://www.gdcvault.com/play/1023191/Making-the-World-of),
  [Internet Archive](https://archive.org/details/GDC2016Ng)
- [Campo Santo blog Q&A on the fog and the trees](https://blog.camposanto.com/post/100680711679/i-asked-twitter-if-anyone-had-questions-about-the)
- [Harry Alisavakis: Firewatch multi-coloured fog](https://halisavakis.com/my-take-on-shaders-firewatch-multi-colored-fog/),
  [AVA: stylistic fog from Firewatch](https://grrava.blogspot.com/2018/08/stylistic-fog-from-firewatch-with.html)

**The Flannan Isles**
- National Records of Scotland: [research guide](https://nrscotland.gov.uk/learning-and-events/research-guides/lighthouses/the-mystery-of-the-flannan-islands-lighthouse),
  ["Though three men dwell on Flannan Isle"](https://blog.nrscotland.gov.uk/2023/12/12/flannan-isles-lighthouse-keepers-the-disappearance/)
- Northern Lighthouse Board: [history](https://www.nlb.org.uk/history/flannan-isles/),
  [the light](https://www.nlb.org.uk/lighthouses/flannan-islands/)
- [Flannan Isles Lighthouse (Wikipedia)](https://en.wikipedia.org/wiki/Flannan_Isles_Lighthouse),
  [Flannan Isles (Wikipedia)](https://en.wikipedia.org/wiki/Flannan_Isles)
- [Royal Museums Greenwich](https://www.rmg.co.uk/stories/maritime-history/what-caused-disappearance-flannan-isle-lighthouse-keepers),
  [Mike Dash interviews](https://interviewswithmikedash.wordpress.com/category/flannan-isles-lighthouse-mystery/),
  [Skeptoid](https://skeptoid.com/episodes/610)
- [Canmore: St Flannan's Chapel](https://canmore.org.uk/site/3971/flannan-isles-st-flannans-chapel),
  [Hebridean Connections](https://hebrideanconnections.com/record/locations/18592/)
- [Martin Martin, *A Description of the Western Islands of Scotland*: islands off Lewis](https://www.undiscoveredscotland.co.uk/usebooks/martin-westernislands/section03.html)
- [Weather Diary: the Flannan Isle storm, December 1900](https://www.weatherdiary.uk/2024/04/21/flannan-isle-storm-december-1900/)
- Na Fir Chlis: [Oxford Reference](https://www.oxfordreference.com/display/10.1093/oi/authority.20110803095819556),
  [Discover Highlands and Islands](https://discoverhighlandsandislands.scot/en/story/the-nimble-men)
- The Brownie: [Science Museum Group](https://collection.sciencemuseumgroup.org.uk/objects/co8406729/no-1-brownie-box-camera),
  [Wikipedia](https://en.wikipedia.org/wiki/Kodak_Brownie)

**The other settings**
- [Australian Antarctic Program: the wireless of Wireless Hill](https://www.antarctica.gov.au/about-antarctica/history/communications/the-wireless-of-wireless-hill/),
  [The Conversation: Sidney Jeffryes](https://theconversation.com/remembering-sidney-jeffryes-and-the-darker-side-of-our-tales-of-antarctic-heroism-105034)
- [Stac an Armin](https://en.wikipedia.org/wiki/Stac_an_Armin),
  [West Highland Museum: St Kilda, smallpox or was it?](https://www.westhighlandmuseum.org.uk/2020/08/01/st-kilda-smallpox-or-was-it/)
- [Oregon Encyclopedia: Tillamook Rock Lighthouse](https://www.oregonencyclopedia.org/articles/tillamook_rock_lighthouse/)
- [North Rona](https://en.wikipedia.org/wiki/North_Rona)
