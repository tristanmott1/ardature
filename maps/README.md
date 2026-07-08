# Map Assets

This directory contains the source references and generated geometry for the Ardature map.

## Source Files

All source drawings currently use the same `1600x1131` coordinate space.

- `source/middle-earth-original.jpeg`: original labeled reference map.
- `source/territories-drawing.jpeg`: source-of-truth boundary drawing. Red lines define the six regions; blue lines define territories within those regions; page edges close shapes where needed.
- `source/landmark-drawing.jpeg`: source-of-truth landmark ink drawing.
- `source/landmark-outline-drawing.jpeg`: source-of-truth landmark mask drawing. Blue outlines clip the landmark ink.
- `territory-key.md`: canonical territory names, region membership, and gameplay connections.

## Generated Files

- `geometry/map.json`: canonical border-first map geometry generated from `source/territories-drawing.jpeg`, `source/landmark-drawing.jpeg`, `source/landmark-outline-drawing.jpeg`, and `territory-key.md`. Coordinates are smoothed map units, not raw source-image pixels.
- `previews/landmarks.svg`: transparent black vector landmark preview generated from the landmark data stored in `geometry/map.json`.
- `previews/territories-blue.svg`: light turquoise-blue territory preview generated from the extracted map model.
- `previews/territories-green.svg`: light green territory preview generated from the extracted map model.
- `previews/territories-red.svg`: softened blood-red territory preview generated from the extracted map model.
- `previews/territories-yellow.svg`: light yellow territory preview generated from the extracted map model.
- `previews/territories-black.svg`: gray-to-charcoal territory preview generated from the extracted map model.
- `previews/territories-purple.svg`: softened electric-purple territory preview generated from the extracted map model.
- `previews/territories-background.svg`: flat background-color territory preview generated from the extracted map model.
- `../src/map/generated/mapData.ts`: app-ready TypeScript map data generated from the same extracted map model.

The territory previews use a flat `#EFE9D9` background, solid territory fills, masked physical border strokes, and the landmark overlay.

Regenerate the map geometry and preview with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\extract-map.ps1
```

The map extractor validates that the output has 6 playable regions plus 1 background region, 42 playable territories plus 3 background territories, one territory assignment for every source pixel, canonical border objects referenced by exactly two territories, and non-empty landmark geometry.

The extractor also writes `src/map/generated/mapData.ts` for the PWA. That file is generated and should not be manually edited.

By default, the extractor simplifies traced borders with a 1.0-pixel source tolerance, scales the source drawing by 10, then applies one smoothing pass before writing geometry. The source image still controls topology; the generated JSON is the mathematical model used by the app.

If borders change in the future, update `source/territories-drawing.jpeg` and `territory-key.md`, then rerun the single extractor. If landmark clipping changes, update `source/landmark-drawing.jpeg` or `source/landmark-outline-drawing.jpeg`, then rerun the same command.
