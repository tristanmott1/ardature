# Setup, Draft, And Sync V1

This milestone replaces the temporary map sandbox with setup, configuration, draft prompts, pause state, reconnect state, and draft ownership state shown as panels or overlays around the shared map.

This document remains the source of truth for setup, sync lobby, territory draft, draft pause/reconnect, and draft ownership mechanics. The current app flow continues into troop allocation, which is documented in `troop-allocation-v1.md`.

## Target Flow

This milestone's original implemented flow was:

```text
Home -> Setup and configuration -> Territory draft -> Draft ownership map
```

Troop selection, troop allocation, full turns, fog of war, combat, and later rule phases are out of scope for this historical milestone. In the current planned flow, the app continues from draft into troop allocation.

Home has two modes:

- Local: one device owns the whole game and is passed around.
- Sync: nearby devices connect with the same QR/WebRTC handshake shape as `../qwixx`, copied and renamed for Ardatúrë rather than literally reused.

The old color-selection sandbox is no longer a user-facing mode. Its map features remain important and should be reused throughout the real app: pan, zoom, selected-territory focus, hit targets, and map-layer rendering.

## Visual Style

The setup/draft UI should be sleek, minimal, and icon-forward like Qwixx. The map should remain the visual center, with controls presented as compact panels, sheets, or popups.

Use familiar icons instead of text-heavy buttons wherever possible:

- `X` for cancel, dismiss, remove, quit, and close.
- check mark for confirm, ready, and start-valid actions.
- shuffle for randomizing turn order.
- drag handle for manual ordering.
- lock and unlock for host-controlled player fields.
- scan/QR icons for sync scanning.
- pause and play/resume for local and host-only sync pause controls.

Use text labels only where the choice itself needs words, such as Local/Sync, player names, draft style, timer values, territory names, and short confirmation messages. Every icon-only button must still have an `aria-label`.

Player colors should use swatches rather than word buttons. Connection state, host identity, locked fields, active picker, and timer state should use small icons or compact chips instead of large explanatory text.

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
- Local setup defaults should also persist separately from active saved games: player names, player colors, player order, and shared game configuration are restored when starting a new local setup.

Sync setup behavior:

- The host enters a name and color before hosting; that creates the host player.
- A joiner enters a name and color before joining.
- Each device remembers its own sync name and color for the next sync entry.
- Sync hosts reuse the saved shared game configuration defaults.
- Duplicate colors are allowed in the lobby, but the host cannot start the draft until all remaining players have unique colors.
- Joiners can edit their own name and color after joining unless the host has locked that field.
- The host can edit any player's name or color.
- If the host edits a player's name or color, that field becomes locked for that player.
- The host can later unlock a player name or color.
- Before the draft starts, a joiner can quit and disappears from the lobby, freeing their color.
- Before the draft starts, the host can remove joined players.

Setup options controlled by the host/local device:

- Turn order, with manual reorder and randomize matching Qwixx.
- `Territory Draft` settings:
  - Draft style dropdown: `Snake`, `Round Robin`, or `Random`.
  - Pick-time dropdown: `5s`, `10s`, `15s`, or `Unlimited`.
  - Default: `Snake` and `Unlimited`.
  - When draft style is `Random`, pick time is forced to `Unlimited` and the pick-time control is locked while displaying that value.
- `Troop Allocation` settings:
  - Allocation style dropdown: `Manual` or `Random`.
  - Allocation-time dropdown: `1m`, `2m`, `3m`, `4m`, `5m`, or `Unlimited`.
  - Default: `Manual` and `Unlimited`.
  - When allocation style is `Random`, allocation time is forced to `Unlimited` and the allocation-time control is locked while displaying that value.

Once setup advances into the draft, names, colors, turn order, and configuration are frozen except for pause/removal behavior described below.

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

- Game-stage screens use a shared colored top bar. The X button is always in the top-left, the current player name is bold and prominent near the left, the timer appears near the right when present, and pause appears in the top-right in local mode and for the sync host.
- The top bar background uses the current player's color instead of a small color dot.
- The current-player top bar is distinct from the controls section. Once the draft starts, it stays visible for the rest of the implemented game flow, including confirmation sheets, draft result notifications, sync notifications, troop allocation controls, allocation waiting, read-only map, pause, and local allocation handoff.
- Pause and other blocking states may hide the controls section, but they do not hide the player/color bar.
- The top bar shows the relevant timer whenever one exists: live turn time, paused remaining time, upcoming handoff time, or shared sync allocation time while waiting.
- Local allocation handoff shows the next player's name in the bar and uses a popup with only the continue arrow.
- The active player picks by selecting a remaining territory on the map.
- Selecting a territory opens a confirmation popup with cancel and confirm controls.
- The shared top bar remains visible during draft confirmation and draft result notifications.
- While the confirmation popup is open, tapping another remaining territory replaces the pending pick, and tapping the map background cancels the pending pick.
- Once confirmed, the territory becomes owned by that player and immediately uses that player's color.
- The confirmation popup is a compact bottom sheet with the selected territory name and cancel/confirm controls.
- The selected pending territory is highlighted on the map for the active drafting viewer using a brighter version of its current color.
- A result popup uses the exact same compact bottom-sheet footprint and shows the player and territory name.
- In local mode, the result popup auto-dismisses after about one second, can be dismissed early by tapping anywhere, and the next player's timer starts only after dismissal.
- In sync mode, pending selections are local-only. Another player's pending selection is not synced, does not move or focus your map, and does not highlight on your device.
- In sync mode, confirmed picks are synced as ownership changes; each device turns that local observation into its own small drafted notification.
- In sync mode, the next player's turn starts immediately on their device; the result popup also auto-dismisses after about one second and can be dismissed early.
- The compact draft controls show the active player's draft progress as confirmed picks over expected final picks, such as `3 / 11`.
- The expected final pick count is computed from the current draft style, frozen turn order, active players, and remaining territories.
- If a timed pick expires with a confirmation popup open, the selected territory is treated as confirmed.
- If a timed pick expires with no confirmation popup open, the host/local device randomly chooses one remaining territory for the active player.
- If pick time is unlimited, there is no timer and no automatic draft selection.
- If local mode pauses during an active pick or confirmation popup, the timer and pending choice are preserved locally.
- If sync mode pauses during an active pick or confirmation popup, any local pending choice is discarded and that player's turn starts over when the game resumes.

Draft ownership map:

- The historical setup/draft milestone immediately showed a read-only map with all owned territories in player colors.
- There is no territory selection, color picker, or troop marker behavior yet.
- Pan and zoom remain available.

## Pause And Player Removal

Local and sync modes should use the same pause button placement and icon in the shared game top bar.

- In local mode, the pause button is always visible during game-stage screens.
- In sync mode, only the host sees the pause button.
- In sync mode, pause is also forced by ungraceful disconnects.

Local pause is a true pause of the single-device draft:

- If the pick timer is running, it freezes with the remaining time preserved.
- If a confirmation popup is open, the pending selected territory stays pending.
- If the result popup is open, no timer is running and the same popup remains.
- On resume, the same player continues from the same state.
- Local pause has a restart button, confirmed like quitting, that returns to local setup/config with the same players and settings.
- Local pause has no end-game or close button.
- Local pause has no disconnected or reconnecting state.
- Local pause has no QR/reconnect controls.
- Local players can be removed while paused.
- Local refresh or close during draft restores into local pause, with the timer stopped and remaining time preserved.

Sync host pause is a synchronization reset:

- The active pick timer is not preserved.
- Any pending selected territory or confirmation popup is discarded.
- On unpause, the current player's turn starts over with a fresh timer.
- The host can restart from pause after confirmation, returning everyone to setup while keeping current sync connections open.
- Sync pause includes connected, disconnected, and reconnecting player status.
- Sync host pause always includes a recovery QR and scan button for disconnected-player recovery.
- Sync non-host pause never includes a QR placeholder or recovery tools. Recovery is coordinated through the host because the host is the source of truth.
- Pause and recovery rows use a compact aligned rhythm: color dot, left-aligned player name, right-aligned connection status when shown, then the far-right trash/action slot or an empty spacer.
- The host can remove players while paused.

In both modes, removing a player during draft clears that player's territories and returns them to the remaining territory pool. If fewer than 2 players remain, the game ends and returns to home.

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

Joiners send requests. The host validates, applies state changes, persists host state when appropriate, and broadcasts the resulting state. Joiners render the latest host state only while connected.

The completed sync contract separates authoritative game facts from connection/session UI state:

- `GameState` contains game facts only.
- `App` owns sync session state such as connecting, connected, reconnecting, disconnected, and host-ended.
- Host-to-joiner updates are revisioned snapshots: `{ type: "snapshot", revision, game }`.
- Joiners ignore stale snapshots.
- Joiner-to-host commands are limited to `profileUpdate`, `draftConfirm`, `allocationUpdate`, and `quit`.
- Host intentional end sends `hostEnded`; joiners return home.
- Host removal sends `removed`; that joiner returns home through the same path as host-ended.
- Lost host connection blocks joiner gameplay during the 10-second reconnecting grace period. If automatic reconnect fails, the joiner returns home.
- The old unversioned `gameState`, `hostQuit`, and pending-pick messages are not part of the contract.

`connected` is defined strictly:

- The device has a live host data channel.
- Host and joiner heartbeat are healthy in both directions.
- The joiner has received a recent host heartbeat or snapshot for the current game.
- The joiner is rendering host-authoritative state for the same page/phase the host is on.

If any of those are false, the device must stop treating itself as connected. Stale local snapshots are allowed only as inert background while reconnecting; they are not current truth.

The sync transport should be copied and adapted from Qwixx:

- WebRTC data channels.
- QR host offer and joiner answer for first-time setup joining.
- QR recovery offer and recovery answer for paused disconnected-player recovery.
- camera scanner with native QR detection when available and JavaScript fallback.
- project-specific Ardatúrë payload kinds and compact QR prefixes.

Sync reconnect and pause:

- The host can manually pause a draft.
- Any ungraceful disconnect during draft forces pause.
- Host refresh during an unpaused sync draft restores into paused mode with all non-host players disconnected.
- After host refresh restore, the host creates a fresh recovery transport and renders a new pause recovery QR. The QR must not remain as a blank placeholder.
- While paused, the host shows a lobby-style page with the current players and connection status.
- The host cannot unpause until every remaining player is connected and at least 2 players remain.
- Host pause state and full draft/allocation details are saved in sync-host local storage, separate from local pass-and-play saves, so the host can close the app, return later, reconnect everyone, and unpause.
- Joiners do not need independent game persistence for this milestone.

Graceful quit and ungraceful disconnect are different:

- Graceful quit during sync draft sends a quit message. The host removes that player, clears their territories, returns those territories to the remaining pool, pauses the draft, then shows the pause page without that player.
- Ungraceful disconnect first marks the player `reconnecting`, keeps their territories owned, and forces pause.
- `reconnecting` lasts 10 seconds. If WebRTC recovers during that window, the player returns to `connected`.
- Host and joiner make this transition independently. The host marks the player `disconnected` after its own 10-second reconnect window. The joiner returns home after its own 10-second reconnect window. The host cannot tell the joiner to become disconnected because the connection is already unhealthy.
- The disconnected player remains in the host game and can return only through the host pause recovery QR.
- If the host intentionally ends the game, it sends `hostEnded` so joiners return home instead of remaining in a disconnected game.
- If the host removes a player, it sends `removed` when possible, then closes that peer. Removed players cannot rejoin.
- Automatic WebRTC reconnect should behave like Qwixx where possible inside the 10-second reconnecting window.
- QR recovery is available only from sync host pause. The host recovery QR contains only currently disconnected players. The rejoining device scans from the normal Sync -> Join flow, chooses one disconnected slot, shows a player-specific answer QR, and the host scanner accepts it only if that player is still disconnected.
- Recovery slot and recovery answer screens must show the disconnected player's frozen color next to the player name, because color is part of the host-authoritative player identity being reclaimed.
- Stale recovery answers fail cleanly. If two devices try to reclaim the same player, only the first accepted answer can reconnect.
- Reconnecting players cannot change the underlying player identity. Names, colors, and locks remain exactly as the host sees them.

Joiner reconnecting UI is deliberately local and minimal:

- Show the local player's name/color if known.
- The most recent map may remain visible as inert background.
- Do not show current roster status, timers, ready state, turn state, or other players' connection state.
- The only choices are waiting or pressing X to stop trying and return home immediately.
- Pressing X while reconnecting does not send `quit`; it only moves that device to the same local outcome as automatic reconnect failure.

Connected pause UI is different:

- If a joiner is still connected and the host game is paused, the joiner may render the host-authored pause state.
- Connected pause may show roster and connection statuses because the device is still receiving source-of-truth data from the host.
- A disconnected/reconnecting joiner must never infer or display those statuses from stale local state.

Sync should share committed game facts promptly enough for the host to resume without outside help:

- Confirmed draft picks are sent immediately.
- Future setup/turn actions should follow the same rule: send meaningful committed facts, not local visual state.
- Transient UI such as pending selection, camera position, focus animation, open modals, and selected inspection territory is never part of the sync contract.

If a sync player is removed during pause:

- Their territories are cleared.
- Cleared territories become draftable again and background-colored.
- The player's color becomes irrelevant for the current draft.
- The draft order pattern remains the same, but that player's future picks are skipped.

## Local Mode During Draft

Local mode uses the same draft engine as sync mode, but without network messages, disconnected status, or reconnect state.

- Ending the local game requires confirmation.
- Local refresh during draft restores into local pause and preserves the active pick timer's remaining time.
- Local manual pause preserves the active timer, pending confirmation, or result popup exactly as-is.
- Local player removal is only available while paused.

## Map Behavior

The app should be a map-first shell. During game stages, the colored top bar sits at the top, optional controls sit below it, and the map fills the remaining space without sliding underneath either section. Draft confirmation, result sheets, pause, scanner, and exit confirmation do not remove the top bar. Full-screen modal states may hide controls and cover the map.

Reusable map modes for this milestone:

- Setup/draft ownership map: pan and zoom only.
- Draft active pick: pan, zoom, and selectable remaining territories.
- Draft inactive player or non-owning sync device: pan and zoom; no valid pick action.
- On touch devices, a quick one-finger pan may coast briefly after release. Pinch zoom, mouse drag, and wheel input stop normally, and any new map action interrupts the coast immediately.
- Confirmation popup: map remains visible; pending pick is confirmed, canceled by the bottom sheet, canceled by tapping the map background, or replaced by tapping another remaining territory.
- Camera controls hide while setup/configuration panels, popups, bottom sheets, or modals cover the map, including confirmation, result notification, pause, scanner, handoff, reconnect, and confirmation dialogs.
- Draft ownership map: pan and zoom; no selection.

The map renderer should continue using generated map data, shared SVG coordinates, static ink, territory fill paths, hit targets, and territory focus bounds. Draft ownership coloring should replace the old sandbox skin picker behavior.

Draft pending picks, allocation selected territories, and read-only map inspection are local presentation state. Sync state contains confirmed ownership, timers, player state, readiness, and troop allocations, but it does not contain another device's current visual selection.

## Implementation Order

Build this milestone in this order:

1. Replace the sandbox page state with real app phases, shared game types, setup state, draft state, ownership state, and persistence keys.
2. Convert the current map sandbox components into reusable map modes for read-only, draft picking, and territory focus.
3. Build local setup/configuration on top of the map-first shell, including player add/edit/delete, colors, turn order, randomize, territory draft settings, and troop allocation settings.
4. Implement the shared draft engine for snake, round-robin, random simulation, active-player calculation, timed picks, confirmation behavior, and ownership assignment.
5. Implement local draft UI and local persistence through setup, draft, manual pause, player removal, end-game confirmation, refresh restore, and draft ownership state.
6. Copy and adapt Qwixx sync transport, QR panels, scanner, and lobby interaction using Ardatúrë-specific payload names and prefixes.
7. Implement sync setup with host/join flows, joiner editable name/color, host edit/lock/unlock, duplicate-color blocking, host roster controls, and setup broadcasts.
8. Implement sync draft as host-authoritative state: host timers, pick requests, confirmed picks, random fallback picks, broadcasts, and read-only views for inactive devices.
9. Implement sync pause/reconnect: host manual pause, disconnect-forced pause, graceful quit, player removal, host persistence, host refresh recovery into pause, automatic reconnect where possible, blocked joiner reconnecting state, QR disconnected-player recovery, and unpause validation.
10. Update verification to cover local setup/draft/pause, sync handshake/setup, sync draft, timeout behavior, pause/reconnect behavior, persistence recovery, and map interaction modes.

Do not build troop allocation, spy, reinforcements, attacks, fortify, or fog of war in this milestone.
