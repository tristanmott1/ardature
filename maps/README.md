# Map Assets

This directory contains the source references and generated geometry for the Ardature map.

## Source Files

- `source/middle-earth-reference.jpg`: original visual reference map.
- `source/territory-boundaries.jpeg`: source-of-truth boundary drawing. Red lines define the six regions; blue lines define territories within those regions; page edges close shapes where needed.
- `territory-key.md`: canonical territory names, region membership, and gameplay connections.

## Generated Files

- `geometry/map.json`: canonical border-first map geometry generated from `source/territory-boundaries.jpeg` and `territory-key.md`. Coordinates are smoothed map units, not raw source-image pixels.
- `previews/territories.svg`: visual preview generated from the same extracted map model.

Regenerate the map geometry and preview with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\extract-map.ps1
```

The map extractor validates that the output has 6 playable regions plus 1 background region, 42 playable territories plus 3 background territories, one territory assignment for every source pixel, and canonical border objects referenced by exactly two territories.

By default, the extractor simplifies traced borders with a 1.5-pixel source tolerance, scales the source drawing by 10, then smooths the paths before writing geometry. The source image still controls topology; the generated JSON is the mathematical model used by the app.

If borders change in the future, update `source/territory-boundaries.jpeg` and `territory-key.md`, then rerun the single extractor.
