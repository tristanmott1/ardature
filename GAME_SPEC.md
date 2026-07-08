# Ardature Game Specification

This document is the source of truth for the Ardature game while it is being designed and built. Rule, screen, state, sync, and deployment decisions should be reflected here before or alongside implementation changes.

Ardature is a private, personal-use, Lord of the Rings themed, Risk-like territory conquest game for phones. The app is intended to be hosted as a static GitHub Pages PWA, with local pass-and-play and offline nearby-device sync.

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
- Troop: a unit in a territory. Each player has three troop classes.
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

Each side has three troop classes. The classes correspond exactly across sides:

| Light troop | Dark troop | Role |
| --- | --- | --- |
| Dwarf | Orc | Numerous, hardest arrow challenge |
| Rohirrim | Warg | Middle quantity, middle arrow challenge |
| Elf | Uruk-hai | Fewest, easiest arrow challenge |

All rules should refer internally to the three abstract troop classes:

- Heavy: dwarf/orc.
- Cavalry: rohirrim/warg.
- Elite: elf/uruk-hai.

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
5. Review the completed territory draft.
6. Allocate starting troops.
7. Begin the first turn.

The host determines setup options.

The first gameplay implementation milestone stops after territory draft review. Troop allocation and turn play are documented for the full game but are not part of that milestone.

### Setup Options

The setup state should allow:

- Player order: randomized or manually rearranged before start.
- Player colors: unique `green`, `blue`, `yellow`, `red`, `purple`, or `black`.
- Draft style: random, round robin, or snake.
- Draft pick time limit for round robin and snake: none, 5 seconds, 10 seconds, or 15 seconds.
- Troop allocation time limit: none, 1 minute, 2 minutes, 3 minutes, 4 minutes, or 5 minutes.
- Starting troop counts by troop class.
- Reinforcement formula constants.
- Region bonus definitions.

The first setup/draft milestone exposes player colors, turn order, draft style, draft pick timer, and troop allocation timer. Starting troop counts, reinforcement constants, and region bonuses may remain hard-coded until troop allocation and turn phases are built.

### Territory Assignment

Every territory must be owned by exactly one player before starting troop allocation.

Supported assignment modes:

- Random draft: the app simulates a snake draft where each pick chooses a random remaining territory.
- Round-robin draft: players select territories one at a time in forward turn order, repeating until every territory is owned.
- Snake draft: players select territories one at a time in forward order, then reverse order, repeating until every territory is owned.

The draft start is based on turn order. The starting drafter is chosen so the final pick belongs to the player who precedes the first-turn player. Random draft still uses snake ordering because that ordering determines which players receive extra territories when 42 territories do not divide evenly by player count.

The draft engine should store progress rather than precomputing one fixed pick queue. Removed players are skipped, and the same round-robin or snake pattern continues until every territory is owned.

### Initial Troop Allocation

After all territories have owners, each player allocates starting troops to their own territories.

Rules:

- Each player receives a starting pool of heavy, cavalry, and elite troops.
- The exact starting pool is a tunable constant based on player count.
- Every owned territory must contain at least one troop total before the game can begin.
- Troops may be allocated in any mixture unless a future rule adds limits.
- A player may not place troops on another player's territory.

In local mode, allocation should use pass screens between players. In sync mode, each player can allocate privately on their own device, with the host validating completeness.

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

There should be six regions. Exact territories and bonuses will be designed later.

Each region has:

- A set of territories.
- A bonus troop class.
- A bonus troop amount.

Owning every territory in a region grants that region's reinforcement bonus during the reinforcement phase.

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

The game proceeds in round-robin turns, one active player at a time.

Eliminated players are skipped.

Each turn has four phases:

1. Spy.
2. Reinforcements.
3. Attack.
4. Fortify.

The active player may not advance to the next phase if required choices in the current phase are incomplete.

The winner is the last remaining player with territories, or equivalently the first player to own every territory.

## Phase 1: Spy

The spy phase is optional.

If the active player still has a spy, they may either:

- Use the spy on one opponent-owned territory.
- Skip the spy phase.

If the active player has already lost their spy, the phase can only be skipped.

### Spy Targeting

The selected spy target must be owned by an opponent.

The success probability is based on the graph distance from the target territory to the active player's nearest owned territory:

```text
spy success chance = function(distance from target to nearest owned territory)
```

Closer targets should be easier to spy on. Farther targets should be riskier.

The exact probability curve is intentionally not fixed yet.

### Spy Result

If the spy succeeds:

- Reveal the target territory's exact troop counts by class.
- Reveal the total troop counts in adjacent territories owned by the same opponent.
- Keep this intel visible only during the current spy phase.
- Preserve the spy for future turns.

If the spy fails:

- Reveal no troop information.
- The player loses their spy for the rest of the game.

After the player advances out of the spy phase, all spy intel is cleared.

## Phase 2: Reinforcements

The active player receives new troops and places them onto owned territories.

Reinforcements have two sources:

- Territory-count reinforcement.
- Region-control bonuses.

### Territory-Count Reinforcement

The active player chooses exactly one troop class for their territory-count reinforcement.

The number of troops received depends on:

- The number of territories the player owns.
- The selected troop class.

The exact formula and constants are intentionally not fixed yet.

The intended relationship is:

```text
heavy reinforcement count > cavalry reinforcement count > elite reinforcement count
```

This means choosing dwarves/orcs gives the most troops, rohirrim/wargs gives fewer, and elves/uruk-hai gives the fewest.

### Region Bonuses

The active player receives bonus troops for each full region they own.

Each region grants:

- A fixed number of troops.
- A fixed troop class.

Example shape:

```text
Moria: +3 heavy
Rohan: +3 cavalry
Lothlorien: +2 elite
```

Exact region definitions and bonus values are intentionally not fixed yet.

### Placement

All reinforcement troops may be placed on any territories owned by the active player.

Rules:

- Reinforcement troops cannot be placed on opponent territories.
- Territory-count reinforcements and region bonuses are combined into one placement pool.
- The player must place every reinforcement troop before advancing to attack.

## Phase 3: Attack

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
7. Post-draft review map.
8. Initial troop allocation.
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

During manual drafts, the active player selects a remaining territory on the map.

Draft selection flow:

1. Select a remaining territory.
2. Show a confirmation popup with cancel and confirm controls.
3. Confirming assigns the territory immediately and colors it with the owner's player color.
4. Show a result popup naming the drafted territory.

In local mode, the result popup includes a next arrow. The next player's timer starts only after that arrow is pressed.

In sync mode, the result popup is dismissible but has no next arrow. The next player's turn starts immediately on that player's device.

Timer behavior:

- If a timed pick expires with a confirmation popup open, the pending territory is confirmed.
- If a timed pick expires with no confirmation popup open, a random remaining territory is chosen for the active player.
- If local mode pauses during an active pick or confirmation popup, the active timer and pending choice are preserved.
- If sync mode pauses during an active pick or confirmation popup, the pending pick is discarded and that player's turn starts over on resume.

After all territories are drafted, the app immediately shows a read-only ownership map. The milestone stops there.

### Pause And Player Removal

Local and sync modes use the same pause button placement and icon. In local mode, the pause button is visible during draft. In sync mode, only the host sees the pause button.

Local pause is a true pause of the single-device draft:

- If the pick timer is running, it freezes with the remaining time preserved.
- If a confirmation popup is open, the pending selected territory stays pending.
- If the result/next-player popup is open, no timer is running and the same popup remains.
- On resume, the same player continues from the same state.
- Local pause has no disconnected status, reconnect status, or QR reconnect controls.
- Local players can be removed while paused.

Sync host pause is a synchronization reset:

- The active pick timer is not preserved.
- Any pending selected territory or confirmation popup is discarded.
- On unpause, the current player's turn starts over with a fresh timer.
- Sync pause includes connected, disconnected, and reconnecting player status.
- Sync pause includes QR reconnect controls when needed.
- The host can remove players while paused.

In both modes, removing a player during draft clears that player's territories and returns them to the remaining territory pool. If fewer than 2 players remain, the game ends and returns to home.

### Sync Pause And Reconnect

The host can manually pause a draft. Any ungraceful disconnect during a sync draft also forces the pause page.

While paused:

- The host sees a lobby-style page with all remaining players and their connection statuses.
- The host can remove players.
- The host cannot unpause until every remaining player is connected and at least 2 players remain.
- If fewer than 2 players remain, the game ends and returns to home.

Graceful quit and ungraceful disconnect are different:

- Graceful quit sends a quit message. The host removes that player, clears their territories, returns those territories to the draft pool, pauses the draft, and shows the pause page without that player.
- Ungraceful disconnect keeps the player in the game as disconnected, keeps their territories owned, and forces pause.

Disconnected players should automatically attempt to reconnect when possible, following the Qwixx-style reconnect behavior. If automatic reconnect does not work, the QR handshake is the fallback.

Fallback reconnect flow:

1. Host shows a reusable paused-game QR.
2. The joiner scans it and sees the game information plus disconnected player names.
3. The joiner chooses their existing disconnected player slot.
4. The joiner generates an answer QR.
5. The host scans the answer QR to reconnect that player.

Reconnecting players cannot change the player identity. Names, colors, and host locks remain exactly as the host sees them.

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

The host validates each request against the current game state, applies valid actions, and broadcasts the resulting state or view updates.

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

Sync host persistence is conservative:

- Host state should be saved after setup starts, draft starts, each pick, pause, removal, and other authoritative changes.
- If the host reloads during an active sync draft, the game restores into the paused reconnect lobby instead of trying to continue a live timer.
- The host can close the app while paused, reopen later, reconnect everyone, and unpause.
- Joiners do not need independent game persistence for the setup/draft milestone.

Because the game can be long, local mode should support refresh recovery. Local draft refresh restores the draft and restarts the active pick timer fresh.

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

The repository currently includes character images under `characters/`:

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

Asset naming may be cleaned up later, but implementation should avoid unnecessary churn until the asset pipeline is clearer.

## Not Yet Fixed

The following decisions are intentionally open:

- Final app name and displayed title.
- Minimum and maximum player count.
- Territory count.
- Exact map layout.
- Region names and territory membership.
- Region bonus values and troop classes.
- Starting troop counts by player count.
- Territory-count reinforcement formula.
- Preparedness floor value.
- Prediction accuracy formula.
- Arrow challenge mechanics and scoring.
- Effectiveness formula.
- Weighted die probability curve.
- Spy success probability by distance.
- Fortify cavalry radius final value.
- Exact sync wire message names and payload schemas.

These should be resolved before or during the relevant implementation pass.

## Implementation Roadmap

Suggested build order:

1. Replace the sandbox page state with real app phases, shared game types, setup state, draft state, ownership state, and persistence keys.
2. Convert the current map sandbox components into reusable map modes for read-only, draft picking, and territory focus.
3. Build local setup/configuration on top of the map-first shell, including player add/edit/delete, colors, turn order, randomize, draft style, pick timer, and troop allocation timer.
4. Implement the shared draft engine for snake, round-robin, random simulation, active-player calculation, timed picks, confirmation behavior, ownership assignment, and post-draft review.
5. Implement local draft UI and local persistence through setup, draft, manual pause, player removal, end-game confirmation, refresh restore, and review.
6. Copy and adapt Qwixx sync transport, QR panels, scanner, and lobby interaction using Ardature-specific payload names and prefixes.
7. Implement sync setup with host/join flows, joiner editable name/color, host edit/lock/unlock, duplicate-color blocking, host roster controls, and setup broadcasts.
8. Implement sync draft as host-authoritative state: host timers, pick requests, confirmed picks, random fallback picks, broadcasts, and read-only views for inactive devices.
9. Implement sync pause/reconnect: host manual pause, disconnect-forced pause, graceful quit, player removal, host persistence, host refresh recovery into pause, automatic reconnect where possible, QR reconnect fallback, and unpause validation.
10. Update verification to cover local setup/draft/pause/review, sync handshake/setup, sync draft, timeout behavior, pause/reconnect behavior, persistence recovery, and map interaction modes.
11. Implement initial troop allocation.
12. Implement turn phases without combat minigames.
13. Implement attack declaration and battle state.
14. Implement prediction triangle.
15. Implement arrow challenge.
16. Implement effectiveness and weighted dice.
17. Implement casualty sampling and post-battle reveals.
18. Implement fortify.
19. Implement elimination and game over.

## Verification Checklist

Before considering the first playable version complete:

- Verify local setup supports 2 to 6 players, names, unique colors, turn order, draft style, draft timer, and troop allocation timer.
- Verify sync setup supports Qwixx-style QR handshake, host lobby, joiner lobby, name/color edits, host locks, duplicate-color blocking, and host-authoritative setup state.
- Verify local and sync drafts support snake, round-robin, random simulation, timed picks, confirmation timeout, random timeout fallback, and post-draft review.
- Verify local pause preserves the active pick timer, pending confirmation, and result popup state, and supports player removal without reconnect state.
- Verify sync pause/reconnect supports manual pause, disconnect-forced pause, graceful quit, player removal, host persistence, QR reconnect fallback, and unpause validation.
- Verify every territory is assigned to exactly one player before troop allocation.
- Verify troop allocation requires at least one troop per owned territory.
- Verify viewer-specific fog of war for owned, adjacent enemy, and distant enemy territories.
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
- Verify local refresh recovery.
- Verify sync host-authoritative state updates.
- Verify sync private battle preparation works on separate devices.
- Verify PWA installability and GitHub Pages build output.
