# App Architecture

Ardatúrë is a static GitHub Pages PWA, organized similarly to the sibling `../qwixx` app: Vite, React, TypeScript, a web manifest, a service worker, and QR/WebRTC sync. The first screen should be the usable game surface, not a landing page. The PWA manifest requests portrait orientation so installed mobile app sessions stay in the vertical game layout when the platform honors web app orientation.

## Top-Level Structure

Planned project layout:

```text
docs/
  planning and implementation notes

maps/
  source drawings, territory key, generated geometry, and visual previews

public/
  app-icons/
    PWA icons and original ring icon source
  troops/
    source/
      original uncropped character art
    icons/
      committed circular troop icon crops

scripts/
  map extraction and generation tools

src/
  App.tsx
  main.tsx
  styles.css
  game/
    armyBuild.ts
    gameState.ts
    gameTypes.ts
  map/
    components/
      HitTargetLayer.tsx
      MapView.tsx
      StaticMapInk.tsx
      TerritoryFillLayer.tsx
      TroopMarkerLayer.tsx
    generated/
      mapData.ts
    mapTypes.ts
  sync/
    syncMessages.ts
    syncTransport.ts
```

The exact file list can evolve, but the boundaries should stay clear:

- `maps/` owns the drawing-to-geometry pipeline.
- `src/map/` owns map rendering and map-specific UI.
- `src/game/` owns game state, reducers, and rules.
- `src/game/armyBuild.ts` owns the tunable starting budgets and fixed-point troop costs, plus the deterministic integer army selector.
- `src/sync/` owns Qwixx-style local network synchronization adapted for Ardatúrë.

The service worker owns installed-app caching. When a change must force already-installed devices onto fresh shell assets, bump `CACHE_NAME` in `public/sw.js` so old cached HTML, manifest, and bundles are discarded on activation. Troop, spy, Caradhras pass, and Paths of the Dead icons are core UI assets, not optional decorations, so the service worker should precache the committed icon files.

## Public Assets

The `public/` directory is organized by runtime asset purpose:

- `app-icons/`: PWA icon files referenced by `index.html`, `manifest.webmanifest`, and the service worker. `ring-icon.jpg` is the original source image for the app icon.
- `troops/source/`: original uncropped character images. These should be preserved because later screens may need full-size character art.
- `troops/source/crop-outlines/`: red-outline crop references. These are the persisted source of truth for manual circular crop placement.
- `troops/icons/`: one-time, manually tuned circular PNG crops for troop UI.
- `caradhras-pass/`: committed SVG weather icons for Caradhras pass states `1-10`.

Troop portraits are raster art and should remain PNGs. Do not convert them to SVG; SVG would either embed the same raster data or create poor traced art. CSS should provide borders, sizing, and count bubbles around these PNGs at runtime.

Army build appears as a centered modal over the map. Normal allocation controls stay compact and use circular image icons with count bubbles rather than text troop labels or letter badges.

The troop icon crops are app-facing assets:

- `dwarf.png`
- `elf.png`
- `orc.png`
- `rohirrim.png`
- `uruk-hai.png`
- `warg.png`
- `witch-king.png`
- `wizard.png`

Additional spy and special-use portrait crops in the same directory include `crow.png`, `crow-captured.png`, `smeagul.png`, `smeagul-captured.png`, `ghost.png`, and `ghost-head.png`.

Army build, troop allocation controls, and future troop displays should use these circular icon crops instead of letter badges. When an icon has a count, render the count as a small white circle attached to the edge of the character circle.

Troop and spy icon ownership should be communicated by a runtime outer ring colored with the owning player's color. The portrait communicates unit type; the ring communicates owner. Captured spies should use the committed captured spy PNGs, currently `smeagul-captured.png` and `crow-captured.png`, with the spy owner's color on the runtime outer ring.

Troop and spy icon paths are centralized in `src/game/troopIcons.tsx`. The app should preload the full troop/spy icon set once at startup so spy buttons, captured-spy rows, army build, allocation, reinforcement, and inspection screens do not show a first-use blank or decode delay.

Caradhras pass icons are simple committed SVG assets. They are clipped circular weather badges without a separate outer outline stroke; sun and cloud shapes use only a thin black outline. They are not generated map geometry and should not be converted into gameplay data. The game syncs and persists `caradhrasPassState`, which is `null` before the first regular turn and an integer from `1-10` during regular turns. The map chooses the matching icon asset only once that integer exists.

Paths of the Dead uses `troops/icons/ghost-head.png` as a dynamic map marker and `troops/icons/ghost.png` for battle-only ghost soldiers. The game syncs and persists `pathsOfTheDeadState`, which is `null` before the first regular turn and an integer from `1-6` during regular turns. States `1-3` render no map marker. States `4-6` render the ghost-head marker at `33%`, `67%`, and `100%` opacity.

## Map Data Flow

The canonical map artifact remains:

```text
maps/geometry/map.json
```

It is generated from:

- `maps/source/territories-drawing.jpeg`
- `maps/source/landmark-drawing.jpeg`
- `maps/source/landmark-outline-drawing.jpeg`
- `maps/territory-key.md`

The app consumes generated TypeScript data:

```text
src/map/generated/mapData.ts
src/map/generated/mapConnections.ts
```

Those files are generated by `scripts/extract-map.ps1` from the same in-memory model that writes `map.json` and the preview SVGs. They should not be manually edited. They contain app-ready values:

- territory IDs and names
- playable/background flags
- territory shape paths
- territory visual centers for troop markers, generated from the large green circles in the territory drawing
- territory focus bounds for selected-camera movement
- resolved skin colors
- static ink paths, including visible border segments, dotted visual ship routes, and landmark paths
- hit target paths
- outgoing directed land plus ship gameplay connections for viewer-specific troop visibility and turn actions

The preview SVGs and PNGs remain verification artifacts. They should continue to be generated so the app can be compared against a known visual output.

## Geometry Rules

The extractor should preserve the current border-first model:

- Regions contain territories.
- Territories reference border IDs.
- Borders are top-level canonical objects shared by exactly two territories.
- Physical borders and playable land connections are different concepts.
- A physical border can exist while `isPlayableConnection` is false because mountains, forests, or other landmarks block gameplay movement.

Source drawings and extraction rules are the only places geometry should be fixed. The app should not contain one-off synthetic dividers, custom geometry patches, or hand-authored territory corrections.

## App Flow

The app should be a map-first shell. The map is always a full-screen layer, while setup, configuration, draft confirmation, pause state, reconnect state, allocation state, and turn state appear as panels or sections above it. Once the draft starts, every game-stage screen uses the same four-section layout described below. The player bar, optional troop section, and optional action section cover the full-screen map instead of resizing it.

The setup/draft milestone is documented in `setup-draft-sync-v1.md`. The troop allocation milestone is documented in `troop-allocation-v1.md`. The first turn-loop milestone is documented in `gameplay-turns-v1.md`. The app phase order through the next gameplay step is:

```text
Home -> Setup and configuration -> Territory draft -> Troop allocation -> Turn loop -> Game over
```

Both local and sync modes share the same setup and draft state model:

- 2 to 6 players.
- Player names.
- Unique player colors from `green`, `blue`, `yellow`, `red`, `purple`, and `black`.
- Turn order with Qwixx-style manual reorder and randomize.
- Draft style: random, round robin, or snake.
- Optional draft pick timers.
- Troop allocation style: manual or random.
- Optional troop allocation timer used by the manual troop allocation phase.

Random allocation is an authoritative game-state transition after the territory draft. It samples each player's army mixture, builds troops with the same economy rules as manual allocation, places all troops, marks allocations complete, and proceeds to the first turn without rendering the manual allocation UI.

The old sandbox interaction is no longer a user-facing app mode. Its useful capabilities remain as reusable map behavior: pan, zoom, selected-territory focus, hit targets, and state-driven territory fills.

## Game Stage Layout

From the start of the territory draft through the rest of the game, the app has exactly four ordered game-stage sections:

1. `PlayerBar`
2. `TroopSection`
3. `Map`
4. `ActionSection`

The `PlayerBar` is always present from the start of draft. It is never covered by modals, popups, sheets, or pause UI, and its X/pause controls remain usable whenever those controls are allowed. CSS layering must keep the game-stage player bar above centered game overlays while keeping map camera controls below every overlay. It uses the color of the player whose turn or draft/allocation step is current. In the sync allocation waiting room and sync passive views, it uses the color/name of the player whose device it is. The left side contains the X button. The player name is prominent near the left; draft may show progress beside the name, such as `3 / 7`. The right side contains the timer when a draft/allocation timer is relevant, and the pause button when pause is available. Timers appear only during draft and troop allocation, including paused remaining time, local handoff upcoming time, and sync waiting-room allocation time. Timers are never shown after troop allocation.

`PlayerBar` and the small dot/name `PlayerIdentity` live in `src/ui/PlayerChrome.tsx`. Game screens should import these shared components instead of defining new player-name rows or local player-bar variants. Player-bar identity, timer, draft progress, pause availability, title-press behavior, and pause labels are projected in `src/game/gameView.ts`; `App.tsx` wires the callbacks but should not inline those phase rules in JSX.

The upper game-stage content slot is optional and appears below the player bar. It can render the `TroopSection` or the sync allocation waiting panel. `TroopSection` itself has exactly two troop-display modes:

- `allocation`: used during initial manual troop allocation and reinforcement placement.
- `info`: used during normal map inspection after allocation, during passive sync turns, and during successful spy intel.

In `allocation` mode, the troop section is hidden until a valid owned territory is selected. Pressing the selected territory again unselects it and hides the section. The top row shows the remaining/movable troop pool and uses the non-clickable `+` affordance. The selected territory or movement name is bold between the rows. The bottom row shows troops on the selected territory/target and uses the non-clickable `-` affordance. The Ready/Finish check button remains in this troop section below the rows.

All troop rows share one display contract. If exact contents are unknown, the row shows exactly four side-aware troop icons, disables/grays them, puts `?` in every count bubble, and never shows captured spies. If exact contents are known, the row shows only troop icons whose counts are greater than zero plus captured spy icons that are actually present in that row/location. Captured spies are inline unit icons, not permanent empty slots. Known rows center the visible icon group and may wrap to a second centered line when captured spies push the row beyond five icons. `+` and `-` affordances are outside that centered icon group and do not affect centering. Structurally required action rows keep their reserved height even when empty; in initial allocation, an empty selected-territory row also hides the `+`/`-` affordance.

In `info` mode, the troop section is hidden until a territory is selected. Pressing the selected territory again unselects it and hides the section. It shows the selected territory name and one row using the shared display contract. Unknown opponent rows still use the selected territory owner's color/side for icon art; only the counts are hidden. Successful spy intel grants exact-breakdown permission for the spied territory only and should use this same `info` mode.

In code, the troop section should stay driven by one explicit section mode. It must be either absent or fully rendered as one mode, never partially present because several overlapping booleans disagreed.

Sync allocation waiting uses the same upper game-stage section slot as troop rows, but it is not a `TroopSection` mode. Ready/waiting columns are visible, troop rows are absent, and the map remains below the section. It is not a popup or modal, so it must not create a separate fifth section or a separate status-section render path.

Pure game-stage projection rules live in `src/game/gameView.ts`. `App.tsx` should use that module for viewer/control context, active overlay priority, selected territory priority, map press mode, player-bar identity/progress, notification visibility, sync snapshot redaction, and section layout. The app shell should wire state and events; it should not grow duplicate phase-condition clusters for those rules.

Complete game-state transitions belong in `src/game/gameState.ts`. Pausing and resuming are handled by `pauseGame(...)` and `resumePausedGame(...)`, including the timer contract: draft pause resets the active pick on resume, while allocation pause preserves remaining allocation time. `App.tsx` may clear local UI selections before pausing, but it must not duplicate phase-by-phase pause/resume state transitions inline.

Game-stage section UI lives in `src/ui/GameSections.tsx`. The public troop surface is one `TroopSection` component with internal modes for initial allocation placement, reinforcement placement, and read-only troop information. Allocation waiting columns and the turn action bar remain separate components, but they are rendered through the same four-section layout slots instead of through additional layout branches. `App.tsx` chooses which section slot to render and passes callbacks/data into these section components; it should not define section panels inline or reach for separate allocation/reinforcement/map-info/status panels.

Pre-game panel UI lives in `src/ui/SetupPanels.tsx`: home mode selection, sync entry/recovery slot selection, and local/sync setup configuration. Setup form primitives remain in `src/ui/FormControls.tsx`. Setup list/config mutations live in `src/game/gameState.ts`, including first-available color selection, list reordering, randomization, forced-unlimited config rules, and paused restart-to-setup cleanup. `App.tsx` owns setup event wiring and sync commands, but it should call those game-state helpers instead of duplicating setup mutation logic inline.

Sync QR error text formatting lives in `src/sync/syncErrors.ts`. `App.tsx` should call these helpers rather than defining one-off utility functions at the bottom of the file.

Generated territory lookup helpers live in `src/map/territoryLookup.ts`. Components and game-view projections should use `territoryForId`, `territoryName`, and `territoriesInRegion` instead of repeatedly scanning `generatedMapData.territories`.

App-level lifecycle hooks live in `src/app/`. Local refresh/close recovery is isolated in `useLocalPauseRecovery`, which writes a paused local snapshot for active local game stages. `App.tsx` should install that hook rather than owning pagehide/beforeunload persistence wiring inline.

Troop and spy icon rendering lives in `src/game/troopIcons.tsx`. Screens should reuse `TroopIconCount`, `TroopIconImage`, `troopIconSrc`, `spyIconSrc`, `preloadTroopIcons`, and `troopName` instead of defining their own troop asset paths, labels, preload behavior, or side mappings.

Troop rows and inline captured-spy icons live in `src/ui/TroopControls.tsx`. Allocation, reinforcement, army build, map-inspection, spy-intel, attack, battle, and fortify screens should import `TroopPlacementRows`, `TroopCountRow`, and `UnknownTroopCountRow` instead of defining local add/remove row markup, fixed four-slot known rows, or separate captured-spy layouts.

Army build modal UI and triangle marker math live in `src/ui/ArmyBuildModal.tsx`. `App.tsx` passes the current player, marker, projected troop counts, and submit handler into that component; it should not define triangle geometry or marker conversion inline.

QR display and scanning UI lives in `src/sync/QrCodeUi.tsx`. `App.tsx` decides when sync QR flows are active, but QR SVG generation, camera scanning, paste-driven verification, torch support, and QR decode details stay inside that sync UI module. `QrPanel` renders only an actual QR SVG; it must not render or style a blank placeholder box while SVG generation is pending.

The `Map` section is always the full-screen visual layer under the game UI. The player bar, optional troop section, and optional action section cover parts of it but never change its rendered SVG size or current `viewBox`. Pan, zoom, return-to-map, and auto-focus controls are available whenever no popup, modal, sheet, handoff, pause, scanner, notification, army-build modal, or confirmation dialog covers the map. Active overlays hide the map camera buttons and disable manual pan/zoom until dismissed. Normal section content, including the sync allocation waiting columns, must not create a separate camera-control exception. Camera buttons stay visible during map focus/return animations, but presses during the animation do nothing. The buttons sit inside the visible aperture with the same padding from the aperture sides/bottom; if the aperture is too short to contain them cleanly, they are hidden instead of overlapping persistent UI.

Camera movement is intent-driven. `App` creates a camera intent only for real app-level camera actions: local handoff home reset or selected-territory focus when automatic focus is enabled. The manual return-to-map button is the same kind of explicit camera action, but it is handled directly inside `MapView` with the current measured aperture. Selection state alone is not a camera command. `App` emits each app-level intent after the selection/phase update has rendered and the visible aperture has been measured, so a territory selection that reveals the troop section focuses into the smaller post-selection aperture. Passive section changes do not move the camera; they only change the aperture used by the next explicit focus/return intent.

Explicit camera targets use the currently visible aperture, not the whole screen. The aperture sides are always the screen sides. Before the game begins, its top is the screen top. After the game begins, its top is the player bar bottom, or the troop section/allocation-waiting bottom when that upper section is visible. Its bottom is the screen bottom, or the action section top when the action section is visible. Return-to-map and selected-territory focus fit their targets inside that aperture. Automatic focus off means selection changes may highlight a territory or reveal a troop section, but they never move the camera.

Camera bounds are separate from the home/fill target. For each orientation, `MapView` computes one stable maximum zoomed-out camera world by fitting the full generated map frame to the screen aspect. This is the same world the user reaches by manually zooming all the way out. It may include paper space outside the generated rectangle on the aspect-required axis. Manual pan, zoom, touch momentum, return-to-map, and territory focus all clamp to that stable orientation world until the orientation changes. Ordinary same-orientation viewport changes, such as mobile browser chrome changing height, do not recalculate the world or move the current `viewBox`.

The `ActionSection` appears only after troop allocation is complete, and only when the local viewer can act on the current turn. It is a persistent bottom section over the full-screen map, not a modal overlay. It contains a single-line instruction row above the button row. When no action is selected, the instruction is `Choose an action`. When spy targeting is selected, the instruction is `Select a territory to spy on`. While successful spy intel is visible, the instruction is `View territory`. During reinforcement placement, the instruction is `Select a territory` until an owned territory is selected, then `Add troops to {territory}`. Attack setup instructions are specific to the current step: `Select a territory to attack from`, `Select a territory to attack`, and `Choose attacking troops`. Fortify setup instructions are `Select a territory to fortify`, then `Select territories to fortify from`. Starting, canceling, or finishing a turn action clears the default map inspection selection so action-specific selections do not leak back into normal map exploration. The button row has the spy button on the left, using the same circular troop-icon button style without a count bubble, and the stage/action button area in the middle/right. When spy setup is in progress, the regular action buttons are replaced by one black, horizontally centered `Cancel Spy` button. When attack setup is in progress, they are replaced by one black, horizontally centered `Cancel Attack` button. When fortify setup is in progress, they are replaced by one black, horizontally centered `Cancel Fortify` button and a black `Skip` button. The cancel action row keeps the normal action-bar height while centering the cancel/skip controls. During successful spy intel, the stage/action buttons are replaced by a dismiss button while the troop section shows the intel in `info` mode.

Allocation-style troop rows expose bulk `+` and `-` buttons through `TroopPlacementRows`. The parent surface owns the legality and maximum-move calculation, so allocation, reinforcement, attack, and fortify reuse the row UI without pushing game rules into the component. When a bulk move must leave troops behind, the shared reserve priority is heavy, then cavalry, then elite, then leader. Initial allocation may reserve multiple troops for empty territories, so it repeatedly reserves heavy first before moving on through the same priority.

Draft has no troop section and no action section. Local handoff screens show the next player in the player bar, hide troop/action sections, and show only the continue-arrow popup. Pause hides troop/action sections but not the player bar.

## Overlay Contract

Game-stage overlays are organized by role, not by phase. Only one overlay should be active at a time. If several overlays are pending, the app shows the highest-priority one first:

1. Sync blocked / disconnected
2. Scanner
3. Decision confirm
4. Pause
5. Handoff
6. Army build
7. Game notification
8. Confirm sheet

Overlay priority, overlay predicate policy, overlay behavior, and pause-panel permissions live in `src/game/gameView.ts`. `App.tsx` should pass current game/session facts into those projections and render the selected overlay; it should not precompute separate `needs...`, `canShow...`, map-freeze, camera-button, section-hiding, pause-resume, restart, removal, or recovery-scan booleans inline. Destructive confirmations use one `decisionPrompt` state, not separate exit/restart booleans. QR scanner UI uses scanner naming, not map-camera naming, so it cannot be confused with map pan/zoom controls.

Every active overlay hides map camera buttons and disables manual pan/zoom until the overlay is dismissed. The player bar remains visible once draft has started, except for pre-game utility flows where the game has not started for that device. Troop and action sections hide whenever an overlay takes over the interaction.

Overlay roles:

- `ConfirmSheet`: compact bottom sheet used for draft territory confirmation, spy target confirmation, and later attack/fortify confirmations. It has a title, optional text, X, and check. The optional text is used for spy capture probability and may be reused by later actions.
- `TaskModal`: centered modal used for required tasks such as army build. The player bar remains visible and interactive; troop/action sections hide; the map is frozen.
- `NotificationModal`: centered dismiss-only modal for authoritative game notifications such as region control changes and spy capture/loss. These notifications are queued game state, not local toast effects.
- `PauseModal`: centered pause UI. The player bar remains visible. Troop/action sections hide. Sync host pause may include recovery QR tools; those tools render a QR only when a recovery offer exists and never show a blank QR placeholder. Sync non-host pause never shows QR recovery tools.
- `DecisionModal`: centered destructive confirmation for restart and exit/end game. It shows a message with side-by-side X and check buttons.
- `HandoffModal`: centered local-only gate with only the continue arrow. Entering local handoff hides troop/action sections, creates a home camera intent for the post-handoff aperture, and freezes user map input while that animation may continue behind the popup. The player bar shows the next player.
- `ScannerModal`: QR camera utility. Scanner flows opened before a device has joined/rejoined a game are not bound by game-stage player bar rules.
- `SyncBlockedModal`: centered reconnecting/disconnected/host-ended blocker. While reconnecting, the device is not connected to host truth and must not show stale host-authored facts as current.

Shared overlay UI primitives live in `src/ui/Overlays.tsx`: `ConfirmSheet`, `DecisionDialog`, `HandoffPanel`, `NotificationDialog`, `ModalActions`, and `ModalIconButton`. Pause UI lives in `src/ui/PausePanel.tsx`, and disconnected/reconnecting session blocking UI lives in `src/ui/SyncSessionBlocker.tsx`. `App` should choose the active overlay and pass game-derived text/callbacks into these components; it should not define duplicate dialog/button primitives inline.

Draft result notifications no longer exist. After a draft pick is confirmed, including timeout/autodraft picks, ownership updates and the draft immediately advances to the next pick.

## UI Style

The app should stay visually sleek, minimal, and mobile-first. The map is the primary visual surface; controls should feel like compact tactical overlays rather than form-heavy pages.

Use icon buttons for common actions whenever the icon is familiar:

- add
- remove
- edit
- lock and unlock
- shuffle
- drag/reorder
- confirm
- cancel
- next
- pause and resume
- scan
- host and join
- exit

Use text where it prevents ambiguity: mode names, player names, draft-style options, timer options, territory names, and important confirmation copy. Icon-only buttons must have clear accessible labels for screen readers and tests.

Prefer compact controls:

- color swatches for player colors
- drag handles for turn order
- small status icons or chips for host, connected, disconnected, locked, active picker, and timer state
- confirmation dialogs for destructive actions that remove players, quit sync games, or end local games

Shared form controls live in `src/ui/FormControls.tsx`: `PanelHeader`, `ColorSelect`, `ConfigSelectSection`, and `SelectField`. Setup/configuration screens should import these primitives instead of defining local select fields, color dropdowns, or panel headers.

## Map Rendering Model

The app renders the map as one shared SVG coordinate system. This avoids gaps and coordinate drift while still letting the app treat each territory as an interactive component. The camera is the SVG `viewBox`, not a transformed map group, so every layer remains in generated map coordinates.

Layer order:

1. `TerritoryFillLayer`
2. `StaticMapInk`
3. `MapWeatherLayer`
4. `TroopMarkerLayer`
5. `HitTargetLayer`

`MapView` owns pan, zoom, and camera-intent execution. The generated app map dimensions include a 1500 map-unit display margin around the extracted source map. The generated `homeViewport` is the normal unbuffered map view inside that larger frame, and the bottom-left overlay control returns to that home view rather than to the maximum zoom-out frame. Manual zoom-out can reveal the full stable orientation world. The bottom-right crosshair overlay toggles automatic selected-territory focus and is stored as a device-local map preference. Automatic focus defaults to off. When automatic focus is enabled and the app creates a territory camera intent, `MapView` fits that territory's generated `focusBounds` rectangle to the measured visible aperture, then clamps the result inside the stable orientation world. Nearly identical focus moves happen instantly; visible moves use a short ease-in-out animation. Focus duration is based on a combined pan and zoom distance, with both values normalized against the halfway viewport diagonal. During that animation, camera buttons remain mounted for visual stability but their click handlers are inert. The focus rectangle is generated from the canonical territory fill loops with 500 map units of padding on every side.

While a focus animation is running, manual camera gestures are locked. Pointer panning, pinch zooming, and wheel zooming are ignored until the animation finishes. Territory taps and skin changes remain active; selecting a different territory redirects the focus animation from the current view. The SVG exposes `data-map-animating="true"` while the camera is moving. Camera controls are DOM overlay buttons outside the SVG interaction path, not SVG map content.

Persistent section changes do not resize the map and do not mutate camera state. `MapView` receives measured visible insets from the app shell and uses them only when an explicit camera intent is consumed. Return-to-map fits `homeViewport` inside the visible aperture. Automatic selected-territory focus fits generated focus bounds inside that same aperture. The stable orientation world controls the outer pan/zoom limits. Manual pan/zoom and the current `viewBox` remain full-screen SVG camera state and are not synced or persisted.

One-finger touch pans use restrained release momentum. `MapView` derives velocity only from the final 100ms of a touch-only, single-pointer gesture, then applies short exponential friction while continuing to use the normal bounded viewport. Momentum never changes zoom or locks input. A new gesture, pinch, wheel event, focus movement, return-to-map action, blocking UI, resize, cancellation, or unmount stops it immediately. Mouse, pen, wheel, and pinch gestures do not launch momentum.

### TerritoryFillLayer

Renders all playable territory fills and the background component. Each playable territory chooses a fill from:

- current skin
- current visual state

The fill layer is also where selected fill styling should happen. Selected territories render as a brighter blend of their current skin color and white, so player color remains recognizable. The static ink stays unchanged above it.

### StaticMapInk

One permanent, non-interactive visual layer. It contains:

- visible physical border strokes
- dotted visual ship routes
- landmark ink

Landmarks affect where border strokes are visible, so these should be treated as one static visual overlay after generation. The generator groups the same masked canonical border paths into two presentation layers: 10-unit borders within a region and 20-unit borders between regions. Background is a region for this classification, so playable-to-background coastlines use the thicker regional stroke. Red guide strokes in the landmark outline drawing generate visual-only dotted ship route curves; they do not affect gameplay connections or border masking. Directed gameplay edges are generated separately; physical land border ink is still shown when either direction exists. Ordinary borders render first, regional borders render second, ship routes render third, and landmarks remain on top.

Gameplay graph helpers live in `src/game/mapGraph.ts`. Game code should use those helpers instead of importing generated connection data directly. Attack, spy distance, spy adjacent reveal, explore related-territory highlights, fortify eligibility, random-allocation border targeting, and opponent troop-total visibility all follow active outgoing directed edges.

The generated directed graph is the base graph. The active graph additionally applies game-state edge modifiers. Caradhras is open while `caradhrasPassState` is `null` or `1-5` and closed at `6-10`. Paths of the Dead is closed while `pathsOfTheDeadState` is `null` or `1-3` and opens only at `4-6`. The generated graph contains `Edoras -> Lamedon`; it never contains `Lamedon -> Edoras`. Gameplay graph filtering belongs in `mapGraph.ts`; the Edoras-to-Lamedon attack swing is the one battle-specific Paths rule and belongs in battle state logic.

`StaticMapInk` should use `pointer-events="none"`.

### MapWeatherLayer

Dynamic, pointer-inert map-local weather markers live above static ink and below troop markers. Caradhras renders `public/caradhras-pass/pass-01.svg` through `pass-10.svg` from the authoritative `GameState.caradhrasPassState` only during regular-turn game stages. Paths of the Dead renders `public/troops/icons/ghost-head.png` near the southwest corner of Edoras only during regular-turn game stages and only for states `4-6`; opacity is `33%`, `67%`, and `100%` for states `4`, `5`, and `6`.

The weather icon is presentation only. It does not own pass rules, edge filtering, or state drift. Those belong in the game graph/state layer so every consumer receives the same active-edge answer.

### TroopMarkerLayer

Dynamic game marker layer. During allocation and the read-only game map, this layer renders larger troop-count circles at generated territory visual centers. These centers come from the large green circles in the territory drawing, not from territory seed points. Later it may show other map-local gameplay markers, but non-map game UI should stay outside the map.

### HitTargetLayer

Invisible topmost territory shapes identify territory geometry even where landmarks or borders visually cover it. `MapView` owns the complete pointer lifecycle: it captures every pointer, tracks tap movement, distinguishes one-finger pan from multi-touch pinch, and routes valid presses to a territory or the map background on pointer-up. Canceled or lost pointers are always removed before another gesture begins. `HitTargetLayer` keeps only generated hit geometry and keyboard activation, so pointer gestures have one owner.

The background component is rendered but not selectable.

Draft confirmation uses the shared compact `ConfirmSheet`. The player bar remains visible above it. Camera controls such as return-to-map and auto-focus hide whenever setup/configuration panels, popups, bottom sheets, or modals cover the map, then return when that overlay closes. Territory emphasis belongs on the map: only the active drafting viewer receives selected-territory fill for the pending pick. If automatic focus is enabled, that viewer also focuses the pending territory. Pending picks are local UI state and are never sent through sync state or messages. Passive sync viewers should not receive, focus, or highlight another player's pending selection. While a confirmation sheet is open, the map is frozen; the active drafter must use the sheet X to cancel or the check to confirm.

## Territory State

The initial app-level map state can be small:

```ts
type MapSkin =
  | "background"
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "black"
  | "purple";

type TerritoryStatus = "unselected" | "suggested" | "selected" | "battleSource" | "battleTarget";

type TerritoryState = {
  skin: MapSkin;
  status: TerritoryStatus;
};
```

Before draft ownership is assigned, playable territories render with the background skin:

```ts
{ skin: "background", status: "unselected" }
```

During draft, allocation, and read-only map phases, playable territory fills are derived from ownership. Owned territories use the owner's unique player color, and unowned territories use the background color. The background component always uses the background skin and is not selectable.

During allocation, only the allocating player's owned territories are selectable. During normal post-allocation inspection, any territory can be selected to open the troop section in `info` mode. Own territories show exact troop breakdowns and captured spies. Opponent territories show the selected territory owner's troop icons with four grayed `?` count bubbles unless a successful spy grants temporary exact-breakdown permission for the spied territory. In local read-only mode, pressing the player name in the player bar cycles the current viewer. Allocation and read-only selected territory IDs are local UI state; sync shares only actual troop allocation data and confirmed ownership.

Territory emphasis has two strengths. Active highlights are for selected, committed, or primary territories and use the brightest blend of the current owner color with white. Suggested highlights use the previous softer selected brightness and mark related local-only territory choices: successful spy intel territory links, valid attack targets after a source is selected, valid fortify sources after a target is selected, and active outgoing directed connections from the currently inspected territory. Battle source and target pulse states have priority over both selected and suggested fill. Suggested highlights are presentation state only and are never synced.

Map press handling has one contract. `src/game/gameView.ts` projects the active `MapPressMode`, the local selection update caused by a territory press, selection cleanup, named selection reset scopes, and selection patch merging. `App.tsx` wires the map callback and applies the returned local selection patch; it should not duplicate a second mode switch or field list for allocation, draft, inspect, reinforcement, spy selection, or selection cleanup.

Territory troop data should track heavy, cavalry, elite, and leader counts. The leader is wizard for light-side colors and witch-king for dark-side colors; army-build mixture math only applies to heavy/cavalry/elite.

## Persistence

Active game recovery and setup preferences should stay separate. Active local games use the saved local game key and can restore in-progress setup, draft, allocation, read-only map, or turn-loop state. Active sync host games use a separate sync-host key. Setup preferences use their own key and only remember convenience defaults: local player names/colors/order, shared game configuration, and this device's sync name/color.

Starting a new local setup should restore local setup preferences with fresh player IDs. Starting sync should restore only this device's sync profile, and sync hosts should reuse the saved game configuration defaults. Remote sync players should never be written into local setup preferences.

Active-game recovery is intentionally conservative:

- Local refresh or close during an active game-stage restores into local pause. Draft resumes with a fresh active pick, allocation resumes from preserved remaining time, and turn play resumes from committed action state.
- Local refresh has no reconnect concept because every player shares the same device.
- Sync host refresh during active play restores the saved host game into paused sync recovery state. Timers are stopped, the host remains connected, and every non-host player is marked disconnected immediately.
- Sync joiners do not own authoritative active-game recovery. If they lose the host and fail automatic reconnect, they return home and must rejoin through host recovery.
- `caradhrasPassState` and `pathsOfTheDeadState` are `null` before regular turns and authoritative active-turn facts after the first turn starts. They are saved/restored with local games and sync-host games.

## Sync Architecture

Sync mode should be copied and adapted from Qwixx rather than literally reused:

- WebRTC data channels.
- QR host offers and joiner answers.
- QR recovery offers and recovery answers for paused disconnected-player recovery.
- Ardatúrë-specific payload kinds and compact QR prefixes.
- Host-authoritative setup, draft, timer, ownership, pause, reconnect, and removal state.

The host is always one of the players and owns the canonical `GameState`. Sync connection/session state is separate UI/session state owned by `App`. Joiners send requests and render host snapshots only while connected. `caradhrasPassState` and `pathsOfTheDeadState` are included in those snapshots like ownership, troops, spies, battle state, and notifications; before the first regular turn, they are `null`.

`connected` has a strict meaning: the device is currently connected to the host, receiving recent host heartbeats/snapshots, and rendering host-authoritative state for the same game page/phase the host is on. A device must not be treated as connected merely because it has stale local state or because a WebRTC channel has not yet reported failure. The session-status type and session-derived viewer/control rules belong to `src/game/gameView.ts`; UI components such as `SyncSessionBlocker` render that projected state but do not define the session contract themselves.

Heartbeat is the source of connection health:

- Host and joiner exchange tiny heartbeat signals separate from full snapshots.
- Heartbeat must be healthy in both directions for the device to count as connected.
- The first missed heartbeat threshold moves that device's local session into `reconnecting`.
- The reconnecting grace period is 10 seconds.
- If heartbeat recovers within 10 seconds, the device returns to connected and receives the latest host snapshot.
- If heartbeat does not recover within 10 seconds, that device independently stops trying. A joiner returns home; the host marks that player disconnected.

Because connection loss means the joiner is no longer connected to the source of truth, joiner reconnecting UI must not present host-derived facts as current truth. It may show local identity, local color, and the last rendered map as inert background, but it must not show current roster status, timers, turn state, ready state, or other players' connection state. Its only controls are to wait or to press X to stop trying and return home. Pressing X while reconnecting does not send `quit`; the device is not connected enough to request removal.

If the host intentionally ends the game, it sends `hostEnded`; if the host removes one player, it sends `removed` to that peer when possible. From the joiner's perspective, host-ended, removed, and automatic reconnect failure all converge to the same outcome: close sync state and return home without stale game controls.

Host-to-joiner game updates are revisioned snapshots:

```ts
{ type: "snapshot", revision, game }
```

Joiners ignore stale snapshots. Joiner-to-host messages are intentionally small: `profileUpdate`, `draftConfirm`, `allocationUpdate`, and `quit`. The host validates every payload before it reaches game logic. Joiners can edit their own unlocked name/color during setup, while the host can edit any name/color and lock or unlock those fields. During sync draft, joiners send only confirmed draft picks, not pending selection previews. During sync allocation, joiners send actual allocation updates, not selected-territory UI state. Ready/waiting is derived locally from each player's `ready` flag while the shared phase remains `allocation` until the host starts the map. The host owns the canonical allocation timer and advances only after every remaining player is ready or after timeout random-completion. Ready-page start-button eligibility is projected in `src/game/gameView.ts`; `App.tsx` should not recompute the roster readiness rule inline.

Timer expiry resolution belongs in `src/game/gameState.ts`. `App.tsx` may detect that a visible timer has expired, but the game layer decides whether an expired draft confirms a pending pick or autodrafts, and whether an expired allocation random-completes one local player or all unready sync players.

Sync setup identity is atomic. QR offers and answers must carry player id, name, and color together. A screen should never render a sync player name with an unknown color and rely on a later profile update to fill the gap.

During sync draft and allocation, graceful quit and ungraceful disconnect are separate:

- Graceful quit removes the player, clears their territories, returns those territories to the draft pool, and pauses the game.
- Ungraceful disconnect keeps the player and their territories, pauses the game, marks them reconnecting for 10 seconds on the host, then marks them disconnected if automatic reconnect fails.

During sync setup, disconnected players are not preserved as recovery slots. If a setup-lobby peer stops being connected, the host removes that player from the setup roster and the player can join again through the normal first-join QR flow. Sync-host setup restore also prunes non-connected setup players so the lobby does not revive stale disconnected rows. If the host restarts a paused active game back to setup, the app rewinds to the pre-game lobby: keep only currently connected players with their names, colors, locks, order, and current game config; clear draft, allocation, turn state, notifications, spies, region control, recovery QR text, recovery slots, reconnecting/disconnected state, and active-game recovery offers. Reconnecting and disconnected players are removed before the setup lobby is shown.

Paused sync games are host-persisted separately from local pass-and-play saves. Host refresh during active sync draft or allocation restores into paused sync recovery with all non-host players disconnected. The restored host creates a fresh recovery transport and renders a new pause recovery QR immediately. The pause modal must never reserve a blank white QR box before that QR text exists. The host can unpause only when at least 2 players remain and every remaining player is connected. Automatic WebRTC reconnect can clear reconnecting state when heartbeat recovers during the 10-second grace period. Once a player is disconnected, the sync host pause modal provides a recovery QR when the recovery offer is ready. The QR contains only disconnected slots, the joiner chooses one slot from the normal Sync -> Join flow, and the host accepts the answer only if that player is still disconnected. Recovery slot and answer screens show the disconnected player's frozen color because the rejoining device is reclaiming that exact host-authoritative player identity. A recovery slot is invalid if it names a player without a valid color. Non-host pause screens never show QR placeholders or recovery tools because recovery authority belongs to the host.

Connected pause and reconnecting are different UI states:

- Connected pause is host-authored. The host and any connected joiner may show the host's current roster/status information.
- Reconnecting is local-only. The device is not connected to host truth and must show only a simple reconnecting modal over inert stale background.
- Disconnected is terminal on the joiner device. The joiner returns home and no longer shows the old game.

Connected pause and recovery player rows should stay visually aligned in both local and sync mode: the color dot comes first, the player name is left-aligned immediately after it, the sync connection status uses a fixed right-aligned column when present, and the trash/action slot or spacer is always the fixed far-right cell. Local pause uses the same grid with an empty status cell so its trash icon never shifts compared with sync pause.

The host should always maintain enough authoritative state to resume the game after recovery. Sync should send committed game facts promptly, but not noisy transient UI:

- Confirmed draft pick: immediate.
- Army build submitted: immediate.
- Ready/unready-by-rule and phase advance: immediate.
- Allocation add/remove changes: send as real allocation data, batched or lightly throttled as needed, and flushed on ready, pause, visibility change, or page unload where practical.
- Turn-loop committed facts: immediate. This includes turn start, spy result, captured-spy territory, reinforcement army submission, finalized reinforcement placements, attack lock, challenge score submissions, battle rolls, casualties, retreat, conquest, final battle dismissal, elimination/victory resolution, forced host-transfer state, fortify/end-turn result, and player removal/redistribution.
- Local selected territory, map focus, camera position, open modal, draft pending preview, read-only inspection, spy target preview before confirmation, successful spy intel view state, and provisional reinforcement placement edits: never synced.

This principle should continue through future phases: the host needs the latest committed model needed to resume, while temporary presentation state remains device-local.

Local map-selection UI state is one explicit model, not a set of phase-specific state variables with separate cleanup effects. `src/game/gameView.ts` owns the sanitizer that clears pending draft picks, allocation selections, turn selections, spy targets, and inspection selections when the current game state makes them invalid. `App.tsx` may update local selections in response to user events, but it should not grow new one-off cleanup effects for individual selection fields.

Player names and colors travel together in QR answers and host-authored snapshots. UI should not render a known player name with an unknown or guessed color. Shared color helpers live in `src/game/playerColors.ts`; player bars, dots, troop icon owner rings, and setup controls should use those helpers rather than defining separate color mappings.

During sync gameplay turns, inactive devices render only a read-only/explore-style map from their own viewer perspective. They do not see another player's pending selections, automatic focus, confirmation sheets, provisional reinforcement edits, attack setup selections, or successful spy intel. They receive visible updates only when the host broadcasts committed facts, such as finalized reinforcements, battle casualties, conquest, fortify/end-turn, or player removal. A failed spy is the one defender-facing spy event: the defender receives a local notification that they captured the active player's spy in the target territory.

Locked battles are authoritative game state. Attack source/target selection and committed-troop drafting are local UI until the attacker confirms the attack. After lock, sync shows the battle modal only to the attacker and defender; other connected players see committed map facts plus public battle location cues. For non-participants, the source/attacking territory flashes at a higher frequency and the target/defending territory uses a slower pulse. Non-participants remain in explore mode and may still select territories, but the battle flash overrides the normal selected-fill color on the flashing source/target territories. The attacker is the only device that may roll, retreat, or dismiss the final battle result. Challenge samples are submitted immediately when the challenge button is pressed and then converted into fixed personal scores for each real battle unit; regular mode uses the same conversion with the overall distribution mean as the sample. The challenge modal shows the challenged player's current battle army row above the button, including any battle-only ghost soldiers for the attacker and any captured spies present with the defender's battle force, but never shows scores or dice before submission. Displayed scores render with one decimal and `/ 10` and are the average personal score of the remaining units. Dice render as large raw pip dice between the defender and attacker scores. Latest roll dice are always displayed exactly as rolled, sorted highest to lowest from left to right, even when casualties reduce the next roll's dice count, but dice never show troop-icon badges. Battle unit rows use the shared known-content display contract, including captured spies present with the battle force, while preserving stable row space when empty. Win results use a separate centered `{winner} defeated {loser}` layout instead of the regular mirrored battle layout; attacker wins show the final dice above the victorious army, defender wins show final dice below the victorious army, the attacker-win result row shows surviving battle-only ghosts until dismissal, and the result row releases the attacker's own captured spy if conquest returns that spy. Scores already submitted or computed persist through pause/reconnect; unfinished challenges restart on resume.

When the active graph allows an attack from Edoras to Lamedon, the Paths of the Dead state also creates one pre-battle swing. Let `G = min(committed attacking troop count, pathsOfTheDeadState - 3)`. Sample one integer uniformly from `-G` through `+G`. Negative values kill that many committed real attacking troops before battle unit scoring/challenge, excluding leaders while any non-leader committed attacker remains. If every committed attacker dies, the challenge is skipped and the defender immediately wins. Positive values add that many battle-only ghost soldiers to the attacking army. Ghost soldiers use `troops/icons/ghost.png`, count for attacker dice, use the attacker's starting score sample as their personal score, die before real troops, disappear on retreat, and appear in the attacker-win result row before disappearing when the battle result is dismissed. Ghost soldiers never occupy Lamedon in the post-battle map state.

When Moria is the defending territory, every roll attempt first selects dice units and then checks for the Balrog with probability `(attacker dice count + defender dice count) / 20`. A Balrog roll stores selected blank dice instead of fake values, kills those selected units directly including leaders, counts as a roll for retreat eligibility, and resolves normal winner/result state from the survivors. If both sides would be wiped out, one random defending dice unit survives, the defender wins, and that survivor is the single occupying troop. The modal plays the non-looping `balrog/balrog.gif` once for `1400ms` as a 50% opacity cover background clipped by the modal while immediately showing black blank dice with no pips or troop badges. The dice and retreat controls stay disabled until the GIF completes.

Elimination is an authoritative post-battle event, not an incidental ownership side effect. After a conquest battle result is dismissed, if a player owns zero territories, every connected device shows `{player} has been eliminated`; in sync mode only the host can confirm. Confirming kills that player's spy, disconnects/removes that peer if applicable, and continues the current player's turn without redistribution because the eliminated player owns no territories. If only one player remains, the modal instead says `{winner} wins` and offers `Exit` or `Restart`. Restart returns only the final two connected players, the winner and final eliminated opponent, to the pre-game setup lobby; previously eliminated players are already forgotten.

Host transfer is a sync pause authority operation. It is available to the current connected host whenever a sync game is paused and at least one other player is currently connected. The destination must be a connected non-host player. The old host remains source of truth until the selected player receives the latest paused snapshot, acknowledges the transfer, and becomes the new broadcaster/recovery authority. Because sync is host-centered, existing peer channels are not migrated: the selected player receives the transfer snapshot, every other connected peer is sent home, and those peers can rejoin through the new host's pause recovery QR. During a voluntary transfer, the old host app exits to home and that player remains in the game as disconnected/recoverable. If the host was eliminated, transfer is forced, resume is disabled until transfer succeeds, and the old host is removed from the game after the selected player becomes host.

Fortify setup is local UI until committed. `App.tsx` owns one provisional target, one selected source, and provisional movement by source. Source eligibility is derived from owned gameplay-connection chains to the target. Cavalry may move from any eligible source; heavy, elite, leader, and immediately connected captured spies share one regular-source lane; remote captured spies may move only while cavalry from that same remote source is committed and must automatically return if that cavalry is undone. Sync joiners send only `{ type: "commitFortify", targetTerritoryId, movesBySource }` or `{ type: "skipFortify" }`. The host validates those commands in game-state helpers before applying them. Sync passive viewers receive only the final fortify/end-turn committed facts.

Turn action helpers in `src/game/gameState.ts` should own composed game-state cleanup. For example, starting reinforcements and ending the turn with fortify both clear transient spy selection inside game-state helpers; `App.tsx` should call those complete actions rather than composing `cancelSpySelection(...)` with another state transition inline. Creating the first regular turn samples `caradhrasPassState` uniformly from `1-10` if it is `null` and samples `pathsOfTheDeadState` uniformly from `1-6` if it is `null`. Every helper that truly advances to the next player after that must drift both dynamic pass states exactly once through shared drift helpers.

Spy and region notifications are not local toast effects. They are authoritative per-player queues stored in `GameState`, persisted with active games, and dismissed one at a time. The sync host stores every player's queue, while viewer-specific snapshots include only the receiving player's queue. Local mode shows queued notifications only on the affected player's turn or handoff; sync mode can deliver the affected player's queue after reconnect because the host remains source of truth.

Notification wording lives in `src/game/notificationText.ts`. `App.tsx` renders the active notification overlay, but it should not define notification text formatting inline.

Local and sync modes use the same pause icon/button placement during draft. In local mode, the pause button is always visible because the device owns the whole game. In sync mode, only the host sees the pause button.

Local pause preserves current state except for draft pick timing. During draft, pausing discards the current pending pick/confirmation and the same player receives a fresh full pick timer on resume. During allocation, pausing preserves remaining timer time, army build/allocation progress, and placed troops. During turn play, committed turn state is preserved according to the action contracts. The pause modal does not repeat draft territory progress; persistent game-stage context belongs in the player bar. Local restart from pause returns to local setup/config with the same players, colors, order, and game config from before the game started. Local refresh/close during an active phase restores into pause; draft resumes with a fresh pick timer and allocation resumes from preserved remaining time. Sync pause follows the same timer split: draft pick time resets, allocation time is preserved. The sync host can confirm a restart from pause, returning connected players to setup without closing transports and clearing every active-game/recovery fact from the previous game.

Both modes allow player removal while paused. During draft, removed players' territories are cleared and returned to the draft pool. During allocation, removed players' territories and troops are redistributed to remaining players according to `troop-allocation-v1.md`. During gameplay turns, removed players' populated territories are redistributed according to `gameplay-turns-v1.md`. Local pause has no disconnected/reconnecting state or QR tools.

## Gameplay Turn Fit

This structure now supports the next turn-loop milestone:

- setup, territory claiming, and ownership colors
- viewer-specific troop visibility rules
- spy targeting and temporary intel
- reinforcement army build and placement
- attack setup and locked battle resolution
- fortify button ending the turn
- gameplay player removal and redistribution
- troop-count markers
- local pass-and-play
- WebRTC sync mode with pause/reconnect

The setup/draft milestone solves player setup, sync connection, draft ownership, persistence, and map interaction. The troop allocation milestone adds army building, troop placement, viewer-specific read-only troop visibility, and troop-count markers. The gameplay-turns milestone adds the turn loop, spy, reinforcements, attack setup/battle, fortify, and turn advancement.
