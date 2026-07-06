# Map Assets

This directory contains the source references and generated geometry for the Ardature map.

## Source Files

- `source/middle-earth-reference.jpg`: original visual reference map.
- `source/territory-boundaries.jpeg`: source-of-truth boundary drawing. Red lines define the six regions; blue lines define territories within those regions; page edges close shapes where needed.
- `territory-key.md`: canonical territory names, region membership, and gameplay connections.

## Generated Files

- `geometry/regions.json`: mathematical region polygons generated from `source/territory-boundaries.jpeg`.
- `geometry/territories.json`: mathematical territory polygons generated from `source/territory-boundaries.jpeg` and `territory-key.md`.
- `previews/territories.svg`: visual preview of the generated territory polygons.

Regenerate all map geometry and the territory preview with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\extract-map.ps1
```

The map extractor validates that the output has exactly 42 territories, the expected count per region, one connected polygon per territory, three background polygons, and exact pixel-area coverage of the full source image.

If borders change in the future, update `source/territory-boundaries.jpeg` and `territory-key.md`, then rerun the single extractor.
