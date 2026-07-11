# Gameplay Turns V1

This milestone starts after initial troop allocation is complete. It replaces the temporary read-only map endpoint with the first real turn loop: spy, reinforcements, attack placeholder, and fortify placeholder.

The goal for this pass is to build the turn shell and the non-combat gameplay that is already well defined. Attack combat remains disabled until the later combat milestone.

## Phase Order

The app flow becomes:

```text
Home -> Setup and configuration -> Territory draft -> Troop allocation -> Turn loop -> Game over
```

The read-only map from `troop-allocation-v1.md` remains useful as a viewer mode and implementation stepping stone, but it is no longer the final gameplay state.

Players take turns in the configured setup turn order, skipping removed players. The game continues until one player owns all 42 playable territories. If fewer than 2 players remain after a removal, the game ends immediately.

There is no normal turn timer in this milestone. Draft timers and allocation timers remain as previously documented, but spy, reinforcements, attack choice, and fortify/end-turn do not use a turn timer.

## Turn Structure

A turn has three implemented stages plus one optional spy action:

1. Reinforcements.
2. Attack.
3. Fortify.

Spy is not a separate blocking phase. A player may use spy at any point during their turn when they are not in the middle of another action:

- before starting reinforcements
- after reinforcements and before choosing attack or fortify
- before or after any completed attack

Spy cannot be used:

- during reinforcement army build or reinforcement placement
- during an attack
- during fortify
- after fortify, because the turn is already over

For the first gameplay implementation:

- Reinforcements are fully implemented.
- Attack is visible but disabled.
- Fortify is available but simply ends the turn without moving troops.
- Local mode uses the existing handoff popup between turns.

## Turn Controls

The shared colored player bar remains at the top of the game screen. It shows the current player's name. There is no normal turn timer to show during this milestone.

A compact turn action bar sits in its own section below the map. It is not an overlay, so it pushes the map upward and remains visible during turn popups such as spy confirmation. Once the turn loop has started and a player is actively on turn, this section is always present for the active local viewer.

The turn action bar indicates the active turn options:

- A small spy button, using the Gollum/Smeagol icon for light-side players and the crow icon for dark-side players.
- A larger stage button that initially says `Reinforcements`.
- After reinforcements are complete, the stage area becomes `Attack` and `Fortify` buttons next to the spy button.

Pressing a stage button changes the current local action prompt. Pressing another stage button while choosing a spy target aborts the spy selection. Popups and modals may appear above the map area, but they should not cover or replace the persistent turn action bar.

## Gameplay Connections

All gameplay uses gameplay connections from `maps/territory-key.md`.

There is no gameplay distinction between land and ship connections. Both count for:

- spy distance
- same-opponent adjacent troop totals revealed by spy
- read-only troop total visibility
- future attacks and fortification where applicable

Physical shared borders from generated geometry are visual map data only. Mountains, forests, coastlines, and dotted ship-route art do not define gameplay adjacency in the app.

## Spy

Each player starts with one spy capability:

- Light-side colors (`green`, `blue`, `yellow`) use the Gollum/Smeagol icon.
- Dark-side colors (`red`, `purple`, `black`) use the crow icon.

The spy is not a troop and has no map location.

### Spy Targeting

When the spy button is active:

- only opponent territories are selectable
- any opponent territory may be selected because the gameplay graph is connected
- selecting a territory opens a compact confirmation sheet
- the sheet shows the territory name and the capture probability
- X cancels
- check confirms and rolls the spy attempt

The capture probability is based on the shortest gameplay-connection distance from the target territory to the nearest territory owned by the current player:

| Distance | Capture probability |
| --- | --- |
| 1 | 20% |
| 2 | 40% |
| 3 | 60% |
| 4 | 80% |
| 5 or more | 90% |

### Spy Failure

If the random sample captures the spy:

- no troop information is revealed
- show a brief notification that the spy was captured
- the spy button becomes disabled
- the captured spy remains unavailable until the player gains control of the territory where the spy was captured

In sync mode, the defender whose territory captured the spy also receives a local notification: `{spy owner name}'s spy was captured in {territory name}`. Successful spy attempts are silent to the defender; the defender must not be told they were spied on.

If the player later captures or receives that territory, the spy becomes available immediately, including during the same turn.

### Spy Success

If the spy is not captured:

- reveal the exact heavy/cavalry/elite/leader breakdown of the selected opponent territory
- reveal total troop counts, but not breakdowns, for territories adjacent to the selected territory that are owned by that same opponent
- show those adjacent totals through the normal white map troop counters
- replace the bottom turn buttons with a dismiss button

The player may inspect the spy information for as long as they want. Pressing dismiss clears all spy intel and returns to the turn controls.

Spy intel is a temporary UI view. It does not become permanent memory in the app unless a future notes/history feature is intentionally added.

## Reinforcements

Reinforcements are required before attack/fortify options become available.

The reinforcement flow reuses the initial allocation mechanics:

1. Build the controllable reinforcement army with the triangle.
2. Add all reinforcement troops to owned territories.
3. Advance to the attack/fortify choice.

### Territory Budget

The controllable reinforcement budget is based on the number of territories owned at the beginning of the current player's turn:

```text
territoryBudget = max(3, floor(ownedTerritoryCount / 3))
```

Examples:

| Owned territories | Territory budget |
| --- | --- |
| 1-11 | 3 |
| 12-14 | 4 |
| 15-17 | 5 |
| 18-20 | 6 |
| 21-23 | 7 |
| 24-26 | 8 |
| 27-29 | 9 |
| 30-32 | 10 |
| 33-35 | 11 |
| 36-38 | 12 |
| 39-41 | 13 |
| 42 | 14 |

The controllable reinforcement army uses the same fixed-point candidate-selection model as initial army build, but with no leader:

- budget scale: `5` cost units per budget point
- heavy cost: `4`
- cavalry cost: `5`
- elite cost: `6`
- effective budget units: `territoryBudget * 5`

The triangle chooses only the heavy/cavalry/elite breakdown for this controllable budget. A new leader is never gained during reinforcements.

### Region Bonuses

Region bonuses are fixed troops added on top of the controllable territory-budget army. The player cannot choose their type.

A region bonus is awarded only when the player owns every playable territory in that region at the beginning of the current player's turn.

| Region | Bonus |
| --- | --- |
| Eriador | 6 elite |
| Rhovanion | 5 elite |
| Gondor | 5 cavalry |
| Rohan | 3 cavalry |
| Rhun | 4 heavy |
| Mordor | 3 heavy |

The army-build modal shows total reinforcement troops above the triangle, including both controllable troops and fixed region bonus troops. Only the territory-budget troops respond to the triangle marker.

Region bonus troops should use the same fixed/additive troop-pool mechanics already used for troops inherited from removed players.

### Reinforcement Placement

Reinforcement placement uses the same compact two-row allocation controls as initial allocation, with one important difference:

- troops that existed before the reinforcement action started cannot be removed
- only troops added during the current reinforcement action can be removed while reinforcing

The selected-territory row still shows the territory's total troops, including troops that existed before reinforcements. Minus buttons are enabled only for troop types that include troops added during the current reinforcement action.

The player may place reinforcement troops on any territories they own. There is no one-new-troop-per-territory requirement during reinforcements. The action is complete only when all new reinforcement troops have been placed.

During sync reinforcements, the active player sees local reinforcement edits immediately. Other devices do not see those provisional troop changes. The host and other players receive the updated troop state only after reinforcements are finalized and committed.

If a player removal cancels the current reinforcement action, the entire reinforcement action is undone. The player may restart reinforcements after the game resumes, using the updated ownership and troop state.

## Attack

Attack is part of the turn structure, but it is disabled in the first gameplay-turn implementation.

The later attack milestone will implement the full source/target selection, committed attackers, prediction triangle, arrow challenge, weighted dice, casualty sampling, conquest, give-up, and post-battle reveal rules from `GAME_SPEC.md`.

Until then:

- the attack button is visible after reinforcements
- the attack button is disabled
- no attack state is created
- players advance by choosing fortify

## Fortify

Fortify is a placeholder in the first gameplay-turn implementation.

For now:

- pressing fortify ends the current player's turn
- no territory selection is required
- no troops move
- the next remaining player begins their turn

The later fortify milestone will implement the full one-target fortification action.

## Sync Viewer Rules

Sync mode follows the previously established host-authoritative contract exactly.

During another player's turn, inactive sync devices show only the map using the same viewer-specific visibility rules as the current explore/read-only view:

- ownership is visible
- the viewer's own territory total markers are visible
- opponent total markers are visible only where the viewer has gameplay adjacency
- own territory breakdowns are visible only through local inspection
- opponent territory breakdowns are not visible except during that viewer's own successful spy intel
- no turn action controls are shown
- no pending selection, focus, confirmation, or provisional reinforcement placement from the active player is shown

Sync devices update from committed host facts only. Host snapshots are viewer-specific during turns: the active player may receive their private spy intel or active action sub-state, while passive viewers receive the same committed map facts with private turn sub-state removed. Verification should include live connected active-turn and passive-turn sync screenshots so this privacy boundary remains visible.

- after reinforcements are finalized
- after future attacks resolve or otherwise commit
- after fortify/end-turn commits
- after player removal and redistribution commits

The active player's provisional reinforcement edits are local to that player until commit. Spy target selection, spy confirmation sheets, and successful spy intel are also local/private. The only defender-facing spy event is the failed-spy captured notification.

## Player Removal During Gameplay

Player removal during gameplay uses one shared authoritative redistribution rule for local and sync.

In local mode:

- the regular X ends the whole game after confirmation
- individual players can be removed only from the pause modal

In sync mode:

- the host removes players from pause
- a graceful quit during gameplay pauses the game and removes that player
- an ungraceful disconnect pauses the game but does not remove that player unless the host later removes them

After any gameplay removal, the game is paused immediately. If fewer than 2 players remain, the game ends instead.

Verification should include a paused gameplay removal case that proves removed territories are reassigned, removed-player leaders are converted to regular troops, active reinforcement state is canceled, and the game remains paused for resume.

### Removed Player Pool

Collect all removed-player territories and all removed-player troops:

- every territory currently owned by the removed player
- territories captured by that player during the current turn
- all placed troops
- all unplaced troops
- all reinforcement troops acquired during the current turn

If the removed player was due to receive reinforcements but had not built the reinforcement army yet, choose a uniform reinforcement mixture before collecting their troops.

If the removed player was partway through reinforcements, include both placed and unplaced reinforcement troops in the removed-player troop pool.

Leaders are not redistributed as leaders. Every removed wizard or witch-king is randomly replaced with one heavy, cavalry, or elite troop before redistribution.

### Redistribution Algorithm

Redistribution happens instantly when the player is removed:

1. Put all removed-player troops into one troop pool.
2. Put all removed-player territories into one territory pool.
3. Shuffle the territory pool.
4. Shuffle the troop pool as individual troop items.
5. Place troops onto the removed-player territories one at a time in round-robin territory order.
6. Shuffle the now-populated territory pool again.
7. Shuffle the remaining player order.
8. Distribute populated territories to remaining players in round-robin player order.
9. Keep the game paused until resume.

This means troops are distributed across the removed player's old territories first, and only then are those populated territories assigned to remaining players.

### Resume Rules

When the game resumes:

- removed players are skipped in turn order
- if the removed player was current, the next remaining player after them in the configured turn order starts
- if the current player was not removed, that player resumes from the same turn stage unless an active action was canceled

Action cancellation rules:

- active spy intel is canceled and the spy survives
- active reinforcements are canceled and undone
- active fortify is canceled
- active attacks are not canceled when attacks exist later; they continue from their locked state

If a captured spy's capture territory is assigned to that spy's owner through redistribution, the spy returns immediately.

## Sync And Persistence Notes

The host remains authoritative for gameplay turns in sync mode.

Committed gameplay facts should be sent promptly enough that the host can resume from its own model:

- turn start
- spy result, spy capture territory, and failed-spy defender notification
- reinforcement army submission
- finalized reinforcement troop placements
- fortify/end-turn result
- player removal and redistribution
- future attack lock and battle state

Transient presentation state remains local:

- selected map territory
- camera position
- focus animation
- open confirmation sheet
- spy target hover/preview before confirm
- dismissed or visible intel panel state after the host-authoritative spy result is known
