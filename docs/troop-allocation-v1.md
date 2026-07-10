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
- Army costs use fixed-point integer units so changing costs does not introduce floating-point errors. The current scale is `5` units per budget point:
  - leader: `5` units (`1.0` budget)
  - heavy: `4` units (`0.8` budget)
  - cavalry: `5` units (`1.0` budget)
  - elite: `6` units (`1.2` budget)
- The regular-troop budget is `(startingBudget * 5) - 5` cost units after reserving the leader.
- Generate every nonnegative integer heavy/cavalry/elite army that stays within that regular-troop budget and leaves fewer than `4` units unused. Because `4` is the cheapest regular troop, no generated army can add another troop without exceeding its budget.
- Compare each candidate's actual troop ratios with the marker percentages using the sum of the three squared ratio differences. Choose the candidate with the smallest error.
- If ratio errors tie, choose the candidate with less unused budget. Remaining exact ties resolve deterministically in heavy, cavalry, elite order.
- This budget-maximal rule prevents moving the marker from producing an army that keeps every existing troop and receives an additional troop for free.
- A corner is a strongest-possible preference for that troop class. Integer budget constraints may still add another class when a literally pure army would leave enough budget to buy another troop.
- A final count of `0` for any troop class is valid.
- While the marker moves, the UI shows live final heavy/cavalry/elite counts plus the guaranteed leader as four circular troop icons with count badges above the triangle.
- Once the player submits the army build, the heavy/cavalry/elite counts plus the guaranteed leader become that player's base army.

Inherited troops from removed players are additive. They do not change the player's budget and they do not get converted into budget. Leaders from removed players are not inherited as leaders; each removed wizard or witch-king is randomly replaced with one heavy, cavalry, or elite troop before redistribution. If a player selected a `100%` cavalry mixture and later receives `2` heavy and `1` elite from a removed player, their live allocation pool shows their original cavalry count, their original leader, plus the inherited `2` heavy and `1` elite.

All starting budgets, the fixed-point scale, the leader cost, and regular troop costs are kept together in `src/game/armyBuild.ts`. Future cost tuning should change those rule constants rather than the candidate-selection algorithm.

## Territory Allocation

After locking the army build, the player allocates all available troops to territories they own.

Allocation rules:

- A player may select only territories they own.
- Selecting a territory highlights it. If automatic focus is enabled, the map also focuses on that territory.
- The selected allocation territory is local UI state. In sync mode, selecting a territory for allocation does not highlight or focus any other device.
- Every owned territory must have at least one troop total before the player can finish.
- Allocation uses the shared colored game top bar: X on the left, current player name prominent near the left, timer near pause when present, and pause on the right in local mode or for the sync host.
- The colored player bar is not the same thing as the controls section. It remains visible during allocation pause, waiting, handoff, and read-only map; the controls below it may hide.
- The timer remains in the player bar whenever relevant, including paused remaining time, the time that will start after a local handoff, and shared sync allocation time while ready players wait.
- The selected territory controls show two compact icon rows: remaining troops for adding and troops on the selected territory for removing.
- The selected territory name is shown in bold between the add and remove rows, but its total troop count is not repeated in the controls because the map marker already shows that total.
- The `+` and `-` row icons are non-clickable affordances. They are muted only when no troop in that row can currently be added or removed.
- The circular troop icons are the action targets: tap a remaining troop icon to add one troop, or tap a selected-territory troop icon to remove one troop.
- The player can remove any number of troops from the selected territory.
- The player can add any number of remaining troops to the selected territory, but only if the total remaining troop count after the add is at least the number of still-empty owned territories.
- This rule guarantees that every empty territory can still receive at least one troop.
- During allocation, troop-count circles appear on all territories owned by the allocating player.
- Territory marker positions come from generated territory visual centers, not from old territory seed points.
- Sync allocation updates share actual troop placement, army build, and readiness data only. They do not include selected-territory inspection state.

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
- After each player finishes, the app shows the next player's name in the top bar and a handoff popup with only a continue arrow before that player begins.
- If a player who already finished allocation later receives redistributed territories or troops, they get a second allocation turn appended to the end of the local allocation order.
- During a second allocation turn, the player can rearrange all of their troops across all of their current territories. Their previous placements remain where they were until the player changes them.

## Sync Allocation

Sync mode is simultaneous and host-authoritative.

- Every player builds and allocates on their own device at the same time.
- The troop allocation timer includes both army build and territory allocation.
- The host owns the canonical allocation timer.
- The host remains in shared `phase: "allocation"` until it starts the read-only map; the ready page is local UI derived from this device's ready flag.
- If the timer is unlimited, there is no timer and no automatic random completion.
- When a player finishes, they press ready.
- Ready is final. Players cannot manually unready.
- A ready player's allocation remains final even if a stale sync update arrives from that device.
- Ready players go to a local waiting page while unready players stay in allocation.
- The waiting page shows all remaining players in two columns: `READY` and `WAITING`.
- The waiting page keeps the same colored top bar for the player whose device it is and shows the shared allocation timer whenever it is relevant.
- All players can see readiness status, not only the host.
- The host can advance only after every remaining player is ready.
- One player becoming ready does not stop the shared timer for the remaining players.
- If the host-authoritative timer expires, the host randomly completes allocation for every unready player using the same random completion rules as local mode.
- Host random completion is final and cannot be overwritten by later stale allocation updates from an unready player's device.
- Joiners send allocation updates as commands. The host accepts them only during allocation, only for that player, and never over a ready or random-completed allocation.
- Allocation updates are committed game facts, not visual UI. They should be sent often enough that the host can resume from its authoritative model if a device disconnects, but not so noisily that every pointer gesture or modal change is synced.
- Add/remove troop changes may be batched or lightly throttled, but they must be flushed on ready, pause, visibility change, or page unload where practical.
- Selected territory, map camera, focus state, open army modal, and local control layout are never synced.

## Allocation Pause, Disconnect, And Removal

Sync allocation uses the same pause/reconnect model as sync draft:

- Any ungraceful disconnect during sync allocation forces pause.
- The host first marks that player `reconnecting` for 10 seconds. If automatic reconnect fails from the host's perspective, the host marks them `disconnected`.
- The joiner independently enters local `reconnecting` when heartbeat with the host fails. If automatic reconnect fails from the joiner's perspective, the joiner returns home.
- The disconnected player remains in the host game and can return only through the sync pause recovery QR.
- Recovery QR tools are host-only. Non-host pause screens must not show a blank QR placeholder.
- The host cannot unpause until every remaining player is connected and at least 2 players remain.
- Joiners cannot continue allocating while reconnecting. Their controls and latest map may remain visible only as inert background behind the blocking reconnecting UI.
- If automatic reconnect fails, the joiner returns home and must rejoin through the host pause recovery QR.
- Joiner reconnecting UI must not show current roster, timer, ready, or allocation status, because those facts belong to the host and the device is no longer connected to host truth.
- If a joiner is still connected and the host game is paused, the joiner may show the host-authored pause/ready roster because heartbeat and snapshots are still healthy.

Local allocation pause and recovery:

- Manual local pause freezes the allocation timer and preserves army build, territory selection, pending counts, and placed troops.
- Local refresh or close during allocation restores into local pause with the allocation timer stopped and remaining time preserved.
- Local mode has no reconnecting, disconnected, recovery QR, or connection status concepts.

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
- Each viewer can select any territory to show its name in the top controls section.
- Selecting one of your own territories also shows the heavy/cavalry/elite/leader breakdown.
- Selecting an opponent territory never shows that territory's breakdown.
- Opponent territories that have any connection to one of the viewer's territories show total troop count only.
- Opponent territory breakdowns are never shown in this milestone.
- Opponent territories with no connection to the viewer's territories show ownership only.
- Connections for visibility come from the territory key's gameplay connections, including both land and ship connections.
- Visibility connections are decoupled from physical shared borders in the generated map geometry.

Local read-only map:

- Because local mode is pass-and-play on one device, pressing the player name in the top bar cycles the current viewer.
- Cycling the viewer changes the viewer perspective and therefore troop-count visibility.
- Later turn play will replace this viewer-cycling shortcut with handoff/confirm screens between players.

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
