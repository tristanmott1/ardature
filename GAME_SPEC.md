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
- Combat score: a score from 0 to 10 derived from the battle troop mixture, either deterministically in regular mode or by challenge sampling in challenge mode.
- Attack: one locked commitment from one owned territory into an enemy territory reached by an outgoing directed edge.
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
| Dwarf | Orc | Heavy: numerous, low score |
| Rohirrim | Warg | Cavalry: middle quantity, middle score |
| Elf | Uruk-hai | Elite: fewer, high score |

Rules that use troop mixtures should refer internally to the three abstract mixture classes:

- Heavy: dwarf/orc.
- Cavalry: rohirrim/warg.
- Elite: elf/uruk-hai.

Each player also has a leader troop: wizard for light-side colors and witch-king for dark-side colors. The leader is allocated like a troop and fights like a troop, but it is not part of the heavy/cavalry/elite army-build triangle.

The UI should render the appropriate side-specific names and art for each player.

### Spies

Each player begins with one spy:

- Light players have a Gollum/Smeagol spy.
- Dark players have a crow spy.

The spy is not a troop and does not count toward troop totals. A spy may be available, captured on a territory, or dead.

When a spy is available, the owning player can use it for spy attempts. When a spy is captured, it becomes a board object on the territory where it was captured. The captured spy has:

- an owner: the player whose spy it is
- a custodian: the player currently holding the spy prisoner
- a territory: the territory where the spy is imprisoned

Captured spies are visible whenever a viewer is allowed to see the detailed unit contents of that territory. This includes the territory owner through normal inspection and any player who successfully spies on that territory. Captured spies are shown with committed circular captured-spy PNG icons using black vertical prison bars. The icon ring is colored by the spy owner's player color.

Captured spies do not count as troops, cannot attack, and cannot be used for spy attempts. Captured spies can be moved during fortify like pieces, but they still do not count as troops and still cannot attack.

If the spy owner captures or otherwise gains control of the territory where their captured spy currently is, that spy is released immediately and becomes available again. The recovery depends on the spy's current territory, not necessarily the territory where the spy was originally captured. If a different player captures that territory, that player gains custody of every captured spy on the territory and those spies remain imprisoned on that territory. Capturing a territory always transfers custody of all captured spies on it, and releases only the captured spies owned by the new territory owner.

When a player is eliminated and owns no territories, that player's spy dies, whether it was available or captured.

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
- Troop allocation style: manual or random.
- Troop allocation time limit for manual allocation: none, 1 minute, 2 minutes, 3 minutes, 4 minutes, or 5 minutes.
- Attack style: challenge or regular.
- Starting troop budget by original player count.
- Reinforcement formula constants.
- Region bonus definitions.

The setup/draft milestone exposes player colors, turn order, territory draft style, draft pick timer, troop allocation style, troop allocation timer, and attack style. Random draft forces pick time to unlimited. Random troop allocation forces allocation time to unlimited. The troop allocation milestone uses the configured allocation style/timer and the starting troop budget rules documented below. The turn-loop milestone uses the reinforcement constants, region bonus values, and attack rules documented in `docs/gameplay-turns-v1.md`.

### Territory Assignment

Every territory must be owned by exactly one player before starting troop allocation.

Supported assignment modes:

- Random draft: the app simulates a snake draft where each pick chooses a random remaining territory.
- Round-robin draft: players select territories one at a time in forward turn order, repeating until every territory is owned.
- Snake draft: players select territories one at a time in forward order, then reverse order, repeating until every territory is owned.

The draft start is based on turn order. The starting drafter is chosen so the final pick belongs to the player who precedes the first-turn player. Random draft still uses snake ordering because that ordering determines which players receive extra territories when 42 territories do not divide evenly by player count.

The draft engine should store progress rather than precomputing one fixed pick queue. Removed players are skipped, and the same round-robin or snake pattern continues until every territory is owned.

### Initial Troop Allocation

After all territories have owners, the app either enters manual initial troop allocation or immediately performs random initial troop allocation. The exact implementation source of truth for this milestone is `docs/troop-allocation-v1.md`.

Rules:

- Manual allocation has players build and place their army through the allocation UI.
- Random allocation skips the allocation UI, randomly samples each player's army mixture, uses the same budget/cost rules as manual allocation, gives every owned territory one troop, then places extras only on owned territories with an active outgoing directed gameplay edge to an opponent territory.
- In manual allocation, each player first chooses an army mixture using a reusable triangle component.
- The triangle uses barycentric coordinates for army building.
- Light-side colors (`green`, `blue`, `yellow`) use dwarf, rohirrim, and elf circular troop icons.
- Dark-side colors (`red`, `purple`, `black`) use orc, warg, and uruk-hai circular troop icons.
- Light-side colors also receive a wizard leader. Dark-side colors also receive a witch-king leader.
- All troop and spy icons should use an outer ring colored by the owning player's color anywhere they appear.
- The gameplay mixture troop classes are heavy, cavalry, and elite.
- The leader troop is not part of the triangle mixture and allocates like any other troop.
- Original player count determines budget: 2 players `40`, 3 players `35`, 4 players `30`, 5 players `25`, 6 players `20`.
- The leader troop costs `1` budget and is guaranteed exactly once in each player's base army.
- Army costs use fixed-point units. The current scale is `5` units per budget point: leader `5`, heavy `4`, cavalry `5`, and elite `6`.
- After reserving the leader, every candidate heavy/cavalry/elite army must stay within budget and leave fewer units than the cheapest troop costs.
- From those budget-maximal integer armies, choose the actual troop ratio closest to the triangle marker by squared ratio error. Break ties by unused budget, then stable heavy/cavalry/elite order.
- No resulting army can be strictly improved by adding a troop without exceeding its budget. Triangle corners express the strongest possible preference but are not guaranteed to remain literally pure when a pure army would leave enough budget for another class.
- The army-build modal shows live counts above the triangle with the shared known-content icon row. Troop types whose count is `0` are hidden and the remaining icons are centered. The count row is sized to keep all four starting troop types on one line without changing the large icon size, so count changes do not make the modal jitter.
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
- Directed outgoing adjacency list.
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
| Rhûn | 4 heavy |
| Mordor | 3 heavy |

## Gameplay Connections And Dynamic Passes

All gameplay uses the active outgoing directed gameplay graph. The generated directed graph from `maps/territory-key.md` is the base graph. Game code must not import or use generated connections directly for rules; it should ask the shared graph helpers for active outgoing edges, active reachability, and active distance.

Dynamic pass states live in `GameState` after regular turns begin:

```text
caradhrasPassState = null before the first regular turn
caradhrasPassState = integer 1-10 during regular turns
pathsOfTheDeadState = null before the first regular turn
pathsOfTheDeadState = integer 1-5 during regular turns
```

`caradhrasPassState` represents current weather on the Rivendell-Caradhras pass:

- `1`: completely clear
- `2-5`: passable, increasingly cloudy/snowy
- `6-10`: impassable, increasingly severe

When `caradhrasPassState` is `1-5`, the active graph includes every generated directed edge between Rivendell and Caradhras. When `caradhrasPassState` is `6-10`, every directed edge between Rivendell and Caradhras is treated as nonexistent. This affects every edge-based rule and view:

`pathsOfTheDeadState` represents the ghostly opening of the Paths of the Dead from Edoras to Lamedon. The generated base graph contains `Edoras -> Lamedon` and never contains `Lamedon -> Edoras`. When `pathsOfTheDeadState` is `1-3`, `Edoras -> Lamedon` is treated as nonexistent. When it is `4-5`, that one directed edge is active. The reverse direction is never active.

Dynamic pass filtering affects every edge-based rule and view:

- spy shortest-path capture probability
- successful-spy same-opponent adjacent total reveals
- read-only opponent troop-total visibility
- explore-mode related-territory highlights
- attack source-target legality
- fortify immediate-source legality
- fortify owned-path source eligibility
- random allocation opponent-border targeting
- any future gameplay helper that asks for outgoing edges, reachability, or distance

Physical border ink remains visual map data. Dynamic pass state never deletes or redraws static border ink.

New authoritative games keep both dynamic pass states as `null` through setup, draft, and troop allocation. When the first regular turn loop is created after allocation, Caradhras is sampled uniformly from `1-10` and Paths of the Dead is sampled uniformly from `1-5`. A null Paths state is closed. Once initialized, each value is fixed through each player's whole turn. Each changes exactly once when a turn actually advances to the next player. Pausing, refreshing, reconnecting, opening handoff, resolving an in-progress battle, confirming elimination, or resuming the same current turn does not drift a pass by itself.

At turn advance, sample this Caradhras drift table from the current state:

| Delta | Base weight |
| --- | --- |
| -2 | 20 |
| -1 | 20 |
| 0 | 20 |
| +1 | 20 |
| +2 | 20 |

Before sampling, discard deltas that would leave the `1-10` range, then normalize the remaining weights. For example, from state `10`, only deltas `-2`, `-1`, and `0` remain, so the next state is `8`, `9`, or `10` with equal probability `20 / 60 = 33.3%` each.

At turn advance, sample this Paths of the Dead drift table from the current state:

| Delta | Base weight |
| --- | --- |
| -1 | 40 |
| 0 | 20 |
| +1 | 40 |

Before sampling, discard deltas that would leave the `1-5` range, then normalize the remaining weights.

The map renders the matching committed icon from `public/caradhras-pass/pass-01.svg` through `pass-10.svg` above the Rivendell-Caradhras connection only after regular turns begin and `caradhrasPassState` is an integer. Paths of the Dead renders `public/troops/icons/ghost.png` at the Edoras-Lamedon midpoint only during regular turns and only for states `2-5`. Its opacity is `25%`, `50%`, `75%`, and `100%` for states `2`, `3`, `4`, and `5`. These icons are visual, pointer-inert, and synced/persisted only through the authoritative integer states.

## Information Visibility

Every player has access to the map throughout the game, but the map is rendered differently per viewer.

For territories owned by the viewing player:

- Territory owner color is visible.
- Exact troop counts by class are visible.
- Total troop count is visible.
- Captured spies imprisoned on that territory are visible with owner-colored spy icons and black prison bars.

For non-owned territories that cannot be reached by one active outgoing directed gameplay edge from any territory owned by the viewing player:

- Territory owner color is visible.
- No troop information is visible.

For non-owned territories that can be reached by one active outgoing directed gameplay edge from at least one territory owned by the viewing player:

- Territory owner color is visible.
- Total troop count is visible.
- Troop counts by class are hidden.

Spy results are a temporary exception during the spy phase only.

### Spy Intel Visibility

On a successful spy attempt:

- The selected enemy territory reveals exact troop counts by class.
- The selected enemy territory reveals captured spies imprisoned there.
- Enemy territories reachable by one active outgoing directed gameplay edge from the selected territory and owned by the same opponent reveal total troop counts.
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

The turn-loop implementation is documented in `docs/gameplay-turns-v1.md`. Reinforcements, spy, attack, and full fortify are the active turn-loop scope.

There is no normal turn timer in the first turn-loop implementation. Draft timers and allocation timers remain as documented, but spy, reinforcements, attack choice, and fortify/end-turn do not use a turn timer.

## Spy

Spy is optional and can be used at any point during the active player's turn when no other action is in progress:

- before starting reinforcements
- after reinforcements and before attack or fortify
- before or after completed attacks

Spy cannot be used during reinforcement placement, during an attack, during fortify, or after fortify ends the turn.

If the active player's spy is captured, the spy button is unavailable until that spy is released. The button should be missing but reserve its spacing so the action section does not jump.

### Spy Targeting

The selected spy target must be owned by an opponent. Any opponent territory may be selected because the directed gameplay graph remains reachable.

The action section instruction row describes the current local turn prompt. When no action is selected, it says `Choose an action`. When spy targeting is selected, it says `Select a territory to spy on`. While successful spy intel is visible, it says `View territory`. During reinforcement placement, it says `Select a territory` until an owned territory is selected, then `Add troops to {territory}`. During attack setup, it says `Select a territory to attack from`, then `Select a territory to attack`, then `Choose attacking troops`. During fortify setup, it says `Select a territory to fortify`, then `Select territories to fortify from`. When spy setup is active, the regular action buttons are replaced by one black, horizontally centered `Cancel Spy` button. When attack setup is active, they are replaced by one black, horizontally centered `Cancel Attack` button. When fortify setup is active, they are replaced by one black, horizontally centered `Cancel Fortify` button and a black `Skip` button. `Skip` ends the turn immediately without confirmation. The cancel action row keeps the normal action-bar height while centering the cancel/skip controls. Starting, canceling, or finishing a turn action clears the default map inspection selection so normal map exploration does not resume with an action territory preselected. Selecting an opponent territory while spying opens a compact confirmation sheet with X and check controls. While this confirmation sheet is active, the map is frozen, manual pan/zoom controls are hidden, troop/action sections are hidden, and the target is canceled with the sheet X rather than by tapping the selected target again.

## Unit Icon Display Contract

All troop and captured-spy rows use one shared display contract across allocation, reinforcements, explore/info mode, successful spy intel, attack troop commitment, battle modal rows, battle result rows, and fortify.

When exact contents are unknown, show exactly four side-aware troop icons: heavy, cavalry, elite, and leader. Use the selected territory owner's color/side for the icon art, disable/gray every icon, show `?` in every count bubble, and never show captured spies.

When exact contents are known, show only troop icons with counts greater than zero. Show captured spy icons only when captured spies are actually present in that row/location. Captured spies appear inline with troop icons, not in permanent empty spy slots. Center the visible icon group. If captured spies push a known row beyond five icons, it may wrap into a second centered line. The maximum visible known row is nine icons: four troop types plus five opponent spies. `+` and `-` row affordances are outside the centered icon group and must not affect centering.

Rows required by an action keep their reserved row height even when empty. During initial troop allocation, an empty selected territory row shows no icons and no `+`/`-` affordance but still occupies exactly the same space. Attack troop commitment intentionally does not show captured spies because captured spies cannot attack.

The capture probability is based on the shortest outgoing directed gameplay path from any active-player territory to the selected target territory:

| Distance | Capture probability |
| --- | --- |
| 1 | 20% |
| 2 | 40% |
| 3 | 60% |
| 4 | 80% |
| 5 or more | 90% |

All outgoing directed gameplay connections from `maps/territory-key.md` count, including ship connections. Physical generated borders are not used for gameplay distance.

### Spy Result

If the spy succeeds:

- reveal the target territory's exact heavy/cavalry/elite/leader counts
- reveal captured spies imprisoned on the target territory
- reveal total troop counts in territories reachable by one active outgoing directed edge from the selected territory and owned by the same opponent
- show outgoing-adjacent totals through normal white map troop counters
- show the target territory through the troop section in information mode using the same exact-count UI used for own territories
- replace the action section buttons with a dismiss button
- preserve the spy for future use

The active player may inspect the successful spy intel as long as they want. Pressing dismiss clears the intel and resumes the turn. Spy intel is a temporary UI snapshot and does not become permanent memory.

If the spy fails:

- reveal no troop information
- queue a blocking notification for the spy owner: `Your spy was captured in {territory}`
- place the spy on the target territory as a captured spy
- set the target territory owner as the spy custodian
- make that player's spy unavailable for future spy attempts

The defender whose territory captured the spy receives a separate blocking notification: `You captured {spy owner}'s spy in {territory}`. Successful spy attempts are silent to the defender.

Spy notifications are affected-player-only, queued in order, persistent through pause/refresh/reconnect, and dismissed one at a time with a check button. They do not auto-dismiss. In local mode, notifications for another player wait until that player's next turn. In sync mode, the host queues notifications authoritatively and delivers them to the affected player after reconnect if necessary.

The captured spy remains on its current territory until released or moved by fortify. If the spy owner gains control of that current territory, the spy becomes available again immediately, including during the same turn. If another player gains control of that current territory, custody transfers to that player and the spy remains captured there.

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

The player controls only the heavy/cavalry/elite breakdown of this territory-count budget. The UI shows the total reinforcement pool, including fixed region bonuses, above the triangle with the shared known-content icon row. Because reinforcements never add a leader, the leader icon is hidden unless a future rule creates a nonzero leader count.

### Region Bonuses

The active player receives fixed bonus troops for each full region they own at the beginning of their turn:

| Region | Bonus |
| --- | --- |
| Eriador | 6 elite |
| Rhovanion | 5 elite |
| Gondor | 5 cavalry |
| Rohan | 3 cavalry |
| Rhûn | 4 heavy |
| Mordor | 3 heavy |

The player does not choose the breakdown of region bonus troops. Region bonus troops are additive fixed troops, using the same fixed-troop pool mechanics as troops inherited from removed players.

### Region Control Notifications

Region control notifications are affected-player-only and use exact plain wording:

- `You control {region}`
- `You lost {region}`

They are queued in order, persist through pause/refresh/reconnect, block the app until dismissed, and are dismissed one at a time.

At the start of the turn loop, region control is computed from the drafted map. If a player drafted an entire region and still controls it at the beginning of that player's first turn, that player receives `You control {region}`.

During future combat, gaining a region on your own turn should notify immediately. Losing a region, or gaining/losing a region through opponent action or player removal, should be queued until the affected player's next turn in local mode. In sync mode, the host may deliver the affected player's notification immediately after the committed ownership change, except for first-turn drafted-region notifications which are shown at that player's first turn.

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

The active player may make any number of attacks after reinforcements and before fortify. The active player may also skip attacking and choose fortify.

Each attack is a locked commitment from one owned source territory into an opponent-owned target territory reached by an outgoing directed edge.

### Attack Restrictions

To declare an attack:

- The target territory must be owned by an opponent.
- The source territory must be owned by the active player.
- The source territory must have an active outgoing directed gameplay edge to the target territory.
- Outgoing directed land and ship gameplay connections both count.
- The source territory must contain at least two total troops before committing.
- The attack must commit at least one troop.
- The committed attacking troops must leave at least one troop behind in the source territory.
- The committed attacking troops may be any mixture of heavy, cavalry, elite, and leader troops present in the source territory.
- Captured spies do not count as troops and cannot attack.
- The same source-target pair cannot be attacked more than once in the same turn.
- A source-target pair already attacked this turn is not selectable during target selection and is not shown as a valid target hint.

The source-target pair restriction applies even if the attacker retreats, loses, or fails to conquer the territory.

### Attack Setup

Attack setup is local UI until committed attacking troops are confirmed. It can be canceled at any point before confirmation.

Once the active player presses `Attack`, the action bar buttons are replaced with a single cancel button. That cancel button is the only way to cancel the attack before troop confirmation. Canceling clears the selected source, selected target, committed troops, and default map inspection selection.

The setup steps are:

1. Select the territory to attack from.
2. Select the territory to attack.
3. Choose attacking troops.
4. Confirm the attack.

After the source is selected, it remains highlighted and the action immediately advances to target selection. There is no source confirmation sheet. After the target is selected, both source and target remain highlighted and the action immediately advances to troop commitment. There is no target confirmation sheet.

During troop commitment, the troop section uses the same visual structure as reinforcement placement:

- The top row has the add symbol and shows troops on the attacking territory that are still available to commit.
- The bottom row has the remove symbol and shows committed attacking troops.
- The text between rows is `{source territory} to {target territory}`.
- The confirm/check button is disabled until at least one troop is committed and at least one troop remains behind in the source.

Once committed troops are confirmed, the attack is locked and must happen. The troop section and action section hide, the challenge/battle modal appears, the player bar remains visible, the map freezes, and camera buttons hide.

### Attack Style

Setup includes an `ATTACK STYLE` section with one dropdown:

- `Challenge`
- `Regular`

Both options are selectable.
The default is `Regular`.

In `Regular` mode, both sides receive deterministic scores from their battle troop mixture.

In `Challenge` mode:

- The attacker always receives a challenge modal.
- In sync mode, the defender also receives a challenge modal.
- In local mode, the defender receives a deterministic score.
- The temporary challenge modal contains one centered button.
- The challenge button, and later the challenge itself, is the only content in the modal; it is not embedded inside the regular battle layout.
- Pressing the button immediately samples and submits that player's score from the beta score distribution.
- The player cannot preview the score before submission.
- Once submitted, the score is fixed for the battle.
- If either score is missing, the battle modal shows a waiting message and dice controls are disabled.

Future challenge mechanics should make player skill naturally produce a sample from the same beta score distribution. The placeholder button exists only to sample that distribution directly.

### Authoritative Battle State

Confirmed battle state is authoritative game state.

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

The active turn also stores source-target pairs already attacked this turn.

Committed troops define the attacker's battle force. Uncommitted troops in the source territory have no bearing on the attack score, dice, or casualties. The defender's battle force is all troops in the target territory at attack lock.

Scores are fixed at battle lock/challenge submission and do not change as troops die.

Committed attacking troops still visually count on the source territory while the battle is active. Casualties reduce the source territory total live. If the attacker retreats, surviving committed troops remain on the source. If the attacker captures the target, surviving committed troops move from source to target at battle end.

### Battle Modal

The battle modal is centered and is a task modal.

The defender is displayed at the top: defender name centered above the defender troop row, defender score centered below it. The attacker is displayed at the bottom: attacker score centered above the attacker troop row, attacker name centered below it. Scores render with one decimal and `/ 10`, for example `7.3 / 10`.

Dice are centered between the two scores. Defender dice are white with black pips. Attacker dice are red with white pips. Dice are large raw dice controls with no surrounding card or rectangle. Before the first roll, blank dice show the correct dice count with no pips.

While the battle is active, the modal layout is a fixed vertical stack: reserved message row, defender name, defender troop row, defender score, dice, attacker score, attacker troop row, attacker name, and retreat button. The top message row is always present. It may be empty or say `Waiting...`.

Battle unit rows follow the shared known-content icon contract. They show troop types with counts greater than zero plus captured spies present with that battle force. Visible icons keep the normal compact icon size and recenter. If a side has no troops after the battle ends, that row renders no troop icons but still reserves the same vertical row space.

Both sides' current battle troop breakdowns are visible in the battle modal. Everyone who sees the modal sees the same battle contents, captured spies present with the battle forces, and which troop types die. Captured spies are not casualties and do not affect dice. The modal shows the latest roll only, not a full roll history. The latest roll always shows exactly the dice that were rolled, sorted highest to lowest from left to right for both attacker and defender. Casualties change troop rows immediately and change the next roll's dice count, but they do not remove dice from the just-finished roll.

In sync mode, only the attacker and defender see the battle modal. Only the attacker can roll, retreat, or dismiss the final result. Other connected players do not see the battle modal, but they do see committed map facts such as live territory troop totals and ownership changes. Non-participants stay in normal explore mode, but the battle source and target territories flash between selected and unselected visual states while the battle is active. The source/attacking territory flashes at a higher frequency, while the target/defending territory uses a slower pulse. Non-participants may still select any territory, including the source or target. If the selected territory is one of the flashing battle territories, the battle flash overrides the normal selected-fill color.

In local mode, only the active attacker sees the battle modal. The defender does not receive a handoff.

The attacker must roll at least once before retreating. Before the first roll, the retreat button is disabled. After at least one roll, the attacker may press retreat. Retreat asks for confirmation. If retreat is confirmed, the attack ends immediately.

When battle ends by conquest or attacker elimination, the normal battle layout is replaced by a simple result layout. It shows `{winner} defeated {loser}`, the winning side's resulting unit row, the final roll dice, and the final check button. The result layout does not show scores, the loser row, or the regular mirrored stack. If the defender wins, the result row shows surviving defending troops plus any captured spies already on the defended territory, and the final roll dice appear below the victorious army. If the attacker wins, the final roll dice appear above the victorious army, and the result row shows surviving attacking troops plus captured third-party spies from the conquered territory. A captured spy owned by the attacker is released immediately by the conquest and appears in this victory result row as the attacker's normal unbarred spy icon; after the result is dismissed, that released spy is no longer displayed in the territory because an available spy is not tied to one territory. Nothing else may happen until the attacker dismisses that final result. When the attacker confirms a retreat, the battle ends immediately and the battle modal closes without showing a final retreat message.

### Combat Score

Each side receives one score from `0` to `10`. The score determines that side's die distribution. It does not directly change troop counts or the Risk-like comparison rules.

Troop score values:

| Troop type | Score value |
| --- | ---: |
| Heavy | 2.5 |
| Cavalry | 5 |
| Elite | 7.5 |
| Leader | 9 |

The leader is stronger than elite but below the endpoint score `10`, so leader-only challenge distributions remain valid.

For battle troop counts:

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

This requires at least one battle troop.

In regular mode:

```text
S = mu
```

In challenge mode:

```text
p = mu / 10
kappa = 20
alpha = kappa * p
beta = kappa * (1 - p)
Y ~ Beta(alpha, beta)
S = 10Y
```

The beta distribution has mean `mu`. A leader-only force has `p = 0.9`, `alpha = 18`, and `beta = 2`.

### Score To Dice

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

Constants:

| Constant | Value |
| --- | ---: |
| `kAminus` | 0.14331904306524929 |
| `kAplus` | 0.27527774317548487 |
| `kDminus` | 0.11630715538926006 |
| `kDplus` | 0.21211393558380784 |

For die face `j` in `{1, 2, 3, 4, 5, 6}`:

```text
P_t(j) = exp(t * (j - 3.5)) / sum(r = 1..6) exp(t * (r - 3.5))
```

Score `5` produces fair dice. Scores above `5` make high faces more likely. Scores below `5` make low faces more likely.

### Dice Rolls

For each roll:

- Attacker rolls up to 3 dice.
- Attacker dice are capped by the number of surviving committed attacking troops.
- Defender rolls up to 2 dice.
- Defender dice are capped by the number of surviving defending troops in the target territory.
- Sort attacker dice from highest to lowest.
- Sort defender dice from highest to lowest.
- Compare the top dice in order.
- The number of encounters is `min(attacker dice count, defender dice count)`.
- For each encounter, exactly one troop dies.
- Attacker kills one defender when the attacker die is strictly greater.
- Otherwise the attacker loses one troop.
- Defender wins ties.

The number of troops that die in one roll is always the number of encounters.

### Casualty Selection

When a troop dies, randomly sample one troop from that side's remaining battle force.

Rules:

- Heavy, cavalry, and elite troops are sampled uniformly by individual troop.
- Leaders are excluded from casualty sampling while any non-leader troop remains.
- A leader can die only if it is the last remaining troop on that side.
- Captured spies are never casualty candidates.

For example, if a force has `2 heavy` and `1 elite`, a casualty has a `2/3` chance to be heavy and a `1/3` chance to be elite. If a force has `1 heavy` and `1 leader`, the heavy must die before the leader can die.

When an attacking troop dies, subtract it from surviving committed attackers and from the source territory. When a defending troop dies, subtract it from surviving defenders and from the target territory.

### Battle End

Battle ends when:

- all defending troops are dead
- all committed attacking troops are dead
- the attacker retreats after at least one roll and confirmation

If all defending troops die:

- The attacker conquers the target territory.
- All surviving committed attacking troops move into the conquered territory.
- Uncommitted source troops remain in the source territory.
- The target territory changes owner to the attacker.
- Captured-spy custody/release rules run for the conquered territory.
- Region control changes and elimination checks run after ownership changes.

If all committed attacking troops die:

- The target territory remains owned by the defender.
- The source territory keeps only the uncommitted troops that were left behind.
- The attacker may continue attacking elsewhere after dismissing the final result.

If the attacker retreats:

- Surviving committed attackers remain on the source territory.
- The target territory remains owned by the defender.
- The same source-target pair may not be attacked again this turn.
- The attacker may continue attacking elsewhere after dismissing the final result.

### Pause, Refresh, And Removal During Battle

Pause must preserve locked attacks.

Snapshots must preserve source, target, committed attacking troops, surviving attacking troops, surviving defending troops, submitted/computed scores, latest roll, whether at least one roll has happened, terminal result, used source-target pairs, pending elimination/victory state, and forced host-transfer state.

Completed scores persist through pause, refresh, and reconnect. If the game pauses while a player is still inside an unfinished challenge, that unfinished challenge restarts on resume. The score is not sampled until the challenge button is pressed and submitted.

The normal pause button is disabled while this device is actively doing a challenge interaction. Forced pause can still happen because of refresh/close or sync disconnect.

## Phase 4: Fortify

Fortify is optional and happens after the active player is done attacking. Once the player advances to fortify, there is no return to attack.

Pressing `Fortify` begins local setup. The regular action buttons are replaced by a black, horizontally centered `Cancel Fortify` button and a black `Skip` button. `Cancel Fortify` resets the whole fortify action and returns to the post-reinforcement action choice. `Skip` has no confirmation; it ends the turn immediately without moving units.

The active player may choose exactly one owned target territory to fortify if they do not skip.

After selecting a target, the player may move legal units into it from eligible owned source territories. Fortify setup is local UI until the final fortify confirmation. Sync passive viewers see only committed host facts after fortify/end-turn commits.

### Fortify Setup

Setup steps:

1. Select the owned target territory to fortify.
2. Select one or more owned source territories to fortify from.
3. Move legal units from selected sources into the target.
4. Confirm the fortify action, or press `Skip` before confirmation to end the turn without fortifying.

The target remains selected while choosing and switching sources. Pressing a selected source again unselects that source but keeps the target. The troop section opens only after a source is selected.

The troop section uses allocation-style rows:

- top/source row: `+` affordance, units available to move from the selected source
- middle label: `{source} to {target}`
- bottom/target row: `-` affordance, total units currently in the target in the provisional fortify view, including original target units plus provisional additions from every source

The final fortify check button is disabled until at least one troop or captured spy has been committed to move. Confirming commits every provisional move at once, ends the current player's turn, and advances to the next remaining player. Sync devices send only the final `{ type: "commitFortify", targetTerritoryId, movesBySource }` command. Skip sends `{ type: "skipFortify" }`. Provisional target, source, and movement UI is never synchronized.

In allocation-style troop rows, the `+` and `-` icons are buttons. Pressing one moves as many currently legal units as possible, while individual unit icons remain one-at-a-time controls. When a bulk action must leave troops behind, it reserves heavy first, then cavalry, then elite, then leader. Initial allocation may reserve multiple troops for empty territories, so it keeps reserving heavy until the reserve requirement is satisfied or the heavies are gone, then proceeds through the same priority.

### Source Eligibility

A source territory is eligible if it is owned by the active player, is not the target, and can reach the target through a chain of active outgoing directed gameplay edges through territories all owned by the active player. This chain uses active outgoing directed gameplay connections, including ship connections. Physical generated borders are irrelevant.

An immediately connected source has an active outgoing directed gameplay edge to the target. A remote source can reach the target through owned territory chains but does not have a direct active outgoing edge to the target.

Every source must leave at least one troop behind. Captured spies do not count as troops, so moving spies never satisfies or violates the one-troop-left requirement by itself.

### Unit Movement

Cavalry may move from any eligible source, including remote sources. Cavalry may come from any number of eligible sources.

Heavy, elite, and leader troops can move only from an immediately connected source. The leader counts as a regular troop for fortify movement restrictions. Exactly one source may contribute regular troops during a fortify action. Once one source has contributed any regular troop, regular troop buttons are disabled for every other source. If all regular troops are removed from that source's committed movement, another immediately connected source may become the regular source.

Captured spies are individual tokens, not troop counts. Captured spy icons are visible only where the spies actually are. Selecting a captured spy in the source row moves that entire icon to the target row. Selecting a moved captured spy in the target row moves that exact spy back to its source only if it was moved from the currently selected source during this fortify action.

Captured spies from immediately connected sources follow the same single-source lane as regular troops. They may move from the one immediately connected source that is contributing regular troops/spies. Once that source has moved a regular troop or captured spy, captured spy icons from other immediately connected sources are disabled unless the first source's regular/spied movement is fully undone.

Captured spies from remote sources can move only by accompanying cavalry from that same source. If a remote source has at least one cavalry committed, captured spies from that remote source may also be moved. If cavalry from that remote source is reduced back to zero, every captured spy moved from that remote source is automatically returned to that source. Remote captured spies never establish the one regular-source lane.

If an active fortify action is canceled before confirmation, every provisional move is undone.

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

If a territory containing captured spies is assigned during redistribution, custody of those spies transfers to the new territory owner. Any captured spy owned by the new territory owner is released immediately.

## Elimination and Win Condition

A player becomes pending-eliminated when they own zero territories, but the removal is not applied silently.

Elimination is resolved after the battle result is dismissed:

- The battle result modal is shown first.
- After the battle result is dismissed, every connected device shows an elimination modal: `{player} has been eliminated`.
- In sync mode, everyone sees the modal, but only the host can confirm it. Non-host devices are blocked until the host confirms.
- Confirming elimination removes that player from the game, disconnects that peer immediately if sync transport exists, kills that player's spy whether it was available or captured, and continues the current player's turn.
- Elimination does not redistribute anything because the eliminated player owns no territories.
- Eliminated players are forgotten by the active game. They cannot reconnect, receive reinforcements, take turns, or appear in future restart lobbies.
- If the eliminated player is the current sync host and at least two players remain, confirmation moves the game into a forced paused host-transfer state before the player is removed. The game cannot resume until the host transfers authority to a different connected player. After transfer succeeds, the old host is removed from the game and the new host may resume after all remaining players are connected or recovered.

If elimination leaves exactly one remaining player, the game is over instead of showing the normal elimination confirmation:

- The modal says `{remaining player} wins`.
- The options are `Exit` and `Restart`, not a single confirm button.
- `Exit` ends the game for everyone.
- `Restart` returns to the setup lobby as if rewinding to before this game started, with only the final two connected players: the winner and the final eliminated opponent. Previously eliminated players are already disconnected and forgotten.

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
13. Attack challenge.
14. Battle resolution.
15. Fortify phase.
16. Game over.

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

Sync setup identity is always `{ id, name, color }`. QR offers, QR answers, snapshots, and lobby rows must carry/display name and color together. The app should never render a named sync player with an unknown color and rely on a later profile update to repair it.

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

The sync lobby has no reconnecting or disconnected state. If a player stops being connected before the draft starts, the host removes that player from the lobby immediately. If the host restarts a paused active game back to setup, reconnecting and disconnected players are removed before the setup lobby is shown. Active-game recovery QR behavior applies only after the draft has started.

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

During manual drafts, the active player selects a remaining territory on the map. The current-player bar stays visible during confirmation.

Draft selection flow:

1. Select a remaining territory.
2. Show a compact confirmation bottom sheet with cancel and confirm controls.
3. Confirming assigns the territory immediately and colors it with the owner's player color.
4. Immediately advance to the next pick.

The confirmation sheet is a compact bottom sheet with the territory name and cancel/confirm controls. The shared player bar remains visible during confirmation. The pending territory itself is highlighted on the map for the active drafting viewer. While confirmation is open, the map is frozen; the active drafter must use the sheet X to cancel or the check to confirm.

Draft result notifications do not exist. Confirmed picks, including timeout/autodraft picks, immediately update ownership and advance the draft.

In sync mode, pending selections are local-only. Another player's pending selection is not synced, never moves or focuses your map, and never highlights on your device. Confirmed picks are synced as ownership changes.

The compact draft controls show the active player's draft progress as confirmed picks over expected final picks, such as `3 / 11`. The expected final pick count is computed from the current draft style, frozen turn order, active players, and remaining territories.

Once draft starts, the game-stage layout has exactly four ordered sections: player bar, optional troop section, full-screen map, and optional action section. The map remains full-screen underneath all persistent game UI; player/troop/action sections cover it rather than resizing it. Those sections define the visible aperture for explicit return-to-map and focus camera intents, but showing or hiding them does not mutate the current camera. Camera intents are emitted only after the resulting persistent UI layout has rendered and been measured, so focus/fill-screen use the post-event aperture. The player bar remains visible for the rest of the game, including confirmation sheets, game notifications, pause, allocation, allocation waiting, local handoff, read-only inspection, and turn play. Pause and modal states may hide troop/action sections and cover the map, but they do not hide or cover the player bar. Draft has no troop section and no action section. The bar shows the relevant timer whenever one exists during draft or allocation: live remaining time, paused remaining time, upcoming handoff time, or shared sync allocation time while waiting. No timer is shown after troop allocation.

The return-to-map/fill-screen target is not the maximum zoomed-out view. The map has one stable maximum zoomed-out camera world per orientation, computed by fitting the full generated map frame to the screen aspect. Manual pan, zoom, touch momentum, return-to-map, and territory focus clamp to that stable orientation world until orientation changes. Same-orientation viewport changes, such as mobile browser chrome changing height, do not recalculate the world or move the current `viewBox`.

Game-stage popups and modals are organized by role. Only one overlay is active at a time. If multiple overlays are pending, the app shows them in this priority order:

1. Sync blocked / disconnected
2. Scanner
3. Decision confirm
4. Pause
5. Handoff
6. Army build
7. Game notification
8. Confirm sheet

Every active overlay freezes the map, hides return-to-map and auto-focus controls, and hides troop/action sections until dismissed. The player bar remains visible once draft has started, except for scanner/rejoin utility flows that happen before the device has joined or rejoined the game. The sync allocation waiting page is not an overlay and is not a fifth section; it uses the same upper game-stage section slot as troop content, keeps the player bar and waiting columns visible, and leaves map interaction governed by the normal no-overlay rule.

Overlay roles:

- Confirm sheet: compact bottom sheet with title, optional text, X, and check. Used by draft, spy target confirmation, and later attack/fortify confirmation. Spy uses the optional text for capture probability.
- Army build task modal: centered modal for initial army build and reinforcement army build.
- Game notification modal: centered dismiss-only modal for authoritative region and spy notifications.
- Pause modal: centered modal; sync host pause may include recovery QR tools, while sync non-host pause never shows QR recovery tools.
- Decision modal: centered destructive confirmation for restart and exit/end game.
- Handoff modal: local-only centered arrow gate. Entering local handoff hides troop/action sections, emits a home camera intent for the post-handoff aperture, and freezes user map input while the home animation may continue behind the popup. The player bar shows the next player.
- Scanner modal: QR camera utility. Scanner flows opened before a device joins/rejoins a game are not bound by game-stage player bar rules.
- Sync blocked modal: centered reconnecting/disconnected/host-ended blocker. Reconnecting devices must not present stale host facts as current truth.

Timer behavior:

- If a timed pick expires with a confirmation sheet open, the pending territory is confirmed.
- If a timed pick expires with no confirmation sheet open, a random remaining territory is chosen for the active player.
- If pick time is unlimited, there is no timer and no automatic draft selection.
- If either local or sync mode pauses during draft, the active pick is reset. Any pending confirmation is discarded, and that same player starts the pick again with a fresh full pick timer on resume.
- Draft pause never preserves partial pick time. Allocation pause does preserve partial allocation time.

After all territories are drafted, the app resolves initial troop allocation according to setup configuration. It does not remain on an ownership-only post-draft review screen.

### Initial Troop Allocation View

Manual initial troop allocation is a required game phase after draft and before turn play begins when allocation style is `Manual`. When allocation style is `Random`, the game creates every player's army and territory placements immediately after draft, then proceeds to the first turn.

Army build:

- The current player chooses a heavy/cavalry/elite mixture with the reusable triangle component.
- The current player's side also gives them exactly one wizard or witch-king leader.
- The triangle marker starts in the center.
- The army-build triangle uses barycentric coordinates and allows true `0%` troop classes.
- The UI shows live troop counts while the marker moves using icon count badges, not troop text. Troop types whose count is `0` are hidden and the remaining icons are centered.
- Submitting the army build locks that player's base heavy/cavalry/elite troop counts plus their guaranteed leader.

Territory allocation:

- The player allocates all available troops to owned territories.
- Only owned territories are selectable.
- Selecting an owned territory highlights it locally. If automatic focus is enabled, the app emits a local territory camera intent after the selection layout has rendered. If automatic focus is off, selection changes can reveal the troop section but never move the map.
- The troop section is hidden until an owned territory is selected.
- Pressing the selected territory again unselects it and hides the troop section.
- The troop section shows icon-only remaining troop totals in the top row, the selected territory name between rows, and icon-only selected-territory troop totals in the bottom row.
- The player may remove troops from the selected territory.
- The player may add remaining troops to the selected territory only when enough total remaining troops are preserved to place at least one troop on every still-empty owned territory.
- The player can finish only when all owned territories contain at least one troop and no troops remain unallocated.

Local allocation:

- Players allocate one at a time in configured turn order, skipping removed players.
- Each player completes army build and territory allocation before the next player starts.
- The allocation timer includes army build and territory allocation.
- If time expires, the current army mixture is locked if needed and the rest of that player's troops are randomly allocated.
- After time expiration, the app briefly says `The remainder of your troops have been randomly allocated.`
- The player bar shows the next player, and a simple arrow popup gates the handoff before that player begins.

Sync allocation:

- All players allocate simultaneously on their own devices.
- The host owns the canonical allocation timer.
- Players press ready when finished.
- Ready players go to a local waiting page while unready players stay in allocation.
- Ready is final unless another player is removed and redistribution affects that player.
- The waiting page shows all remaining players in two columns: `READY` and `WAITING`.
- The waiting page keeps the device player's colored player bar visible and shows the shared allocation timer while it is relevant.
- The host can advance only when every remaining player is ready.
- If time expires, the host randomly completes allocation for every unready player.

### Read-Only Game Map

After all remaining players have allocated troops, the app has enough information to render a viewer-specific read-only map. The next gameplay milestone uses that same visibility model inside the turn loop rather than stopping at the read-only map as the final state.

Visibility rules:

- Ownership is visible to everyone.
- A viewer sees total troop counts on their own territories.
- A viewer can select any territory to open the troop section in information mode.
- Pressing the selected territory again unselects it and hides the troop section.
- Selecting an owned territory shows its name plus exact known contents: only troop icons with counts greater than zero, plus captured spy icons actually present there.
- Selecting an opponent territory shows its name and exactly four side-aware troop icons grayed out with `?` in the count bubbles.
- Unknown opponent rows never show captured spy icons.
- Opponent territory breakdowns are never shown during normal inspection, even if the viewer can see the total troop count on the map.
- Opponent territories reachable by one active outgoing directed edge from any viewer-owned territory show total troop count only.
- Opponent territories not reachable by one active outgoing directed edge from any viewer-owned territory show ownership only.
- Captured spies are shown only when exact contents are visible.
- Visibility connections use outgoing directed gameplay connections from the viewer's own territories, including both land and ship connections.
- Visibility connections are independent of physical shared borders in generated geometry.

In local mode, pressing the player name in the player bar cycles the current viewer. Sync mode uses the device's local player as the viewer, including on the host device.

### Sync Turn Viewer Rules

During another player's turn, inactive sync devices show only a read-only/explore-style map using the same viewer-specific visibility rules:

- ownership is visible
- the viewer's own territory total markers are visible
- opponent total markers are visible only where the viewer has gameplay adjacency
- own territory breakdowns are visible only through local inspection
- opponent inspection shows grayed `?` troop icons, never breakdowns, except during that viewer's own successful spy intel
- no turn action controls are shown
- no pending selection, focus, confirmation, or provisional reinforcement placement from the active player is shown

Sync devices update from committed host facts only:

- after reinforcements are finalized
- after attack lock, battle rolls, casualties, retreat, conquest, or final battle dismissal commit
- after fortify/end-turn commits
- after player removal and redistribution commits

The active player's provisional reinforcement edits are local to that player until commit. Spy target selection, spy confirmation sheets, successful spy intel, and attack setup selections are also local/private. The only defender-facing spy event is the failed-spy captured notification. Locked battle state is shared only with the attacker and defender; other sync players see committed map facts but not the battle modal.

### Pause And Player Removal

Local and sync modes use the same pause button placement and icon. In local mode, the pause button is visible during draft. In sync mode, only the host sees the pause button.

Local pause is a true pause of the single-device game, with draft and allocation timers treated differently:

- During draft, the current pick resets. The pending selected territory or confirmation sheet is discarded, and the same player receives a fresh full pick timer on resume.
- During allocation, the timer freezes with remaining time preserved. Army build, territory selection, pending counts, and placed troops remain intact.
- During turn play, the current committed state is preserved according to the turn/action rules.
- Local pause has a restart button, confirmed like quitting, that returns to setup/config with the same players, colors, order, and game config from before the game started.
- Local pause has no end-game or close button.
- Local pause has no disconnected status, reconnect status, or QR reconnect controls.
- Local players can be removed while paused.
- Local refresh or close during an active game phase restores into local pause. Draft resumes with a fresh pick timer; allocation resumes from preserved remaining time.
- Local mode never requires reconnection when reopened because all players share one device.

Sync host pause follows the same timer contract:

- During draft, the active pick timer is not preserved. Any pending selected territory or confirmation sheet is discarded, and the current picker starts over with a fresh full pick timer on resume.
- During allocation, the host preserves remaining allocation time. Ready players stay ready, unready players continue with the same remaining shared timer after resume.
- The host can restart from pause after confirmation, returning connected players to setup while keeping current sync connections open.
- Restart is a clean return to the pre-game lobby: keep only currently connected players, their names/colors/locks/order as of restart, and the current game config; clear every active-game fact from the previous game, including draft ownership, allocation, turn state, notifications, spies, region control, recovery QR text, recovery slots, reconnecting/disconnected status, and host recovery offers.
- Reconnecting and disconnected players are removed because setup lobby accepts connected players only and has no recovery slots.
- Sync pause includes connected, disconnected, and reconnecting player status.
- Sync host pause includes a recovery QR and scan button for disconnected-player recovery as soon as a recovery offer exists. It must never show a blank QR placeholder while that offer is being created.
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
- Reconnecting and disconnected slots are preserved only while an active game remains paused. If the host returns to setup, those players are removed.

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

1. Host pause shows a recovery QR as soon as a recovery offer exists and never shows a blank QR placeholder.
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

The completed sync contract separates authoritative game facts from connection/session state:

- `GameState` stores game facts only.
- `App` owns sync session state such as connecting, connected, reconnecting, disconnected, and host-ended.
- Heartbeat defines whether a session is connected. A stale snapshot is not enough.
- Host-to-joiner updates are revisioned snapshots: `{ type: "snapshot", revision, game }`.
- Joiners ignore stale snapshots.
- Joiner-to-host commands are limited to `profileUpdate`, `draftConfirm`, `allocationUpdate`, `turnCommand`, and `quit`.
- Turn commands carry committed turn facts only: spy confirmation/dismissal, notification dismissal, committed reinforcements, locked attacks, challenge score submissions, battle rolls, retreat, final battle dismissal, elimination/victory confirmation, and fortify/end-turn.
- The host validates every command against the current game state before applying it.
- Host intentional end uses `hostEnded`.
- Host player removal uses `removed` when the peer is still reachable.
- Old unversioned `gameState`, `hostQuit`, and pending-pick messages are not part of the current sync contract.

The host applies valid actions, persists active sync-host state separately from local pass-and-play saves, and broadcasts the resulting revisioned snapshot.

Host transfer is a paused sync-only authority change:

- Transfer can be started by the current connected host whenever a sync game is paused and at least one non-host player is currently connected.
- The destination must be a currently connected non-host player.
- Voluntary transfer does not block resume before it is chosen; forced transfer after host elimination does block resume.
- The old host remains the source of truth until the chosen player receives the latest authoritative paused snapshot and acknowledges the transfer.
- Existing WebRTC data channels are host-centered and cannot be reassigned. The chosen player receives the transfer snapshot and becomes the new host. Every other connected peer returns home and can rejoin through the new host's pause recovery QR.
- During voluntary transfer, the old host app returns home and that player remains in the game as disconnected/recoverable.
- During forced transfer, the old host is eliminated and removed from the game after the chosen player becomes host.
- If the old host was eliminated and at least two players remain, the game enters a forced pause that cannot resume until host transfer succeeds.
- If the host is gone before transfer completes, there is no source of truth to transfer from. Recovery must use the old host's persisted paused model after that host device returns.

Sync frequency should follow a resume-safety rule:

- Send committed game facts promptly enough that the host can resume without outside help.
- Avoid syncing noisy transient UI.
- Draft confirmations, army-build submission, ready, timeout completion, pause, resume, removal, and phase advance are immediate committed facts.
- Allocation troop placement is committed game data. It may be batched or lightly throttled, but must be flushed on ready, pause, visibility change, or page unload where practical.
- Turn-loop facts follow the same pattern: turn start, Caradhras pass state/drift, spy result, captured-spy state, queued spy/region notifications, finalized reinforcement placements, fortify/end-turn, elimination, and game-over are committed facts.
- Attack and battle events follow this pattern: host must receive enough committed data to resume; local setup previews and controls remain local.
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
- Challenge score request.
- Battle resolution update.
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
- Challenge score submission.
- Battle roll request.
- Battle retreat request.
- Battle result dismissal.
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
- Attacker score, once submitted or computed.
- Defender score, once submitted or computed.
- Current surviving attacking troops.
- Current surviving defending troops.
- Latest dice roll.
- Whether at least one round has been rolled.
- Terminal outcome, when finished.

The host should not enable battle dice until both required scores are present.

### Local Pass-and-Play Privacy

Local mode should use explicit pass screens before private information appears.

Example:

- "Pass to Frodo" before Frodo allocates starting troops.

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
  caradhrasPassState: number | null;
  pathsOfTheDeadState: number | null;
  map: MapState;
  territories: Record<TerritoryId, TerritoryState>;
  regions: Record<RegionId, RegionState>;
  setup: SetupState;
  spies: Record<PlayerId, SpyState>;
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
};
```

Suggested spy shape:

```ts
type SpyState = {
  ownerPlayerId: string;
  status: "available" | "captured" | "dead";
  territoryId: string | null;
  custodianPlayerId: string | null;
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
- The current Caradhras pass state is part of active game persistence and sync host snapshots.
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

The circular troop icon crops under `public/troops/icons/` are raster PNGs, not SVGs. They should be used anywhere the UI needs troop type icons. Counts should be rendered as small white circular badges attached to the icon. Troop and spy icons should render with a runtime outer ring colored by the owning player's color. Captured spy icons should use the committed `smeagul-captured.png` and `crow-captured.png` assets.

Troop and spy icons are core UI assets. The app should preload the full icon set at startup, and the service worker should precache the committed troop/spy PNGs, so first-use spy buttons, captured spies, allocation rows, army build, reinforcement rows, and inspection rows render without a visible blank or decode delay.

## Not Yet Fixed

The following decisions are intentionally open:

- Final app name and displayed title.
- Future tuning of starting troop budgets and troop costs.
- Future tuning of reinforcement troop costs and region bonus values.
- Future challenge interaction mechanics beyond the temporary sample button.
- Future tuning of combat score constants, tilt constants, and beta concentration.
- Fortify cavalry radius final value.
- Future combat-specific sync message names and payload schemas.

These should be resolved before or during the relevant implementation pass.

## Implementation Roadmap

Suggested build order:

1. Replace the sandbox page state with real app phases, shared game types, setup state, draft state, ownership state, and persistence keys.
2. Convert the current map sandbox components into reusable map modes for read-only, draft picking, and territory focus.
3. Build local setup/configuration on top of the map-first shell, including player add/edit/delete, colors, turn order, randomize, territory draft settings, and troop allocation settings.
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
17. Implement turn phases without battle resolution.
18. Implement attack declaration and locked battle state.
19. Implement regular/challenge score generation.
20. Implement tilted dice, casualties, retreat, conquest, and battle dismissal.
21. Implement sync battle modal visibility and attacker-only battle controls.
22. Implement full fortify.
23. Implement elimination and game over.

Current implementation status:

- Steps 1 through 21 are implemented for the current setup, draft, troop allocation, read-only map, turn-loop, spy, reinforcements, attack setup, battle scoring, dice resolution, retreat, conquest, and sync battle visibility scope.
- Sync mode now uses the cleaned contract documented above: revisioned host snapshots, validated joiner commands, explicit `hostEnded` and `removed`, blocked joiner play during host reconnecting, QR disconnected-player recovery from host pause, and separate sync-host active game persistence.
- Steps 17 through 21 are documented in `docs/gameplay-turns-v1.md`: turn order, spy, reinforcements, attack setup/battle resolution, full fortify, and gameplay player removal redistribution.

## Verification Checklist

Before considering the first playable version complete:

- Verify local setup supports 2 to 6 players, names, unique colors, turn order, territory draft settings, and troop allocation settings.
- Verify sync setup supports Qwixx-style QR handshake, host lobby, joiner lobby, name/color edits, host locks, duplicate-color blocking, and host-authoritative setup state.
- Verify local and sync drafts support snake, round-robin, random simulation, timed picks, confirmation timeout, random timeout fallback, and transition into troop allocation.
- Verify local pause resets draft picks, preserves allocation timers/progress, preserves committed turn state, and supports player removal without reconnect state.
- Verify local refresh during active play restores into pause with draft resuming from a fresh pick and allocation resuming from preserved remaining time.
- Verify sync heartbeat defines connected state, missed heartbeat immediately enters reconnecting, and host/joiner independently transition after the 10-second grace period.
- Verify joiner reconnecting UI shows only local identity/inert background plus wait/X controls, never stale host roster, timer, ready, or connection-status facts.
- Verify sync pause/reconnect supports manual pause, disconnect-forced pause, graceful quit, player removal, host persistence, QR disconnected-player recovery, stale recovery-answer failure, and unpause validation.
- Verify every territory is assigned to exactly one player before troop allocation.
- Verify territory visual centers are generated from the large green circles in the territory drawing and are used for troop-count circles.
- Verify army-build triangle barycentric coordinates, leader budget reservation, fixed-point costs, hard budget limits, closest-ratio selection, and budget-maximal non-dominated results.
- Verify troop allocation requires at least one troop per owned territory and prevents placements that would make that impossible.
- Verify local manual allocation uses configured turn order, pass-and-play handoff screens, allocation timer, timeout random completion, and second allocation turns after redistribution.
- Verify random allocation skips manual allocation UI and immediately creates valid authoritative troop placements.
- Verify sync allocation uses simultaneous private allocation, host-authoritative timer, ready/waiting state visible to all players, and host advance only when all remaining players are ready.
- Verify allocation player removal redistributes territories and troops exactly as specified, unreadying affected sync players and adding second allocation turns for affected local players.
- Verify read-only game map visibility for own territories, outgoing-connected opponent territories, and distant opponent territories, using active directed gameplay connections including ship connections.
- Verify Caradhras pass states `1-5` keep Rivendell-Caradhras edges active, states `6-10` remove those edges from every graph consumer, turn advance drifts the state with normalized clamped weights, and the matching pass icon renders pointer-inert above the connection.
- Verify spy success, spy failure, spy loss, and spy intel clearing after the spy phase.
- Verify reinforcements can be placed only on owned territories.
- Verify attacks enforce directed gameplay connection, leave-one-behind, commit-at-least-one, and source-target once-per-turn rules.
- Verify regular attacks compute deterministic scores from committed attacker troops and locked defender troops.
- Verify challenge attacks immediately submit sampled beta scores and restart unfinished challenges after pause.
- Verify tilted dice respond to attacker/defender combat scores.
- Verify casualties are sampled uniformly from eligible non-leader troops, with leaders dying only when last.
- Verify conquest moves all committed survivors into the target.
- Verify giving up is unavailable before the first roll and returns committed survivors afterward.
- Verify battle modal is visible only to attacker and defender in sync, while other players see live committed map totals.
- Verify fortify allows one outgoing-adjacent mixed-source move and additional cavalry movement through directed owned paths.
- Verify eliminated players are skipped and cannot act.
- Verify game over triggers when one player owns all territories.
- Verify sync host-authoritative state updates include committed game facts promptly enough to resume, without syncing transient visual UI state.
- Verify sync challenge/battle state preserves locked attacks through pause, refresh, reconnect, and snapshots.
- Verify PWA installability and GitHub Pages build output.
