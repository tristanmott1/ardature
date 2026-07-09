# Troop Allocation V1

This milestone starts after every playable territory has exactly one owner. It adds army building, troop allocation, allocation timers, allocation pause/removal behavior, and the first viewer-specific read-only map.

## Phase Order

The app phase order for this milestone is:

```text
Home -> Setup and configuration -> Territory draft -> Troop allocation -> Read-only game map
```

The old post-draft ownership-only review is no longer the final milestone state. After draft completion, the app enters troop allocation. After every remaining player has allocated troops, the app enters a read-only game map. Full turns, spy, reinforcements, attack, and fortify are still out of scope.

## Troop Classes

Player color determines visual troop side:

- `green`, `blue`, and `yellow` players use light troop icons: dwarf, rohirrim, elf, and wizard.
- `red`, `purple`, and `black` players use dark troop icons: orc, warg, uruk-hai, and witch-king.

The gameplay troop classes are the same for both sides:

- heavy: dwarf or orc
- cavalry: rohirrim or warg
- elite: elf or uruk-hai
- leader: wizard or witch-king

The leader troop is not part of the triangle mixture. Every player always has exactly one base leader troop, determined by side, and the leader allocates to territories like any other troop.

The UI should use circular character icons wherever practical. Allocation controls should not use troop names when an icon can clearly identify the troop class. The app-facing troop icons live in `public/troops/icons/` and are manually tuned PNG crops from the original art in `public/troops/source/`. The red outline files in `public/troops/source/crop-outlines/` are the source of truth for manual crop placement.

When a troop icon is displayed with a count, the count should appear in a small white circular badge on the edge of the character circle. The icon itself remains the main visual; no troop text should be shown in ordinary allocation UI.

## Army Build

Each player first chooses an army mixture with a reusable triangle component. This army build step should appear as a large centered modal over the map, not as part of the compact top controls. The compact controls for this step should stay minimal: current player identity plus pause/exit controls.

Triangle rules:

- The top corner is heavy.
- The bottom-left corner is cavalry.
- The bottom-right corner is elite.
- Each triangle corner displays the appropriate circular troop icon for the player's side.
- The marker starts in the center.
- The marker is draggable anywhere inside the triangle for army building.
- The marker position is converted to troop percentages with barycentric coordinates.
- Army building allows true `0%` for a troop class.
- The same triangle component will later be reused for opponent prediction. Prediction mode will prevent the marker from getting too close to a corner so no troop class can be `0%`, even though the triangle should look visually the same.

Budget rules:

- The starting budget is based on the number of players at the beginning of the game:
  - 2 players: `40`
  - 3 players: `35`
  - 4 players: `30`
  - 5 players: `25`
  - 6 players: `20`
- The leader troop costs `1` budget and is guaranteed exactly once in the player's base army no matter where the triangle marker is placed.
- The effective triangle budget is `startingBudget - 1`.
- Troop costs are:
  - heavy: `0.8`
  - cavalry: `1.0`
  - elite: `1.2`
- Weighted cost per troop is `(heavyPercent * 0.8) + (cavalryPercent * 1.0) + (elitePercent * 1.2)`.
- Adjusted triangle troop count is `round(effectiveTriangleBudget / weightedCostPerTroop)`.
- Raw heavy/cavalry/elite counts are each troop percentage multiplied by the adjusted triangle troop count.
- Each raw troop count is rounded to the nearest integer.
- If the rounded heavy/cavalry/elite counts do not sum to the adjusted triangle troop count, force them to match:
  - If the sum is too high, reduce the troop class whose raw count is closest to the next lower integer. Repeat with another troop class if needed.
  - If the sum is too low, increase the troop class whose raw count is closest to the next higher integer. Repeat with another troop class if needed.
- A final count of `0` for any troop class is valid.
- While the marker moves, the UI shows live final heavy/cavalry/elite counts plus the guaranteed leader as four circular troop icons with count badges above the triangle.
- Once the player submits the army build, the heavy/cavalry/elite counts plus the guaranteed leader become that player's base army.

Inherited troops from removed players are additive. They do not change the player's budget and they do not get converted into budget. Leaders from removed players are not inherited as leaders; each removed wizard or witch-king is randomly replaced with one heavy, cavalry, or elite troop before redistribution. If a player selected a `100%` cavalry mixture and later receives `2` heavy and `1` elite from a removed player, their live allocation pool shows their original cavalry count, their original leader, plus the inherited `2` heavy and `1` elite.

## Territory Allocation

After locking the army build, the player allocates all available troops to territories they own.

Allocation rules:

- A player may select only territories they own.
- Selecting a territory focuses the map on that territory.
- Every owned territory must have at least one troop total before the player can finish.
- Allocation uses the shared colored game top bar: X on the left, current player name prominent near the left, timer near pause when present, and pause on the right in local mode or for the sync host.
- The selected territory controls show two compact icon rows: remaining troops for adding and troops on the selected territory for removing.
- The selected territory name is shown in bold between the add and remove rows, but its total troop count is not repeated in the controls because the map marker already shows that total.
- The `+` and `-` row icons are non-clickable affordances. They are muted only when no troop in that row can currently be added or removed.
- The circular troop icons are the action targets: tap a remaining troop icon to add one troop, or tap a selected-territory troop icon to remove one troop.
- The player can remove any number of troops from the selected territory.
- The player can add any number of remaining troops to the selected territory, but only if the total remaining troop count after the add is at least the number of still-empty owned territories.
- This rule guarantees that every empty territory can still receive at least one troop.
- During allocation, troop-count circles appear on all territories owned by the allocating player.
- Territory marker positions come from generated territory visual centers, not from old territory seed points.

Random completion rules:

- If the timer expires before the army build is submitted, the current marker position is locked. If the player has never moved the marker, the center marker produces a uniform army build.
- If the timer expires during territory allocation, remaining troops are placed randomly.
- If any owned territories are empty, only empty territories participate until every empty territory receives troops.
- If no owned territories are empty but troops remain, all owned territories participate.
- The random algorithm shuffles the target territory list, expands remaining troops into one item per troop, shuffles that troop list, and places troops one at a time in round-robin order across the shuffled territories.
- It should be impossible for a player to have fewer total troops than owned territories. If this invariant fails, the app may fail loudly.

## Local Allocation

Local mode is pass-and-play.

- Players allocate one at a time.
- Allocation order is the configured turn order from setup, skipping removed players.
- A player completes both army build and territory allocation before the next player starts.
- The troop allocation timer includes both army build and territory allocation.
- If the timer is unlimited, there is no timer and no automatic random completion.
- If the timer expires, the app locks the current army build if needed, randomly completes remaining allocation, and shows a brief message: `The remainder of your troops have been randomly allocated.`
- After each player finishes, a handoff screen hides that player's allocation before the next player begins.
- If a player who already finished allocation later receives redistributed territories or troops, they get a second allocation turn appended to the end of the local allocation order.
- During a second allocation turn, the player can rearrange all of their troops across all of their current territories. Their previous placements remain where they were until the player changes them.

## Sync Allocation

Sync mode is simultaneous and host-authoritative.

- Every player builds and allocates on their own device at the same time.
- The troop allocation timer includes both army build and territory allocation.
- The host owns the canonical allocation timer.
- If the timer is unlimited, there is no timer and no automatic random completion.
- When a player finishes, they press ready.
- Ready is final. Players cannot manually unready.
- Ready players go to a waiting page.
- The waiting page shows all remaining players and whether each player is ready.
- All players can see readiness status, not only the host.
- The host can advance only after every remaining player is ready.
- If the host-authoritative timer expires, the host randomly completes allocation for every unready player using the same random completion rules as local mode.

## Allocation Pause, Disconnect, And Removal

Sync allocation uses the same pause/reconnect model as sync draft:

- Any ungraceful disconnect during sync allocation forces pause.
- The disconnected player remains in the game as disconnected/reconnecting.
- The host cannot unpause until every remaining player is connected and at least 2 players remain.
- Reconnect uses the same automatic reconnect and QR fallback model as sync draft.

If a player is removed during allocation:

- If fewer than 2 players remain, the game ends and returns home.
- The removed player's territories and troops are redistributed to the remaining players.
- If the removed player has submitted an army build, use that troop mixture plus the player's guaranteed leader.
- If the removed player has not submitted an army build, force a uniform army build with the removed player's effective triangle budget plus the player's guaranteed leader.
- Before redistribution, replace every removed leader troop with one random heavy, cavalry, or elite troop.
- The removed player's existing territory placements, if any, do not matter.
- The removed player's territories and troops are decoupled before redistribution.
- Shuffle the remaining players.
- Shuffle the removed territories.
- Shuffle the removed troops as individual troop items.
- Redistribute territories in round-robin order using the shuffled player order.
- Redistribute troops in round-robin order using the same shuffled player order, starting over at the beginning.
- This territory-first then troop redistribution guarantees every redistributed territory can receive at least one troop.

Recipient behavior:

- In sync mode, every player who receives redistributed territories or troops becomes unready, even if they were previously ready.
- In sync mode, affected players can rearrange all of their troops across all of their current territories before readying again.
- In local mode, players who already completed allocation and receive redistributed territories or troops get second allocation turns appended to the end of the local allocation order.
- In local mode, affected players can rearrange all of their troops across all of their current territories during the second allocation turn.
- Additional troops received from a removed player are added to the recipient's allocation pool. They do not increase or alter the recipient's army-build budget.

## Read-Only Game Map

After every remaining player has allocated troops, the app enters a read-only game map.

Visibility rules:

- Ownership is visible to everyone.
- Each viewer sees total troop counts on their own territories.
- Each viewer can select only their own territories.
- Selecting one of your own territories shows the heavy/cavalry/elite/leader breakdown in the top controls section.
- Opponent territories are not selectable.
- Opponent territories that have any connection to one of the viewer's territories show total troop count only.
- Opponent territory breakdowns are never shown in this milestone.
- Opponent territories with no connection to the viewer's territories show ownership only.
- Connections for visibility come from the territory key's gameplay connections, including both land and ship connections.
- Visibility connections are decoupled from physical shared borders in the generated map geometry.

Local read-only map:

- Because local mode is pass-and-play on one device, this milestone uses a temporary current-viewer dropdown at the top of the map.
- Changing the dropdown changes the viewer perspective and therefore troop-count visibility.
- Later turn play will replace this dropdown with handoff/confirm screens between players.

Sync read-only map:

- Each device uses that device's local player as the viewer.
- The host does not automatically see every player's troop breakdown.
- The host only sees the host player's own breakdowns, plus opponent total counts for territories connected to the host player's territories according to the same viewer rules.

## Map Generation Requirement

During drawing processing, each playable territory must receive a generated visual center.

- The visual center is the center of the large green circle marked inside that territory in the territory drawing.
- This generated center is stored in the territory object in app map data.
- Troop-count circles and any future map-local territory marker use this generated visual center.
- The app should not use territory seed points as troop marker positions.
- If a playable territory does not have exactly one detectable green center circle, generation should fail loudly rather than silently guessing.
