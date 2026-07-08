# Map Sandbox V1

The first app version is a map interaction sandbox. It should prove that the app can render the generated map, pan and zoom comfortably, select territories, and assign territory colors on a phone.

## Goals

- Open directly to the map.
- Pan around the map.
- Zoom in and out.
- Tap/click territories reliably, including areas covered by landmarks.
- Show selectable territory states through fill styling.
- Let the selected territory choose one of seven skins.
- Keep generated app data aligned with generated previews.

## Non-Goals

- Player setup.
- Game turns.
- Reinforcements.
- Combat.
- Fog of war.
- Sync mode.
- Troop-type data.
- Persistent finished game records.

These features should fit the architecture later, but they are not part of the first app milestone.

## Initial State

Every playable territory starts as:

```ts
{ skin: "background", status: "unselected" }
```

The background component renders in the background color and is never selectable.

## Territory Press Behavior

When a playable territory is pressed:

- If it is `unselected`, it becomes `selected` and all other playable territories become `unselected`.
- If it is `selected`, it becomes `unselected`.

This keeps the first version deterministic and focused on single-territory selection.

Selecting a territory also moves the map camera to that territory. The generated app data contains a `focusBounds` rectangle for each playable territory, built from the territory's fill loops with 500 map units of padding. If the territory touches the outer map edge on a side, that side gets no padding. The camera fits that rectangle to the current screen shape, fills the screen in one direction, centers in the other direction, and then clamps the result inside the map.

Focus movement is distance-based. If the current view is already nearly identical to the selected territory's focus view, the camera updates instantly. Otherwise, the camera uses a short ease-in-out animation. Duration scales with both center movement and zoom difference, normalized against the halfway viewport size.

Unselecting a territory does not move the camera.

During a focus animation, territory and skin interactions remain active:

- pressing a different territory redirects the focus animation to that territory
- pressing the selected territory unselects it and stops the focus animation where it is
- choosing a skin updates the selected territory without interrupting the focus animation

Manual camera gestures are locked while the focus animation runs:

- pointer panning is ignored
- pinch zooming is ignored
- wheel or trackpad zooming is ignored

After the animation finishes or is canceled, the user can pan and zoom normally from the current view.

The camera can zoom all the way out to the full map. The `viewBox` stays within the map dimensions, and the SVG's tan background fills any extra screen space when the full-map view does not match the screen shape.

## Skin Picker

When exactly one territory is selected, show seven skin options at the top of the screen:

- background
- blue
- green
- red
- yellow
- black
- purple

Choosing a skin changes the selected territory's `skin` and leaves it selected.

The skin picker should be compact and mobile-friendly. Color swatches are preferred over text-heavy buttons.

## Visual States

Each playable territory fill has two visual states:

- `unselected`: base skin fill.
- `selected`: brighter, whiter version of the base fill.

These states affect only the fill layer. The static map ink layer remains unchanged.

## Layering

The map should render in this order:

1. Territory fills.
2. Static map ink.
3. Troop marker layer.
4. Hit targets.

For V1, the troop marker layer exists structurally but does not need to display anything unless sample/debug troop counts are intentionally added later.

## Pan And Zoom

Use a custom lightweight pan/zoom implementation first.

Expected controls:

- Drag to pan.
- Pinch to zoom on touch devices.
- Wheel or trackpad gesture to zoom on desktop.

The map should stay usable on a phone viewport. The implementation should avoid browser page scrolling while interacting with the map.

## Generated Data

The map generator produces `src/map/generated/mapData.ts` with:

- map dimensions and viewBox
- territory shape paths
- territory centers
- territory focus bounds
- skin colors for each territory
- static ink paths
- hit target paths

The app does not reconstruct territory loops from raw borders at runtime.

## Verification

After implementation, verify:

- the app map visually matches the generated preview SVG/PNG for unselected background state
- territory taps work over landmark-covered areas
- pan and zoom feel usable on desktop and mobile viewport sizes
- selecting a territory visibly changes its fill underneath the static ink
- choosing a skin updates the selected territory and keeps it selected
