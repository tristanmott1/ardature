# Ardatúrë Game Specification

This document is the source of truth for the Ardatúrë game while it is being designed and built. Rule, screen, state, sync, and deployment decisions should be reflected here before or alongside implementation changes.

Ardatúrë is a private, personal-use, Lord of the Rings themed, Risk-like territory conquest game for phones. The app is intended to be hosted as a static GitHub Pages PWA, with local pass-and-play and offline nearby-device sync.

## Product Goal

Build a static, installable PWA for playing a hidden-information territory conquest game inspired by Risk.

The app supports two play modes:

- Local mode: one device hosts the entire game and is passed between players. Private steps are protected by pass screens and view-specific rendering.
- Sync mode: nearby devices connect over a local network using WebRTC data channels and QR-code signaling, following the same broad model as the sibling `../qwixx/` app. One host device owns the canonical game state. Joined devices submit actions and render the game from their own player's view.

Sync mode is designed for no-backend play:

- GitHub Pages serves the static app shell.
- No server, database, or app store distribution is required.
- Devices need a local network path, usually the same Wi-Fi network or one phone hotspot.
- The hotspot does not need cellular service if it creates a local Wi-Fi network.
- The app should not depend on Bluetooth.
- Once the PWA has loaded, sync mode should keep working without internet as long as the devices remain locally connected.

The app should follow the sibling `../qwixx/` structure where practical:

- Vite, React, and TypeScript.
- Static GitHub Pages deployment.
- PWA manifest and service worker.
- Local-first state using `localStorage`.
- Compact mobile-first layout.
- No routing library unless the project later grows enough to require one.
- Page state managed inside the app.
- WebRTC data channels for sync mode.
- Two-way QR signaling for host offer and joiner answer.

## Design Principles

- The first screen is the usable app, not marketing content.
- The game should feel playable on one phone.
- Hidden information should be respected by the UI, but it does not need cryptographic secrecy.
- The map should be a custom-designed LOTR-heavy map suitable for personal use.
- Combat should reward intelligence, bluffing, preparation, and skill without losing the recognizable Risk-like rhythm.
- Constants may be tuned later. This document should define the shape of formulas even when exact numbers are still undecided.

## Core Terms

- Player: a human participant in the game.
- Host: in sync mode, the device that owns canonical game state and validates shared actions.
- Side: a player's visual faction, either light or dark.
- Color: a unique player color used to mark territory ownership.
- Territory: one node on the map graph.
- Region: a named group of territories with a reinforcement bonus when fully owned by one player.
- Border: an adjacency edge between two territories.
- Troop: a unit in a territory. Each player has three mixture troop classes plus one leader troop in their base army.
- Spy: a non-troop, player-owned capability used in the spy phase.
- Preparedness: a player's predicted mixture of the opponent's troop classes, selected on a triangle interface.
- Effectiveness: a score from 0 to 10 derived from prediction accuracy and arrow challenge performance.
- Attack: one locked commitment from one owned territory into one adjacent enemy territory.
- Encounter: one die-vs-die comparison inside a battle round.

## Players, Sides, and Colors

Some number of players join the game before setup begins.

Each player chooses:

- A display name.
- A side: light or dark.
- A unique color.

Side determines visual theme only. It does not create teams and does not change rules. Any number of players may choose the same side, including every player choosing light or every player choosing dark. All players compete individually.

Each player color must be unique. Territory ownership is always shown by color.

### Troop Equivalence

Each side has three mixture troop classes. The classes correspond exactly across sides:

| Light troop | Dark troop | Role |
| --- | --- | --- |
| Dwarf | Orc | Numerous, hardest arrow challenge |
| Rohirrim | Warg | Middle quantity, middle arrow challenge |
| Elf | Uruk-hai | Fewest, easiest arrow challenge |

Rules that use troop mixtures should refer internally to the three abstract mixture classes:

- Heavy: dwarf/orc.
- Cavalry: rohirrim/warg.
- Elite: elf/uruk-hai.

Each player also has a leader troop: wizard for light-side colors and witch-king for dark-side colors. The leader is allocated like a troop, but it is not part of mixture prediction or the heavy/cavalry/elite triangle.

The UI should render the appropriate side-specific names and art for each player.

### Spies

Each player begins with one spy:

- Light players have a Gollum/Smeagol spy.
- Dark players have a crow spy.

The spy is not a troop, has no map location, and cannot be moved or attacked. A spy can be lost permanently if a spy attempt fails.

## Game Setup

Setup has these stages:

1. Create or join game.
2. Enter and configure players.
3. Choose host-controlled setup options.
4. Draft or assign territories.
5. Allocate starting troops.
6. Begin the turn loop.

The read-only map from the troop allocation milestone remains the viewer model for inactive sync players and post-allocation inspection, but it is not a separate required stop once the turn loop exists.

The host determines setup options.

The setup/draft milestone stopped after territory draft review. The troop allocation milestone is documented in `docs/troop-allocation-v1.md`. The next gameplay implementation milestone is the first turn loop, documented in `docs/gameplay-turns-v1.md`.

### Setup Options

The setup state should allow:

- Player order: randomized or manually rearranged before start.
- Player colors: unique `green`, `blue`, `yellow`, `red`, `purple`, or `black`.
- Draft style: random, round robin, or snake.
- Draft pick time limit for round robin and snake: none, 5 seconds, 10 seconds, or 15 seconds.
- Troop allocation time limit: none, 1 minute, 2 minutes, 3 minutes, 4 minutes, or 5 minutes.
- Starting troop budget by original player count.
- Reinforcement formula constants.
- Region bonus definitions.

The setup/draft milestone exposes player colors, turn order, draft style, draft pick timer, and troop allocation timer. The troop allocation milestone uses the configured allocation timer and the starting troop budget rules documented below. The turn-loop milestone uses the reinforcement constants and region bonus values documented in `docs/gameplay-turns-v1.md`.

### Territory Assignment

Every territory must be owned by exactly one player before starting troop allocation.

Supported assignment modes:

- Random draft: the app simulates a snake draft where each pick chooses a random remaining territory.
- Round-robin draft: players select territories one at a time in forward turn order, repeating until every territory is owned.
- Snake draft: players select territories one at a time in forward order, then reverse order, repeating until every territory is owned.

The draft start is based on turn order. The starting drafter is chosen so the final pick belongs to the player who precedes the first-turn player. Random draft still uses snake ordering because that ordering determines which players receive extra territories when 42 territories do not divide evenly by player count.

The draft engine should store progress rather than precomputing one fixed pick queue. Removed players are skipped, and the same round-robin or snake pattern continues until every territory is owned.

### Initial Troop Allocation

After all territories have owners, the app enters initial troop allocation. The exact implementation source of truth for this milestone is `docs/troop-allocation-v1.md`.

Rules:

- Each player first chooses an army mixture using a reusable triangle component.
- The triangle uses barycentric coordinates for army building.
- Light-side colors (`green`, `blue`, `yellow`) use dwarf, rohirrim, and elf circular troop icons.
- Dark-side colors (`red`, `purple`, `black`) use orc, warg, and uruk-hai circular troop icons.
- Light-side colors also receive a wizard leader. Dark-side colors also receive a witch-king leader.
- The gameplay mixture troop classes are heavy, cavalry, and elite.
- The leader troop is not part of the triangle mixture and allocates like any other troop.
- Original player count determines budget: 2 players `40`, 3 players `35`, 4 players `30`, 5 players `25`, 6 players `20`.
- The leader troop costs `1` budget and is guaranteed exactly once in each player's base army.
- Army costs use fixed-point units. The current scale is `5` units per budget point: leader `5`, heavy `4`, cavalry `5`, and elite `6`.
- After reserving the leader, every candidate heavy/cavalry/elite army must stay within budget and leave fewer units than the cheapest troop costs.
- From those budget-maximal integer armies, choose the actual troop ratio closest to the triangle marker by squared ratio error. Break ties by unused budget, then stable heavy/cavalry/elite order.
- No resulting army can be strictly improved by adding a troop without exceeding its budget. Triangle corners express the strongest possible preference but are not guaranteed to remain literally pure when a pure army would leave enough budget for another class.
- Every owned territory must contain at least one troop total before the game can begin.
- A player may not place troops on another player's territory.
- During allocation, troop-count circles appear on all territories owned by the allocating player.
- Territory marker positions come from generated visual centers marked by large green circles in the territory drawing.

In local mode, allocation uses pass-and-play turns in configured turn order, skipping removed players. The allocation timer includes both army build and territory placement. If the timer expires, the app locks the current army mixture, randomly allocates remaining troops, shows a brief message, and advances through a handoff screen.

In sync mode, every player allocates at the same time. The host owns the canonical allocation timer. Players press ready when done and cannot manually unready. One player becoming ready does not stop the shared timer for the remaining players. Ready players see a local waiting page with all remaining players split into `READY` and `WAITING` columns, while unready players stay in allocation. The host can advance only after every remaining player is ready. If the timer expires, the host randomly completes allocation for every unready player, and that host-finalized completion cannot be overwritten by stale player updates.

If a player is removed during allocation, their territories and troops are redistributed to remaining players using the exact redistribution rules in `docs/troop-allocation-v1.md`. Additional troops received from a removed player are additive and do not alter the recipient's army-build budget.

## Map and Regions

The map is a custom graph of territories and borders.

The map should be LOTR-heavy in names and theme for personal use. It should not use official map art directly unless the user later provides it and explicitly wants that. The first build should use custom SVG/canvas/HTML map geometry backed by structured territory data.

The map data should include:

- Territory id.
- Territory display name.
- Region id.
- Region display name.
- Map coordinates or shape data.
- Adjacency list.
- Optional visual label position.
- Optional artwork or icon hooks.

There are six playable regions. Their territory membership comes from `maps/territory-key.md` and generated map data.

Each region has:

- A set of territories.
- A bonus troop class.
- A bonus troop amount.

Owning every territory in a region grants that region's reinforcement bonus during the reinforcement phase:

| Region | Bonus |
| --- | --- |
| Eriador | 6 elite |
| Rhovanion | 5 elite |
| Gondor | 5 cavalry |
| Rohan | 3 cavalry |
| Rhun | 4 heavy |
| Mordor | 3 heavy |

## Information Visibility

Every player has access to the map throughout the game, but the map is rendered differently per viewer.

For territories owned by the viewing player:

- Territory owner color is visible.
- Exact troop counts by class are visible.
- Total troop count is visible.

For non-owned territories not adjacent to any territory owned by the viewing player:

- Territory owner color is visible.
- No troop information is visible.

For non-owned territories adjacent to at least one territory owned by the viewing player:

- Territory owner color is visible.
- Total troop count is visible.
- Troop counts by class are hidden.

Spy results are a temporary exception during the spy phase only.

### Spy Intel Visibility

On a successful spy attempt:

- The selected enemy territory reveals exact troop counts by class.
- Enemy territories adjacent to the selected territory and owned by the same opponent reveal total troop counts.
- This is an intel snapshot.
- The intel disappears once the current player advances past the spy phase.
- The intel does not become permanent memory in the UI unless a later notes/history feature is explicitly added.

## Turn Structure

The game proceeds in round-robin turns, one active player at a time. Removed players are skipped. The first turn after initial allocation belongs to the first player in the configured setup turn order.

Each turn has three ordered stages:

1. Reinforcements.
2. Attack.
3. Fortify.

Spy is an optional action that can be used during the turn only when the active player is not in the middle of another action. The winner is the first player to own all 42 playable territories, or equivalently the last remaining player with territories.

The first turn-loop implementation is documented in `docs/gameplay-turns-v1.md`. In that implementation, reinforcements and spy are active, attack is disabled, and fortify simply ends the turn.

There is no normal turn timer in the first turn-loop implementation. Draft timers and allocation timers remain as documented, but spy, reinforcements, attack choice, and fortify/end-turn do not use a turn timer.

## Spy

Spy is optional and can be used at any point during the active player's turn when no other action is in progress:

- before starting reinforcements
- after reinforcements and before attack or fortify
- before or after completed attacks in the later combat milestone

Spy cannot be used during reinforcement placement, during an attack, during fortify, or after fortify ends the turn.

If the active player has already lost their spy, the spy button is disabled until the player gains control of the territory where that spy was captured.

### Spy Targeting

The selected spy target must be owned by an opponent. Any opponent territory may be selected because the gameplay graph is connected.

The capture probability is based on the shortest gameplay-connection distance from the target territory to the active player's nearest owned territory:

| Distance | Capture probability |
| --- | --- |
| 1 | 10% |
| 2 | 20% |
| 3 | 30% |
| 4 | 40% |
| 5 | 50% |
| 6 | 60% |
| 7 | 70% |
| 8 | 80% |
| 9 or more | 90% |

All gameplay connections from `maps/territory-key.md` count, including ship connections. Physical generated borders are not used for gameplay distance.

### Spy Result

If the spy succeeds:

- reveal the target territory's exact heavy/cavalry/elite/leader counts
- reveal total troop counts in adjacent territories owned by the same opponent
- show adjacent totals through normal white map troop counters
- replace the turn controls with a dismiss button
- preserve the spy for future use

The active player may inspect the successful spy intel as long as they want. Pressing dismiss clears the intel and resumes the turn. Spy intel is a temporary UI snapshot and does not become permanent memory.

If the spy fails:

- reveal no troop information
- show a notification that the spy was captured
- store the territory where the spy was captured
- disable that player's spy

In sync mode, the defender whose territory captured the spy also receives a local notification: `{spy owner name}'s spy was captured in {territory name}`. Successful spy attempts are silent to the defender.

The spy becomes available again immediately if that player later gains control of the capture territory, including during the same turn.

## Reinforcements

The active player receives new troops and places them onto owned territories before attack or fortify becomes available.

Reinforcements have two sources:

- territory-count reinforcement, whose heavy/cavalry/elite breakdown is chosen with the triangle
- fixed region-control bonuses

### Territory-Count Reinforcement

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

The reinforcement triangle uses the same fixed-point candidate-selection model as initial army build, but there is no leader:

- budget scale: `5` cost units per budget point
- heavy cost: `4`
- cavalry cost: `5`
- elite cost: `6`
- effective budget units: `territoryBudget * 5`

The player controls only the heavy/cavalry/elite breakdown of this territory-count budget. The UI shows the total reinforcement pool, including fixed region bonuses, above the triangle.

### Region Bonuses

The active player receives fixed bonus troops for each full region they own at the beginning of their turn:

| Region | Bonus |
| --- | --- |
| Eriador | 6 elite |
| Rhovanion | 5 elite |
| Gondor | 5 cavalry |
| Rohan | 3 cavalry |
| Rhun | 4 heavy |
| Mordor | 3 heavy |

The player does not choose the breakdown of region bonus troops. Region bonus troops are additive fixed troops, using the same fixed-troop pool mechanics as troops inherited from removed players.

### Placement

All reinforcement troops may be placed on any territories owned by the active player.

Rules:

- Reinforcement troops cannot be placed on opponent territories.
- The player must place every reinforcement troop before advancing.
- Existing troops that were present before the reinforcement action started cannot be removed during reinforcement placement.
- Only troops added during the current reinforcement action can be removed while reinforcing.
- There is no requirement to add at least one new troop to each owned territory.

If player removal cancels an active reinforcement action, the reinforcement action is undone and can be restarted after resume with the updated game state.

During sync reinforcements, the active player sees local reinforcement edits immediately. Other devices do not see those provisional troop changes. The host and other players receive the updated troop state only after reinforcements are finalized and committed.

## Phase 3: Attack

Attack is disabled in the first turn-loop implementation. The full rules below remain the design target for the later combat milestone.

The active player may make any number of attacks during the attack phase.

Each attack is a locked commitment from one owned source territory into one adjacent opponent-owned target territory.

The active player may end the attack phase without attacking.

### Attack Restrictions

To declare an attack:

- The target territory must be owned by an opponent.
- The source territory must be owned by the active player.
- The source territory must be adjacent to the target territory.
- The source territory must contain at least two total troops before committing.
- The committed attacking troops must leave at least one troop behind in the source territory.
- The committed attacking troops may be any mixture of troop classes present in the source territory.
- The same source-target pair cannot be attacked more than once in the same turn.

The source-target pair restriction applies even if the attacker gives up, loses, or fails to conquer the territory.

### Attack Lock

Once the attacker submits:

- Source territory.
- Target territory.
- Committed attacking troops.

The attack is locked and must happen.

There is no separate "original attack mixture" beyond the committed troops. The committed troops define the attacker's battle force and troop mixture. Uncommitted troops in the source territory are not part of the attack.

The defender's battle force is all troops currently in the target territory at the moment the attack locks.

### Private Battle Preparation

Before battle rolls begin, both players complete two private steps:

1. Predict the opposing troop mixture.
2. Complete the arrow challenge.

In local mode, the phone should be passed between players with interstitial screens so each player can complete private preparation without exposing hidden information.

In sync mode, each player completes preparation on their own device. The host waits until both preparation payloads are submitted before resolving battle.

### Prediction Triangle

The prediction UI is a triangle with one troop class at each corner.

The player moves a marker inside the triangle to indicate what mixture of opposing troop classes they believe they are facing.

The corners are softened so no troop class can ever receive 0% preparedness.

Preparedness should be computed as:

```text
preparedness = floor per class + marker-derived remaining distribution
```

The exact floor value is intentionally not fixed yet. A likely shape is:

```text
minimum preparedness per class = 5% to 10%
remaining preparedness = 70% to 85%, distributed by marker position
```

The three preparedness percentages must sum to 100%.

### Arrow Challenge

After prediction, each player fires one arrow at a target.

Each troop class has an associated challenge difficulty:

```text
elite easiest < cavalry middle < heavy hardest
```

The active challenge difficulty is a weighted average based on the player's own battle force mixture:

- The attacker faces a difficulty based on the committed attacking troops.
- The defender faces a difficulty based on the troops defending the target territory.

Exact target geometry, scoring bands, and touch/motion mechanics are intentionally not fixed yet.

The arrow challenge returns a normalized performance score suitable for combining with prediction accuracy.

### Effectiveness

Each side receives an effectiveness score from 0 to 10.

Effectiveness is based on:

- Prediction accuracy against the opponent's actual battle force mixture.
- Arrow challenge performance.

The exact formula is intentionally not fixed yet.

The midpoint is 5:

- 5 means average effectiveness and fair dice.
- Less than 5 skews dice toward lower rolls.
- Greater than 5 skews dice toward higher rolls.

The formula should keep effectiveness bounded:

```text
effectiveness = clamp(0, 10, function(prediction accuracy, arrow performance))
```

### Weighted Dice

Battle dice are six-sided but not necessarily fair.

For each side:

```text
die face probabilities = function(effectiveness)
```

At effectiveness 5, each face should have equal probability.

At effectiveness below 5:

- Lower die faces become more likely.
- Higher die faces become less likely.

At effectiveness above 5:

- Higher die faces become more likely.
- Lower die faces become less likely.

The exact distribution curve is intentionally not fixed yet.

The combat log may describe advantage qualitatively, but the game should preserve the die-roll feel rather than showing only deterministic modifiers.

### Battle Round

After both players complete preparation, battle proceeds in repeated rounds.

For each round:

- Attacker rolls up to 3 dice.
- Attacker dice are capped by the number of surviving committed attacking troops.
- Defender rolls up to 2 dice.
- Defender dice are capped by the number of surviving defending troops in the target territory.
- Sort attacker dice from highest to lowest.
- Sort defender dice from highest to lowest.
- Compare the top dice in order.
- The number of encounters is `min(attacker dice count, defender dice count)`.
- For each encounter, exactly one troop dies.
- Higher die wins the encounter.
- Defender wins ties.

Rounds continue until:

- All committed attacking troops are dead.
- All defending troops in the target territory are dead.
- The attacker gives up after at least one battle round.

The attacker must roll at least once before giving up.

### Casualty Selection

When a side loses an encounter, the troop class that dies is randomly sampled.

The sampling probabilities are proportional to both:

- The losing side's actual surviving troop ratio.
- The opposing side's preparedness ratio.

For example, if the defender has 2 elite troops and 8 heavy troops, the actual ratio is:

```text
elite = 20%
heavy = 80%
```

If the attacker's preparedness is:

```text
elite = 60%
heavy = 40%
```

Then the probability of an elite casualty is:

```text
(0.2 * 0.6) / ((0.2 * 0.6) + (0.8 * 0.4)) = 27.27%
```

The same rule applies in both directions:

- When a defending troop dies, sample from surviving defending troops using the attacker's preparedness.
- When an attacking troop dies, sample from surviving committed attacking troops using the defender's preparedness.

Troop classes with no surviving troops cannot be selected.

Because prediction corners are softened, preparedness should never be exactly 0 for any troop class.

### Conquest

If all defending troops die:

- The attacker conquers the target territory.
- All surviving committed attacking troops move into the conquered territory.
- No committed survivors may remain in the source territory.
- Uncommitted source troops remain in the source territory.
- The target territory changes owner to the attacker.

The attacker may continue attacking afterward if they have valid attacks remaining.

### Attacker Defeat

If all committed attacking troops die:

- The target territory remains owned by the defender.
- The source territory keeps only the uncommitted troops that were left behind.
- The attacker may continue attacking elsewhere if they have valid attacks remaining.

### Giving Up

After at least one battle round, the attacker may give up.

If the attacker gives up:

- Surviving committed attackers return to the source territory.
- The target territory remains owned by the defender.
- The same source-target pair may not be attacked again this turn.
- The attacker may continue attacking elsewhere.

### Post-Battle Reveals

After an attack ends, the game reveals hidden troop mixture information only in these cases:

- If the defender survives because the attacker gives up or all committed attackers die, the defender is shown the committed attacking mixture that attacked them.
- If the defender is conquered, the defender is not shown the mixture that defeated them.
- If the attacker conquers the target, the attacker is shown the defending mixture that they defeated.
- If the attacker gives up, the attacker is shown the defending mixture they withdrew from.
- If all committed attacking troops die, the attacker is not shown the defending mixture that defeated them.

The reveal refers to the battle force at attack lock time, not to later surviving troop counts.

The UI should make these reveals available at the end of battle, then return to normal fog-of-war rules.

## Phase 4: Fortify

In the first turn-loop implementation, pressing fortify simply ends the current player's turn. The full rules below remain the design target for the later fortify milestone.

The fortify phase is optional.

The active player may choose up to one target territory they own to fortify.

After selecting a target, the player may move troops into it from eligible owned source territories.

### Standard Fortification

The player may select one adjacent owned source territory and move any combination of troops from that source to the target.

Rules:

- Source and target must be adjacent.
- Source and target must both be owned by the active player.
- The source must be left with at least one troop total.
- Any troop classes may be moved from the adjacent source.

### Cavalry Fortification

In addition to the standard adjacent source, the player may send cavalry from any number of additional owned source territories within a fixed graph radius of the target.

Rules:

- Only cavalry troops may move using this extended rule.
- The path from each source to the target must pass only through territories owned by the active player.
- The radius is intended to be 2 edges, but the exact value can remain tunable.
- Each source must be left with at least one troop total.

For light players, cavalry are rohirrim. For dark players, cavalry are wargs.

After fortification is submitted or skipped, the turn ends and play advances to the next non-eliminated player.

## Player Removal During Gameplay

Player removal during gameplay is different from normal elimination by conquest.

In local mode:

- the regular X ends the whole local game after confirmation
- individual player removal is available only from the pause modal

In sync mode:

- the host can remove players from pause
- a graceful quit during gameplay pauses the game and removes that player
- an ungraceful disconnect pauses the game but does not remove that player unless the host later removes them

After any gameplay removal, the game pauses immediately. If fewer than 2 players remain, the game ends instead.

Redistribution steps:

1. Collect all territories currently owned by the removed player, including territories captured during the current turn.
2. Collect all removed-player troops into one pool, including placed troops, unplaced troops, and reinforcement troops acquired during the current turn.
3. If the removed player was due to receive reinforcements but had not built that reinforcement army yet, choose a uniform reinforcement mixture first.
4. Replace every removed wizard or witch-king with one random heavy, cavalry, or elite troop.
5. Shuffle the removed-player territories.
6. Shuffle the removed-player troops as individual troop items.
7. Place troops onto the removed-player territories one at a time in round-robin territory order.
8. Shuffle the now-populated territory list again.
9. Shuffle the remaining players.
10. Distribute populated territories to remaining players in round-robin player order.
11. Keep the game paused until resume.

Resume rules:

- removed players are skipped in turn order
- if the current player was removed, the next remaining player after them in configured turn order starts
- if the current player was not removed, that player resumes the same turn stage unless the active action is canceled
- active spy intel is canceled and the spy survives
- active reinforcements are canceled and undone
- active fortify is canceled
- active attacks are not canceled once attacks exist later

If a captured spy's capture territory is assigned to that spy's owner through redistribution, the spy returns immediately.

## Elimination and Win Condition

A player is eliminated immediately when they own zero territories.

When eliminated:

- The player is fully out.
- Their future turns are skipped.
- Their spy, if still available, disappears with them.
- They cannot receive reinforcements or take actions.

The game ends when one player owns every territory or all other players are eliminated.

## App Pages and Views

The app should use app pages/views rather than a marketing site.

Expected top-level views:

1. Home.
2. Map-first setup and configuration.
3. Sync host lobby.
4. Sync join flow.
5. Territory draft.
6. Sync paused reconnect lobby.
7. Initial troop allocation.
8. Read-only game map.
9. Main map / turn view.
10. Spy phase.
11. Reinforcement phase.
12. Attack planner.
13. Prediction triangle.
14. Arrow challenge.
15. Battle resolution.
16. Fortify phase.
17. Game over.

These do not need to become separate routes. They can be page states inside the app.

### Home

Home should present the two modes:

- Local.
- Sync.

It should preserve any useful local settings such as last used player names, colors, and sides.

### Local Mode Setup

Local mode setup should allow:

- Add players.
- Edit player names.
- Choose each player's unique color.
- Remove players.
- Clear all players.
- Randomize player order.
- Rearrange player order.
- Choose draft style.
- Choose draft pick time limit.
- Choose troop allocation time limit.
- Start the draft.

The app should validate:

- Minimum player count of 2.
- Maximum player count of 6.
- Non-empty player names.
- Unique colors.
- Setup options selected.

For the setup/draft milestone, side selection is not exposed. Players only need names and colors.

### Sync Mode Setup

Sync mode has host and join flows.

The user enters their own player name and color before hosting or joining.

The host:

- Creates a sync room.
- Becomes the first connected player by default.
- Shows a QR code containing the host WebRTC offer.
- Scans each joiner's answer QR to complete connection.
- Controls setup options.
- Can rearrange and randomize player order.
- Can edit any player's name or color.
- Locks a player name or color when editing that field.
- Can later unlock a player name or color.
- Can remove players before the draft starts.
- Starts the draft only when at least 2 players remain and all players have unique colors.

The joiner:

- Chooses their own name and color before scanning the host QR.
- Scans the host offer QR.
- Shows an answer QR.
- Waits for the host to scan the answer QR.
- Appears in the host lobby only after the data channel opens.
- Can edit their own name and color while those fields are unlocked.
- Waits for the host to start the draft.

Duplicate colors are allowed in the sync lobby, but the host Start button remains disabled until all remaining players have unique colors.

The QR handshake should follow the same broad requirements as Qwixx:

- Large, crisp QR codes.
- Quiet margin.
- Compact QR payloads.
- Rear-camera scanning when available.
- Native browser QR detection when available.
- App-level QR fallback when needed.
- Clear status text for scanning, QR found, answer ready, connecting, connected, and failure states.
- Host Start disabled while accepting an answer.
- Joiner not considered connected until the data channel opens.

The exact QR prefixes should be project-specific, not Qwixx-specific.

### Draft View

During manual drafts, the active player selects a remaining territory on the map. The current-player top bar stays visible during confirmation and draft result notifications.

Draft selection flow:

1. Select a remaining territory.
2. Show a compact confirmation bottom sheet with cancel and confirm controls.
3. Confirming assigns the territory immediately and colors it with the owner's player color.
4. Show a result popup naming the player and drafted territory.

The confirmation popup is a compact bottom sheet with the territory name and cancel/confirm controls. The shared game top bar remains visible during confirmation. The pending territory itself is highlighted on the map for the active drafting viewer. While confirmation is open, tapping another remaining territory replaces the pending pick, and tapping the map background cancels it.

The result popup uses the exact same compact bottom-sheet footprint and also keeps the shared game top bar visible. In local mode, it auto-dismisses after about one second, can be dismissed early by tapping anywhere, and the next player's timer starts only after dismissal.

In sync mode, pending selections are local-only. Another player's pending selection is not synced, never moves or focuses your map, and never highlights on your device. Confirmed picks are synced as ownership changes; each device turns that local observation into its own small drafted notification. The next player's turn starts immediately on that player's device. The result popup also auto-dismisses after about one second and can be dismissed early.

The compact draft controls show the active player's draft progress as confirmed picks over expected final picks, such as `3 / 11`. The expected final pick count is computed from the current draft style, frozen turn order, active players, and remaining territories.

The colored player bar is distinct from the controls section. Once draft starts, the player bar remains visible for the rest of the implemented game flow, including confirmation sheets, result notifications, pause, allocation, allocation waiting, local handoff, and read-only map. Pause and modal states may hide controls, but they do not hide the player/color bar. The bar shows the relevant timer whenever one exists: live remaining time, paused remaining time, upcoming handoff time, or shared sync allocation time while waiting.

Timer behavior:

- If a timed pick expires with a confirmation popup open, the pending territory is confirmed.
- If a timed pick expires with no confirmation popup open, a random remaining territory is chosen for the active player.
- If pick time is unlimited, there is no timer and no automatic draft selection.
- If local mode pauses during an active pick or confirmation popup, the active timer and pending choice are preserved.
- If sync mode pauses during an active pick or confirmation popup, any local pending pick is discarded and that player's turn starts over on resume.

After all territories are drafted, the app enters the troop allocation phase. It does not remain on an ownership-only post-draft review screen.

### Initial Troop Allocation View

Initial troop allocation is a required game phase after draft and before turn play begins.

Army build:

- The current player chooses a heavy/cavalry/elite mixture with the reusable triangle component.
- The current player's side also gives them exactly one wizard or witch-king leader.
- The triangle marker starts in the center.
- The army-build triangle uses barycentric coordinates and allows true `0%` troop classes.
- The UI shows live troop counts while the marker moves using icon count badges, not troop text.
- Submitting the army build locks that player's base heavy/cavalry/elite troop counts plus their guaranteed leader.

Territory allocation:

- The player allocates all available troops to owned territories.
- Only owned territories are selectable.
- Selecting an owned territory highlights it locally. If automatic focus is enabled, the map also focuses on that territory locally.
- The controls show icon-only troop totals for the selected territory and icon-only remaining troop totals.
- The player may remove troops from the selected territory.
- The player may add remaining troops to the selected territory only when enough total remaining troops are preserved to place at least one troop on every still-empty owned territory.
- The player can finish only when all owned territories contain at least one troop and no troops remain unallocated.

Local allocation:

- Players allocate one at a time in configured turn order, skipping removed players.
- Each player completes army build and territory allocation before the next player starts.
- The allocation timer includes army build and territory allocation.
- If time expires, the current army mixture is locked if needed and the rest of that player's troops are randomly allocated.
- After time expiration, the app briefly says `The remainder of your troops have been randomly allocated.`
- The top bar shows the next player, and a simple arrow popup gates the handoff before that player begins.

Sync allocation:

- All players allocate simultaneously on their own devices.
- The host owns the canonical allocation timer.
- Players press ready when finished.
- Ready players go to a local waiting page while unready players stay in allocation.
- Ready is final unless another player is removed and redistribution affects that player.
- The waiting page shows all remaining players in two columns: `READY` and `WAITING`.
- The waiting page keeps the device player's colored top bar visible and shows the shared allocation timer while it is relevant.
- The host can advance only when every remaining player is ready.
- If time expires, the host randomly completes allocation for every unready player.

### Read-Only Game Map

After all remaining players have allocated troops, the app has enough information to render a viewer-specific read-only map. The next gameplay milestone uses that same visibility model inside the turn loop rather than stopping at the read-only map as the final state.

Visibility rules:

- Ownership is visible to everyone.
- A viewer sees total troop counts on their own territories.
- A viewer can select any territory to show its name in the top controls section.
- Selecting one of your own territories also shows its heavy/cavalry/elite/leader breakdown.
- Selecting an opponent territory never shows its troop breakdown.
- Opponent territories connected to any of the viewer's territories show total troop count only.
- Opponent territories not connected to any of the viewer's territories show ownership only.
- Visibility connections use all gameplay connections from `maps/territory-key.md`, including both land and ship connections.
- Visibility connections are independent of physical shared borders in generated geometry.

In local mode, pressing the player name in the top bar cycles the current viewer. Sync mode uses the device's local player as the viewer, including on the host device.

### Sync Turn Viewer Rules

During another player's turn, inactive sync devices show only a read-only/explore-style map using the same viewer-specific visibility rules:

- ownership is visible
- the viewer's own territory total markers are visible
- opponent total markers are visible only where the viewer has gameplay adjacency
- own territory breakdowns are visible only through local inspection
- opponent breakdowns are not visible except during that viewer's own successful spy intel
- no turn action controls are shown
- no pending selection, focus, confirmation, or provisional reinforcement placement from the active player is shown

Sync devices update from committed host facts only:

- after reinforcements are finalized
- after future attacks resolve or otherwise commit
- after fortify/end-turn commits
- after player removal and redistribution commits

The active player's provisional reinforcement edits are local to that player until commit. Spy target selection, spy confirmation sheets, and successful spy intel are also local/private. The only defender-facing spy event is the failed-spy captured notification.

### Pause And Player Removal

Local and sync modes use the same pause button placement and icon. In local mode, the pause button is visible during draft. In sync mode, only the host sees the pause button.

Local pause is a true pause of the single-device draft:

- If the pick timer is running, it freezes with the remaining time preserved.
- If a confirmation popup is open, the pending selected territory stays pending.
- If the result popup is open, no timer is running and the same popup remains.
- On resume, the same player continues from the same state.
- Local pause has a restart button, confirmed like quitting, that returns to local setup/config with the same players and settings.
- Local pause has no end-game or close button.
- Local pause has no disconnected status, reconnect status, or QR reconnect controls.
- Local players can be removed while paused.
- Local refresh or close during an active game phase restores into local pause with timers stopped and remaining time preserved.
- Local mode never requires reconnection when reopened because all players share one device.

Sync host pause is a synchronization reset:

- The active pick timer is not preserved.
- Any pending selected territory or confirmation popup is discarded.
- On unpause, the current player's turn starts over with a fresh timer.
- The host can restart from pause after confirmation, returning everyone to setup while keeping current sync connections open.
- Sync pause includes connected, disconnected, and reconnecting player status.
- Sync host pause always includes a recovery QR and scan button for disconnected-player recovery.
- Sync non-host pause does not include a blank QR placeholder or recovery tools.
- The host can remove players while paused.
- Host refresh or close during active sync play restores the host game into paused recovery state with all non-host players disconnected, creates a fresh recovery transport, and renders a new recovery QR.

In both modes, removing a player during draft clears that player's territories and returns them to the remaining territory pool. If fewer than 2 players remain, the game ends and returns to home.

During allocation, removing a player redistributes that player's territories and troops:

- If fewer than 2 players remain, the game ends and returns home.
- If the removed player has submitted an army build, use that mixture plus that player's guaranteed leader.
- If the removed player has not submitted an army build, force a uniform mixture with that player's effective triangle budget plus that player's guaranteed leader.
- Before redistribution, replace every removed wizard or witch-king with one random heavy, cavalry, or elite troop.
- Existing troop placements on the removed player's territories do not matter.
- The removed player's territories and troops are decoupled before redistribution.
- Remaining players are shuffled.
- Removed territories are shuffled.
- Removed troops are expanded into individual troop items and shuffled.
- Territories are redistributed in round-robin order using the shuffled player order.
- Troops are redistributed in round-robin order using the same shuffled player order, starting over at the beginning.
- In sync mode, every recipient becomes unready and can rearrange all troops across all current territories.
- In local mode, recipients who already completed allocation receive second allocation turns appended to the end of the local allocation order and can rearrange all troops across all current territories.
- Additional troops received from a removed player are additive. They do not increase or alter the recipient's army-build budget.

### Sync Pause And Reconnect

The host can manually pause a draft. Any ungraceful disconnect during a sync draft also forces the pause page.

While paused:

- The host sees a lobby-style page with all remaining players and their connection statuses.
- The host can remove players.
- The host cannot unpause until every remaining player is connected and at least 2 players remain.
- If fewer than 2 players remain, the game ends and returns to home.

Graceful quit and ungraceful disconnect are different:

- Graceful quit sends a quit message. The host removes that player, clears their territories, returns those territories to the draft pool, pauses the draft, and shows the pause page without that player.
- Ungraceful disconnect keeps the player in the game, keeps their territories owned, marks them reconnecting on the host, and forces pause.
- Host end-game sends `hostEnded` so joiners return home instead of staying in a disconnected game.
- Host removal sends `removed` to that peer when possible. Removed players return home and cannot rejoin.

`connected` means the device is currently on the same authoritative game page as the host:

- The host data channel is live.
- Host and joiner heartbeat are healthy in both directions.
- The joiner has heard a recent host heartbeat or snapshot.
- The joiner is rendering the latest host-authoritative phase/page, not stale local assumptions.

If any of these are false, the device must stop treating itself as connected. WebRTC channel state alone is not enough.

Disconnected players should automatically attempt to reconnect when possible, following the Qwixx-style reconnect behavior. Host and joiner make reconnect/disconnect decisions independently because the failing connection cannot be trusted to carry those state changes:

- Joiner detects missed heartbeat and enters local `reconnecting`.
- Host detects missed heartbeat from that player and marks the player `reconnecting`.
- Both sides use a 10-second reconnecting grace period.
- If heartbeat recovers, the joiner receives the latest host snapshot and returns to connected.
- If heartbeat does not recover, the joiner returns home exactly as if the host ended the game or removed them.
- If heartbeat does not recover, the host marks that player disconnected and keeps them in the host game for QR recovery.

Joiner reconnecting UI is local-only:

- It may show the local player's name/color and the most recent map as inert background.
- It must not show current roster status, timers, ready state, turn state, or other players' connection state.
- The only choices are to wait or press X to stop trying and return home immediately.
- Pressing X while reconnecting does not send `quit`, because the player is not connected enough to remove themselves from the host game.

Connected pause UI is host-authored. If a joiner is still connected while the host game is paused, it may show the host's roster and connection statuses. A reconnecting joiner must never infer those facts from stale local state.

QR recovery flow:

1. Host pause always shows a recovery QR.
2. The recovery QR contains only players the host currently marks disconnected.
3. The joiner uses the normal Sync -> Join path and scans the recovery QR.
4. The joiner chooses one disconnected player slot.
5. The joiner generates a player-specific recovery answer QR.
6. The host scans the answer QR to reconnect that player.
7. The host accepts the answer only if that player is still disconnected; stale or duplicate answers fail cleanly.

Reconnecting players cannot change the player identity. Names, colors, and host locks remain exactly as the host sees them.

The host's persisted model must contain enough information to resume the game after recovery, including draft ownership, army builds, troop allocations, readiness, timers stopped at pause/restore, and the current phase.

## Sync Network Model

Sync mode uses local WebRTC data channels between the host and each joined player.

The host is authoritative for shared game state:

- Player roster.
- Player order.
- Sides and colors.
- Map seed/data.
- Territory ownership.
- Troop counts.
- Current phase.
- Current player.
- Pending setup choices.
- Pending attack state.
- Battle resolution.
- Eliminations.
- Game over.

Joined devices send action requests to the host.

The completed sync contract through troop allocation separates authoritative game facts from connection/session state:

- `GameState` stores game facts only.
- `App` owns sync session state such as connecting, connected, reconnecting, disconnected, and host-ended.
- Heartbeat defines whether a session is connected. A stale snapshot is not enough.
- Host-to-joiner updates are revisioned snapshots: `{ type: "snapshot", revision, game }`.
- Joiners ignore stale snapshots.
- Joiner-to-host commands are limited to `profileUpdate`, `draftConfirm`, `allocationUpdate`, and `quit`.
- The host validates every command against the current game state before applying it.
- Host intentional end uses `hostEnded`.
- Host player removal uses `removed` when the peer is still reachable.
- Old unversioned `gameState`, `hostQuit`, and pending-pick messages are not part of the current sync contract.

The host applies valid actions, persists active sync-host state separately from local pass-and-play saves, and broadcasts the resulting revisioned snapshot.

Sync frequency should follow a resume-safety rule:

- Send committed game facts promptly enough that the host can resume without outside help.
- Avoid syncing noisy transient UI.
- Draft confirmations, army-build submission, ready, timeout completion, pause, resume, removal, and phase advance are immediate committed facts.
- Allocation troop placement is committed game data. It may be batched or lightly throttled, but must be flushed on ready, pause, visibility change, or page unload where practical.
- Turn-loop facts follow the same pattern: turn start, spy result, spy capture territory, failed-spy defender notification, finalized reinforcement placements, fortify/end-turn, elimination, and game-over are committed facts.
- Future attack and battle events should also follow this pattern: host must receive enough committed data to resume; local previews and controls remain local.
- Never sync map camera, focus animation, selected inspection territory, open modal state, hover/press state, local pending draft preview, provisional reinforcement edits, successful spy intel view state, or other purely visual state.

Because this is for personal use, hidden state may exist client-side. However, the UI should still render strictly from the local player's viewer perspective. When practical, the host may send redacted player-specific views to make accidental spoilers less likely.

### Sync Event Categories

Host-to-player events should include:

- Lobby state.
- Setup state.
- Game start.
- Full or redacted game state update.
- Current phase update.
- Turn advance.
- Spy result.
- Reinforcement result.
- Attack locked notification.
- Preparation request.
- Battle resolution update.
- Post-battle reveal, if applicable.
- Fortify result.
- Player eliminated.
- Game over.
- Player removed or disconnected.
- Host start over.
- Session ended.

Player-to-host events should include:

- Join metadata after QR handshake.
- Lobby edits allowed to that player.
- Territory draft selection.
- Initial troop allocation submission.
- Initial troop allocation ready state.
- Spy target or skip.
- Reinforcement troop choice and placement.
- Attack declaration.
- Prediction submission.
- Arrow challenge submission.
- Battle give-up request.
- Continue attack or end attack phase.
- Fortify submission or skip.
- Exit game.

### Pending Attack State

The host should represent an attack as an explicit pending state.

The pending attack state should include:

- Attack id.
- Attacker player id.
- Defender player id.
- Source territory id.
- Target territory id.
- Committed attacking troop counts.
- Defending troop counts at attack lock.
- Attacker prediction payload, once submitted.
- Defender prediction payload, once submitted.
- Attacker arrow payload, once submitted.
- Defender arrow payload, once submitted.
- Attacker effectiveness, once computed.
- Defender effectiveness, once computed.
- Current surviving attacking troops.
- Current surviving defending troops.
- Battle log.
- Whether at least one round has been rolled.
- Terminal outcome, when finished.

The host should not resolve battle dice until both players have submitted their private preparation.

### Local Pass-and-Play Privacy

Local mode should use explicit pass screens before private information appears.

Examples:

- "Pass to Frodo" before Frodo allocates starting troops.
- "Pass to the defender" before defender prediction.
- "Pass to the attacker" before attacker prediction.
- "Pass back to active player" after battle reveal.

Pass screens should hide the map and any private troop data.

The user should need to confirm they are the named player before private steps become visible.

## State Model

The app should keep a serializable game state object.

Suggested high-level shape:

```ts
type GameState = {
  id: string;
  mode: "local" | "sync";
  players: PlayerState[];
  playerOrder: string[];
  currentPlayerId: string;
  phase: TurnPhase;
  turnNumber: number;
  map: MapState;
  territories: Record<TerritoryId, TerritoryState>;
  regions: Record<RegionId, RegionState>;
  setup: SetupState;
  spyIntel: SpyIntelState | null;
  pendingAttack: PendingAttackState | null;
  turnAttackPairs: SourceTargetPair[];
  battleHistory: BattleSummary[];
  winnerPlayerId: string | null;
};
```

Suggested player shape:

```ts
type PlayerState = {
  id: string;
  name: string;
  side: "light" | "dark";
  color: string;
  status: "active" | "eliminated" | "left";
  spyAvailable: boolean;
};
```

Suggested territory shape:

```ts
type TerritoryState = {
  id: string;
  ownerPlayerId: string;
  troops: {
    heavy: number;
    cavalry: number;
    elite: number;
    leader: number;
  };
};
```

Exact TypeScript names can change, but the implementation should preserve these concepts.

## Rendering Player Views

The app should derive a viewer-specific map model from canonical game state.

```text
visible map = projectGameStateForViewer(gameState, viewerPlayerId)
```

The projection should decide, per territory:

- Whether exact troop class counts are visible.
- Whether only total troop count is visible.
- Whether no troop count is visible.
- Whether spy intel overlays are visible.
- Whether post-battle reveal data is visible.

This should be a pure helper where possible so local mode and sync mode use the same visibility rules.

## Persistence

Persist locally for all modes:

- Player name preferences.
- Side preference.
- Color preference.
- Local roster.
- App settings.
- Last selected setup options where useful.

Persist local active games:

- Full local game state.
- Current page/phase where practical.

Persist sync host state where useful:

- Host setup preferences.
- Host player identity.
- Full host-owned setup and draft state.
- Territory ownership.
- Pause state.
- Remaining player roster.
- Name/color locks.
- Draft settings and progress.

Setup preferences are separate from active saved games. Each device should remember local player names, colors, order, and shared game configuration for new local games. Each device should also remember its own sync name and color, and sync hosts should reuse the saved shared game configuration. Remote sync players are not stored as local setup defaults.

Sync host persistence is conservative:

- Host state should be saved after setup starts, draft starts, each pick, pause, removal, and other authoritative changes.
- If the host reloads during active sync play, the game restores into paused recovery state instead of trying to continue a live timer.
- On sync host restore, all non-host players are disconnected immediately because no live heartbeat survives the refresh.
- The host can close the app while paused, reopen later, reconnect everyone, and unpause.
- Joiners do not need independent game persistence for the setup/draft milestone.

Because the game can be long, local mode should support refresh recovery. Local refresh during active play restores into local pause, clears running timer deadlines, and preserves remaining time so resume continues from the paused state.

## PWA and Deployment

The app should be deployable as static files on GitHub Pages.

Requirements:

- Vite build output in `dist`.
- Vite `base: "./"` for GitHub Pages compatibility.
- Web app manifest.
- App icons.
- Service worker for offline app shell caching.
- GitHub Actions deployment to GitHub Pages on push to `main`, once implementation begins.

Sync mode should remain compatible with static hosting:

- No HTTP server participates in gameplay.
- QR codes carry WebRTC offer and answer data needed for offline signaling.
- WebRTC data channels carry gameplay events after the handshake.
- Camera scanning and WebRTC require HTTPS in normal browsers, which GitHub Pages provides.

## Existing Assets

Runtime public assets are organized under `public/`:

- `app-icons/`: PWA icons and the original ring icon source.
- `troops/source/`: original uncropped character art.
- `troops/icons/`: manually tuned circular PNG crops used by troop UI.

The repository currently includes source character images under `public/troops/source/`:

- `crow.png`
- `dwarf.png`
- `elf.png`
- `ghost.png`
- `orc.png`
- `rohirrim.png`
- `smeagul.png`
- `warg.png`
- `witch-king.png`
- `wizard.png`
- `uruk-hai.png`

The game should use these assets where appropriate, especially for troop icons, side identity, spy identity, and atmospheric UI accents.

The circular troop icon crops under `public/troops/icons/` are raster PNGs, not SVGs. They should be used anywhere the UI needs troop type icons. Counts should be rendered as small white circular badges attached to the icon.

## Not Yet Fixed

The following decisions are intentionally open:

- Final app name and displayed title.
- Future tuning of starting troop budgets and troop costs.
- Future tuning of reinforcement troop costs and region bonus values.
- Preparedness floor value.
- Prediction accuracy formula.
- Arrow challenge mechanics and scoring.
- Effectiveness formula.
- Weighted die probability curve.
- Fortify cavalry radius final value.
- Future combat-specific sync message names and payload schemas.

These should be resolved before or during the relevant implementation pass.

## Implementation Roadmap

Suggested build order:

1. Replace the sandbox page state with real app phases, shared game types, setup state, draft state, ownership state, and persistence keys.
2. Convert the current map sandbox components into reusable map modes for read-only, draft picking, and territory focus.
3. Build local setup/configuration on top of the map-first shell, including player add/edit/delete, colors, turn order, randomize, draft style, pick timer, and troop allocation timer.
4. Implement the shared draft engine for snake, round-robin, random simulation, active-player calculation, timed picks, confirmation behavior, and ownership assignment.
5. Implement local draft UI and local persistence through setup, draft, manual pause, player removal, end-game confirmation, and refresh restore.
6. Copy and adapt Qwixx sync transport, QR panels, scanner, and lobby interaction using Ardatúrë-specific payload names and prefixes.
7. Implement sync setup with host/join flows, joiner editable name/color, host edit/lock/unlock, duplicate-color blocking, host roster controls, and setup broadcasts.
8. Implement sync draft as host-authoritative state: host timers, pick requests, confirmed picks, random fallback picks, broadcasts, and read-only views for inactive devices.
9. Implement sync pause/reconnect: host manual pause, disconnect-forced pause, graceful quit, player removal, host persistence, host refresh recovery into pause, automatic reconnect where possible, blocked joiner reconnecting state, QR disconnected-player recovery, and unpause validation.
10. Update verification to cover local setup/draft/pause, sync handshake/setup, sync draft, timeout behavior, pause/reconnect behavior, persistence recovery, and map interaction modes.
11. Generate territory visual centers from the large green circles in the territory drawing.
12. Implement army-build triangle, troop budget calculation, and exact rounded troop counts.
13. Implement local troop allocation, allocation timeout random completion, and pass-and-play handoff.
14. Implement sync troop allocation, ready/waiting state, host-authoritative timeout completion, and allocation pause/reconnect.
15. Implement allocation player-removal redistribution for local and sync.
16. Implement read-only game map with viewer-specific troop visibility.
17. Implement turn phases without combat minigames.
18. Implement attack declaration and battle state.
19. Implement prediction triangle.
20. Implement arrow challenge.
21. Implement effectiveness and weighted dice.
22. Implement casualty sampling and post-battle reveals.
23. Implement full fortify.
24. Implement elimination and game over.

Current implementation status:

- Steps 1 through 17 are implemented for the current setup, draft, troop allocation, read-only map, and first turn-loop scope.
- Sync mode now uses the cleaned contract documented above: revisioned host snapshots, validated joiner commands, explicit `hostEnded` and `removed`, blocked joiner play during host reconnecting, QR disconnected-player recovery from host pause, and separate sync-host active game persistence.
- Step 17 is documented in `docs/gameplay-turns-v1.md`: turn order, spy, reinforcements, attack disabled, fortify ends turn, and gameplay player removal redistribution.

## Verification Checklist

Before considering the first playable version complete:

- Verify local setup supports 2 to 6 players, names, unique colors, turn order, draft style, draft timer, and troop allocation timer.
- Verify sync setup supports Qwixx-style QR handshake, host lobby, joiner lobby, name/color edits, host locks, duplicate-color blocking, and host-authoritative setup state.
- Verify local and sync drafts support snake, round-robin, random simulation, timed picks, confirmation timeout, random timeout fallback, and transition into troop allocation.
- Verify local pause preserves active timers, pending confirmation, result popup state, army/allocation progress, and player removal without reconnect state.
- Verify local refresh during active play restores into pause with timers stopped and remaining time preserved.
- Verify sync heartbeat defines connected state, missed heartbeat immediately enters reconnecting, and host/joiner independently transition after the 10-second grace period.
- Verify joiner reconnecting UI shows only local identity/inert background plus wait/X controls, never stale host roster, timer, ready, or connection-status facts.
- Verify sync pause/reconnect supports manual pause, disconnect-forced pause, graceful quit, player removal, host persistence, QR disconnected-player recovery, stale recovery-answer failure, and unpause validation.
- Verify every territory is assigned to exactly one player before troop allocation.
- Verify territory visual centers are generated from the large green circles in the territory drawing and are used for troop-count circles.
- Verify army-build triangle barycentric coordinates, leader budget reservation, fixed-point costs, hard budget limits, closest-ratio selection, and budget-maximal non-dominated results.
- Verify troop allocation requires at least one troop per owned territory and prevents placements that would make that impossible.
- Verify local allocation uses configured turn order, pass-and-play handoff screens, allocation timer, timeout random completion, and second allocation turns after redistribution.
- Verify sync allocation uses simultaneous private allocation, host-authoritative timer, ready/waiting state visible to all players, and host advance only when all remaining players are ready.
- Verify allocation player removal redistributes territories and troops exactly as specified, unreadying affected sync players and adding second allocation turns for affected local players.
- Verify read-only game map visibility for own territories, connected opponent territories, and distant opponent territories, using all gameplay connections including ship connections.
- Verify spy success, spy failure, spy loss, and spy intel clearing after the spy phase.
- Verify reinforcements can be placed only on owned territories.
- Verify attacks enforce adjacency, leave-one-behind, and source-target once-per-turn rules.
- Verify both players complete private prediction and arrow challenge steps before battle.
- Verify weighted dice respond to effectiveness.
- Verify casualties are sampled from actual troop ratio weighted by opponent preparedness.
- Verify conquest moves all committed survivors into the target.
- Verify giving up is unavailable before the first roll and returns committed survivors afterward.
- Verify post-battle reveal rules for all outcomes.
- Verify fortify allows one adjacent mixed-source move and additional cavalry movement through owned territory.
- Verify eliminated players are skipped and cannot act.
- Verify game over triggers when one player owns all territories.
- Verify sync host-authoritative state updates include committed game facts promptly enough to resume, without syncing transient visual UI state.
- Verify sync private battle preparation works on separate devices.
- Verify PWA installability and GitHub Pages build output.
