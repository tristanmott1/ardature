import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const baseUrl = "http://127.0.0.1:5174/";
const outputDir = new URL("../verification-output/", import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function outputPath(name) {
  return fileURLToPath(new URL(name, outputDir));
}

async function capture(page, name) {
  await page.screenshot({ path: outputPath(name) });
}

async function waitForServer(processHandle) {
  let output = "";

  processHandle.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  processHandle.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (output.includes("Local:") || output.includes("ready")) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Vite did not start.\n${output}`);
}

async function stopServer(processHandle) {
  if (!processHandle.pid || processHandle.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await Promise.race([
      new Promise((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(processHandle.pid), "/T", "/F"], {
          shell: false,
          stdio: "ignore",
        });
        killer.on("exit", resolve);
        killer.on("error", resolve);
      }),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    return;
  }

  processHandle.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => processHandle.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
}

async function launchBrowser() {
  for (const executablePath of chromePaths) {
    try {
      return await chromium.launch({ executablePath, headless: true });
    } catch {
      // Try the next locally installed browser path.
    }
  }

  return chromium.launch({ headless: true });
}

async function runSourceChecks() {
  console.log("Checking sources");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const armyBuildSource = await readFile(new URL("../src/game/armyBuild.ts", import.meta.url), "utf8");
  const gameStateSource = await readFile(new URL("../src/game/gameState.ts", import.meta.url), "utf8");
  const gameTypesSource = await readFile(new URL("../src/game/gameTypes.ts", import.meta.url), "utf8");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const mapConnectionsSource = await readFile(new URL("../src/map/generated/mapConnections.ts", import.meta.url), "utf8");
  const hitTargetSource = await readFile(new URL("../src/map/components/HitTargetLayer.tsx", import.meta.url), "utf8");
  const mapViewSource = await readFile(new URL("../src/map/components/MapView.tsx", import.meta.url), "utf8");
  const staticMapInkSource = await readFile(new URL("../src/map/components/StaticMapInk.tsx", import.meta.url), "utf8");
  const territoryFillSource = await readFile(new URL("../src/map/components/TerritoryFillLayer.tsx", import.meta.url), "utf8");
  const troopMarkerSource = await readFile(new URL("../src/map/components/TroopMarkerLayer.tsx", import.meta.url), "utf8");
  const mapPreferencesSource = await readFile(new URL("../src/map/mapPreferences.ts", import.meta.url), "utf8");
  const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifestSource = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
  const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const mapExtractorSource = await readFile(new URL("../scripts/extract-map.ps1", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const territoryPreviewSource = await readFile(new URL("../maps/previews/territories-background.svg", import.meta.url), "utf8");
  const blueTerritoryPreviewSource = await readFile(new URL("../maps/previews/territories-blue.svg", import.meta.url), "utf8");
  const syncMessagesSource = await readFile(new URL("../src/sync/syncMessages.ts", import.meta.url), "utf8");
  const syncTransportSource = await readFile(new URL("../src/sync/syncTransport.ts", import.meta.url), "utf8");
  const appArchitectureDocs = await readFile(new URL("../docs/app-architecture.md", import.meta.url), "utf8");
  const setupDraftDocs = await readFile(new URL("../docs/setup-draft-sync-v1.md", import.meta.url), "utf8");
  const mapWidth = generatedNumber(mapDataSource, "width");
  const mapHeight = generatedNumber(mapDataSource, "height");
  const sourceWidth = generatedNumber(mapDataSource, "sourceWidth");
  const sourceHeight = generatedNumber(mapDataSource, "sourceHeight");
  const homeViewport = generatedViewport(mapDataSource, "homeViewport");

  assert(mapDataSource.includes("satisfies GeneratedMapData"), "Generated map data is typed.");
  assert(mapDataSource.includes("territoryBorderPaths") && mapDataSource.includes("regionBorderPaths"), "Generated static ink separates territory and regional borders.");
  assert(mapDataSource.includes("territoryBorderStrokeWidth: 10") && mapDataSource.includes("regionBorderStrokeWidth: 20"), "Generated border layers use distinct stroke widths.");
  assert(mapDataSource.includes("shipRoutePaths") && mapDataSource.includes('shipRouteDashArray: "42 40"'), "Generated static ink includes dotted ship routes.");
  assert(mapExtractorSource.includes("return first.RegionId != second.RegionId;"), "Border classification treats background as a region.");
  assert(mapExtractorSource.includes("ExpectedShipRouteCount = 4") && mapExtractorSource.includes("SvgSimpleShipRoutePath"), "Map extractor derives four simple ship route curves from red guide strokes.");
  assert(!mapExtractorSource.includes("RegionShadeValues"), "Map themes do not use fixed region shade buckets.");
  assert(mapExtractorSource.includes("ShadeJitterAmount") && mapExtractorSource.includes("ApplyShadeContrast") && mapExtractorSource.includes("EnforceUniqueShadeValues"), "Territory shades use deterministic variation and adjacency contrast.");
  assert(staticMapInkSource.indexOf("territoryBorderPaths.map") < staticMapInkSource.indexOf("regionBorderPaths.map"), "Static ink draws regional borders over ordinary territory borders.");
  assert(staticMapInkSource.indexOf("regionBorderPaths.map") < staticMapInkSource.indexOf("shipRoutePaths.map") && staticMapInkSource.indexOf("shipRoutePaths.map") < staticMapInkSource.indexOf("landmarkPath"), "Static ink draws ship routes between regional borders and landmark ink.");
  assert(territoryPreviewSource.includes('stroke-width="10"') && territoryPreviewSource.includes('stroke-width="20"'), "Generated previews include both border widths.");
  assert((territoryPreviewSource.match(/class="ship-route-ink"/g) ?? []).length === 4 && territoryPreviewSource.includes('stroke-dasharray="42 40"'), "Generated previews include four dotted ship route strokes.");
  const bluePreviewFillColors = new Set([...blueTerritoryPreviewSource.matchAll(/fill="(#[0-9A-Fa-f]{6})" stroke="\1" stroke-width="12"/g)].map((match) => match[1]));
  const backgroundPreviewFillColors = new Set([...territoryPreviewSource.matchAll(/fill="(#[0-9A-Fa-f]{6})" stroke="\1" stroke-width="12"/g)].map((match) => match[1]));
  assert(bluePreviewFillColors.size > 6, "Colored previews contain varied territory fill shades.");
  assert(backgroundPreviewFillColors.size === 1, "Background preview keeps one uniform tan fill.");
  assert(mapConnectionsSource.includes("generatedMapConnections"), "Generated map connections exist.");
  assert((mapConnectionsSource.match(/": \[/g) ?? []).length === 42, "Generated map connections include 42 playable territories.");
  assert(!mapConnectionsSource.includes("shipRoute") && !gameStateSource.includes("shipRoute") && !syncMessagesSource.includes("shipRoute"), "Visual ship routes are not consumed by gameplay or sync code.");
  assert(!mapDataSource.includes("NaN"), "Generated map data has no NaN values.");
  assert(!mapDataSource.includes("Infinity"), "Generated map data has no Infinity values.");
  assert((mapDataSource.match(/id: "/g) ?? []).length === 42, "Generated app data has 42 playable territories.");
  assert(mapWidth === sourceWidth * 10 + 3000 && mapHeight === sourceHeight * 10 + 3000, "Generated app data includes the 1500-unit display frame.");
  assert(
    homeViewport.x === 1500 &&
    homeViewport.y === 1500 &&
    homeViewport.width === sourceWidth * 10 &&
    homeViewport.height === sourceHeight * 10,
    "Generated app data includes the unbuffered home viewport.",
  );
  const focusBounds = [...mapDataSource.matchAll(/focusBounds: \{ minX: ([^,]+), minY: ([^,]+), maxX: ([^,]+), maxY: ([^ }]+) \}/g)];
  assert(focusBounds.length === 42, "Generated app data has 42 focus bounds.");
  for (const match of focusBounds) {
    const values = match.slice(1).map(Number);
    assert(values.every(Number.isFinite), "Generated focus bounds are finite.");
    assert(values[2] > values[0] && values[3] > values[1], "Generated focus bounds are non-empty.");
    assert(values[0] >= 0 && values[1] >= 0 && values[2] <= mapWidth && values[3] <= mapHeight, "Generated focus bounds stay inside the map.");
  }
  assert(appSource.includes("SyncHostTransport") && appSource.includes("SyncJoinTransport"), "App wires the QR sync transport.");
  assert(appSource.includes("pauseSyncGame"), "App has sync pause semantics.");
  assert(appSource.includes("syncDraftNoticeFromOwnershipChange"), "App creates local sync draft notices from ownership changes.");
  assert(appSource.includes("onCloseRef") && appSource.includes("resultKey"), "Draft result auto-dismiss is stable across parent re-renders.");
  assert(appSource.includes("pendingDraftTerritoryId") && appSource.includes("allocationSelectedTerritoryId") && appSource.includes("gameMapSelectedTerritoryId"), "App keeps map selections in local UI state.");
  assert(!gameTypesSource.includes("pendingTerritoryId") && !gameStateSource.includes("pendingTerritoryId"), "Shared draft state does not store pending visual selection.");
  assert(!gameTypesSource.includes("selectedTerritoryId") && !gameStateSource.includes("selectedTerritoryId: null") && !gameStateSource.includes("allocation.selectedTerritoryId"), "Shared allocation state does not store selected visual territory.");
  assert(!syncMessagesSource.includes("draftPending"), "Sync messages do not share pending draft selections.");
  assert(!syncMessagesSource.includes('type: "allocationUpdate";\n      allocation: PlayerAllocation;') || !syncMessagesSource.includes("selectedTerritoryId"), "Allocation sync messages do not include selected territory UI state.");
  assert(!showDraftPanelSource(appSource).includes("viewerPendingTerritory") && !showDraftPanelSource(appSource).includes("blockingResultTerritory") && !showDraftPanelSource(appSource).includes("noticeTerritory"), "Draft top bar stays visible during confirmation and notifications.");
  assert(appSource.includes("RotateCcw") && appSource.includes("restartPausedGame"), "Pause can restart to setup without closing transports.");
  assert(!appSource.includes('closeLabel="End game"'), "Pause modal does not use a close X to end the game.");
  assert(appSource.includes("closeOnOutsidePress"), "Color dropdowns close on outside press.");
  assert(stylesSource.includes(".sync-entry-panel") && stylesSource.includes("padding-bottom: 112px"), "Sync entry reserves color menu space.");
  assert(cssZIndex(stylesSource, ".map-camera-control") < cssZIndex(stylesSource, ".modal-scrim"), "Map camera controls stack below modal popups.");
  assert(cssZIndex(stylesSource, ".map-camera-control") < cssZIndex(stylesSource, ".draft-sheet-scrim"), "Map camera controls stack below draft sheets.");
  assert(cssZIndex(stylesSource, ".map-camera-control") < cssZIndex(stylesSource, ".army-build-scrim"), "Map camera controls stack below army build modal.");
  assert(syncMessagesSource.includes('type: "snapshot"') && syncMessagesSource.includes("revision: number"), "Sync messages use revisioned host snapshots.");
  assert(syncMessagesSource.includes('type: "hostEnded"') && appSource.includes('type: "hostEnded"'), "Sync messages include an explicit host-ended event.");
  assert(syncMessagesSource.includes('type: "removed"') && appSource.includes('type: "removed"'), "Sync messages include an explicit removed event.");
  assert(!syncMessagesSource.includes('type: "gameState"') && !appSource.includes('type: "gameState"'), "Old unversioned gameState sync messages are removed.");
  assert(!syncMessagesSource.includes('type: "hostQuit"') && !appSource.includes('type: "hostQuit"'), "Old hostQuit sync messages are removed.");
  assert(appSource.includes("SyncSessionState") && appSource.includes("syncJoinerBlocked"), "Joiners track disconnected session state outside GameState.");
  assert(appSource.includes("lastSnapshotRevisionRef") && appSource.includes("rawMessage.revision <= lastSnapshotRevisionRef.current"), "Joiners ignore stale snapshots.");
  assert(syncTransportSource.includes("DEFAULT_RECONNECT_GRACE_MS = 10000"), "Sync reconnect grace is 10 seconds.");
  assert(syncTransportSource.includes("HEARTBEAT_INTERVAL_MS = 1000") && syncTransportSource.includes("HEARTBEAT_TIMEOUT_MS = 3000"), "Sync transport has explicit heartbeat timing.");
  assert(syncTransportSource.includes("HEARTBEAT_PING") && syncTransportSource.includes("HEARTBEAT_PONG") && syncTransportSource.includes("isHeartbeatMessage(message)"), "Sync heartbeat messages are handled inside the transport.");
  assert(syncTransportSource.includes("Date.now() - peer.lastHeardAt > HEARTBEAT_TIMEOUT_MS") && syncTransportSource.includes("Date.now() - this.lastHeardAt > HEARTBEAT_TIMEOUT_MS"), "Host and joiner independently enter reconnecting when heartbeat is stale.");
  assert(syncTransportSource.includes('peer.status === "connected"') && syncTransportSource.includes("sendChannelMessage(peer.channel, message);"), "Host sends app messages only to connected peers.");
  assert(syncTransportSource.includes("peer.channel.close();") && syncTransportSource.includes("peer.peerConnection.close();") && syncTransportSource.includes('this.callbacks.onPeerStatus?.(playerId, "gone")'), "Host closes the old peer transport when reconnecting fully fails.");
  assert(syncTransportSource.includes('event.channel.addEventListener("close", () => this.markReconnecting())') && syncTransportSource.includes("window.setTimeout(() => this.markGone(), this.reconnectGraceMs)"), "Ungraceful closes route through reconnecting before disconnected.");
  assert(syncTransportSource.includes("ardature-sync-recovery-offer") && syncTransportSource.includes("ardature-sync-recovery-answer"), "Sync transport has distinct recovery payload kinds.");
  assert(syncTransportSource.includes("ARR:") && syncTransportSource.includes("ARY:"), "Sync transport has distinct compact recovery QR prefixes.");
  assert(appSource.includes("Stop reconnecting") && appSource.includes("<Icon size={24} />"), "Joiner reconnecting UI offers a local stop option.");
  assert(appSource.includes('connectionStatus === "disconnected"') && appSource.includes("createRecoveryOffer(disconnectedSyncPlayers)"), "Host recovery QR slots are filtered from host disconnected state.");
  assert(appSource.includes("hostTransportRef.current = new SyncHostTransport") && appSource.includes("restoredSyncHost"), "Restored sync hosts rebuild transport for recovery QR generation.");
  assert(appSource.includes('const showRecoveryTools = mode === "sync" && Boolean(onScanRecoveryAnswer)'), "Recovery QR tools render only for the sync host pause modal.");
  assert(appSource.includes("createRecoveryAnswer") && appSource.includes("onChooseRecoveryPlayer"), "Joiners choose a disconnected slot before creating a recovery answer.");
  assert(syncTransportSource.includes("color: PlayerColor | null") && syncTransportSource.includes("RECOVERY_PLAYER_COLORS"), "Recovery slots carry validated player colors.");
  assert(appArchitectureDocs.includes("Recovery slot and answer screens show the disconnected player's frozen color") && setupDraftDocs.includes("Recovery slot and recovery answer screens must show the disconnected player's frozen color"), "Recovery player color visibility is documented.");
  assert(appSource.includes("hostTransportRef.current?.sendToPeer(playerId, { type: \"removed\" })"), "Host sends removed before closing a removed peer.");
  assert(gameStateSource.includes("pauseLocalGameForStorage") && appSource.includes("pagehide") && appSource.includes("beforeunload"), "Local refresh writes a paused active-game snapshot.");
  assert(gameStateSource.includes("applySyncProfileUpdate") && gameStateSource.includes("applySyncDraftConfirm") && gameStateSource.includes("applySyncPlayerQuit"), "Host command application is centralized in game helpers.");
  assert(gameStateSource.includes("SYNC_HOST_GAME_KEY") && appSource.includes("saveSyncHostGame(nextGame, localPlayerId, revision)") && appSource.includes("readSyncHostGame()"), "Sync host active games persist separately from local games.");
  assert(!gameTypesSource.includes("noticeTerritoryId") && !gameTypesSource.includes("noticePlayerId"), "Shared draft state does not store local notices.");
  assert(!gameStateSource.includes("timerMs(state.config.pickTimeLimit) ?? 0") && gameStateSource.includes('draft: state.mode === "sync" ? beginDraftTimer'), "Sync draft timers preserve unlimited pick time.");
  assert(gameStateSource.includes("expandRemovedTroops(removedTroopPool") && gameStateSource.includes('troopType === "leader" ? randomMixtureTroop() : troopType'), "Removed-player leaders are replaced by random regular troops.");
  assert(armyBuildSource.includes("ARMY_ECONOMY") && armyBuildSource.includes("costScale: 5") && armyBuildSource.includes("heavy: 4") && armyBuildSource.includes("cavalry: 5") && armyBuildSource.includes("elite: 6"), "Army economy keeps tunable fixed-point costs together.");
  assert(armyBuildSource.includes("remainingCostUnits >= minimumCost") && armyBuildSource.includes("mixtureError"), "Army builds use budget-maximal closest-ratio candidates.");
  assert(!gameStateSource.includes("weightedCost") && !gameStateSource.includes("adjustedCount"), "Old average-cost army rounding is removed.");
  assert(!gameTypesSource.includes("allocationWaiting"), "AppPhase does not include allocationWaiting.");
  assert(gameStateSource.includes('return { ...state, phase: "allocation", allocation: nextAllocation };'), "Sync ready keeps the shared phase in allocation.");
  assert(gameStateSource.includes("const readyAllocation = markAllocationReady(allocation, playerId)") && gameStateSource.includes("allAllocationsReady(readyAllocation, state.players)"), "Sync ready preserves the allocation timer until every player is ready.");
  assert(gameStateSource.includes("function completeTimedOutSyncAllocations") && appSource.includes("completeTimedOutSyncAllocations(current)"), "Sync allocation timeout uses the host-authoritative timeout completion helper.");
  assert(gameStateSource.includes("currentPlayerAllocation.ready || currentPlayerAllocation.randomCompleted"), "Host ignores stale allocation updates after a player is ready or random-completed.");
  assert(appSource.includes("applySyncAllocationUpdate(current, playerId, rawMessage.allocation)"), "Host allocation updates go through the sync allocation merge contract.");
  assert(gameStateSource.includes('value === "allocationWaiting" ? "allocation"'), "Old allocationWaiting saves normalize to allocation.");
  assert(appSource.includes('game.mode === "sync" && game.phase === "allocation" && localAllocationReady'), "Ready page is derived from this device's ready state.");
  assert(appSource.includes("function ReadyColumn") && appSource.includes('title="Ready"') && appSource.includes('title="Waiting"'), "Allocation ready page uses ready and waiting columns.");
  assert(appSource.includes("showGameTopBar") && appSource.includes("timerRemaining={timerRemaining}"), "A persistent game top bar keeps relevant timers visible.");
  assert(!appSource.includes('detail="ready"') && !appSource.includes("allocating</span>"), "Allocation ready page does not show row-level ready labels.");
  assert(appSource.includes("data-qr-text") && appSource.includes("handlePaste"), "QR scanner supports paste-driven verification.");
  assert(appSource.includes("canAdvance={syncRole === \"host\"") && appSource.includes("onAdvance={startAllocatedGame}"), "Allocation waiting panel exposes host-only start control.");
  assert(syncTransportSource.includes("ardature-sync-offer") && syncTransportSource.includes("ARO:"), "Sync transport uses Ardatúrë QR payloads.");
  assert(mapViewSource.includes("viewBox") && mapViewSource.includes("MapViewport"), "Map view owns the viewport camera.");
  assert(mapViewSource.includes("constrainViewport"), "Map view constrains the viewport inside the map.");
  assert(mapViewSource.includes("viewportTransitionDistance"), "Map view uses combined pan and zoom focus distance.");
  assert(mapViewSource.includes("onMapPress"), "Map view supports map-background presses.");
  assert(mapViewSource.includes("setPointerCapture") && mapViewSource.includes("territoryIdFromTarget"), "Map view captures and classifies every pointer gesture.");
  assert(mapViewSource.includes("hadMultiplePointersRef") && mapViewSource.includes("onLostPointerCapture"), "Map view cleans up multi-touch and lost pointer capture state.");
  assert(mapViewSource.includes('pointer.pointerType === "touch"') && mapViewSource.includes("startPanMomentum") && mapViewSource.includes("stopPanMomentum"), "Map view applies momentum only to touch panning.");
  assert(mapViewSource.includes("PAN_MOMENTUM_DECAY_MS = 300") && mapViewSource.includes("PAN_MOMENTUM_MAX_MS = 900"), "Touch momentum uses restrained fixed tuning.");
  assert(!hitTargetSource.includes("onPointerDown") && !hitTargetSource.includes("onPointerUp") && !hitTargetSource.includes("pendingPress"), "Hit targets do not duplicate map pointer gesture state.");
  assert(mapViewSource.includes("Maximize") && mapViewSource.includes("Return to map view"), "Map view uses a corner-only return-to-map control.");
  assert(mapViewSource.includes("Crosshair") && mapViewSource.includes("Disable automatic focus") && mapViewSource.includes("Enable automatic focus"), "Map view exposes an auto-focus toggle.");
  assert(mapPreferencesSource.includes("ardature.mapPreferences.v1") && mapPreferencesSource.includes("autoFocusEnabled: false"), "Map preferences persist auto-focus with a default-off state.");
  assert(territoryFillSource.includes("mixWithWhite") && territoryFillSource.includes("SELECTED_WHITE_MIX = 0.35"), "Selected territory fill blends the current color with white.");
  assert(!territoryFillSource.includes('state.status === "selected" ? "#ffffff"'), "Selected territory fill is not hard-coded to white.");
  assert(troopMarkerSource.includes("data-troop-marker"), "Troop markers expose territory ids for visibility verification.");
  assert(appSource.includes("icon-button-spacer"), "Host self-removal leaves an aligned spacer instead of a trash button.");
  assert(appSource.includes("function GameTopBar") && appSource.includes("showGameTopBar") && appSource.includes("allocation-waiting-panel"), "Game stages use the shared persistent game top bar.");
  assert(appSource.includes('current.phase !== "home" && current.phase !== "setup"'), "Pagehide local recovery does not overwrite storage from home or setup.");
  assert(!appSource.includes("draft-status") && !appSource.includes("allocation-summary"), "Old game-stage header markup is removed.");
  assert(appSource.includes("TroopIconCount") && appSource.includes("troopIconSrc"), "Allocation UI uses troop image icons.");
  assert(!appSource.includes("TroopBadge") && !appSource.includes("troopLabel"), "Old letter troop badge components are removed.");
  assert(!stylesSource.includes(".troop-badge") && !stylesSource.includes(".troop-chip") && !stylesSource.includes(".army-builder"), "Old troop badge styles are removed.");
  assert(!appSource.includes("troop-step-grid") && !appSource.includes("troop-stepper"), "Old troop stepper markup is removed.");
  assert(!stylesSource.includes(".troop-step-grid") && !stylesSource.includes(".troop-stepper"), "Old troop stepper styles are removed.");
  assert(!stylesSource.includes(".army-triangle text"), "Army triangle does not style text labels.");
  assert(!mapViewSource.includes("isImmediatePress") && !mapViewSource.includes("pressImmediately"), "Old immediate territory press workaround is removed.");
  assert(indexSource.includes("./app-icons/icon-192.png") && indexSource.includes("./app-icons/apple-touch-icon.png"), "Index references organized app icons.");
  assert(manifestSource.includes("app-icons/icon-192.png") && manifestSource.includes("app-icons/icon-512.png"), "Manifest references organized app icons.");
  assert(serviceWorkerSource.includes("./app-icons/icon-192.png") && serviceWorkerSource.includes("./app-icons/icon-512.png"), "Service worker caches organized app icons.");
}

function generatedNumber(source, name) {
  const match = source.match(new RegExp(`\\n  ${name}: ([^,]+),`));

  if (!match) {
    throw new Error(`Missing generated ${name}.`);
  }

  const value = Number(match[1]);
  assert(Number.isFinite(value), `Generated ${name} is finite.`);
  return value;
}

function cssZIndex(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped} \\{[\\s\\S]*?z-index: ([0-9]+);`));

  if (!match) {
    throw new Error(`Missing z-index for ${selector}.`);
  }

  return Number(match[1]);
}

function showDraftPanelSource(source) {
  const match = source.match(/const showDraftPanel = [\s\S]*?;/);

  if (!match) {
    throw new Error("Missing showDraftPanel expression.");
  }

  return match[0];
}

function generatedViewport(source, name) {
  const match = source.match(new RegExp(`\\n  ${name}: \\{ x: ([^,]+), y: ([^,]+), width: ([^,]+), height: ([^ }]+) \\},`));

  if (!match) {
    throw new Error(`Missing generated ${name}.`);
  }

  const viewport = {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  };

  assert(Object.values(viewport).every(Number.isFinite), `Generated ${name} is finite.`);
  return viewport;
}

function generatedTerritoryCenter(source, territoryId) {
  const lineBreak = "\\r?\\n";
  const pattern = new RegExp(`id: "${territoryId}",${lineBreak}      name: "[^"]+",${lineBreak}      regionId: "[^"]+",${lineBreak}      center: \\{ x: ([^,]+), y: ([^ }]+) \\},`);
  const match = source.match(pattern);

  if (!match) {
    throw new Error(`Missing generated center for ${territoryId}.`);
  }

  const point = {
    x: Number(match[1]),
    y: Number(match[2]),
  };

  assert(Number.isFinite(point.x) && Number.isFinite(point.y), `Generated center for ${territoryId} is finite.`);
  return point;
}

async function viewBox(page) {
  const value = await page.locator(".map-svg").getAttribute("viewBox");

  if (!value) {
    throw new Error("Map SVG has no viewBox.");
  }

  return value;
}

function parseViewBox(value) {
  const parts = value.trim().split(/\s+/).map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Invalid viewBox: ${value}`);
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

async function mapSize(page) {
  const background = page.locator("[data-background-piece]");
  const width = Number(await background.getAttribute("width"));
  const height = Number(await background.getAttribute("height"));

  assert(Number.isFinite(width) && Number.isFinite(height), "Map dimensions are finite.");
  return { width, height };
}

function assertViewBoxInside(value, size, message) {
  const viewport = parseViewBox(value);
  const epsilon = 0.001;

  assert(viewport.x >= -epsilon, message);
  assert(viewport.y >= -epsilon, message);
  assert(viewport.x + viewport.width <= size.width + epsilon, message);
  assert(viewport.y + viewport.height <= size.height + epsilon, message);
}

function homeViewportFromSize(size) {
  return {
    x: 1500,
    y: 1500,
    width: size.width - 3000,
    height: size.height - 3000,
  };
}

function assertViewBoxEquals(value, expected, message) {
  const viewport = parseViewBox(value);
  const epsilon = 0.001;

  assert(Math.abs(viewport.x - expected.x) <= epsilon, message);
  assert(Math.abs(viewport.y - expected.y) <= epsilon, message);
  assert(Math.abs(viewport.width - expected.width) <= epsilon, message);
  assert(Math.abs(viewport.height - expected.height) <= epsilon, message);
}

async function waitForViewBox(page, expected) {
  await page.waitForFunction(
    (target) => {
      const value = document.querySelector(".map-svg")?.getAttribute("viewBox");
      const parts = value?.trim().split(/\s+/).map(Number) ?? [];

      return parts.length === 4 &&
        Math.abs(parts[0] - target.x) < 0.001 &&
        Math.abs(parts[1] - target.y) < 0.001 &&
        Math.abs(parts[2] - target.width) < 0.001 &&
        Math.abs(parts[3] - target.height) < 0.001;
    },
    expected,
  );
}

async function mapPointToScreen(page, point) {
  return page.evaluate((mapPoint) => {
    const svg = document.querySelector(".map-svg");

    if (!(svg instanceof SVGSVGElement)) {
      throw new Error("Missing map SVG.");
    }

    const matrix = svg.getScreenCTM();

    if (!matrix) {
      throw new Error("Missing map screen matrix.");
    }

    const svgPoint = svg.createSVGPoint();
    svgPoint.x = mapPoint.x;
    svgPoint.y = mapPoint.y;
    const screenPoint = svgPoint.matrixTransform(matrix);
    return {
      x: screenPoint.x,
      y: screenPoint.y,
    };
  }, point);
}

function touchPoint(point, id) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
    id,
    radiusX: 1,
    radiusY: 1,
    force: 1,
  };
}

async function dispatchTouch(client, type, points) {
  await client.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point) => touchPoint(point, point.id)),
  });
  await new Promise((resolve) => setTimeout(resolve, 24));
}

async function touchTap(client, point, id) {
  await dispatchTouch(client, "touchStart", [{ ...point, id }]);
  await dispatchTouch(client, "touchEnd", []);
}

async function touchDrag(client, start, end, id) {
  await dispatchTouch(client, "touchStart", [{ ...start, id }]);
  await dispatchTouch(client, "touchMove", [{ ...end, id }]);
  await dispatchTouch(client, "touchEnd", []);
}

async function clickTerritory(page, territoryId) {
  const target = page.locator(`[data-territory-hit="${territoryId}"]`);
  await target.focus();
  await target.press("Enter");
}

async function clickMapBackground(page) {
  const point = await page.evaluate(() => {
    const svg = document.querySelector(".map-svg");

    if (!(svg instanceof SVGSVGElement)) {
      return null;
    }

    const bounds = svg.getBoundingClientRect();

    // Find a visible ocean point that is not covered by a territory hit target.
    for (let y = bounds.top + 8; y < bounds.bottom; y += 12) {
      for (let x = bounds.left + 8; x < bounds.right; x += 12) {
        if (document.elementFromPoint(x, y)?.matches("[data-background-piece]")) {
          return { x, y };
        }
      }
    }

    return null;
  });

  assert(point, "Map has a visible background press point.");
  await page.mouse.click(point.x, point.y);
}

function assertBoxEquals(actual, expected, message) {
  const epsilon = 0.001;

  assert(
    actual &&
    expected &&
    Math.abs(actual.x - expected.x) <= epsilon &&
    Math.abs(actual.y - expected.y) <= epsilon &&
    Math.abs(actual.width - expected.width) <= epsilon &&
    Math.abs(actual.height - expected.height) <= epsilon,
    message,
  );
}

async function setPlayerName(page, index, name) {
  await page.getByLabel("Player name").fill(name);
  await page.getByLabel("Add player").click();
  await page.locator(".player-row").nth(index).waitFor();
}

async function setPlayerColor(page, index, color) {
  const row = page.locator(".player-row").nth(index);

  await row.getByRole("button", { name: /color/i }).click();
  await row.getByRole("menuitemradio", { name: colorLabel(color) }).click();
}

async function playerNames(page) {
  return page.locator(".player-row input").evaluateAll((inputs) => inputs.map((input) => input.value));
}

async function assertNoHorizontalOverflow(page, message) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!hasOverflow, message);
}

async function assertBelow(page, upperLocator, lowerLocator, message) {
  const upper = await upperLocator.boundingBox();
  const lower = await lowerLocator.boundingBox();

  assert(upper && lower && lower.y >= upper.y + upper.height - 1, message);
}

async function assertTopBarFullWidth(page, selector, message) {
  const bar = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();

  assert(bar && viewport && bar.x <= 1 && bar.width >= viewport.width - 2, message);
}

async function assertNoMapCameraControls(page, message) {
  const returnCount = await page.getByRole("button", { name: "Return to map view" }).count();
  const enableCount = await page.getByRole("button", { name: "Enable automatic focus" }).count();
  const disableCount = await page.getByRole("button", { name: "Disable automatic focus" }).count();

  assert(returnCount + enableCount + disableCount === 0, message);
}

async function assertCompactPlayerRowsAligned(page, selector, message) {
  const rows = await page.locator(selector).evaluateAll((elements) => elements.map((row) => {
    const dot = row.querySelector(".player-dot")?.getBoundingClientRect();
    const name = row.querySelector("strong")?.getBoundingClientRect();
    const status = row.querySelector(".connection-label")?.getBoundingClientRect();
    const action = row.querySelector(".icon-button, .icon-button-spacer")?.getBoundingClientRect();

    return dot && name && status && action
      ? {
          actionRight: action.right,
          actionLeft: action.left,
          dotRight: dot.right,
          nameLeft: name.left,
          rowRight: row.getBoundingClientRect().right,
          statusLeft: status.left,
          statusRight: status.right,
        }
      : null;
  }));
  const completeRows = rows.filter(Boolean);

  assert(completeRows.length >= 2, `${message}: expected at least two complete rows.`);
  for (const row of completeRows) {
    assert(row.nameLeft >= row.dotRight + 4, `${message}: names sit immediately to the right of colors.`);
    assert(row.statusRight <= row.actionLeft - 4, `${message}: statuses sit to the left of the action slot.`);
    assert(row.actionRight >= row.rowRight - 8, `${message}: action slots sit on the far right.`);
  }

  const nameLefts = completeRows.map((row) => row.nameLeft);
  const statusRights = completeRows.map((row) => row.statusRight);
  assert(Math.max(...nameLefts) - Math.min(...nameLefts) < 1, `${message}: names are left-aligned.`);
  assert(Math.max(...statusRights) - Math.min(...statusRights) < 1, `${message}: statuses are right-aligned.`);
}

async function assertReadyColumnHeadersLeftAligned(page) {
  const columns = await page.locator(".ready-column").evaluateAll((elements) => elements.map((column) => {
    const header = column.querySelector("h2")?.getBoundingClientRect();
    const firstName = column.querySelector(".ready-player-row strong")?.getBoundingClientRect();

    return header && firstName
      ? { headerLeft: header.left, nameLeft: firstName.left }
      : null;
  }));

  for (const column of columns.filter(Boolean)) {
    assert(column.headerLeft <= column.nameLeft + 1, "Ready/waiting column headers are left-justified within their columns.");
  }
}

async function checkColorMenuDismissal(page) {
  const firstColorButton = page.locator(".player-row").nth(0).getByRole("button", { name: /color/i });
  const secondColorButton = page.locator(".player-row").nth(1).getByRole("button", { name: /color/i });

  await firstColorButton.click();
  assert((await page.locator(".color-select-menu").count()) === 1, "Opening a color menu shows one menu.");
  await page.mouse.click(5, 5);
  assert((await page.locator(".color-select-menu").count()) === 0, "Clicking outside a color menu closes it.");
  await secondColorButton.click();
  assert((await page.locator(".color-select-menu").count()) === 1, "A different color menu can open after dismissal.");
  await page.mouse.click(5, 5);
  assert((await page.locator(".color-select-menu").count()) === 0, "The second color menu also closes on outside click.");
}

function colorLabel(color) {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

async function startLocalSnakeDraft(page) {
  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Aragorn");
  await setPlayerColor(page, 0, "green");
  await setPlayerName(page, 1, "Gimli");
  await setPlayerColor(page, 1, "blue");
  await assertNoHorizontalOverflow(page, "Local setup has no horizontal overflow on mobile.");
  await assertBelow(page, page.locator(".player-list"), page.getByRole("button", { name: "Randomize" }), "Local randomize sits below player names.");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.waitForSelector("[data-territory-hit]");
}

async function closeActiveSetup(page) {
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("dialog", { name: "End this game and return home?" }).waitFor();
  await page.getByRole("button", { name: "End game" }).click();
}

async function runSetupPreferenceChecks(page) {
  console.log("Checking setup preferences");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await capture(page, "01-home-mobile.png");
  await assertNoMapCameraControls(page, "Home overlay hides map camera controls.");

  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Aragorn");
  await setPlayerColor(page, 0, "green");
  await setPlayerName(page, 1, "Gimli");
  await setPlayerColor(page, 1, "blue");
  await setPlayerName(page, 2, "Legolas");
  await setPlayerColor(page, 2, "yellow");
  await page.getByRole("button", { name: "Round robin" }).click();
  await page.getByLabel("PICK TIME").selectOption("10");
  await page.getByLabel("TROOP TIME").selectOption("120");
  await page.getByRole("button", { name: "Random", exact: true }).click();
  assert((await page.getByLabel("PICK TIME").inputValue()) === "0", "Random draft forces pick time to unlimited.");
  assert(await page.getByLabel("PICK TIME").isDisabled(), "Random draft locks pick time after forcing unlimited.");
  await page.getByRole("button", { name: "Round robin" }).click();
  await page.getByLabel("PICK TIME").selectOption("10");
  await page.getByRole("button", { name: "Randomize" }).click();
  const savedLocalNames = await playerNames(page);
  await checkColorMenuDismissal(page);
  await capture(page, "02-local-setup-mobile.png");
  await assertNoMapCameraControls(page, "Local setup/config overlay hides map camera controls.");
  await closeActiveSetup(page);

  await page.getByRole("button", { name: "Local" }).click();
  assert(JSON.stringify(await playerNames(page)) === JSON.stringify(savedLocalNames), "Local names and order persist.");
  assert((await page.getByRole("button", { name: "Round robin" }).getAttribute("class"))?.includes("selected"), "Draft style persists.");
  assert((await page.getByLabel("PICK TIME").inputValue()) === "10", "Pick time persists.");
  assert((await page.getByLabel("TROOP TIME").inputValue()) === "120", "Troop time persists.");
  await closeActiveSetup(page);

  await page.getByRole("button", { name: "Sync" }).click();
  await page.getByLabel("Sync player name").fill("Galadriel");
  await capture(page, "03-sync-entry-mobile.png");
  await page.getByRole("button", { name: "Sync player color" }).click();
  await capture(page, "04-sync-entry-color-menu-mobile.png");
  await page.getByRole("menuitemradio", { name: "Purple" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Sync" }).click();
  assert((await page.getByLabel("Sync player name").inputValue()) === "Galadriel", "Sync profile name persists.");
  await page.getByRole("button", { name: "Sync player color" }).click();
  assert((await page.getByRole("menuitemradio", { name: "Purple" }).getAttribute("class"))?.includes("selected"), "Sync profile color persists.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Host" }).click();
  await page.waitForSelector(".qr-code svg", { timeout: 10000 });
  assert((await page.getByLabel("PICK TIME").inputValue()) === "10", "Sync host uses saved pick time.");
  assert((await page.getByLabel("TROOP TIME").inputValue()) === "120", "Sync host uses saved troop time.");
  await closeActiveSetup(page);

  await page.getByRole("button", { name: "Local" }).click();
  assert(JSON.stringify(await playerNames(page)) === JSON.stringify(savedLocalNames), "Sync setup does not overwrite local players.");
  await closeActiveSetup(page);
}

async function runArmyRuleChecks(page) {
  console.log("Checking army build rules");
  await page.goto(baseUrl);
  const result = await page.evaluate(async () => {
    const { ARMY_ECONOMY, armyCountsForMarker } = await import("/src/game/armyBuild.ts");
    const minimumCost = Math.min(...Object.values(ARMY_ECONOMY.mixtureTroopCostUnits));
    const violations = [];

    // Sample the full triangle on a regular barycentric grid for every player budget.
    for (let playerCount = 2; playerCount <= 6; playerCount += 1) {
      const budgetUnits = ARMY_ECONOMY.startingBudgetByPlayerCount[playerCount] * ARMY_ECONOMY.costScale;

      for (let heavyStep = 0; heavyStep <= 20; heavyStep += 1) {
        for (let cavalryStep = 0; cavalryStep <= 20 - heavyStep; cavalryStep += 1) {
          const marker = {
            heavy: heavyStep / 20,
            cavalry: cavalryStep / 20,
            elite: (20 - heavyStep - cavalryStep) / 20,
          };
          const counts = armyCountsForMarker(marker, "green", playerCount);
          const spentUnits = counts.leader * ARMY_ECONOMY.leaderCostUnits +
            counts.heavy * ARMY_ECONOMY.mixtureTroopCostUnits.heavy +
            counts.cavalry * ARMY_ECONOMY.mixtureTroopCostUnits.cavalry +
            counts.elite * ARMY_ECONOMY.mixtureTroopCostUnits.elite;
          const validCounts = Object.values(counts).every((count) => Number.isInteger(count) && count >= 0);

          if (!validCounts || counts.leader !== 1 || spentUnits > budgetUnits || budgetUnits - spentUnits >= minimumCost) {
            violations.push({ playerCount, marker, counts, spentUnits, budgetUnits });
          }
        }
      }
    }

    return {
      centerThreePlayer: armyCountsForMarker({ heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 }, "green", 3),
      eliteThreePlayer: armyCountsForMarker({ heavy: 0, cavalry: 0, elite: 1 }, "green", 3),
      violations,
    };
  });

  assert(result.violations.length === 0, "Every sampled army is integral, within budget, and cannot add another troop.");
  assert(JSON.stringify(result.centerThreePlayer) === JSON.stringify({ heavy: 11, cavalry: 12, elite: 11, leader: 1 }), "Three-player center chooses the closest full-budget uniform army.");
  assert(JSON.stringify(result.eliteThreePlayer) === JSON.stringify({ heavy: 0, cavalry: 0, elite: 28, leader: 1 }), "Three-player elite corner remains pure when its remainder cannot buy another troop.");
}

async function runMapThemeChecks(page) {
  console.log("Checking varied map shades");
  await page.goto(baseUrl);
  const result = await page.evaluate(async () => {
    const { generatedMapData } = await import("/src/map/generated/mapData.ts");
    const coloredSkins = ["blue", "green", "red", "yellow", "black", "purple"];
    const violations = [];

    for (const skin of coloredSkins) {
      const colors = new Set(generatedMapData.territories.map((territory) => territory.skins[skin]));
      if (colors.size <= 6) {
        violations.push({ skin, colorCount: colors.size });
      }
    }

    return {
      backgroundColors: [...new Set(generatedMapData.territories.map((territory) => territory.skins.background))],
      violations,
    };
  });

  assert(result.violations.length === 0, "Every colored skin has varied territory shades.");
  assert(result.backgroundColors.length === 1 && result.backgroundColors[0] === "#EFE9D9", "Background skin remains uniformly tan.");
}

async function runLocalDraftChecks(page) {
  console.log("Checking local draft");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("[data-background-piece]");
  await startLocalSnakeDraft(page);
  await capture(page, "05-local-draft-map-mobile.png");

  const size = await mapSize(page);
  const homeViewport = homeViewportFromSize(size);
  assertViewBoxInside(await viewBox(page), size, "Initial draft viewBox stays inside the map.");
  assertViewBoxEquals(await viewBox(page), homeViewport, "Initial draft viewBox uses the home viewport.");
  assert((await page.locator("[data-territory-fill]").count()) === 42, "Map renders 42 territory fill groups.");
  assert((await page.locator("[data-territory-hit]").count()) === 42, "Draft renders 42 hit targets.");
  const controlsBox = await page.locator(".game-top-bar").boundingBox();
  const mapBox = await page.locator(".map-shell").boundingBox();
  assert(controlsBox && mapBox && mapBox.y >= controlsBox.y + controlsBox.height - 1, "Draft controls sit above the map.");
  assert((await page.locator(".game-top-bar").count()) === 1, "Draft uses the shared game top bar.");
  assert((await page.locator(".game-top-bar .player-dot").count()) === 0, "Game top bar does not use player dots.");
  const topBarBox = await page.locator(".game-top-bar").boundingBox();
  const endButtonBox = await page.locator(".game-top-bar").getByRole("button", { name: "End game" }).boundingBox();
  const pauseButtonBox = await page.locator(".game-top-bar").getByRole("button", { name: "Pause draft" }).boundingBox();
  assert(topBarBox && endButtonBox && pauseButtonBox && endButtonBox.x < topBarBox.x + topBarBox.width * 0.2, "Game top bar keeps X on the left.");
  assert(topBarBox && pauseButtonBox && pauseButtonBox.x + pauseButtonBox.width > topBarBox.x + topBarBox.width * 0.8, "Game top bar keeps pause on the right.");
  await page.getByText("0 / 21").waitFor();
  assert((await page.getByText("42 left").count()) === 0, "Draft controls show active-player progress instead of territories left.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Map shows the return-to-map control.");
  assert((await page.getByRole("button", { name: "Enable automatic focus" }).count()) === 1, "Auto-focus defaults to off.");
  assert(
    await page.locator(".static-map-ink").evaluate((node) => getComputedStyle(node).pointerEvents === "none"),
    "Static ink layer is pointer inert.",
  );
  assert((await page.locator(".territory-border-ink").count()) > 0, "Map renders ordinary territory border ink.");
  assert((await page.locator(".region-border-ink").count()) > 0, "Map renders thicker regional and coastline border ink.");
  assert((await page.locator('.territory-border-ink[stroke-width="10"]').count()) === (await page.locator(".territory-border-ink").count()), "Territory borders use the thin stroke.");
  assert((await page.locator('.region-border-ink[stroke-width="20"]').count()) === (await page.locator(".region-border-ink").count()), "Regional borders use the thick stroke.");

  const beforeDefaultSelection = await viewBox(page);
  await clickTerritory(page, "shire");
  const confirmDialog = page.getByRole("dialog", { name: "Confirm territory" });
  await confirmDialog.waitFor();
  const confirmBox = await confirmDialog.boundingBox();
  const viewport = page.viewportSize();
  assert(confirmBox && viewport && confirmBox.y > viewport.height * 0.55, "Confirm sheet appears at the bottom.");
  assert(confirmBox && viewport && confirmBox.width > 280 && confirmBox.width <= viewport.width - 32, "Confirm sheet uses the wider bottom-sheet layout.");
  assert((await page.locator(".game-top-bar").count()) === 1, "Draft top bar stays visible during territory confirmation.");
  assertViewBoxEquals(await viewBox(page), parseViewBox(beforeDefaultSelection), "Default-off auto-focus leaves the viewBox unchanged.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 0, "Confirm sheet hides the return-to-map control.");
  assert((await page.getByRole("button", { name: "Enable automatic focus" }).count()) === 0, "Confirm sheet hides the auto-focus control.");
  assert(await confirmDialog.getByRole("heading", { name: "Shire" }).isVisible(), "Confirm modal shows the territory name.");
  assert((await confirmDialog.locator(".territory-preview-shape").count()) === 0, "Confirm sheet has no territory preview.");
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Pending territory is selected on the map.");
  const selectedFill = await page.locator('[data-territory-fill="shire"] [data-territory-fill-piece="shire"]').first().getAttribute("fill");
  assert(selectedFill && selectedFill !== "#ffffff", "Pending territory is brightened without becoming pure white.");
  await capture(page, "06-local-draft-confirm-mobile.png");
  await clickMapBackground(page);
  await confirmDialog.waitFor({ state: "detached" });
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 0, "Tapping the map background cancels the pending pick.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Return-to-map control returns after confirm cancellation.");
  assert((await page.getByRole("button", { name: "Enable automatic focus" }).count()) === 1, "Auto-focus control returns after confirm cancellation.");

  await page.getByRole("button", { name: "Enable automatic focus" }).click();
  assert((await page.getByRole("button", { name: "Disable automatic focus" }).count()) === 1, "Auto-focus can be enabled.");
  assert(await page.evaluate(() => localStorage.getItem("ardature.mapPreferences.v1")?.includes('"autoFocusEnabled":true')), "Auto-focus preference is persisted.");
  await page.reload();
  await page.waitForSelector("[data-background-piece]");
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await capture(page, "06b-local-refresh-pause-mobile.png");
  assert((await page.locator(".game-top-bar").count()) === 1, "Local refresh restores into pause while keeping the player bar visible.");
  await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Resume" }).click();
  await page.getByText("0 / 21").waitFor();
  assert((await page.getByRole("button", { name: "Disable automatic focus" }).count()) === 1, "Auto-focus enabled state persists after reload.");
  const beforeFocusedSelection = await viewBox(page);
  await clickTerritory(page, "shire");
  await confirmDialog.waitFor();
  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeFocusedSelection);
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "false");
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Auto-focus still selects the pending territory.");

  await clickTerritory(page, "bree");
  await confirmDialog.getByRole("heading", { name: "Bree" }).waitFor();
  const replacedConfirmBox = await confirmDialog.boundingBox();
  await page.getByRole("button", { name: "Confirm pick" }).click();
  const resultDialog = page.getByRole("status");
  await resultDialog.waitFor();
  const resultBox = await resultDialog.boundingBox();
  await capture(page, "07-local-draft-result-mobile.png");
  assert((await page.locator(".game-top-bar").count()) === 1, "Draft top bar stays visible during draft notification.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 0, "Draft result sheet hides the return-to-map control.");
  assert((await page.getByRole("button", { name: "Disable automatic focus" }).count()) === 0, "Draft result sheet hides the auto-focus control.");
  assert(replacedConfirmBox && resultBox && Math.abs(replacedConfirmBox.width - resultBox.width) < 1, "Result sheet matches confirm sheet width.");
  assert(replacedConfirmBox && resultBox && Math.abs(replacedConfirmBox.height - resultBox.height) < 1, "Result sheet matches confirm sheet height.");
  assert((await resultDialog.getByRole("button", { name: "Next player" }).count()) === 0, "Result modal has no next button.");
  assert((await resultDialog.locator(".territory-preview-shape").count()) === 0, "Result sheet has no territory preview.");
  await page.getByText("0 / 21").waitFor();
  await waitForViewBox(page, homeViewport);
  assertViewBoxEquals(await viewBox(page), homeViewport, "Local result dismissal returns to the home viewport.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Return-to-map control returns after draft notification.");
  assert((await page.getByRole("button", { name: "Disable automatic focus" }).count()) === 1, "Auto-focus control returns after draft notification.");

  await clickTerritory(page, "shire");
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor();
  await page.getByRole("button", { name: "Confirm pick" }).click();
  await page.locator(".pick-result-scrim").click();
  await page.getByText("1 / 21").waitFor();

  await page.getByRole("button", { name: "Pause draft" }).click();
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await capture(page, "08-local-pause-mobile.png");
  assert((await page.locator(".game-top-bar").count()) === 1, "Pause keeps the game top bar visible.");
  const pauseBox = await page.getByRole("dialog", { name: "Paused" }).boundingBox();
  const pauseViewport = page.viewportSize();
  assert(pauseBox && pauseViewport && Math.abs((pauseBox.x + pauseBox.width / 2) - (pauseViewport.width / 2)) < 1, "Pause modal is centered horizontally.");
  assert((await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "End game" }).count()) === 0, "Local pause has no end-game close button.");
  assert((await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Restart game" }).count()) === 1, "Local pause has a restart button.");
  await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Restart game" }).click();
  await page.getByRole("dialog", { name: "Restart this game and return to setup?" }).waitFor();
  await capture(page, "09-restart-confirm-mobile.png");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await page.getByText("40 territories remain.").waitFor();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByText("1 / 21").waitFor();

  const box = await page.locator(".map-svg").boundingBox();
  assert(box, "Map SVG has a bounding box.");
  const beforeWheel = await viewBox(page);
  await page.locator(".map-svg").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
    deltaY: 500,
  });
  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeWheel);
  const zoomedOutViewport = parseViewBox(await viewBox(page));
  assert(zoomedOutViewport.width > homeViewport.width, "Manual wheel zoom can zoom out past the home viewport.");
  assertViewBoxInside(await viewBox(page), size, "Wheel zoom keeps the viewBox inside the framed map.");
  await page.getByRole("button", { name: "Return to map view" }).click();
  await page.waitForFunction(
    (expected) => {
      const value = document.querySelector(".map-svg")?.getAttribute("viewBox");
      if (!value) {
        return false;
      }

      const parts = value.trim().split(/\s+/).map(Number);
      return Math.abs(parts[0] - expected.x) < 0.001 &&
        Math.abs(parts[1] - expected.y) < 0.001 &&
        Math.abs(parts[2] - expected.width) < 0.001 &&
        Math.abs(parts[3] - expected.height) < 0.001;
    },
    homeViewport,
  );
}

async function runDesktopMapInteractionChecks(page) {
  console.log("Checking desktop map interaction");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const shireCenter = generatedTerritoryCenter(mapDataSource, "shire");

  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("[data-background-piece]");
  await startLocalSnakeDraft(page);

  const shireScreen = await mapPointToScreen(page, shireCenter);
  const hitTerritory = await page.evaluate((point) => {
    return document.elementFromPoint(point.x, point.y)?.closest("[data-territory-hit]")?.getAttribute("data-territory-hit");
  }, shireScreen);
  assert(hitTerritory === "shire", "Generated Shire center maps to the Shire hit target.");

  const returnButtonBox = await page.getByRole("button", { name: "Return to map view" }).boundingBox();
  const focusButtonBox = await page.getByRole("button", { name: "Enable automatic focus" }).boundingBox();
  const beforeClickViewBox = await viewBox(page);

  await page.mouse.click(shireScreen.x, shireScreen.y);
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor();
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Real desktop click selects a territory.");
  assertViewBoxEquals(await viewBox(page), parseViewBox(beforeClickViewBox), "Default-off auto-focus keeps desktop click from moving the camera.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 0, "Desktop confirm sheet hides the return-to-map control.");
  assert((await page.getByRole("button", { name: "Enable automatic focus" }).count()) === 0, "Desktop confirm sheet hides the auto-focus control.");

  await page.getByRole("button", { name: "Cancel pick" }).click();
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor({ state: "detached" });
  assertBoxEquals(await page.getByRole("button", { name: "Return to map view" }).boundingBox(), returnButtonBox, "Return-to-map control returns anchored after desktop cancel.");
  assertBoxEquals(await page.getByRole("button", { name: "Enable automatic focus" }).boundingBox(), focusButtonBox, "Auto-focus control returns anchored after desktop cancel.");

  const beforeDragViewBox = await viewBox(page);
  await page.mouse.move(shireScreen.x, shireScreen.y);
  await page.mouse.down();
  await page.mouse.move(shireScreen.x + 70, shireScreen.y + 24);
  await page.mouse.up();
  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeDragViewBox);
  const afterDesktopDrag = parseViewBox(await viewBox(page));
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), afterDesktopDrag, "Desktop mouse drag has no release momentum.");
  assert((await page.getByRole("dialog", { name: "Confirm territory" }).count()) === 0, "Desktop drag pans instead of selecting.");
  assertBoxEquals(await page.getByRole("button", { name: "Return to map view" }).boundingBox(), returnButtonBox, "Return-to-map control stays anchored after desktop drag.");
  assertBoxEquals(await page.getByRole("button", { name: "Enable automatic focus" }).boundingBox(), focusButtonBox, "Auto-focus control stays anchored after desktop drag.");

  const beforeWheelViewBox = await viewBox(page);
  const svgBox = await page.locator(".map-svg").boundingBox();
  assert(svgBox, "Map SVG has a desktop bounding box.");
  await page.locator(".map-svg").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: svgBox.x + svgBox.width / 2,
    clientY: svgBox.y + svgBox.height / 2,
    deltaY: -500,
  });
  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeWheelViewBox);
  assertBoxEquals(await page.getByRole("button", { name: "Return to map view" }).boundingBox(), returnButtonBox, "Return-to-map control stays anchored after desktop wheel zoom.");
  assertBoxEquals(await page.getByRole("button", { name: "Enable automatic focus" }).boundingBox(), focusButtonBox, "Auto-focus control stays anchored after desktop wheel zoom.");

  const beforeControlClickViewBox = await viewBox(page);
  await page.getByRole("button", { name: "Enable automatic focus" }).click();
  assertViewBoxEquals(await viewBox(page), parseViewBox(beforeControlClickViewBox), "Auto-focus control does not pan or zoom the map.");
  assert((await page.locator('[data-territory-fill-state="selected"]').count()) === 0, "Auto-focus control does not select a territory.");
}

async function runMobileMapInteractionChecks(page) {
  console.log("Checking mobile map interaction");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const shireCenter = generatedTerritoryCenter(mapDataSource, "shire");
  const client = await page.context().newCDPSession(page);

  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("[data-background-piece]");
  await startLocalSnakeDraft(page);

  // A real touch tap selects once through the root map gesture controller.
  await touchTap(client, await mapPointToScreen(page, shireCenter), 1);
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor();
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Mobile touch tap selects a territory.");
  await page.getByRole("button", { name: "Cancel pick" }).click();

  // A one-finger drag beginning on a territory pans without selecting it.
  const dragStart = await mapPointToScreen(page, shireCenter);
  const beforeDrag = parseViewBox(await viewBox(page));
  await touchDrag(client, dragStart, { x: dragStart.x + 64, y: dragStart.y + 28 }, 2);
  const afterDrag = parseViewBox(await viewBox(page));
  assert(afterDrag.x !== beforeDrag.x || afterDrag.y !== beforeDrag.y, "Mobile one-finger drag pans the map.");
  assert(Math.abs(afterDrag.width - beforeDrag.width) < 0.001, "Mobile one-finger drag does not zoom the map.");
  assert((await page.getByRole("dialog", { name: "Confirm territory" }).count()) === 0, "Mobile one-finger drag does not select a territory.");

  // A two-finger gesture zooms, then the next one-finger gesture returns to panning.
  const mapBox = await page.locator(".map-svg").boundingBox();
  assert(mapBox, "Mobile map has a bounding box.");
  const center = { x: mapBox.x + mapBox.width / 2, y: mapBox.y + mapBox.height / 2 };
  const beforePinch = parseViewBox(await viewBox(page));
  await dispatchTouch(client, "touchStart", [
    { x: center.x - 34, y: center.y, id: 3 },
    { x: center.x + 34, y: center.y, id: 4 },
  ]);
  await dispatchTouch(client, "touchMove", [
    { x: center.x - 74, y: center.y, id: 3 },
    { x: center.x + 74, y: center.y, id: 4 },
  ]);
  await dispatchTouch(client, "touchEnd", []);
  const afterPinch = parseViewBox(await viewBox(page));
  assert(afterPinch.width < beforePinch.width, "Mobile two-finger gesture zooms the map.");
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), afterPinch, "Mobile pinch does not launch momentum.");

  // A quick touch pan coasts after release without changing zoom.
  const beforePostPinchDrag = parseViewBox(await viewBox(page));
  await touchDrag(client, center, { x: center.x - 48, y: center.y + 26 }, 5);
  const afterPostPinchDrag = parseViewBox(await viewBox(page));
  assert(Math.abs(afterPostPinchDrag.width - beforePostPinchDrag.width) < 0.001, "One finger pans without zooming after a pinch.");
  assert(afterPostPinchDrag.x !== beforePostPinchDrag.x || afterPostPinchDrag.y !== beforePostPinchDrag.y, "One-finger pan remains responsive after a pinch.");
  await page.waitForTimeout(140);
  const afterMomentum = parseViewBox(await viewBox(page));
  assert(afterMomentum.x !== afterPostPinchDrag.x || afterMomentum.y !== afterPostPinchDrag.y, "Quick mobile pan continues after release.");
  assert(Math.abs(afterMomentum.width - afterPostPinchDrag.width) < 0.001, "Touch pan momentum never changes zoom.");

  // A new slow gesture interrupts momentum and does not launch another coast.
  await dispatchTouch(client, "touchStart", [{ ...center, id: 8 }]);
  await dispatchTouch(client, "touchMove", [{ x: center.x + 30, y: center.y + 18, id: 8 }]);
  await page.waitForTimeout(130);
  await dispatchTouch(client, "touchEnd", []);
  const afterSlowRelease = parseViewBox(await viewBox(page));
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), afterSlowRelease, "Slow held touch pan stops immediately on release.");

  // A canceled territory touch is removed before the next gesture begins.
  const canceledTouch = await mapPointToScreen(page, shireCenter);
  await dispatchTouch(client, "touchStart", [{ ...canceledTouch, id: 6 }]);
  await dispatchTouch(client, "touchCancel", []);
  const afterCanceledTouch = parseViewBox(await viewBox(page));
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), afterCanceledTouch, "Canceled touch does not launch momentum.");
  const beforePostCancelDrag = parseViewBox(await viewBox(page));
  await touchDrag(client, center, { x: center.x + 42, y: center.y - 24 }, 7);
  const afterPostCancelDrag = parseViewBox(await viewBox(page));
  assert(Math.abs(afterPostCancelDrag.width - beforePostCancelDrag.width) < 0.001, "Canceled touch does not turn the next pan into a zoom.");
  assert(afterPostCancelDrag.x !== beforePostCancelDrag.x || afterPostCancelDrag.y !== beforePostCancelDrag.y, "Map remains responsive after a canceled touch.");

  // Return-to-map replaces active momentum and settles at the home viewport.
  await page.getByRole("button", { name: "Return to map view" }).click();
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "false");
  const size = await mapSize(page);
  const homeViewport = homeViewportFromSize(size);
  await waitForViewBox(page, homeViewport);
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), homeViewport, "Return-to-map cancels touch momentum.");

  // A fast edge swipe remains constrained and settles without bouncing.
  await touchDrag(client, center, { x: center.x + 170, y: center.y, id: 9 });
  await page.waitForTimeout(950);
  assertViewBoxInside(await viewBox(page), size, "Touch momentum remains inside map bounds.");
  const atMomentumRest = parseViewBox(await viewBox(page));
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), atMomentumRest, "Touch momentum stops at the map edge.");
  await page.getByRole("button", { name: "Return to map view" }).click();
  await waitForViewBox(page, homeViewport);

  // Territory selection can redirect an active focus animation.
  await page.getByRole("button", { name: "Enable automatic focus" }).click();
  await clickTerritory(page, "shire");
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "true");
  await clickTerritory(page, "bree");
  await page.getByRole("dialog", { name: "Confirm territory" }).getByRole("heading", { name: "Bree" }).waitFor();
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "false");
}

async function runRandomAllocationChecks(page) {
  console.log("Checking random draft allocation");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Frodo");
  await setPlayerColor(page, 0, "yellow");
  await setPlayerName(page, 1, "Sauron");
  await setPlayerColor(page, 1, "red");
  await page.getByRole("button", { name: "Random", exact: true }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.waitForSelector('.app-shell[data-app-phase="allocationHandoff"]');
  await capture(page, "10-allocation-handoff-mobile.png");
  assert((await page.locator(".game-top-bar").count()) === 1, "Allocation handoff shows the next player's top bar.");
  assert((await page.getByRole("dialog", { name: "Allocation handoff" }).getByRole("button", { name: "Begin allocation" }).count()) === 1, "Allocation handoff popup is only the continue arrow.");
  assert((await page.locator('[data-territory-fill][data-territory-skin="background"]').count()) < 42, "Random draft colors territories.");
  await page.getByRole("button", { name: "Begin allocation" }).click();
  await page.waitForSelector(".army-build-modal .army-triangle");
  await capture(page, "11-allocation-army-mobile.png");
  assert((await page.locator(".army-build-modal .troop-icon-count").count()) === 4, "Army build shows three troop classes plus leader.");
  assert((await page.locator(".army-triangle .army-triangle-icon").count()) === 3, "Army triangle uses three troop icons.");
  assert((await page.locator(".army-triangle text").count()) === 0, "Army triangle has no H/C/E text labels.");
  const projectedCounts = (await page.locator(".army-build-modal .troop-count-bubble").evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim()))).sort((left, right) => Number(left) - Number(right));
  assert(projectedCounts.join(",") === "1,13,13,13", "Two-player center army reserves one leader and spends 39 triangle budget.");
  await page.getByRole("button", { name: "Confirm army" }).click();
  await page.waitForSelector(".allocation-controls");
  const ownedTerritoryId = await page.locator('[data-territory-fill][data-territory-skin="yellow"]').first().getAttribute("data-territory-fill");
  assert(ownedTerritoryId, "Random draft gives the allocating player at least one territory.");
  await clickTerritory(page, ownedTerritoryId);
  await page.waitForSelector(".allocation-target");
  await capture(page, "12-allocation-territory-mobile.png");
  assert((await page.locator(".game-top-bar").count()) === 1, "Allocation uses the shared game top bar.");
  assert((await page.locator(".allocation-target span").count()) === 0, "Allocation target does not repeat the territory troop total.");
  assert((await page.locator(".troop-action-row").count()) === 2, "Territory allocation has add and remove rows.");
  assert((await page.locator(".troop-action-row").nth(0).locator(".troop-icon-button").count()) === 4, "Add row has four troop icon buttons.");
  assert((await page.locator(".troop-action-row").nth(1).locator(".troop-icon-button").count()) === 4, "Remove row has four troop icon buttons.");
  const allocationBox = await page.locator(".allocation-controls").boundingBox();
  const addIconsBox = await page.locator(".troop-action-icons").nth(0).boundingBox();
  const removeIconsBox = await page.locator(".troop-action-icons").nth(1).boundingBox();
  assert(allocationBox && addIconsBox && Math.abs((addIconsBox.x + addIconsBox.width / 2) - (allocationBox.x + allocationBox.width / 2)) < 2, "Add troop icons are centered independent of the plus icon.");
  assert(allocationBox && removeIconsBox && Math.abs((removeIconsBox.x + removeIconsBox.width / 2) - (allocationBox.x + allocationBox.width / 2)) < 2, "Remove troop icons are centered independent of the minus icon.");
  const allocationChildClasses = await page.locator(".allocation-controls").evaluate((node) => Array.from(node.children).map((child) => child.className));
  assert(String(allocationChildClasses[0]).includes("troop-action-row") && String(allocationChildClasses[1]).includes("allocation-target") && String(allocationChildClasses[2]).includes("troop-action-row"), "Allocation controls order add row, territory name, remove row.");
  assert((await page.locator(".troop-row-affordance button").count()) === 0, "Row plus and minus icons are not buttons.");
  await page.getByRole("button", { name: "Add heavy" }).click();
  assert((await page.locator(".troop-marker").count()) >= 1, "Adding a troop shows a troop marker.");
  await page.getByRole("button", { name: "Remove heavy" }).click();
  await page.getByRole("button", { name: "Add heavy" }).click();
  await finishAllocationTurn(page, "yellow", { coveredTerritoryIds: [ownedTerritoryId], troopPool: [
    ...Array(12).fill("heavy"),
    ...Array(13).fill("cavalry"),
    ...Array(13).fill("elite"),
    "leader",
  ] });
  await page.waitForSelector('.app-shell[data-app-phase="allocationHandoff"]');
  await page.getByRole("button", { name: "Begin allocation" }).click();
  await page.waitForSelector(".army-build-modal .army-triangle");
  await page.getByRole("button", { name: "Confirm army" }).click();
  await page.waitForSelector(".allocation-controls");
  await finishAllocationTurn(page, "red");
  await page.waitForSelector('.app-shell[data-app-phase="gameMap"]');
  await capture(page, "13-game-map-mobile.png");
  assert((await page.locator(".game-top-bar").count()) === 1, "Read-only map uses the shared game top bar.");
  await assertTopBarFullWidth(page, ".game-top-bar", "Read-only map top bar spans the screen.");
  assert((await page.getByLabel("Current viewer").count()) === 0, "Local game map does not use a viewer dropdown.");
  assert((await page.getByRole("button", { name: "Change viewer" }).count()) === 1, "Local game map cycles viewer from the name bar.");
  assert((await page.locator(".troop-marker").count()) > 0, "Read-only game map shows troop totals.");
  await clickTerritory(page, ownedTerritoryId);
  assert((await page.locator(".game-map-panel .selected-territory-name").count()) === 1, "Read-only map shows the selected territory name.");
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 4, "Read-only breakdown uses troop icon counts.");
  const opponentTerritoryId = await page.locator('[data-territory-fill][data-territory-skin="red"]').first().getAttribute("data-territory-fill");
  assert(opponentTerritoryId, "Random draft gives the opponent at least one territory.");
  await clickTerritory(page, opponentTerritoryId);
  assert((await page.locator(".game-map-panel .selected-territory-name").count()) === 1, "Read-only map shows opponent territory names.");
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 0, "Read-only map hides opponent breakdowns.");
  await page.getByRole("button", { name: "Change viewer" }).click();
  await clickTerritory(page, opponentTerritoryId);
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 4, "Cycling local viewer reveals that player's own breakdowns.");
}

async function runReadOnlyVisibilityChecks(page) {
  console.log("Checking read-only map visibility");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const savedState = readOnlyVisibilityGameState(territoryIds);

  assert(territoryIds.length === 42, "Read-only visibility fixture has all territories.");
  await page.addInitScript((state) => {
    localStorage.clear();
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(state));
  }, savedState);
  await page.goto(baseUrl);
  await page.waitForSelector('.app-shell[data-app-phase="gameMap"]');
  await capture(page, "13b-read-only-visibility-mobile.png");
  assert((await page.locator('[data-troop-marker="shire"]').count()) === 1, "Read-only map shows own territory troop total.");
  assert((await page.locator('[data-troop-marker="grey-havens"]').count()) === 1, "Read-only map shows Grey Havens as a connected opponent troop total.");
  assert((await page.locator('[data-troop-marker="bree"]').count()) === 1, "Read-only map shows Bree as a connected opponent troop total.");
  assert((await page.locator('[data-troop-marker="minhiriath"]').count()) === 1, "Read-only map shows Minhiriath as a connected opponent troop total.");
  assert((await page.locator('[data-troop-marker="nurn"]').count()) === 0, "Read-only map hides distant opponent troop total.");
  await clickTerritory(page, "shire");
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 4, "Read-only map shows own territory breakdown.");
  await clickTerritory(page, "bree");
  assert((await page.locator(".game-map-panel .selected-territory-name").getByText("Bree").count()) === 1, "Read-only map shows connected opponent territory name.");
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 0, "Read-only map hides connected opponent breakdown.");
  await clickTerritory(page, "nurn");
  assert((await page.locator(".game-map-panel .selected-territory-name").getByText("Nurn").count()) === 1, "Read-only map shows distant opponent territory name.");
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 0, "Read-only map hides distant opponent breakdown.");
  await page.getByRole("button", { name: "Change viewer" }).click();
  assert((await page.locator('[data-troop-marker="nurn"]').count()) === 1, "Cycling local viewer shows that player's own distant territory total.");
  await clickTerritory(page, "nurn");
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 4, "Cycling local viewer reveals that player's own distant breakdown.");
}

function readOnlyVisibilityGameState(territoryIds) {
  return {
    phase: "gameMap",
    mode: "local",
    players: [
      {
        id: "viewer",
        name: "Frodo",
        color: "yellow",
        nameLocked: false,
        colorLocked: false,
        connectionStatus: "connected",
      },
      {
        id: "opponent",
        name: "Sauron",
        color: "red",
        nameLocked: false,
        colorLocked: false,
        connectionStatus: "connected",
      },
    ],
    config: {
      draftStyle: "snake",
      pickTimeLimit: 0,
      troopAllocationTimeLimit: 0,
    },
    draft: {
      originalTurnOrder: ["viewer", "opponent"],
      startIndex: 0,
      step: territoryIds.length,
      ownership: Object.fromEntries(territoryIds.map((territoryId) => [
        territoryId,
        territoryId === "shire" ? "viewer" : "opponent",
      ])),
      resultTerritoryId: null,
      resultPlayerId: null,
      timerRemainingMs: null,
      timerEndsAt: null,
    },
    allocation: {
      originalPlayerCount: 2,
      order: ["viewer", "opponent"],
      currentIndex: 0,
      timerRemainingMs: null,
      timerEndsAt: null,
      playerAllocations: {
        viewer: {
          marker: { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 },
          buildSubmitted: true,
          baseTroops: { heavy: 2, cavalry: 1, elite: 0, leader: 1 },
          inheritedTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
          ready: true,
          randomCompleted: false,
          territories: {
            shire: { heavy: 2, cavalry: 1, elite: 0, leader: 1 },
          },
        },
        opponent: {
          marker: { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 },
          buildSubmitted: true,
          baseTroops: { heavy: 6, cavalry: 4, elite: 0, leader: 0 },
          inheritedTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
          ready: true,
          randomCompleted: false,
          territories: {
            "grey-havens": { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
            bree: { heavy: 3, cavalry: 0, elite: 0, leader: 0 },
            minhiriath: { heavy: 1, cavalry: 1, elite: 0, leader: 0 },
            nurn: { heavy: 1, cavalry: 2, elite: 0, leader: 0 },
          },
        },
      },
    },
  };
}

async function finishAllocationTurn(page, skin, options = {}) {
  const territoryIds = await page.locator(`[data-territory-fill][data-territory-skin="${skin}"]`).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-territory-fill")).filter(Boolean),
  );
  assert(territoryIds.length > 0, `Expected owned ${skin} territories.`);

  const covered = new Set(options.coveredTerritoryIds ?? []);
  const troopPool = options.troopPool ? [...options.troopPool] : [
    ...Array(13).fill("heavy"),
    ...Array(13).fill("cavalry"),
    ...Array(13).fill("elite"),
    "leader",
  ];

  for (const territoryId of territoryIds.filter((id) => !covered.has(id))) {
    const troopType = troopPool.shift();
    assert(troopType, "Expected enough troops to cover owned territories.");
    await clickTerritory(page, territoryId);
    await page.getByRole("button", { name: `Add ${troopType}` }).click();
  }

  await clickTerritory(page, territoryIds[0]);
  for (const troopType of troopPool) {
    await page.getByRole("button", { name: `Add ${troopType}` }).click();
  }

  await page.getByRole("button", { name: "Ready" }).click();
}

async function runSyncEntryChecks(page) {
  console.log("Checking sync entry");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Sync" }).click();
  await page.getByLabel("Sync player name").fill("Galadriel");
  await page.getByRole("button", { name: "Sync player color" }).click();
  await page.getByRole("menuitemradio", { name: "Purple" }).click();
  await page.getByRole("button", { name: "Host" }).click();
  await page.waitForSelector(".qr-code svg", { timeout: 10000 });
  await capture(page, "14-sync-host-lobby-mobile.png");
  await assertNoMapCameraControls(page, "Sync setup/config overlay hides map camera controls.");
  await assertBelow(page, page.locator(".qr-code"), page.getByRole("button", { name: "Scan" }), "Sync scan sits below the host QR.");
  await assertBelow(page, page.locator(".player-list"), page.getByRole("button", { name: "Randomize" }), "Sync randomize sits below player names.");
  assert((await page.locator(".player-row").count()) === 1, "Host lobby starts with the host player.");
  assert((await page.getByRole("button", { name: "Remove Galadriel" }).count()) === 0, "Host cannot remove themselves in the lobby.");
  assert(await page.getByRole("button", { name: "Start game" }).isDisabled(), "Sync host cannot start with one player.");
  assert((await page.locator("[data-sync-role='host']").count()) === 1, "App records host sync role.");
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByRole("dialog", { name: "Scan answer" }).waitFor();
  await capture(page, "14b-sync-scan-answer-mobile.png");
  assert((await page.locator(".scanner-modal .scanner-frame video").count()) === 1, "Sync scan answer modal shows a camera frame.");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("dialog", { name: "End this game and return home?" }).waitFor();
  await capture(page, "15-sync-exit-confirm-mobile.png");
  assert((await page.getByRole("dialog", { name: "End this game and return home?" }).getByRole("button").count()) === 2, "Exit confirmation has two icon buttons.");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForSelector("[data-sync-role='host']");
}

async function runSyncReadyPageChecks(browser) {
  console.log("Checking sync ready page");
  const host = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const joiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  host.setDefaultTimeout(15000);
  joiner.setDefaultTimeout(15000);

  await host.goto(baseUrl);
  await host.evaluate(() => localStorage.clear());
  await host.reload();
  await host.getByRole("button", { name: "Sync" }).click();
  await host.getByLabel("Sync player name").fill("Gandalf");
  await host.getByRole("button", { name: "Sync player color" }).click();
  await host.getByRole("menuitemradio", { name: "Green" }).click();
  await host.getByRole("button", { name: "Host" }).click();
  await host.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await joiner.goto(baseUrl);
  await joiner.evaluate(() => localStorage.clear());
  await joiner.reload();
  await joiner.getByRole("button", { name: "Sync" }).click();
  await joiner.getByLabel("Sync player name").fill("Saruman");
  await joiner.getByRole("button", { name: "Sync player color" }).click();
  await joiner.getByRole("menuitemradio", { name: "Red" }).click();
  await joiner.getByRole("button", { name: "Join" }).click();
  await pasteScannerText(joiner, await qrText(host));
  await joiner.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await host.getByRole("button", { name: "Scan" }).click();
  await pasteScannerText(host, await qrText(joiner));
  await host.getByText("Saruman").waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Random", exact: true }).click();
  await host.getByRole("button", { name: "Start game" }).click();
  await host.waitForSelector(".army-build-modal .army-triangle", { timeout: 15000 });
  await host.getByRole("button", { name: "Confirm army" }).click();
  await host.waitForSelector(".allocation-controls");
  await finishAllocationTurn(host, "green");
  await host.waitForSelector(".allocation-waiting-panel .ready-columns");
  await capture(host, "16-sync-ready-page-mobile.png");
  assert((await host.locator(".game-top-bar").count()) === 1, "Sync ready page uses the top game bar.");
  await assertTopBarFullWidth(host, ".game-top-bar", "Sync ready page top bar spans the screen.");
  assert((await host.locator(".game-top-player span").count()) === 0, "Sync ready top bar shows name only.");
  assert((await host.locator(".ready-column").count()) === 2, "Sync ready page has two columns.");
  await assertReadyColumnHeadersLeftAligned(host);
  assert((await host.locator(".ready-player-row .connection-label").count()) === 0, "Sync ready rows do not include row-level status.");

  await joiner.waitForSelector(".army-build-modal .army-triangle", { timeout: 15000 });
  await capture(joiner, "17-sync-unready-allocation-mobile.png");
  assert((await joiner.locator(".allocation-waiting-panel").count()) === 0, "Unready sync player does not see ready page.");

  await host.close();
  await joiner.close();
}

async function runSyncRecoveryChecks(browser) {
  console.log("Checking sync recovery");
  const host = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const joiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const rejoiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const recoveryJoiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  host.setDefaultTimeout(20000);
  joiner.setDefaultTimeout(20000);
  rejoiner.setDefaultTimeout(20000);
  recoveryJoiner.setDefaultTimeout(20000);

  await host.goto(baseUrl);
  await host.evaluate(() => localStorage.clear());
  await host.reload();
  await host.getByRole("button", { name: "Sync" }).click();
  await host.getByLabel("Sync player name").fill("Elrond");
  await host.getByRole("button", { name: "Host" }).click();
  await host.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await joiner.goto(baseUrl);
  await joiner.evaluate(() => localStorage.clear());
  await joiner.reload();
  await joiner.getByRole("button", { name: "Sync" }).click();
  await joiner.getByLabel("Sync player name").fill("Boromir");
  await joiner.getByRole("button", { name: "Sync player color" }).click();
  await joiner.getByRole("menuitemradio", { name: "Red" }).click();
  await joiner.getByRole("button", { name: "Join" }).click();
  await pasteScannerText(joiner, await qrText(host));
  await joiner.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await host.getByRole("button", { name: "Scan" }).click();
  await pasteScannerText(host, await qrText(joiner));
  await host.getByText("Boromir").waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Start game" }).click();
  await host.waitForSelector('.app-shell[data-app-phase="draft"]', { timeout: 15000 });
  await host.getByRole("button", { name: "Pause draft" }).click();
  await host.getByRole("dialog", { name: "Paused" }).waitFor();
  await capture(host, "18-sync-pause-recovery-qr-mobile.png");
  assert((await host.getByRole("dialog", { name: "Paused" }).locator(".qr-code[data-qr-text]").count()) === 1, "Sync host pause always shows a recovery QR.");
  await assertCompactPlayerRowsAligned(host, ".pause-modal .player-row.compact-row", "Sync pause player rows align names, statuses, and actions");
  await joiner.getByRole("dialog", { name: "Paused" }).waitFor({ timeout: 15000 });
  await capture(joiner, "18b-sync-joiner-pause-no-qr-mobile.png");
  assert((await joiner.getByRole("dialog", { name: "Paused" }).locator(".qr-code[data-qr-text]").count()) === 0, "Sync joiner pause does not show a recovery QR.");
  assert((await joiner.getByRole("dialog", { name: "Paused" }).locator(".qr-placeholder").count()) === 0, "Sync joiner pause does not show a blank QR placeholder.");

  await rejoiner.goto(baseUrl);
  await rejoiner.evaluate(() => localStorage.clear());
  await rejoiner.reload();
  await rejoiner.getByRole("button", { name: "Sync" }).click();
  await rejoiner.getByLabel("Sync player name").fill("Recovered");
  await rejoiner.getByRole("button", { name: "Join" }).click();
  await pasteScannerText(rejoiner, await qrText(host));
  await rejoiner.getByText("No disconnected players").waitFor({ timeout: 15000 });
  await capture(rejoiner, "19-sync-recovery-no-slots-mobile.png");

  await joiner.close();
  await host.locator('.pause-modal [data-player-status="disconnected"]').waitFor({ timeout: 20000 });
  await capture(host, "20-sync-pause-disconnected-slot-mobile.png");
  await assertCompactPlayerRowsAligned(host, ".pause-modal .player-row.compact-row", "Disconnected sync pause rows keep names and statuses aligned");
  await host.reload();
  await host.getByRole("dialog", { name: "Paused" }).waitFor({ timeout: 15000 });
  await host.getByRole("dialog", { name: "Paused" }).locator(".qr-code[data-qr-text]").waitFor({ timeout: 15000 });
  await host.locator('.pause-modal [data-player-status="disconnected"]').waitFor({ timeout: 15000 });
  await capture(host, "21-sync-host-refresh-recovery-qr-mobile.png");

  await recoveryJoiner.goto(baseUrl);
  await recoveryJoiner.evaluate(() => localStorage.clear());
  await recoveryJoiner.reload();
  await recoveryJoiner.getByRole("button", { name: "Sync" }).click();
  await recoveryJoiner.getByLabel("Sync player name").fill("Recovered");
  await recoveryJoiner.getByRole("button", { name: "Join" }).click();
  await pasteScannerText(recoveryJoiner, await qrText(host));
  const recoverySlotButton = recoveryJoiner.getByRole("button", { name: "Boromir" });
  await recoverySlotButton.waitFor({ timeout: 15000 });
  assert((await recoverySlotButton.locator(".player-dot").count()) === 1, "Recovery slot picker shows the disconnected player's color.");
  const recoverySlotLayout = await recoverySlotButton.evaluate((button) => {
    const dot = button.querySelector(".player-dot")?.getBoundingClientRect();
    const name = button.querySelector("strong")?.getBoundingClientRect();

    return dot && name
      ? { dotRight: dot.right, nameLeft: name.left, svgCount: button.querySelectorAll("svg").length }
      : null;
  });
  assert(recoverySlotLayout && recoverySlotLayout.svgCount === 0, "Recovery slot picker uses color plus name without an extra leading icon.");
  assert(recoverySlotLayout.nameLeft >= recoverySlotLayout.dotRight + 4, "Recovery slot name is left-aligned just to the right of the color.");
  await capture(recoveryJoiner, "22-sync-recovery-slot-picker-mobile.png");
  await recoverySlotButton.click();
  await recoveryJoiner.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });
  const answerColor = await recoveryJoiner
    .locator(".player-row")
    .filter({ has: recoveryJoiner.getByLabel("Boromir color") })
    .locator(".color-select")
    .evaluate((element) => getComputedStyle(element).getPropertyValue("--selected-color").trim());
  assert(answerColor === "#b3444a", "Recovery answer QR page keeps the disconnected player's color visible.");
  await capture(recoveryJoiner, "23-sync-recovery-answer-qr-mobile.png");

  await host.getByRole("button", { name: "Scan" }).click();
  await host.getByRole("dialog", { name: "Scan answer" }).waitFor();
  await capture(host, "23b-sync-recovery-scan-answer-mobile.png");
  assert((await host.locator(".scanner-modal .scanner-frame video").count()) === 1, "Recovery scan answer modal shows a camera frame.");
  await pasteScannerText(host, await qrText(recoveryJoiner));
  await host.locator('.pause-modal [data-player-status="connected"]').filter({ hasText: "Boromir" }).waitFor({ timeout: 15000 });
  await capture(host, "24-sync-pause-recovered-mobile.png");
  assert((await host.locator('.pause-modal [data-player-status="disconnected"]').count()) === 0, "Recovered player is no longer listed as disconnected.");

  await host.close();
  await rejoiner.close();
  await recoveryJoiner.close();
}

async function runSyncHostLossChecks(browser) {
  console.log("Checking sync host loss");
  const host = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const joiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  host.setDefaultTimeout(20000);
  joiner.setDefaultTimeout(25000);

  await host.goto(baseUrl);
  await host.evaluate(() => localStorage.clear());
  await host.reload();
  await host.getByRole("button", { name: "Sync" }).click();
  await host.getByLabel("Sync player name").fill("Aragorn");
  await host.getByRole("button", { name: "Host" }).click();
  await host.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await joiner.goto(baseUrl);
  await joiner.evaluate(() => localStorage.clear());
  await joiner.reload();
  await joiner.getByRole("button", { name: "Sync" }).click();
  await joiner.getByLabel("Sync player name").fill("Legolas");
  await joiner.getByRole("button", { name: "Sync player color" }).click();
  await joiner.getByRole("menuitemradio", { name: "Blue" }).click();
  await joiner.getByRole("button", { name: "Join" }).click();
  await pasteScannerText(joiner, await qrText(host));
  await joiner.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await host.getByRole("button", { name: "Scan" }).click();
  await pasteScannerText(host, await qrText(joiner));
  await host.getByText("Legolas").waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Start game" }).click();
  await joiner.waitForSelector('.app-shell[data-app-phase="draft"]', { timeout: 15000 });

  await host.close();
  await joiner.getByRole("alertdialog", { name: "Sync connection" }).getByText("Reconnecting...").waitFor({ timeout: 15000 });
  await capture(joiner, "25-sync-joiner-host-loss-reconnecting-mobile.png");
  assert((await joiner.locator(".sync-session-dialog .qr-code").count()) === 0, "Host-loss reconnecting UI has no QR code.");
  assert((await joiner.locator(".sync-session-dialog .player-row").count()) === 0, "Host-loss reconnecting UI does not show stale roster status.");
  const reconnectDialogBox = await joiner.locator(".sync-session-dialog").boundingBox();
  const stopReconnectBox = await joiner.getByRole("button", { name: "Stop reconnecting" }).boundingBox();
  assert(
    reconnectDialogBox &&
      stopReconnectBox &&
      Math.abs((stopReconnectBox.x + stopReconnectBox.width / 2) - (reconnectDialogBox.x + reconnectDialogBox.width / 2)) < 1,
    "Reconnect stop button is centered below the text.",
  );
  assert(stopReconnectBox && stopReconnectBox.width < 80, "Reconnect stop button is compact.");

  await joiner.waitForSelector('.app-shell[data-app-phase="home"]', { timeout: 20000 });
  await capture(joiner, "26-sync-joiner-host-loss-home-mobile.png");
  assert((await joiner.getByRole("button", { name: "Sync" }).count()) === 1, "Joiner returns home after host reconnect fails.");

  await joiner.close();
}

async function runSyncTerminalEventChecks(browser) {
  console.log("Checking sync terminal events");
  const endedHost = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const endedJoiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const removeHost = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const removedJoiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  endedHost.setDefaultTimeout(20000);
  endedJoiner.setDefaultTimeout(20000);
  removeHost.setDefaultTimeout(20000);
  removedJoiner.setDefaultTimeout(20000);

  await connectSyncPair(endedHost, endedJoiner, {
    hostName: "Theoden",
    hostColor: "Yellow",
    joinerName: "Eomer",
    joinerColor: "Blue",
  });
  await endedHost.getByRole("button", { name: "Start game" }).click();
  await endedJoiner.waitForSelector('.app-shell[data-app-phase="draft"]', { timeout: 15000 });
  await endedHost.getByRole("button", { name: "End game" }).click();
  await endedHost.getByRole("dialog", { name: "End this game and return home?" }).getByRole("button", { name: "End game" }).click();
  await endedJoiner.waitForSelector('.app-shell[data-app-phase="home"]', { timeout: 15000 });
  await capture(endedJoiner, "27-sync-joiner-host-ended-home-mobile.png");
  assert((await endedJoiner.getByRole("button", { name: "Sync" }).count()) === 1, "Joiner returns home when host ends the game.");

  await connectSyncPair(removeHost, removedJoiner, {
    hostName: "Faramir",
    hostColor: "Green",
    joinerName: "Denethor",
    joinerColor: "Red",
  });
  await removeHost.getByRole("button", { name: "Remove Denethor" }).click();
  await removedJoiner.waitForSelector('.app-shell[data-app-phase="home"]', { timeout: 15000 });
  await capture(removedJoiner, "28-sync-joiner-removed-home-mobile.png");
  assert((await removedJoiner.getByRole("button", { name: "Sync" }).count()) === 1, "Removed joiner returns home immediately.");
  await removeHost.waitForFunction(
    () => !Array.from(document.querySelectorAll(".player-row input")).some((input) => input.value === "Denethor"),
  );
  assert((await removeHost.getByRole("button", { name: "Remove Denethor" }).count()) === 0, "Host setup removes the player after sending removed.");

  await endedHost.close();
  await endedJoiner.close();
  await removeHost.close();
  await removedJoiner.close();
}

async function connectSyncPair(host, joiner, { hostColor, hostName, joinerColor, joinerName }) {
  await host.goto(baseUrl);
  await host.evaluate(() => localStorage.clear());
  await host.reload();
  await host.getByRole("button", { name: "Sync" }).click();
  await host.getByLabel("Sync player name").fill(hostName);
  await host.getByRole("button", { name: "Sync player color" }).click();
  await host.getByRole("menuitemradio", { name: hostColor }).click();
  await host.getByRole("button", { name: "Host" }).click();
  await host.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await joiner.goto(baseUrl);
  await joiner.evaluate(() => localStorage.clear());
  await joiner.reload();
  await joiner.getByRole("button", { name: "Sync" }).click();
  await joiner.getByLabel("Sync player name").fill(joinerName);
  await joiner.getByRole("button", { name: "Sync player color" }).click();
  await joiner.getByRole("menuitemradio", { name: joinerColor }).click();
  await joiner.getByRole("button", { name: "Join" }).click();
  await pasteScannerText(joiner, await qrText(host));
  await joiner.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });

  await host.getByRole("button", { name: "Scan" }).click();
  await pasteScannerText(host, await qrText(joiner));
  await host.getByText(joinerName).waitFor({ timeout: 15000 });
}

async function qrText(page) {
  const text = await page.locator(".qr-code[data-qr-text]").last().getAttribute("data-qr-text");
  assert(text, "QR text is exposed for verification.");
  return text;
}

async function pasteScannerText(page, text) {
  await page.locator(".scanner-modal").waitFor();
  await page.evaluate((payload) => {
    const data = new DataTransfer();
    data.setData("text/plain", payload);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      clipboardData: data,
    });
    document.querySelector(".scanner-modal")?.dispatchEvent(event);
  }, text);
}

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await runSourceChecks();

  const server = spawn(npmCommand(), ["exec", "vite", "--", "--host", "127.0.0.1", "--port", "5174", "--strictPort"], {
    cwd: projectRoot,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    console.log("Starting Vite");
    await waitForServer(server);
    console.log("Launching browser");
    const browser = await launchBrowser();
    const mobile = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(10000);
    await runMapThemeChecks(mobile);
    await runArmyRuleChecks(mobile);
    await runSetupPreferenceChecks(mobile);
    await runLocalDraftChecks(mobile);
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    desktop.setDefaultTimeout(10000);
    await runDesktopMapInteractionChecks(desktop);
    const touchMobile = await browser.newPage({ deviceScaleFactor: 2, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    touchMobile.setDefaultTimeout(10000);
    await runMobileMapInteractionChecks(touchMobile);
    await touchMobile.close();
    await runRandomAllocationChecks(mobile);
    const readOnlyMobile = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
    readOnlyMobile.setDefaultTimeout(10000);
    await runReadOnlyVisibilityChecks(readOnlyMobile);
    await readOnlyMobile.close();
    await runSyncEntryChecks(mobile);
    await runSyncReadyPageChecks(browser);
    await runSyncRecoveryChecks(browser);
    await runSyncHostLossChecks(browser);
    await runSyncTerminalEventChecks(browser);

    console.log("Closing browser");
    await Promise.race([
      browser.close(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } finally {
    console.log("Stopping Vite");
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
