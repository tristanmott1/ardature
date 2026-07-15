# Map Assets

This directory contains the source references and generated geometry for the Ardatúrë map.

## Source Files

All source drawings currently use the same `1600x1131` coordinate space.

- `source/middle-earth-original.jpeg`: original labeled reference map.
- `source/territories-drawing.jpeg`: source-of-truth boundary drawing. Red lines define the six regions; blue lines define territories within those regions; page edges close shapes where needed.
- `source/landmark-drawing.jpeg`: source-of-truth landmark ink drawing.
- `source/landmark-outline-drawing.jpeg`: source-of-truth landmark mask and ship-route guide drawing. Blue outlines are used exactly to clip the landmark ink and hide covered border strokes. Red guide strokes are used to derive visual dotted ship routes.
- `territory-key.md`: canonical territory names, region membership, and base directed gameplay connections.

## Generated Files

- `geometry/map.json`: canonical border-first map geometry generated from `source/territories-drawing.jpeg`, `source/landmark-drawing.jpeg`, `source/landmark-outline-drawing.jpeg`, and `territory-key.md`. Coordinates are smoothed map units, not raw source-image pixels.
- `previews/landmarks.svg`: transparent black vector landmark preview generated from the landmark data stored in `geometry/map.json`, translated into the app preview frame.
- `previews/territories-blue.svg`: light turquoise-blue territory preview generated from the extracted map model.
- `previews/territories-green.svg`: light green territory preview generated from the extracted map model.
- `previews/territories-red.svg`: softened blood-red territory preview generated from the extracted map model.
- `previews/territories-yellow.svg`: light yellow territory preview generated from the extracted map model.
- `previews/territories-black.svg`: gray-to-charcoal territory preview generated from the extracted map model.
- `previews/territories-purple.svg`: softened electric-purple territory preview generated from the extracted map model.
- `previews/territories-background.svg`: flat background-color territory preview generated from the extracted map model.
- `../src/map/generated/mapData.ts`: app-ready TypeScript map data generated from the same extracted map model, including territory visual centers and selected-camera focus bounds.
- `../src/map/generated/mapConnections.ts`: app-ready directed gameplay connections generated from territory land, ship, and one-way connections.

The territory previews use a flat `#EFE9D9` background, solid territory fills, physical border strokes hidden by the exact landmark mask, dotted visual ship routes, and the landmark overlay. Colored themes use deterministic territory shades based mostly on west-to-east position, with some north-to-south weight and small stable variation so neighboring territories remain visually distinct. The background theme remains one uniform tan. Borders inside one region use a 10-unit stroke. Borders between regions use a 20-unit stroke, with `background` treated as a region so coastlines receive the thicker stroke. App-facing previews add the same 1500 map-unit display margin used by the PWA so edge territories and manual camera movement have natural breathing room.

Regenerate the map geometry and preview with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\extract-map.ps1
```

The map extractor validates that the output has 6 playable regions plus 1 background region, 42 playable territories plus 3 background territories, one territory assignment for every source pixel, canonical border objects referenced by exactly two territories, non-empty landmark geometry, and exactly 4 visual ship-route guide strokes.

The extractor also writes `src/map/generated/mapData.ts` and `src/map/generated/mapConnections.ts` for the PWA. `mapData.ts` translates territory fills, hit targets, visual centers, static ink, landmarks, and visual ship routes into a framed app coordinate system with a 1500 map-unit margin on every side. It also includes a generated `homeViewport` for the normal unbuffered map view. Territory focus bounds are generated from framed fill loops with 500 map units of padding on every side, then clamped inside the framed app map. `mapConnections.ts` exports `generatedDirectedMapConnections`, each playable territory's base outgoing land and ship gameplay connections. Runtime game code must treat those as the base graph and apply active game-state modifiers, currently the Caradhras pass weather state and Paths of the Dead state, through `src/game/mapGraph.ts` before using connections for attacks, spy distance, fortify, random allocation, explore highlights, or viewer-specific troop visibility. Both generated files should not be manually edited.

Each playable territory must have exactly one generated visual center. The visual center is the center of the large green circle marked inside that territory in `source/territories-drawing.jpeg`. Troop-count circles and future territory-local markers must use these generated visual centers. The extractor should fail loudly if a playable territory does not have exactly one detectable green center circle; it should not silently fall back to territory seed points.

By default, the extractor simplifies traced borders with a 1.0-pixel source tolerance, scales the source drawing by 10, then applies one smoothing pass before writing geometry. The source image still controls topology; the generated JSON is the mathematical model used by the app.

Landmarks are extracted without dilation, smoothing, simplification, or tiny-component cleanup. The extractor detects blue outline pixels, flood-fills from the page edge, treats blue and enclosed pixels as the landmark mask, then turns dark pixels from `source/landmark-drawing.jpeg` inside that mask into black vector ink. Red guide strokes in the landmark outline drawing are processed separately as visual-only ship routes: the extractor finds exactly four red components, derives center samples through each stroke, and fits one single-bend dotted black curve for each route.

If borders change in the future, update `source/territories-drawing.jpeg` and `territory-key.md`, then rerun the single extractor. If landmark clipping or visual ship routes change, update `source/landmark-drawing.jpeg` or `source/landmark-outline-drawing.jpeg`, then rerun the same command.
