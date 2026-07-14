# Ardatúrë Docs

This directory contains planning and implementation notes for the app. The existing `GAME_SPEC.md` remains the high-level game rules and product source of truth. The `maps/` directory keeps its own source-art and generation documentation.

## Documents

- `../GAME_SPEC.md`: overall game rules, modes, setup, combat, and long-term product behavior.
- `../maps/README.md`: map source drawings, generated geometry, previews, and extraction workflow.
- `app-architecture.md`: planned PWA directory structure, app data flow, and map rendering architecture.
- `setup-draft-sync-v1.md`: setup, sync lobby, territory draft, draft pause/reconnect, and draft ownership mechanics.
- `troop-allocation-v1.md`: current gameplay milestone for army building, troop allocation, allocation pause/removal, and viewer-specific read-only map visibility.
- `gameplay-turns-v1.md`: turn-loop milestone for turn order, spy, reinforcements, region bonuses, attack setup/battle, fortify placeholder, and gameplay player removal.

## Documentation Rules

- Major structure, state, sync, and map-pipeline decisions should be documented before or alongside implementation.
- The source drawings and `maps/territory-key.md` define map geometry and gameplay connections. If generated geometry is wrong, fix the drawings, thresholds, or extraction method directly. Do not add one-off synthetic geometry or custom divider patches in app code.
- Generated app data should be derived from canonical map artifacts, not hand-authored separately.

