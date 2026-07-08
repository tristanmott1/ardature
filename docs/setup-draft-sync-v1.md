# Setup, Draft, And Sync V1

This milestone replaces the temporary map sandbox with the first real Ardature game flow. The map stays central throughout the app, with setup, configuration, draft prompts, pause state, and review state shown as panels or overlays around the shared map.

## Target Flow

The first implemented game flow is:

```text
Home -> Setup and configuration -> Territory draft -> Post-draft review map
```

Troop selection, troop allocation, full turns, fog of war, combat, and later rule phases are out of scope for this milestone. When the draft is complete, the app shows a read-only ownership map and stops there.

Home has two modes:

- Local: one device owns the whole game and is passed around.
- Sync: nearby devices connect with the same QR/WebRTC handshake shape as `../qwixx`, copied and renamed for Ardature rather than literally reused.

The old color-selection sandbox is no longer a user-facing mode. Its map features remain important and should be reused throughout the real app: pan, zoom, selected-territory focus, hit targets, and map-layer rendering.

## Players And Setup

Both modes use the same setup state and validation:

- Minimum players: 2.
- Maximum players: 6.
- Each player has a name.
- Each player has one optional color until setup is complete.
- Player colors are `green`, `blue`, `yellow`, `red`, `purple`, and `black`.
- All players must have unique colors before the host/local device can start the draft.
- Territory ownership uses the owner's color immediately after each confirmed pick.

There is no gap between player join and game configuration. Player rows and game configuration controls are visible together during setup.

Local setup behavior:

- Players can be added, edited, deleted, reordered, randomized, and assigned colors on the same setup page.
- Manual reorder and randomize should match the interaction style used by Qwixx.
- Local setup and draft state should persist in `localStorage` so refresh recovery is possible.

Sync setup behavior:

- The host enters a name and color before hosting; that creates the host player.
- A joiner enters a name and color before joining.
- Duplicate colors are allowed in the lobby, but the host cannot start the draft until all remaining players have unique colors.
- Joiners can edit their own name and color after joining unless the host has locked that field.
- The host can edit any player's name or color.
- If the host edits a player's name or color, that field becomes locked for that player.
- The host can later unlock a player name or color.
- Before the draft starts, a joiner can quit and disappears from the lobby, freeing their color.
- Before the draft starts, the host can remove joined players.

Setup options controlled by the host/local device:

- Turn order, with manual reorder and randomize matching Qwixx.
- Draft style: `random`, `roundRobin`, or `snake`.
- Default draft style: `snake`.
- Pick time limit for `roundRobin` and `snake`: `none`, `5 seconds`, `10 seconds`, or `15 seconds`.
- Troop allocation time limit: `none`, `1 minute`, `2 minutes`, `3 minutes`, `4 minutes`, or `5 minutes`.

Troop allocation is configured now so the setting is present in state, but the milestone stops before troop allocation begins.

Once setup advances into the draft, names, colors, turn order, and configuration are frozen except for sync pause/removal behavior described below.

## Draft Rules

All 42 playable territories are drafted until none remain.

Draft start is based on turn order. The starting drafter is chosen so the final pick of the whole draft belongs to the player who precedes the first-turn player.

Draft styles:

- `snake`: players draft forward through turn order, then backward, repeating.
- `roundRobin`: players draft forward through turn order, repeating.
- `random`: skip the manual draft UI and simulate a snake draft where each pick chooses a random remaining territory.

Random draft still uses the snake ordering because that ordering determines which players get extra territories when 42 territories do not divide evenly by player count.

The draft engine should not precompute one fixed 42-pick queue. It should store draft progress and compute the next eligible picker from the frozen turn order, draft style, pick count, direction, active players, and remaining territories. Removed players are skipped, and the pattern continues until all territories are owned.

Manual draft interaction:

- The active player picks by selecting a remaining territory on the map.
- Selecting a territory opens a confirmation popup with cancel and confirm controls.
- Once confirmed, the territory becomes owned by that player and immediately uses that player's color.
- A result popup shows which territory was drafted.
- In local mode, the result popup includes a next arrow; the next player's timer starts only after that arrow is pressed.
- In sync mode, the next player's turn starts immediately on their device; the result popup is dismissible and has no next arrow.
- If a timed pick expires with a confirmation popup open, the selected territory is treated as confirmed.
- If a timed pick expires with no confirmation popup open, the host/local device randomly chooses one remaining territory for the active player.
- If the host pauses during an active pick or confirmation popup, the pending choice is discarded and that turn starts over when the game resumes.

Post-draft review:

- The app immediately shows a read-only map with all owned territories in player colors.
- There is no territory selection, color picker, or troop marker behavior yet.
- Pan and zoom remain available.

## Sync Model

Sync mode is host-authoritative.

The host owns:

- player roster
- name/color locks
- setup options
- turn order
- draft state
- timers
- random fallback picks
- territory ownership
- pause/resume state
- removal of players

Joiners send requests. The host validates, applies state changes, persists host state when appropriate, and broadcasts the resulting state. Joiners render the host state.

The sync transport should be copied and adapted from Qwixx:

- WebRTC data channels.
- QR host offer.
- QR joiner answer.
- camera scanner with native QR detection when available and JavaScript fallback.
- project-specific Ardature payload kinds and compact QR prefixes.

Sync reconnect and pause:

- Pause is a sync-only game phase.
- The host can manually pause a draft.
- Any ungraceful disconnect during draft forces pause.
- Host refresh during an unpaused sync draft restores into paused mode.
- While paused, the host shows a lobby-style page with the current players and connection status.
- The host cannot unpause until every remaining player is connected and at least 2 players remain.
- Host pause state and full draft details are saved in local storage so the host can close the app, return later, reconnect everyone, and unpause.
- Joiners do not need independent game persistence for this milestone.

Graceful quit and ungraceful disconnect are different:

- Graceful quit during sync draft sends a quit message. The host removes that player, clears their territories, returns those territories to the remaining pool, pauses the draft, then shows the pause page without that player.
- Ungraceful disconnect keeps the player in the game as disconnected, keeps their territories owned, forces pause, and allows automatic reconnect.
- Automatic reconnect should behave like Qwixx where possible.
- If automatic reconnect does not work, the QR handshake is the fallback.
- During paused reconnect, a joiner scans the host QR, sees the game information and disconnected player names, chooses their own disconnected player slot, generates an answer QR, and the host scans it.
- Reconnecting players cannot change the underlying player identity. Names, colors, and locks remain as the host sees them.

If a sync player is removed during pause:

- Their territories are cleared.
- Cleared territories become draftable again and background-colored.
- The player's color becomes irrelevant for the current draft.
- The draft order pattern remains the same, but that player's future picks are skipped.

If fewer than 2 players remain during sync draft, the game ends and returns to home.

## Local Mode During Draft

Local mode has no player quit during draft. The available escape hatch is ending the entire game and returning to home.

- Ending the local game requires confirmation.
- Local refresh during draft restores the draft and restarts the active pick timer fresh.
- Local mode uses the same draft engine as sync mode, but without network messages or pause/reconnect state.

## Map Behavior

The app should be a map-first shell with panels and modals layered above it.

Reusable map modes for this milestone:

- Setup/review: pan and zoom only.
- Draft active pick: pan, zoom, and selectable remaining territories.
- Draft inactive player or non-owning sync device: pan and zoom; no valid pick action.
- Confirmation popup: map remains visible; pending pick is confirmed or canceled by the popup.
- Post-draft review: pan and zoom; no selection.

The map renderer should continue using generated map data, shared SVG coordinates, static ink, territory fill paths, hit targets, and territory focus bounds. Draft and review ownership coloring should replace the old sandbox skin picker behavior.

## Implementation Order

Build this milestone in this order:

1. Replace the sandbox page state with real app phases, shared game types, setup state, draft state, ownership state, and persistence keys.
2. Convert the current map sandbox components into reusable map modes for read-only, draft picking, and territory focus.
3. Build local setup/configuration on top of the map-first shell, including player add/edit/delete, colors, turn order, randomize, draft style, pick timer, and troop allocation timer.
4. Implement the shared draft engine for snake, round-robin, random simulation, active-player calculation, timed picks, confirmation behavior, ownership assignment, and post-draft review.
5. Implement local draft UI and local persistence through setup, draft, end-game confirmation, refresh restore, and review.
6. Copy and adapt Qwixx sync transport, QR panels, scanner, and lobby interaction using Ardature-specific payload names and prefixes.
7. Implement sync setup with host/join flows, joiner editable name/color, host edit/lock/unlock, duplicate-color blocking, host roster controls, and setup broadcasts.
8. Implement sync draft as host-authoritative state: host timers, pick requests, confirmed picks, random fallback picks, broadcasts, and read-only views for inactive devices.
9. Implement sync pause/reconnect: manual pause, disconnect-forced pause, graceful quit, player removal, host persistence, host refresh recovery into pause, automatic reconnect where possible, QR reconnect fallback, and unpause validation.
10. Update verification to cover local setup/draft/review, sync handshake/setup, sync draft, timeout behavior, pause/reconnect behavior, persistence recovery, and map interaction modes.

Do not build troop allocation, spy, reinforcements, attacks, fortify, or fog of war in this milestone.
