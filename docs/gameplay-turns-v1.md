# Gameplay Turns V1

This milestone starts after initial troop allocation is complete. It replaces the temporary read-only map endpoint with the real turn loop: spy, reinforcements, attack, and fortify.

The shared troop/captured-spy display and full fortify action are implemented in this milestone. Future work should build on those shared rows and the final fortify command contract instead of adding phase-specific fortify panels.

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

The turn-loop scope is:

- Reinforcements are fully implemented.
- Attack is implemented with source/target selection, committed attacking troops, attack-style scoring, tilted dice, live casualties, retreat, conquest, and a final dismiss button.
- Fortify is implemented as a one-target movement action with optional skip.
- Local mode uses the existing handoff popup between turns.

## Turn Layout

The shared colored player bar remains at the top of the game screen. It shows the current player's name. There is no normal turn timer to show during this milestone. In sync mode, passive devices use the owning device player's name/color while viewing another player's turn.

When the current viewer is not in the middle of an action, map inspection uses the troop section in `info` mode:

- By default no territory is selected and the troop section is hidden.
- Selecting any territory opens the troop section.
- Pressing the selected territory again unselects it and hides the troop section.
- The troop section shows the territory name and follows the shared unit-icon display contract below.
- Own territories show exact contents.
- Opponent territories show unknown contents unless this viewer has successful spy intel for that territory.
- Passive sync devices use this same default inspection mode during opponent turns.

A compact turn action section sits at the bottom of the screen over the full-screen map. It is persistent turn UI, not a modal overlay, so it changes the visible map aperture used by focus/return actions but does not resize the SVG or mutate the current camera. Once the turn loop has started and a player is actively on turn, this section is normally present for the active local viewer. It hides while a modal, popup, bottom sheet, pause, scanner, handoff, notification, or decision confirmation takes over the interaction.

The action section has a single-line instruction row above the buttons:

- When no action is selected, the instruction is `Choose an action`.
- When spy targeting is selected, the instruction is `Select a territory to spy on`.
- While successful spy intel is visible, the instruction is `View territory`.
- During reinforcement placement, the instruction is `Select a territory` until an owned territory is selected, then `Add troops to {territory}`.
- During attack source selection, the instruction is `Select a territory to attack from`.
- During attack target selection, the instruction is `Select a territory to attack`.
- During attack troop commitment, the instruction is `Choose attacking troops`.
- During fortify target selection, the instruction is `Select a territory to fortify`.
- During fortify source selection, the instruction is `Select territories to fortify from`.

When spy setup is in progress, the normal action buttons are replaced by one black, horizontally centered `Cancel Spy` button. When attack setup is in progress, they are replaced by one black, horizontally centered `Cancel Attack` button. When fortify setup is in progress, they are replaced by a black, horizontally centered `Cancel Fortify` button and a black `Skip` button. `Skip` ends the turn immediately without confirmation and without moving units. The action bar keeps the same height as the normal turn action bar while centering the cancel/skip controls.

The turn action section indicates the active turn options:

- A small spy button, using the Gollum/Smeagol icon for light-side players and the crow icon for dark-side players.
- A larger stage button that initially says `Reinforcements`.
- After reinforcements are complete, the stage area becomes `Attack` and `Fortify` buttons next to the spy button.

Pressing a stage button changes the current local action prompt. Pressing another stage button while choosing a spy target aborts the spy selection. Starting, canceling, or finishing an action clears the default map inspection selection so the normal map explorer never resumes with an action territory preselected. Popups and modals may appear above the map area, but they should not cover the player bar.

In allocation-style troop rows, the `+` and `-` icons are buttons. Pressing one moves as many currently legal units as possible, while the individual unit icons remain one-at-a-time controls. When a bulk action must leave a troop behind, it leaves one troop using priority: heavy, then cavalry, then elite, then leader.

## Gameplay Connections

All gameplay uses gameplay connections from `maps/territory-key.md`.

There is no gameplay distinction between land and ship connections. Both count for:

- spy distance
- same-opponent adjacent troop totals revealed by spy
- read-only troop total visibility
- attacks and fortification where applicable

Physical shared borders from generated geometry are visual map data only. Mountains, forests, coastlines, and dotted ship-route art do not define gameplay adjacency in the app.

## Unit Icon Display

All troop and captured-spy rows use one shared display contract. This applies to initial allocation, reinforcements, normal explore/info mode, successful spy intel, attack troop commitment, battle modal rows, battle result rows, and fortify.

When exact contents are unknown:

- show exactly the four side-aware troop icons: heavy, cavalry, elite, and leader
- use the selected territory owner's side/color to choose light or dark icon art
- disable/gray every icon
- show `?` in every count bubble
- never show captured spy icons

When exact contents are known:

- show only troop icons whose count is greater than zero
- show captured spy icons only for captured spies actually present in that row/location
- captured spies appear inline with troop icons, not in permanent empty spy slots
- center the visible icon group
- if a row has more than five icons because captured spies are present, it may wrap into a second centered line
- the maximum visible row is nine icons: four troop types plus five opponent spies
- any `+` or `-` row affordance is outside the centered icon group and must not affect centering

Rows that are structurally required by an action keep their reserved row height even when they contain no icons. In initial troop allocation, this can happen before a selected territory has any troops; the row is empty, the `+` or `-` affordance is not shown, and the row still occupies exactly the same space. Information rows may be hidden entirely when no territory is selected, but once a selected territory opens the troop section, the selected territory and its visible/unknown unit row must render as a complete `info` mode section.

Attack troop commitment is the one known-content action row that intentionally does not show captured spies. It shows only movable attacking troops from the source because captured spies cannot attack.

## Spy

Each player starts with one spy capability:

- Light-side colors (`green`, `blue`, `yellow`) use the Gollum/Smeagol icon.
- Dark-side colors (`red`, `purple`, `black`) use the crow icon.

The spy is not a troop and does not count toward troop totals. A spy can be available, captured, or dead.

Available spies can make spy attempts. Captured spies are board objects on a territory. Each captured spy stores the spy owner, current custodian, and current territory. Captured spies are visible whenever a viewer is allowed to inspect the detailed unit contents of that territory. This includes the territory owner through normal inspection and another player during a successful spy on that territory.

Captured spies use committed circular captured-spy PNG icons with black vertical prison bars. The icon ring is colored by the spy owner's player color. Captured spies cannot be used for spy attempts, cannot attack, and do not count toward troop totals. Captured spies can move during fortify under the fortify rules below, but they still cannot attack and still do not count as troops.

### Spy Targeting

When the spy button is active:

- only opponent territories are selectable
- any opponent territory may be selected because the gameplay graph is connected
- selecting a territory opens the shared compact bottom `ConfirmSheet`
- the sheet shows the territory name and the capture probability
- X cancels
- check confirms and rolls the spy attempt
- while the confirmation sheet is open, the map is frozen, manual pan/zoom controls are hidden, and troop/action sections are hidden
- spy targeting is canceled through the confirmation sheet X, not by tapping the already-selected target

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
- queue a blocking notification for the spy owner: `Your spy was captured in {territory}`
- place the spy on the target territory as a captured spy
- set the target territory owner as the spy custodian
- the spy button becomes unavailable and is missing while preserving its spacing
- the captured spy remains unavailable until released

The defender whose territory captured the spy receives a separate blocking notification: `You captured {spy owner}'s spy in {territory}`. Successful spy attempts are silent to the defender; the defender must not be told they were spied on.

Spy notifications are queued per affected player, persist through pause/refresh/reconnect, and are dismissed one at a time with a check button. They do not auto-dismiss. While one is open, the rest of the app is blocked.

In local mode, queued spy-captured notifications for other players appear only at the beginning of that affected player's turn, in the order received. In sync mode, the host queues the notification authoritatively and delivers it to the affected player even if that player was disconnected when it was created.

The captured spy remains on its current territory until released or moved by fortify. If the spy owner captures or receives that current territory, the spy becomes available immediately, including during the same turn. If another player captures or receives that territory, that player gains custody of every captured spy on it, and those spies remain captured on that same territory.

### Spy Success

If the spy is not captured:

- reveal the exact known contents of the selected opponent territory
- reveal any captured spies imprisoned on the selected opponent territory as part of that known-content row
- reveal total troop counts, but not breakdowns, for territories adjacent to the selected territory that are owned by that same opponent
- show those adjacent totals through the normal white map troop counters
- show the selected opponent territory through the troop section in `info` mode, using the same exact-count UI that own territories use
- replace the bottom action buttons with a dismiss button

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
| Rhûn | 4 heavy |
| Mordor | 3 heavy |

The army-build modal shows total reinforcement troops above the triangle, including both controllable troops and fixed region bonus troops. It uses the shared known-content icon row: troop types whose count is `0` are hidden and the remaining icons are centered. The modal is wide enough to keep the large count row on one line without shrinking icons, so changing the marker does not make the modal height jitter. Only the territory-budget troops respond to the triangle marker. Because reinforcements never add a leader, the leader icon is hidden unless a future rule creates a nonzero leader count.

Region bonus troops should use the same fixed/additive troop-pool mechanics already used for troops inherited from removed players.

### Region Control Notifications

Region control notifications are affected-player-only and use exact plain wording:

- `You control Eriador`
- `You lost Eriador`

The same wording applies to all six regions. Region notifications are queued per affected player, persist through pause/refresh/reconnect, block the app until dismissed, and are shown one at a time in received order.

At the start of the turn loop, region control is computed from the drafted map. If a player drafted an entire region and still controls it at the beginning of their first turn, that player receives the corresponding `You control {region}` notification.

During future combat, gaining a region on your own turn should notify immediately. Losing a region, or gaining/losing a region because another player was removed or because an opponent action changed ownership, should be queued until the affected player's next turn in local mode. In sync mode, the host may deliver the affected player's notification immediately after the committed ownership change, except for first-turn drafted-region notifications which are still shown at that player's first turn.

### Reinforcement Placement

Reinforcement placement uses the same compact two-row allocation controls as initial allocation, with one important difference:

- troops that existed before the reinforcement action started cannot be removed
- only troops added during the current reinforcement action can be removed while reinforcing
- the troop section is hidden until the active player selects an owned territory
- pressing the selected territory again unselects it and hides the troop section

The placement controls follow the shared known-content icon contract. The top row shows only remaining reinforcement troop types whose counts are greater than zero. Reinforcements never create a new leader, so the leader icon is absent unless a count is actually present from a future rule. The selected-territory row shows the territory's total known contents, including troops that existed before reinforcements and any captured spies on that territory. Minus buttons are enabled only for troop types that include troops added during the current reinforcement action. Captured spies may be visible in the selected-territory row when present, but they are not removable during reinforcement placement.

The player may place reinforcement troops on any territories they own. There is no one-new-troop-per-territory requirement during reinforcements. The action is complete only when all new reinforcement troops have been placed.

During sync reinforcements, the active player sees local reinforcement edits immediately. Other devices do not see those provisional troop changes. The host and other players receive the updated troop state only after reinforcements are finalized and committed.

If a player removal cancels the current reinforcement action, the entire reinforcement action is undone. The player may restart reinforcements after the game resumes, using the updated ownership and troop state.

## Attack

After reinforcements are complete, the active player may make any number of attacks before fortifying. The active player may also skip attacking and go directly to fortify.

An attack is a locked commitment from one owned source territory into one connected opponent-owned target territory.

### Attack Style

Setup includes an `ATTACK STYLE` configuration section with one dropdown:

- `Challenge`
- `Regular`

`Challenge` and `Regular` are both selectable.
The default is `Regular`.

In `Regular` mode, both sides receive deterministic combat scores from their committed battle troop mixture.

In `Challenge` mode:

- The attacker always receives a challenge modal.
- In sync mode, the defender also receives a challenge modal.
- In local mode, the defender receives a deterministic score even when attack style is `Challenge`.
- The temporary challenge modal contains one centered button.
- The challenge button, and later the challenge itself, is the only content in the modal; it is not embedded inside the regular battle layout.
- Pressing the challenge button immediately samples and submits that player's score from the configured beta score distribution.
- The player does not see their challenge score before submission.
- Once submitted, that score is fixed for the battle.
- If one side is still waiting on a challenge score, the battle modal shows a waiting message and the dice controls remain disabled.

The future skill challenge must produce or evaluate a score from the same beta distribution. The current placeholder button exists only to sample that distribution directly.

### Attack Setup

Pressing `Attack` begins local attack setup.

Attack setup is local UI until the attacking troop commitment is confirmed. It can be canceled at any point before confirmation.

Once `Attack` is pressed, the action bar buttons are replaced with one cancel button. That cancel button is the only way to cancel attack setup. Canceling clears the attack source, target, committed troops, and default map inspection selection.

The setup steps are:

1. Select the territory to attack from.
2. Select the territory to attack.
3. Choose attacking troops.
4. Confirm the attack.

Rules:

- The source territory must be owned by the active player.
- The target territory must be owned by an opponent.
- The source and target must be connected by gameplay connection.
- All gameplay connections from `maps/territory-key.md` count, including ship connections.
- Physical generated borders do not define attack legality.
- The source territory must contain at least two troops.
- The attack must commit at least one troop.
- The attack must leave at least one troop behind in the source territory.
- Any subset and mixture of heavy, cavalry, elite, and leader troops may be committed.
- Captured spies on a territory do not count as troops and cannot attack.
- The same source-target pair may not be attacked more than once in the same turn.

The source-target restriction is not meaningfully directional in normal play because the active player cannot attack their own territories and cannot lose territories during their own turn. Once a source-target pair is committed, that pair is blocked for the rest of the turn even if the attacker retreats, loses, or captures the target.

During setup:

- After the source is selected, it remains highlighted.
- Selecting the source does not open a confirmation sheet; the action immediately advances to target selection.
- After the target is selected, both source and target remain highlighted.
- Selecting the target does not open a confirmation sheet; the action immediately advances to troop commitment.
- During troop commitment, the troop section uses allocation mode.
- The top row has the add symbol and shows troops currently on the attacking territory that are still available to commit.
- The bottom row shows committed attacking troops.
- The text between rows is `{source territory} to {target territory}`.
- The troop-section confirm/check button is disabled until at least one troop is committed and at least one troop remains behind in the source.
- The action bar remains visible and shows the setup instruction plus the cancel button.

Once attacking troops are confirmed, the attack is locked and must proceed. The troop section and action section hide. The challenge/battle modal appears as the active task modal. The player bar remains visible. The map is frozen, camera buttons are hidden, and no other action may happen until the battle is dismissed.

### Authoritative Battle State

Confirmed battle state is authoritative game state, not local presentation state.

The battle state must include:

- attack id
- attacker player id
- defender player id
- source territory id
- target territory id
- committed attacking troop counts
- defender troop counts at lock
- current surviving attacking troop counts
- current surviving defending troop counts
- attacker score, once submitted or computed
- defender score, once submitted or computed
- latest dice roll, if any
- whether at least one roll has happened
- terminal result, if the battle has ended

The active turn should also store the source-target pairs already attacked this turn.

Once a battle locks, scores are computed from the troop mixture at lock time and do not change as troops die. Uncommitted troops left behind in the source territory have no bearing on the attack score, dice, or casualties.

Committed attacking troops still visually count on the source territory while battle is active. Casualties reduce the source territory total live. If the attacker retreats, surviving committed troops remain on the source territory. If the attacker captures the target, surviving committed troops move from source to target at battle end.

The defender's battle force is every troop currently occupying the target territory at attack lock.

### Battle Modal

The battle modal is centered and uses the task-modal overlay role.

The defender is shown at the top of the modal, with the defender name centered above the defender troop row and the defender score centered below it. The attacker is shown at the bottom, with the attacker score centered above the attacker troop row and the attacker name centered below it. Scores render with one decimal and `/ 10`, for example `7.3 / 10`.

The dice sit between the two scores. Defender dice are white with black pips. Attacker dice are red with white pips. Dice are large raw dice controls without an enclosing card or rectangle. Before the first roll, the correct number of dice is shown as blank dice with no pips.

While the battle is active, the modal layout is a fixed vertical stack: reserved message row, defender name, defender troop row, defender score, dice, attacker score, attacker troop row, attacker name, and retreat button. The top message row is always present. It may be empty or say `Waiting...`.

Battle unit rows follow the shared known-content icon contract. They show troop types with counts greater than zero plus captured spies present with that battle force. The visible icons keep the normal compact icon size and recenter. If a side has no troops after the battle ends, that row renders no troop icons but still reserves the same vertical row space.

Both sides' current battle troop breakdowns are visible during the battle. Everyone who can see the battle modal sees the same battle contents, captured spies present with the battle forces, and which troop types die. Captured spies are not casualties and do not affect dice. The modal shows the latest roll only, not a full roll history. The latest roll always shows exactly the dice that were rolled; casualties change troop rows immediately and change the next roll's dice count, but they do not remove dice from the just-finished roll.

In sync mode:

- The attacker and defender see the same battle modal.
- Only the attacker can roll, retreat, or dismiss the final battle result.
- Other connected players do not see the battle modal.
- Other connected players stay in normal explore mode.
- Other connected players still see committed live map facts, such as territory troop totals changing after each roll and ownership changing after conquest.
- While the battle is active, other connected players see both the source territory and target territory flashing between selected and unselected visual states.
- The source/attacking territory flashes at a higher frequency.
- The target/defending territory uses a slower pulse.
- Non-participants may still select any territory in explore mode, including the source or target territory.
- If a non-participant selects the source or target territory while it is flashing, the battle flash overrides the regular selected-fill color for that territory.

In local mode, only the active attacker sees the battle modal. The defender does not receive a handoff or challenge because local challenge mode uses deterministic defender score.

The attacker must roll at least once. Before the first roll, the retreat button is disabled. After at least one roll, the attacker may retreat. Pressing retreat opens a confirmation decision. If retreat is confirmed, the attack ends immediately.

If the battle ends by conquest or attacker elimination, the normal battle layout is replaced by a simple result layout. It shows `{winner} defeated {loser}`, the winning side's resulting unit row centered below it, and the final check button. The result layout does not show scores, dice, the loser row, or the regular mirrored stack. If the defender wins, the result row shows surviving defending troops plus any captured spies that were already on the defended territory. If the attacker wins, the result row shows surviving attacking troops plus captured third-party spies from the conquered territory. A captured spy owned by the attacker is released immediately by the conquest and appears in this victory result row as the attacker's normal unbarred spy icon; after the result is dismissed, that released spy is no longer displayed in the territory because an available spy is not tied to one territory. Nothing else may happen until the attacker presses that final check button. If the attacker confirms a retreat, the battle ends immediately and the battle modal closes; no final retreat message is shown.

After battle dismissal, the active player returns to the normal post-reinforcement action choice with `Attack` and `Fortify` available, unless the game has ended. The active player may attack again if a legal source-target pair remains and the pair has not already been used this turn.

### Combat Score

Every battle side receives one score between `0` and `10`.

The score affects only that side's die distribution. It does not directly change troop count, casualty count, or the Risk-like comparison rules.

Troop score values are:

| Troop type | Score value |
| --- | ---: |
| Heavy | 2.5 |
| Cavalry | 5 |
| Elite | 7.5 |
| Leader | 9 |

The leader is intentionally better than elite but below the endpoint score of `10`, so a leader-only challenge distribution remains valid.

For troop counts:

```text
H = heavy count
C = cavalry count
E = elite count
L = leader count
```

The mean score is:

```text
mu = (2.5H + 5C + 7.5E + 9L) / (H + C + E + L)
```

This requires at least one troop in the battle force.

In regular mode, the battle score is deterministic:

```text
S = mu
```

In challenge mode, the battle force defines a beta distribution over scores. Let:

```text
p = mu / 10
kappa = 20
alpha = kappa * p
beta = kappa * (1 - p)
Y ~ Beta(alpha, beta)
S = 10Y
```

With leader score `9`, a leader-only force has:

```text
p = 0.9
alpha = 18
beta = 2
```

The beta score distribution has mean `mu`. Larger `kappa` would make challenge scores cluster more tightly around `mu`; smaller `kappa` would make challenge outcomes more variable. The current implementation target is `kappa = 20`.

### Score To Dice

Scores are converted into role-specific tilted six-sided dice.

First center the score:

```text
q(S) = (S - 5) / 5
```

Attacker tilt:

```text
tA(S) =
  kAminus * q(S), if 0 <= S <= 5
  kAplus  * q(S), if 5 < S <= 10
```

Defender tilt:

```text
tD(S) =
  kDminus * q(S), if 0 <= S <= 5
  kDplus  * q(S), if 5 < S <= 10
```

Calibrated constants:

| Constant | Value |
| --- | ---: |
| `kAminus` | 0.14331904306524929 |
| `kAplus` | 0.27527774317548487 |
| `kDminus` | 0.11630715538926006 |
| `kDplus` | 0.21211393558380784 |

For a die face `j` in `{1, 2, 3, 4, 5, 6}`:

```text
P_t(j) = exp(t * (j - 3.5)) / sum(r = 1..6) exp(t * (r - 3.5))
```

At score `5`, tilt is `0` and the die is fair. Above `5`, higher faces become more likely. Below `5`, lower faces become more likely.

The tilt constants are role-specific because attackers can roll up to three dice, defenders can roll up to two dice, and ties favor the defender.

### Dice Rolls

For each battle roll:

```text
attackerDice = min(3, surviving committed attacking troops)
defenderDice = min(2, surviving defending troops)
comparisonCount = min(attackerDice, defenderDice)
```

Roll all dice from the appropriate tilted distribution. Sort attacker dice high-to-low and defender dice high-to-low. Compare the highest dice side by side.

For each comparison:

- if the attacker die is strictly greater, the defender loses one troop
- otherwise, the attacker loses one troop

Ties favor the defender.

The number of troops that die in one roll is always `comparisonCount`.

### Casualties

When a troop is lost, randomly sample one troop from that side's remaining battle force.

Rules:

- Heavy, cavalry, and elite troops are sampled uniformly by individual troop.
- Leaders are excluded from casualty sampling while any non-leader troop remains on that side.
- A leader can die only if it is the last remaining troop on that side.
- Captured spies are not troops and are never casualty candidates.

Examples:

- If a force has `2 heavy`, `1 elite`, and no leader, a casualty has a `2/3` chance to be heavy and `1/3` chance to be elite.
- If a force has `1 heavy` and `1 leader`, the heavy must die before the leader can die.
- If a force has only `1 leader`, the leader can die.

When an attacking troop dies, subtract it from the surviving committed attackers and from the source territory. When a defending troop dies, subtract it from the surviving defenders and from the target territory.

### Battle End

Battle ends in one of three ways:

1. All defending troops die.
2. All committed attacking troops die.
3. The attacker retreats after at least one roll and confirmation.

If all defending troops die:

- the attacker conquers the target territory
- all surviving committed attacking troops move from source to target
- uncommitted source troops remain in source
- the target territory changes owner to the attacker
- captured-spy custody/release rules run for the conquered territory
- region control changes and elimination checks run after ownership changes

If all committed attacking troops die:

- the target remains owned by the defender
- the source keeps only the troops that were left behind
- the attacker may continue attacking elsewhere after dismissing the final result

If the attacker retreats:

- surviving committed attacking troops remain on the source territory
- the target remains owned by the defender
- the same source-target pair remains blocked for the turn
- the attacker may continue attacking elsewhere after dismissing the final result

### Pause, Refresh, And Removal During Battle

Pause must preserve locked attacks.

Snapshots must preserve:

- source territory
- target territory
- committed attacking troops
- surviving attacking troops
- surviving defending troops
- attacker score, if already submitted/computed
- defender score, if already submitted/computed
- latest roll
- whether at least one roll has happened
- terminal result, if present
- used source-target pairs for the turn

Completed scores persist through pause, refresh, and reconnect. If the game pauses while a player is still inside an unfinished challenge, that unfinished challenge is restarted on resume. The score is not sampled until the challenge button is pressed and submitted.

The normal pause button is disabled while this device is actively doing its challenge interaction. Forced pause can still happen because of refresh/close or sync disconnect. Local refresh/close during a challenge restores into pause. Sync disconnect during a challenge pauses the host game like any other disconnect.

If a player is removed during gameplay while an attack is active:

- active attacks are not canceled
- if the removed player is not participating in the active battle, the battle continues from its locked state after redistribution/pause handling
- if the removed player is the attacker or defender in the active battle, the implementation must resolve this explicitly before resume; the host must not leave a battle requiring input from a removed player
- if fewer than two players remain, the game ends

## Fortify

Fortify is optional and happens after the active player is done attacking. Once the player advances to fortify, there is no return to attack.

Pressing `Fortify` begins local fortify setup. The regular action buttons are replaced by:

- a black, horizontally centered `Cancel Fortify` button
- a black `Skip` button

`Cancel Fortify` resets the whole fortify action and returns to the post-reinforcement action choice. `Skip` has no confirmation; it ends the current player's turn immediately without moving units.

Fortify setup is local UI until the final fortify confirmation. Sync passive viewers do not see the active player's fortify target, source selections, provisional moves, focus, troop section, or action prompt. They see only committed host facts after fortify/end-turn commits.

### Fortify Steps

The setup steps are:

1. Select the owned target territory to fortify.
2. Select one or more owned source territories to fortify from.
3. Move legal units from selected sources into the target.
4. Confirm the fortify action, or press `Skip` before confirmation to end the turn without fortifying.

Instruction text:

- before target selection: `Select a territory to fortify`
- after target selection and before choosing a source: `Select territories to fortify from`
- while a source is selected and the troop section is open: keep the fortify-source instruction in the action section while the troop section names the current movement as `{source} to {target}`

Only the target and currently selected source need to be emphasized as local setup selections. The target remains selected while choosing and switching sources. Pressing a selected source again unselects that source but keeps the fortify target.

### Fortify Source Eligibility

The target must be owned by the active player.

A source territory is eligible if:

- it is owned by the active player
- it is not the target
- it is connected to the target through a chain of territories all owned by the active player

This chain uses gameplay connections from `maps/territory-key.md`, including ship connections. Physical map borders are irrelevant.

Immediate connection matters for which units can move:

- An immediately connected source is directly connected to the target by one gameplay edge.
- A remote source is connected to the target through owned territory chains but is not directly connected to the target.

### Fortify Movement Rules

Every source must leave at least one troop behind. Captured spies do not count as troops, so moving spies never satisfies or violates the one-troop-left requirement by itself.

Cavalry:

- cavalry may be moved from any eligible source, including remote sources
- cavalry may come from any number of eligible sources
- there is no single-source limit for cavalry

Regular troops:

- heavy, elite, and leader troops can move only from an immediately connected source
- exactly one source may contribute regular troops during a fortify action
- once one source has contributed any regular troop, regular troop buttons are disabled for every other source
- if all regular troops are removed from the committed movement for that source, another immediately connected source may become the regular source
- the leader counts as a regular troop for fortify movement restrictions

Captured spies:

- captured spies are individual tokens, not troop counts
- captured spies can move only if their actual icon is present in the selected source
- selecting a captured spy in the source row moves that entire spy icon to the target row
- selecting a moved captured spy in the target row moves that exact spy back to its source, if that spy was moved from the currently selected source during this fortify action
- captured spies already on the target remain visible there but are not removable unless they were moved there from the currently selected source in this fortify action
- captured spies moved from one source are not removable while another source is selected

Captured spies from immediately connected sources follow the same single-source lane as regular troops:

- they may move from the one immediately connected source that is contributing regular troops/spies
- once that source has moved a regular troop or captured spy, captured spy icons from other immediately connected sources are disabled unless the first source's regular/spied movement is fully undone

Captured spies from remote sources can move only by accompanying cavalry from that same source:

- if a remote source has at least one cavalry committed, captured spies from that remote source may also be moved
- if cavalry from that remote source is reduced back to zero, every captured spy moved from that remote source is automatically returned to that source
- remote captured spies never establish the one regular-source lane

### Fortify Troop Section

The troop section uses allocation-style rows once a source is selected.

Top/source row:

- uses the `+` bulk-action button
- shows units currently available to move from the selected source
- follows the shared known-content icon contract
- shows troop icons with counts greater than zero that are legal or potentially legal from that source
- disables illegal options instead of hiding them when a visible unit exists but cannot currently move
- shows captured spy icons only if captured spies are actually present in the selected source
- does not show a permanent empty captured-spy slot

Middle label:

- exactly `{source} to {target}`

Bottom/target row:

- uses the `-` bulk-action button
- shows the total units currently in the target in the provisional fortify view
- includes the target's original troops and captured spies
- includes all provisional fortify additions from every source, not only the currently selected source
- follows the shared known-content icon contract
- captured spy icons appear only for spies actually in the target
- tapping a removable troop or spy moves it back only when it belongs to the currently selected source's provisional movement
- units moved from other sources and units originally in the target remain visible but disabled while this source is selected

The final fortify check button is disabled until at least one troop or captured spy has been committed to move. Confirming commits every provisional move at once, ends the current player's turn, and advances to the next remaining player through the normal local handoff or sync host snapshot flow.

Sync uses two final-only turn commands:

- `{ type: "commitFortify", targetTerritoryId, movesBySource }`
- `{ type: "skipFortify" }`

`movesBySource` stores each source territory's troop counts and captured-spy owner ids. The host validates ownership, source eligibility, one-troop-left, one regular-source lane, remote cavalry/spy requirements, and each captured spy's current territory/custodian before applying the command. Provisional target/source selections and provisional movement edits are local-only and are never sent to passive sync viewers.

If player removal, pause/reconnect cleanup, or cancelation cancels an active fortify action before confirmation, all provisional fortify moves are undone. Locked attacks are not canceled by fortify cleanup because an active locked attack is a different authoritative state.

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
- after attack lock, battle rolls, casualties, retreat, conquest, or final battle dismissal commit
- after fortify/end-turn commits
- after player removal and redistribution commits

The active player's provisional reinforcement edits are local to that player until commit. Spy target selection, spy confirmation sheets, and successful spy intel are also local/private. The only defender-facing spy event is the failed-spy captured notification.

Attack setup selections are local until the attacker confirms committed troops. Once an attack is locked, the host/shared game state owns the battle. In sync mode, the attacker and defender receive the battle modal; other players receive only committed map facts such as live troop totals and ownership changes.

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
- active locked attacks are not canceled; they continue from their preserved battle state unless the removed player is a battle participant and the implementation resolves that special case before resume

If a territory containing captured spies is assigned during redistribution, custody of those spies transfers to the new territory owner. Any captured spy owned by the new territory owner is released immediately.

When a player is eliminated and owns no territories, that player's spy dies whether it was available or captured.

## Sync And Persistence Notes

The host remains authoritative for gameplay turns in sync mode.

Committed gameplay facts should be sent promptly enough that the host can resume from its own model:

- turn start
- spy result, captured-spy state, and failed-spy defender notification
- queued spy and region notifications
- reinforcement army submission
- finalized reinforcement troop placements
- fortify/end-turn result
- player removal and redistribution
- attack lock, battle scores, latest dice roll, casualties, retreat, conquest, and final battle dismissal

Transient presentation state remains local:

- selected map territory
- camera position
- focus animation
- open confirmation sheet
- spy target hover/preview before confirm
- dismissed or visible intel panel state after the host-authoritative spy result is known

Notification queues are not transient presentation state. They are authoritative per-player game facts. The host stores all queues; viewer-specific sync snapshots include only the receiving player's queue.
