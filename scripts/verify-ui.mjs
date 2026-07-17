import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const baseUrl = "http://127.0.0.1:5174/";
const outputDir = new URL("../verification-output/", import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const fixtureInitPages = new WeakSet();
const fixtureWindowNamePrefix = "ardature-fixture:";

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

function gifStats(bytes) {
  let totalDelay = 0;
  let frameCount = 0;

  for (let index = 0; index < bytes.length - 7; index += 1) {
    if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) {
      totalDelay += bytes.readUInt16LE(index + 4);
      frameCount += 1;
    }
  }

  return {
    frameCount,
    hasLoopExtension: bytes.toString("latin1").includes("NETSCAPE2.0"),
    totalMs: totalDelay * 10,
  };
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
  const args = ["--disable-features=WebRtcHideLocalIpsWithMdns"];

  for (const executablePath of chromePaths) {
    try {
      return await chromium.launch({ args, executablePath, headless: true });
    } catch {
      // Try the next locally installed browser path.
    }
  }

  return chromium.launch({ args, headless: true });
}

async function runSourceChecks() {
  console.log("Checking sources");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const armyBuildModalSource = await readFile(new URL("../src/ui/ArmyBuildModal.tsx", import.meta.url), "utf8");
  const armyBuildSource = await readFile(new URL("../src/game/armyBuild.ts", import.meta.url), "utf8");
  const gameStateSource = await readFile(new URL("../src/game/gameState.ts", import.meta.url), "utf8");
  const gameTypesSource = await readFile(new URL("../src/game/gameTypes.ts", import.meta.url), "utf8");
  const gameViewSource = await readFile(new URL("../src/game/gameView.ts", import.meta.url), "utf8");
  const combatSource = await readFile(new URL("../src/game/combat.ts", import.meta.url), "utf8");
  const notificationTextSource = await readFile(new URL("../src/game/notificationText.ts", import.meta.url), "utf8");
  const playerColorsSource = await readFile(new URL("../src/game/playerColors.ts", import.meta.url), "utf8");
  const troopIconsSource = await readFile(new URL("../src/game/troopIcons.tsx", import.meta.url), "utf8");
  const mapGeometrySource = await readFile(new URL("../maps/geometry/map.json", import.meta.url), "utf8");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const mapConnectionsSource = await readFile(new URL("../src/map/generated/mapConnections.ts", import.meta.url), "utf8");
  const mapGraphSource = await readFile(new URL("../src/game/mapGraph.ts", import.meta.url), "utf8");
  const mapTypesSource = await readFile(new URL("../src/map/mapTypes.ts", import.meta.url), "utf8");
  const hitTargetSource = await readFile(new URL("../src/map/components/HitTargetLayer.tsx", import.meta.url), "utf8");
  const mapViewSource = await readFile(new URL("../src/map/components/MapView.tsx", import.meta.url), "utf8");
  const staticMapInkSource = await readFile(new URL("../src/map/components/StaticMapInk.tsx", import.meta.url), "utf8");
  const territoryFillSource = await readFile(new URL("../src/map/components/TerritoryFillLayer.tsx", import.meta.url), "utf8");
  const troopMarkerSource = await readFile(new URL("../src/map/components/TroopMarkerLayer.tsx", import.meta.url), "utf8");
  const mapWeatherSource = await readFile(new URL("../src/map/components/MapWeatherLayer.tsx", import.meta.url), "utf8");
  const mapPreferencesSource = await readFile(new URL("../src/map/mapPreferences.ts", import.meta.url), "utf8");
  const territoryLookupSource = await readFile(new URL("../src/map/territoryLookup.ts", import.meta.url), "utf8");
  const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifestSource = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
  const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const balrogGifBytes = await readFile(new URL("../public/balrog/balrog.gif", import.meta.url));
  const localPauseRecoverySource = await readFile(new URL("../src/app/useLocalPauseRecovery.ts", import.meta.url), "utf8");
  const mapExtractorSource = await readFile(new URL("../scripts/extract-map.ps1", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const territoryPreviewSource = await readFile(new URL("../maps/previews/territories-background.svg", import.meta.url), "utf8");
  const blueTerritoryPreviewSource = await readFile(new URL("../maps/previews/territories-blue.svg", import.meta.url), "utf8");
  const syncMessagesSource = await readFile(new URL("../src/sync/syncMessages.ts", import.meta.url), "utf8");
  const qrCodeUiSource = await readFile(new URL("../src/sync/QrCodeUi.tsx", import.meta.url), "utf8");
  const syncErrorsSource = await readFile(new URL("../src/sync/syncErrors.ts", import.meta.url), "utf8");
  const syncTransportSource = await readFile(new URL("../src/sync/syncTransport.ts", import.meta.url), "utf8");
  const troopIconFiles = await readdir(new URL("../public/troops/icons/", import.meta.url));
  const caradhrasPassIconFiles = await readdir(new URL("../public/caradhras-pass/", import.meta.url));
  const caradhrasPassIconSources = await Promise.all(
    Array.from({ length: 9 }, (_, index) =>
      readFile(new URL(`../public/caradhras-pass/pass-${String(index + 2).padStart(2, "0")}.svg`, import.meta.url), "utf8")),
  );
  const verifySource = await readFile(new URL("../scripts/verify-ui.mjs", import.meta.url), "utf8");
  const formControlsSource = await readFile(new URL("../src/ui/FormControls.tsx", import.meta.url), "utf8");
  const gameSectionsSource = await readFile(new URL("../src/ui/GameSections.tsx", import.meta.url), "utf8");
  const battleModalSource = await readFile(new URL("../src/ui/BattleModal.tsx", import.meta.url), "utf8");
  const overlaysSource = await readFile(new URL("../src/ui/Overlays.tsx", import.meta.url), "utf8");
  const pausePanelSource = await readFile(new URL("../src/ui/PausePanel.tsx", import.meta.url), "utf8");
  const playerChromeSource = await readFile(new URL("../src/ui/PlayerChrome.tsx", import.meta.url), "utf8");
  const setupPanelsSource = await readFile(new URL("../src/ui/SetupPanels.tsx", import.meta.url), "utf8");
  const syncSessionBlockerSource = await readFile(new URL("../src/ui/SyncSessionBlocker.tsx", import.meta.url), "utf8");
  const troopControlsSource = await readFile(new URL("../src/ui/TroopControls.tsx", import.meta.url), "utf8");
  const appArchitectureDocs = await readFile(new URL("../docs/app-architecture.md", import.meta.url), "utf8");
  const setupDraftDocs = await readFile(new URL("../docs/setup-draft-sync-v1.md", import.meta.url), "utf8");
  const gameplayTurnsDocs = await readFile(new URL("../docs/gameplay-turns-v1.md", import.meta.url), "utf8");
  const gameSpecDocs = await readFile(new URL("../GAME_SPEC.md", import.meta.url), "utf8");
  const mapWidth = generatedNumber(mapDataSource, "width");
  const mapHeight = generatedNumber(mapDataSource, "height");
  const sourceWidth = generatedNumber(mapDataSource, "sourceWidth");
  const sourceHeight = generatedNumber(mapDataSource, "sourceHeight");
  const homeViewport = generatedViewport(mapDataSource, "homeViewport");
  const directedConnectionMap = JSON.parse(mapConnectionsSource
    .replace(/^export const generatedDirectedMapConnections = /, "")
    .replace(/\s+as const;\s*$/, ""));

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
  assert(mapConnectionsSource.includes("generatedDirectedMapConnections") && !mapConnectionsSource.includes("generatedMapConnections"), "Generated map connections are explicitly directed.");
  assert((mapConnectionsSource.match(/": \[/g) ?? []).length === 42, "Generated map connections include 42 playable territories.");
  assert(directedConnectionMap.udun.includes("dead-marshes") && !directedConnectionMap["dead-marshes"].includes("udun"), "Generated directed graph keeps Udun to Dead Marshes one-way.");
  assert(directedConnectionMap.andrast.includes("harlindon") && directedConnectionMap.andrast.includes("minhiriath") && directedConnectionMap.andrast.includes("enedwaith") && !directedConnectionMap.harlindon.includes("andrast") && !directedConnectionMap.minhiriath.includes("andrast") && !directedConnectionMap.enedwaith.includes("andrast"), "Generated directed graph keeps Andrast ship routes one-way.");
  assert(directedConnectionMap.edoras.includes("lamedon") && !directedConnectionMap.lamedon.includes("edoras"), "Generated directed graph includes only Edoras to Lamedon.");
  assert(directedConnectionMap.shire.includes("bree") && directedConnectionMap.bree.includes("shire"), "Generated directed graph keeps normal connections bidirectional.");
  assert(/"id": "dead-marshes__udun"[\s\S]*?"isPlayableConnection": true/.test(mapGeometrySource) && /"id": "edoras__lamedon"[\s\S]*?"isPlayableConnection": true/.test(mapGeometrySource), "One-way land edges still mark physical borders as playable ink.");
  assert(!appSource.includes("generatedMapConnections") && !gameStateSource.includes("generatedMapConnections") && !gameViewSource.includes("generatedMapConnections"), "Gameplay code does not import the old ambiguous generated connection map.");
  assert(!appSource.includes("generatedDirectedMapConnections") && !gameStateSource.includes("generatedDirectedMapConnections") && !gameViewSource.includes("generatedDirectedMapConnections"), "Gameplay code does not import the raw generated directed graph.");
  assert(mapGraphSource.includes("createCaradhrasPassState") && mapGraphSource.includes("driftCaradhrasPassState") && mapGraphSource.includes("isCaradhrasPassOpen"), "Caradhras pass state helpers are centralized.");
  assert(mapGraphSource.includes("createPathsOfTheDeadState") && mapGraphSource.includes("driftPathsOfTheDeadState") && mapGraphSource.includes("isPathsOfTheDeadOpen"), "Paths of the Dead state helpers are centralized.");
  assert(mapGraphSource.includes("export type DynamicEdgeState") && mapGraphSource.includes("outgoingTerritoryIds(territoryId: string, edgeState: DynamicEdgeState)") && mapGraphSource.includes("isCaradhrasPassConnection") && mapGraphSource.includes("isPathsOfTheDeadConnection"), "Active directed graph filtering lives in mapGraph.");
  assert(mapGraphSource.includes("directedDistanceFromAny") && mapGraphSource.includes("directedOwnedSourcesReachingTarget") && mapGraphSource.includes("pathsOfTheDeadState"), "Directed gameplay graph helpers consume dynamic edge state.");
  assert(["-2", "-1", "0", "1", "2"].every((delta) => mapGraphSource.includes(`{ delta: ${delta}, weight: 20 }`)), "Caradhras pass drift uses the current uniform 20/20/20/20/20 distribution.");
  assert(["-1", "0", "1"].every((delta) => mapGraphSource.includes(`{ delta: ${delta}, weight: ${delta === "0" ? "20" : "40"} }`)), "Paths of the Dead drift uses the current 40/20/40 distribution.");
  assert(mapGraphSource.includes("const PATHS_OF_THE_DEAD_MAX = 6") && mapGraphSource.includes("const PATHS_OF_THE_DEAD_OPEN_AT = 4"), "Paths of the Dead uses six states and opens at state four.");
  assert(gameTypesSource.includes("caradhrasPassState: number | null") && gameTypesSource.includes("pathsOfTheDeadState: number | null") && gameStateSource.includes("caradhrasPassState: null") && gameStateSource.includes("pathsOfTheDeadState: null") && gameStateSource.includes("caradhrasPassState: state.caradhrasPassState ?? createCaradhrasPassState()") && gameStateSource.includes("pathsOfTheDeadState: state.pathsOfTheDeadState ?? createPathsOfTheDeadState()") && gameStateSource.includes("pathsOfTheDeadState: driftPathsOfTheDeadState(state.pathsOfTheDeadState)"), "GameState keeps dynamic pass states null before first turn, samples them at turn start, and drifts them on turn advance.");
  assert(appSource.includes("regularTurnPhaseHasWeather") && appSource.includes("dynamicMapWeatherMarkers") && appSource.includes("pathsOfTheDeadWeatherMarkers") && appSource.includes('id: "paths-of-the-dead"'), "Dynamic pass icons render only during regular-turn game stages.");
  assert(gameTypesSource.includes('export type BattleUnitType = TroopType | "ghost"') && gameTypesSource.includes("attackingUnits: BattleUnit[]") && gameTypesSource.includes("defendingUnits: BattleUnit[]") && gameTypesSource.includes("pathsOfTheDeadSwing: number | null") && gameStateSource.includes("pathsOfTheDeadAttackSwing") && gameStateSource.includes("sourceTerritoryId !== EDORAS_ID") && gameStateSource.includes("targetTerritoryId !== LAMEDON_ID") && gameStateSource.includes("pathsState - (PATHS_OF_THE_DEAD_OPEN_AT - 1)") && gameStateSource.includes('type: "ghost"'), "Battle state stores Paths swing and battle-only ghost units that die before real attackers.");
  assert(battleModalSource.includes("challengePlayerId") && battleModalSource.includes("challengeGhostTroops") && battleModalSource.includes("GhostSoldierCount") && troopIconsSource.includes("ghostSoldierIconSrc"), "Battle modal shows challenge army rows and battle-only ghost soldiers.");
  assert(!mapConnectionsSource.includes("shipRoute") && !gameStateSource.includes("shipRoute") && !syncMessagesSource.includes("shipRoute"), "Visual ship routes are not consumed by gameplay or sync code.");
  assert(!mapDataSource.includes("NaN"), "Generated map data has no NaN values.");
  assert(!mapDataSource.includes("Infinity"), "Generated map data has no Infinity values.");
  assert((mapDataSource.match(/id: "/g) ?? []).length === 42, "Generated app data has 42 playable territories.");
  const userFacingNameSources = [
    indexSource,
    manifestSource,
    setupPanelsSource,
    mapDataSource,
    notificationTextSource,
    appArchitectureDocs,
    gameplayTurnsDocs,
    gameSpecDocs,
  ].join("\n");
  const mojibakePattern = new RegExp("[\\u00c3\\u00c2\\ufffd]");
  assert(!mojibakePattern.test(userFacingNameSources), "User-facing app title, territory data, notifications, and docs contain no mojibake.");
  assert(!/\b(Rhun|Lorien|Udun|Druwaith)\b/.test(userFacingNameSources), "User-facing names do not use stale unaccented variants.");
  assert(
    indexSource.includes("<title>Ardatúrë</title>") &&
      setupPanelsSource.includes("Ardatúrë") &&
      manifestSource.includes("Ardatúrë") &&
      mapDataSource.includes('name: "Lórien"') &&
      mapDataSource.includes('name: "Sea of Rhûn"') &&
      mapDataSource.includes('name: "Udûn"') &&
      mapDataSource.includes('name: "Drúwaith Iaur"') &&
      notificationTextSource.includes('rhun: "Rhûn"') &&
      gameplayTurnsDocs.includes("| Rhûn | 4 heavy |") &&
      gameSpecDocs.includes("| Rhûn | 4 heavy |"),
    "User-facing names preserve required special characters.",
  );
  assert(serviceWorkerSource.includes('const CACHE_NAME = "ardature-v7"'), "Service worker cache version is bumped for refreshed shell assets.");
  assert(caradhrasPassIconFiles.filter((fileName) => /^pass-\d\d\.svg$/.test(fileName)).length === 9, "Caradhras pass has nine simplified top-level SVG icons.");
  assert(caradhrasPassIconSources.every((source) => !source.includes('stroke="#ffffff"') && !source.includes('fill="none"')), "Caradhras pass icons do not render an outer circle outline.");
  assert(caradhrasPassIconSources.every((source) => !source.includes("#ffd45a")), "Caradhras pass simplified icons do not render suns.");
  assert(caradhrasPassIconSources.every((source) => !source.includes("<path") || source.includes('stroke="#202020" stroke-linejoin="round" stroke-width="3"')), "Caradhras pass cloud paths use a skinny dark outline.");
  assert(!caradhrasPassIconFiles.includes("pass-01.svg") && Array.from({ length: 9 }, (_, index) => `pass-${String(index + 2).padStart(2, "0")}.svg`).every((asset) => caradhrasPassIconFiles.includes(asset)), "Caradhras pass state 1 has no icon and states 2-10 have simplified top-level icons.");
  assert(Array.from({ length: 9 }, (_, index) => `./caradhras-pass/pass-${String(index + 2).padStart(2, "0")}.svg`).every((asset) => serviceWorkerSource.includes(asset)), "Service worker precaches every simplified Caradhras pass icon.");
  assert(serviceWorkerSource.includes("./troops/icons/ghost.png") && serviceWorkerSource.includes("./troops/icons/ghost-head.png") && troopIconFiles.includes("ghost.png") && troopIconFiles.includes("ghost-head.png"), "Service worker precaches the Paths of the Dead marker and battle ghost icons.");
  assert(territoryLookupSource.includes("territoryForId") && !appSource.includes("generatedMapData.territories.find") && !gameSectionsSource.includes("generatedMapData.territories.find") && !gameViewSource.includes("new Map<string, GeneratedTerritoryData>"), "Territory lookup uses one shared generated-data helper.");
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
  assert(gameStateSource.includes("function pauseGame") && gameStateSource.includes("function resumePausedGame") && appSource.includes("pauseGame(current") && appSource.includes("resumePausedGame(current") && !appSource.includes("pauseSyncGame") && !appSource.includes("pauseDraftTimer") && !appSource.includes("pauseAllocationTimer"), "Pause and resume game-state transitions are centralized outside App.");
  assert(!appSource.includes("syncDraftNoticeFromOwnershipChange") && !appSource.includes("PickResultDialog"), "Draft result notifications are completely removed.");
  assert(!gameTypesSource.includes("resultTerritoryId") && !gameTypesSource.includes("resultPlayerId"), "Draft state does not store stale result popup fields.");
  assert(gameViewSource.includes("type ActiveOverlay") && gameViewSource.includes('type: "confirm"') && gameViewSource.includes('type: "pause"') && gameViewSource.includes("function activeOverlayForState"), "App uses a single overlay model for game-stage popups.");
  assert(appSource.includes("const activeOverlay = activeOverlayForState") && !appSource.includes("firstActiveOverlay("), "App imports active overlay priority instead of assembling modal priority inline.");
  assert(gameViewSource.includes("type OverlayBehavior") && gameViewSource.includes("function overlayBehaviorForOverlay") && gameViewSource.includes("hidesCameraControls") && gameViewSource.includes("hidesUpperSection") && gameViewSource.includes("hidesActionSection") && !gameViewSource.includes("const hasActiveOverlay") && !gameViewSource.includes("const hideSections"), "Overlay behavior is explicit instead of derived from scattered active-overlay booleans.");
  assert(!appSource.includes("resetCameraKey") && !mapViewSource.includes("resetCameraKey"), "Map camera movement no longer uses resetCameraKey.");
  assert(mapViewSource.includes("type MapCameraIntent") && mapViewSource.includes("cameraIntent") && mapViewSource.includes("consumedCameraIntentIdRef"), "MapView consumes explicit camera intents.");
  assert(!mapViewSource.includes("selectedTerritoryId") && appSource.includes("requestHomeCameraIntent") && appSource.includes("requestTerritoryCameraIntent") && appSource.includes("pendingCameraRequest"), "MapView does not focus directly from selected territory state.");
  assert(gameViewSource.includes("type PausePanelPolicy") && gameViewSource.includes("function pausePanelPolicyForGame") && appSource.includes("const pausePanelPolicy = pausePanelPolicyForGame") && !appSource.includes('canRemove={game.mode === "local"') && !appSource.includes("game.players.every((player) => player.connectionStatus === \"connected\")"), "Pause panel permissions are projected outside App.");
  assert(appSource.includes("const [decisionPrompt, setDecisionPrompt]") && gameViewSource.includes("decisionPrompt: DecisionPrompt") && !appSource.includes("isEndGamePromptOpen") && !appSource.includes("isRestartGamePromptOpen"), "Decision overlays use one prompt state instead of separate booleans.");
  assert(appSource.includes("syncScannerMode") && gameViewSource.includes("scannerActive") && !appSource.includes("syncCameraMode") && !gameViewSource.includes("syncCameraMode"), "QR scanner overlay state is named separately from map camera controls.");
  assert(!appSource.includes("needsAllocationArmyBuild") && !appSource.includes("needsReinforcementArmyBuild") && !appSource.includes("canShowDraftConfirm") && gameViewSource.includes("const needsAllocationArmyBuild") && gameViewSource.includes("const needsReinforcementArmyBuild") && gameViewSource.includes("const canShowDraftConfirm"), "Overlay predicate policy lives in the active overlay projection helper.");
  assert(appSource.includes("function renderActiveOverlay()") && appSource.includes("const activeOverlayElement = renderActiveOverlay()"), "App renders active overlays through one switch.");
  assert(overlaysSource.includes("function ModalActions") && overlaysSource.includes("function ModalIconButton") && (overlaysSource.match(/className=\"modal-actions\"/g) ?? []).length === 1 && !appSource.includes("function ModalActions"), "Dialog action rows share one imported modal action primitive.");
  assert(appSource.includes('from "./ui/PausePanel"') && pausePanelSource.includes("function PausePanel") && !appSource.includes("function PausePanel"), "Pause overlay UI is imported instead of defined inline.");
  assert(appSource.includes('from "./ui/SyncSessionBlocker"') && syncSessionBlockerSource.includes("function SyncSessionBlocker") && !appSource.includes("function SyncSessionBlocker"), "Sync blocked overlay UI is imported instead of defined inline.");
  assert(appSource.includes('from "./ui/GameSections"') && appSource.includes("TroopSection") && gameSectionsSource.includes("function TroopSection") && gameSectionsSource.includes("function TurnActionPanel") && !appSource.includes("AllocationPanel") && !appSource.includes("ReinforcementPanel") && !appSource.includes("GameMapPanel"), "Game-stage troop UI is rendered through one imported TroopSection.");
  assert(!gameSectionsSource.includes("allocation-panel") && !gameSectionsSource.includes("reinforcement-panel") && !gameSectionsSource.includes("game-map-panel") && !gameSectionsSource.includes("allocation-controls") && !stylesSource.includes(".game-map-panel") && !stylesSource.includes(".allocation-controls"), "Troop section DOM classes use troop-section modes instead of old phase-panel names.");
  assert(appSource.includes("function renderUpperSection()") && appSource.includes("function renderActionSection()") && appSource.includes("{upperSectionElement}") && appSource.includes("{actionSectionElement}"), "App renders game-stage sections through explicit section slots.");
  assert(!troopControlsSource.includes("Select a territory"), "Allocation troop controls do not render a placeholder sliver when no territory is selected.");
  assert(gameSectionsSource.includes('className="troop-icon-button turn-spy-button"') && gameSectionsSource.includes("turn-spy-spacer") && !gameSectionsSource.includes('className="icon-button turn-spy-button"'), "Turn spy button reuses troop icon button styling and keeps a spacer when lost.");
  assert(gameSectionsSource.includes("turn-action-instruction") && stylesSource.includes(".turn-action-instruction") && appSource.includes("turnActionInstructionForGame(game, turnSelectedTerritoryId)") && gameViewSource.includes("Add troops to ${territory.name}") && gameViewSource.includes("View territory"), "Turn action bar includes a derived instruction row for each action.");
  assert(stylesSource.includes(".army-build-modal > .troop-count-row.large") && stylesSource.includes("flex-wrap: nowrap"), "Army build modal keeps the large count row on one line.");
  assert(stylesSource.includes('.turn-spy-button[data-selected="true"]') && stylesSource.includes(".turn-spy-spacer"), "Turn spy selected and missing states have dedicated styling.");
  assert(appSource.includes("syncSnapshotForViewer") && appSource.includes("hostTransportRef.current?.sendToPeer(player.id") && gameViewSource.includes("spyIntel: null") && gameViewSource.includes("reinforcement: null"), "Sync snapshots hide private turn sub-state from passive viewers.");
  assert(gameTypesSource.includes("GameNotification") && gameTypesSource.includes("notifications: Record<string, GameNotification[]>") && gameTypesSource.includes("regionControl: Record<string, string | null>"), "Game state stores authoritative per-player notification queues and region control.");
  assert(gameStateSource.includes("applyRegionControlChanges") && gameStateSource.includes('type: "regionGained"') && gameStateSource.includes('type: "regionLost"'), "Region notifications come from authoritative control transitions.");
  assert(gameStateSource.includes('type: "spyLost"') && gameStateSource.includes('type: "spyCaptured"') && appSource.includes("NotificationDialog") && !appSource.includes("GameNotificationDialog"), "Spy capture notifications use the queued blocking notification flow.");
  assert(appSource.includes('from "./game/notificationText"') && notificationTextSource.includes("function notificationMessage") && !appSource.includes("function notificationMessage"), "Notification text formatting is imported instead of defined inline.");
  assert(
    gameStateSource.includes("function addSetupPlayer") &&
      gameStateSource.includes("function reorderSetupPlayers") &&
      gameStateSource.includes("function updateSetupConfig") &&
      appSource.includes("addSetupPlayer(current") &&
      appSource.includes("updateSetupConfig(current") &&
      !appSource.includes('from "./game/setupUtils"') &&
      !appSource.includes("function firstAvailableColor") &&
      !appSource.includes("function moveItem"),
    "Setup list and config mutations live in game-state helpers instead of App.",
  );
  assert(gameTypesSource.includes('status: "available" | "captured" | "dead"') && gameTypesSource.includes("custodianPlayerId: string | null") && !gameTypesSource.includes("capturedTerritoryId: string | null"), "Spy state stores explicit status, territory, and custodian.");
  assert(gameStateSource.includes("capturedSpiesOnTerritory") && gameStateSource.includes("restoreCapturedSpies") && gameStateSource.includes("custodianPlayerId: territoryOwnerId"), "Captured spies are selected by territory and custody follows ownership changes.");
  assert(troopControlsSource.includes("type CapturedSpyToken") && troopControlsSource.includes("function CapturedSpyIcon") && !troopControlsSource.includes("function CapturedSpyRow") && troopIconsSource.includes('captured ? "-captured" : ""') && troopIconsSource.includes("ownerColor={player.color}"), "Captured spies render inline through the shared troop row.");
  assert(gameTypesSource.includes('type: "dismissNotification"') && gameTypesSource.includes("notificationId: string") && syncMessagesSource.includes('command.type === "dismissNotification"') && appSource.includes('sendTurnCommand({ type: "dismissNotification", notificationId: currentNotification.id })'), "Sync joiners dismiss queued notifications through the host by notification id.");
  assert(gameTypesSource.includes('delivery: "turnStart" | "immediate"') && gameTypesSource.includes("minTurnNumber: number") && appSource.includes("visibleNotification") && gameViewSource.includes('game.mode === "local" && game.phase === "turnHandoff"') && gameViewSource.includes("game.turn.turnNumber >= notification.minTurnNumber"), "Queued local notifications wait until after handoff.");
  assert(gameViewSource.includes("[viewerId]: game.notifications[viewerId] ?? []"), "Sync snapshots include only the viewer's notification queue.");
  assert(
    gameStateSource.includes("function startTurnReinforcements") &&
      gameStateSource.includes("function commitFortifyAndFinishTurn") &&
      gameStateSource.includes("function skipFortifyAndFinishTurn") &&
      appSource.includes("startTurnReinforcements(current") &&
      appSource.includes("commitFortifyAndFinishTurn(current") &&
      appSource.includes("skipFortifyAndFinishTurn(current") &&
      !appSource.includes("startReinforcements(cancelSpySelection(current)") &&
      !appSource.includes("finishTurnWithFortify(cancelSpySelection(current)"),
    "Turn action cleanup is composed in game-state helpers instead of App.",
  );
  assert(gameTypesSource.includes('type: "commitFortify"') && gameTypesSource.includes('type: "skipFortify"') && !gameTypesSource.includes('type: "fortify"'), "Turn commands use final fortify commit/skip messages.");
  assert(syncMessagesSource.includes('command.type === "commitFortify"') && syncMessagesSource.includes('command.type === "skipFortify"') && syncMessagesSource.includes("isFortifyMovesBySource"), "Sync validation covers final fortify commands.");
  assert(appSource.includes("type FortifySetupState") && appSource.includes("const [fortifySetup, setFortifySetup]") && !gameTypesSource.includes("FortifySetupState"), "Provisional fortify setup is local App UI state, not shared GameState.");
  assert(mapGraphSource.includes("function directedOwnedPathExists") && gameStateSource.includes("directedOwnedSourcesReachingTarget") && gameStateSource.includes("validFortifySpies"), "Fortify legality uses directed gameplay paths and validates captured-spy locations.");
  assert(!appSource.includes("spyCaptureNoticeFromTurnChange") && !appSource.includes("SpyCaptureNotice"), "Old effect-based spy capture notices are removed.");
  assert(appSource.includes("type MapSelectionState") && appSource.includes("const [mapSelections, setMapSelections]") && appSource.includes("pendingDraftTerritoryId") && appSource.includes("allocationSelectedTerritoryId") && appSource.includes("gameMapSelectedTerritoryId"), "App keeps local map selections in one explicit UI state model.");
  assert(!appSource.includes("setPendingDraftTerritoryId") && !appSource.includes("setAllocationSelectedTerritoryId") && !appSource.includes("setGameMapSelectedTerritoryId") && !appSource.includes("setTurnSelectedTerritoryId") && !appSource.includes("setPendingSpyTerritoryId"), "App does not preserve old per-selection setter wiring.");
  assert(gameViewSource.includes("function sanitizeMapSelections") && appSource.includes("sanitizeMapSelections(current") && !appSource.includes("isPausedLocalDraft"), "Local map-selection cleanup is centralized in the game-view projection helpers.");
  assert(gameViewSource.includes("function applyMapSelectionUpdates") && appSource.includes("applyMapSelectionUpdates(current, updates)") && !appSource.includes("...current, ...updates"), "Local map-selection updates merge through the shared game-view helper.");
  assert(gameViewSource.includes("function clearTurnMapSelections") && gameViewSource.includes("function clearNonDraftMapSelections") && appSource.includes("setMapSelections(clearTurnMapSelections)") && appSource.includes("setMapSelections(clearNonDraftMapSelectionState)") && appSource.includes("clearNonDraftMapSelections();"), "Local map selection reset scopes live in game-view helpers instead of App field lists.");
  assert(gameViewSource.includes("function selectedTerritoryForMap") && appSource.includes("const viewerSelectedTerritoryId = selectedTerritoryForMap") && gameViewSource.includes('game.turn?.stage === "spyIntel"'), "Map selected-territory priority is centralized in one helper.");
  assert(gameViewSource.includes("type MapPressMode") && gameViewSource.includes("function mapPressModeForGame") && gameViewSource.includes("function mapSelectionUpdateForPress") && appSource.includes("mapSelectionUpdateForPress({") && !appSource.includes("switch (mapPressMode)") && appSource.includes("onTerritoryPress={!layout.freezeMapGestures && mapPressMode ? pressTerritory : undefined}"), "Map territory presses use one explicit mode and selection-update contract.");
  assert(gameViewSource.includes("function territoryInspectionForViewer") && gameViewSource.includes("revealedTerritoryId") && gameViewSource.includes("territoryForId(revealedTerritoryId)") && appSource.includes("const gameMapInspection = territoryInspectionForViewer") && appSource.includes("const turnMapInspection = territoryInspectionForViewer") && !appSource.includes("const gameMapSelectedTerritory =") && !appSource.includes("const spyIntelTerritory ="), "Territory troop visibility, lookup, and captured-spy inspection use one projection helper.");
  assert(gameViewSource.includes("const selectedOwnerId") && gameViewSource.includes("troopPlayerId: selectedOwnerId"), "Unknown opponent troop info uses the selected territory owner's icon side.");
  assert(!appSource.includes("function selectedTerritoryForMap") && !appSource.includes("function activeOverlayForState") && !appSource.includes("function gameStageLayoutForState") && !appSource.includes("function syncSnapshotForViewer"), "App imports pure game-view projections instead of defining duplicate phase logic.");
  assert(!gameTypesSource.includes("pendingTerritoryId") && !gameStateSource.includes("pendingTerritoryId"), "Shared draft state does not store pending visual selection.");
  assert(!gameTypesSource.includes("selectedTerritoryId") && !gameStateSource.includes("selectedTerritoryId: null") && !gameStateSource.includes("allocation.selectedTerritoryId"), "Shared allocation state does not store selected visual territory.");
  assert(!syncMessagesSource.includes("draftPending"), "Sync messages do not share pending draft selections.");
  assert(!syncMessagesSource.includes('type: "allocationUpdate";\n      allocation: PlayerAllocation;') || !syncMessagesSource.includes("selectedTerritoryId"), "Allocation sync messages do not include selected territory UI state.");
  assert(gameViewSource.includes('const isGameStage = game.phase !== "home" && game.phase !== "setup"') && gameViewSource.includes("showPlayerBar: isGameStage && Boolean(playerBarPlayer)") && gameViewSource.includes("showGameStageLayout: isGameStage"), "Game-stage layout and player bar are not gated by overlay-specific draft state.");
  assert(gameViewSource.includes('export type ActionSectionMode = "turn" | null') && !gameViewSource.includes('ActionSectionMode = "none"') && gameViewSource.includes('? "turn" : null'), "Absent game-stage action sections use null instead of a string sentinel.");
  assert(gameViewSource.includes("function gameViewContextForState") && gameViewSource.includes("type SyncSessionStatus") && appSource.includes("gameViewContextForState({") && !appSource.includes("const isSyncGame =") && !appSource.includes("const syncJoinerBlocked =") && !appSource.includes("const canControlActivePlayer =") && !syncSessionBlockerSource.includes("export type SyncSessionState"), "Viewer, control, and sync-session projection lives in game-view helpers instead of App or UI components.");
  assert(gameViewSource.includes("function playerBarControlsForGame") && appSource.includes("const playerBarControls = playerBarControlsForGame") && !appSource.includes('pauseLabel={game.phase === "draft"'), "Player-bar control availability and labels are projected from game-view helpers.");
  assert(gameViewSource.includes("type TroopSectionMode") && gameViewSource.includes("type UpperGameSectionMode") && gameViewSource.includes('type: "allocation"') && gameViewSource.includes('type: "info"') && gameViewSource.includes('type: "allocationWaiting"') && gameViewSource.indexOf('type: "allocationWaiting"') > gameViewSource.indexOf("type UpperGameSectionMode") && !gameViewSource.slice(gameViewSource.indexOf("type TroopSectionMode"), gameViewSource.indexOf("type UpperGameSectionMode")).includes('type: "allocationWaiting"') && !gameViewSource.includes("type StatusSectionMode") && !appSource.includes("function renderStatusSection()") && !appSource.includes("showAllocationTroopSection"), "Troop display modes stay allocation/info while waiting content uses the shared upper section projection.");
  assert(!appSource.includes("canShowAllocationSection") && !appSource.includes("canShowReinforcementSection") && gameViewSource.includes("allocationBuildSubmitted") && gameViewSource.includes("allocationSelectedTerritoryId") && gameViewSource.includes("turnSelectedTerritoryId"), "Troop-section visibility policy lives in game-view projection, not App.");
  assert(pausePanelSource.includes("RotateCcw") && appSource.includes("restartPausedGame"), "Pause can restart to setup without closing transports.");
  assert(!appSource.includes('closeLabel="End game"'), "Pause modal does not use a close X to end the game.");
  assert(formControlsSource.includes("closeOnOutsidePress"), "Color dropdowns close on outside press.");
  assert(stylesSource.includes(".sync-entry-panel") && stylesSource.includes("padding-bottom: 112px"), "Sync entry reserves color menu space.");
  assert(cssZIndex(stylesSource, ".map-camera-control") < cssZIndex(stylesSource, ".modal-scrim"), "Map camera controls stack below modal popups.");
  assert(cssZIndex(stylesSource, ".map-camera-control") < cssZIndex(stylesSource, ".draft-sheet-scrim"), "Map camera controls stack below draft sheets.");
  assert(cssZIndex(stylesSource, ".map-camera-control") < cssZIndex(stylesSource, ".army-build-scrim"), "Map camera controls stack below army build modal.");
  assert(cssZIndex(stylesSource, ".game-layout > .player-bar") > cssZIndex(stylesSource, ".army-build-scrim") && cssZIndex(stylesSource, ".game-layout > .player-bar") > cssZIndex(stylesSource, ".notification-backdrop"), "Game-stage player bar stays above centered game overlays.");
  assert(syncMessagesSource.includes('type: "snapshot"') && syncMessagesSource.includes("revision: number"), "Sync messages use revisioned host snapshots.");
  assert(syncMessagesSource.includes('type: "hostEnded"') && appSource.includes('type: "hostEnded"'), "Sync messages include an explicit host-ended event.");
  assert(syncMessagesSource.includes('type: "removed"') && appSource.includes('type: "removed"'), "Sync messages include an explicit removed event.");
  assert(!syncMessagesSource.includes('type: "gameState"') && !appSource.includes('type: "gameState"'), "Old unversioned gameState sync messages are removed.");
  assert(!syncMessagesSource.includes('type: "hostQuit"') && !appSource.includes('type: "hostQuit"'), "Old hostQuit sync messages are removed.");
  assert(appSource.includes("SyncSessionStatus") && gameViewSource.includes("syncJoinerBlocked") && !gameTypesSource.includes("SyncSessionStatus"), "Joiners track disconnected session state outside GameState.");
  assert(gameViewSource.includes('const isSyncGame = game.mode === "sync"') && gameViewSource.includes('const isSyncHost = isSyncGame && syncRole === "host"') && gameViewSource.includes('const isSyncJoiner = isSyncGame && syncRole === "joiner"') && gameViewSource.includes('const canSendSyncCommand = !isSyncJoiner || syncSession === "connected"'), "Sync role checks use named derived session booleans in game-view projection.");
  assert(appSource.includes("type JoinerSyncCommand") && appSource.includes("function sendJoinerCommand") && appSource.includes("function sendTurnCommand") && appSource.includes("joinTransportRef.current?.send(command);"), "Joiner-originated sync commands share one send helper.");
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
  assert(syncTransportSource.includes("hostColor: PlayerColor") && syncTransportSource.includes("playerColor: PlayerColor") && syncTransportSource.includes("playerColor: player.color") && appSource.includes("color: answer.hostColor") && appSource.includes("color: joinedPlayer.color"), "Sync QR setup identity always pairs player names with colors before rendering.");
  assert(verifySource.includes("WebRtcHideLocalIpsWithMdns"), "UI verification disables mDNS-only WebRTC candidates for local headless sync handshakes.");
  assert(syncSessionBlockerSource.includes("Stop reconnecting") && syncSessionBlockerSource.includes("<Icon size={24} />"), "Joiner reconnecting UI offers a local stop option.");
  assert(gameViewSource.includes('connectionStatus === "disconnected"') && gameViewSource.includes("disconnectedSyncPlayers") && appSource.includes("createRecoveryOffer(disconnectedSyncPlayers)"), "Host recovery QR slots are filtered from host disconnected state in game-view projection.");
  assert(appSource.includes("hostTransportRef.current = new SyncHostTransport") && appSource.includes("restoredSyncHost"), "Restored sync hosts rebuild transport for recovery QR generation.");
  assert(pausePanelSource.includes('const showRecoveryTools = mode === "sync" && Boolean(onScanRecoveryAnswer)'), "Recovery QR tools render only for the sync host pause modal.");
  assert(appSource.includes("createRecoveryAnswer") && appSource.includes("onChooseRecoveryPlayer"), "Joiners choose a disconnected slot before creating a recovery answer.");
  assert(syncTransportSource.includes("color: PlayerColor;") && syncTransportSource.includes("hostColor: PlayerColor;") && syncTransportSource.includes("RECOVERY_PLAYER_COLORS.includes(slot.color as PlayerColor)"), "Recovery slots require validated player colors.");
  assert(!appSource.includes("host color is required for recovery.") && syncTransportSource.includes("RECOVERY_PLAYER_COLORS.includes(payload.hostColor as PlayerColor)") && syncTransportSource.includes("RECOVERY_PLAYER_COLORS.includes(payload.playerColor as PlayerColor)"), "Malformed QR identity colors are rejected by sync payload validation, not patched in UI.");
  assert(appArchitectureDocs.includes("Recovery slot and answer screens show the disconnected player's frozen color") && setupDraftDocs.includes("Recovery slot and recovery answer screens must show the disconnected player's frozen color"), "Recovery player color visibility is documented.");
  assert(appSource.includes("hostTransportRef.current?.sendToPeer(playerId, { type: \"removed\" })"), "Host sends removed before closing a removed peer.");
  assert(appSource.includes("useLocalPauseRecovery(game)") && localPauseRecoverySource.includes("pauseLocalGameForStorage") && localPauseRecoverySource.includes("pagehide") && localPauseRecoverySource.includes("beforeunload"), "Local refresh writes a paused active-game snapshot through the app recovery hook.");
  assert(gameStateSource.includes("applySyncProfileUpdate") && gameStateSource.includes("applySyncDraftConfirm") && gameStateSource.includes("applySyncTurnCommand") && gameStateSource.includes("applySyncPlayerQuit"), "Host command application is centralized in game helpers.");
  assert(gameStateSource.includes("SYNC_HOST_GAME_KEY") && appSource.includes("saveSyncHostGame(nextGame, localPlayerId, revision)") && appSource.includes("readSyncHostGame()"), "Sync host active games persist separately from local games.");
  assert(!gameTypesSource.includes("noticeTerritoryId") && !gameTypesSource.includes("noticePlayerId"), "Shared draft state does not store local notices.");
  assert(!gameStateSource.includes("timerMs(state.config.pickTimeLimit) ?? 0") && gameStateSource.includes("draft: beginDraftTimer(draft, state.config, now)"), "Draft timers preserve unlimited pick time after confirmed picks.");
  assert(gameStateSource.includes("expandRemovedTroops(removedTroopPool") && gameStateSource.includes('troopType === "leader" ? randomMixtureTroop() : troopType'), "Removed-player leaders are replaced by random regular troops.");
  assert(armyBuildSource.includes("ARMY_ECONOMY") && armyBuildSource.includes("costScale: 5") && armyBuildSource.includes("heavy: 4") && armyBuildSource.includes("cavalry: 5") && armyBuildSource.includes("elite: 6"), "Army economy keeps tunable fixed-point costs together.");
  assert(armyBuildSource.includes("remainingCostUnits >= minimumCost") && armyBuildSource.includes("mixtureError"), "Army builds use budget-maximal closest-ratio candidates.");
  assert(!gameStateSource.includes("weightedCost") && !gameStateSource.includes("adjustedCount"), "Old average-cost army rounding is removed.");
  assert(gameTypesSource.includes('export type AllocationStyle = "manual" | "random"') && gameTypesSource.includes("allocationStyle: AllocationStyle"), "Game config has explicit allocation style.");
  assert(gameStateSource.includes("export const ALLOCATION_STYLES") && gameStateSource.includes("config.allocationStyle === \"random\"") && gameStateSource.includes("advanceAfterDraft"), "Game state routes post-draft flow through allocation style.");
  assert(gameTypesSource.includes('export type AttackStyle = "challenge" | "regular"') && gameTypesSource.includes("attackStyle: AttackStyle"), "Game config has explicit attack style.");
  assert(gameStateSource.includes("export const ATTACK_STYLES") && setupPanelsSource.includes("Attack Style") && setupPanelsSource.includes("Challenge") && setupPanelsSource.includes("Regular"), "Setup UI exposes the attack style config section.");
  assert(gameStateSource.includes("function commitAttack") && gameStateSource.includes("function rollBattle") && gameStateSource.includes("function retreatBattle") && gameStateSource.includes("completedAttacks"), "Attack state transitions live in game-state helpers.");
  assert(gameStateSource.includes("function canSelectAttackTargetTerritory") && appSource.includes("canSelectAttackTargetTerritory(game") && !appSource.includes("completedAttacks.includes(`${attackSetup.sourceTerritoryId}->${territoryId}`)"), "Attack target selection and hints use one completed-pair helper.");
  assert(gameTypesSource.includes("BattleState") && gameTypesSource.includes('type: "commitAttack"') && gameTypesSource.includes('type: "submitBattleScore"') && gameTypesSource.includes('type: "rollBattle"'), "Turn commands include locked battle actions.");
  assert(gameTypesSource.includes("committedAttackingTroops: TroopCounts") && gameTypesSource.includes("initialDefendingTroops: TroopCounts") && gameTypesSource.includes("attackingUnits: BattleUnit[]") && gameTypesSource.includes("defendingUnits: BattleUnit[]") && gameTypesSource.includes("unitId: string") && gameTypesSource.includes("unitType: BattleUnitType"), "Battle state preserves locked original troop counts and current survivor units.");
  assert(gameTypesSource.includes('type: "dice"') && gameTypesSource.includes('type: "balrog"') && gameTypesSource.includes("balrogAwakened: true") && gameTypesSource.includes("BattleBlankDie") && gameTypesSource.includes("id: string;"), "Battle latest-roll state distinguishes normal dice rolls from Balrog blank dice with stable roll ids.");
  assert(syncMessagesSource.includes('command.type === "commitAttack"') && syncMessagesSource.includes('command.type === "rollBattle"') && syncMessagesSource.includes('command.type === "retreatBattle"'), "Sync message validation covers battle commands.");
  assert(battleModalSource.includes("function BattleModal") && battleModalSource.includes("Roll dice") && battleModalSource.includes("Retreat") && battleModalSource.includes("score.toFixed(1)") && battleModalSource.includes("/ 10") && battleModalSource.includes("defeated") && battleModalSource.includes("battle-pip"), "Battle modal renders pip dice, retreat, result text, and one-decimal scores out of ten.");
  assert(battleModalSource.includes("function BattleDiceRows") && battleModalSource.includes("latestDice ? [...latestDice].sort") && !battleModalSource.includes("BattleDieUnitIcon") && !stylesSource.includes(".battle-die-unit") && battleModalSource.includes('battle.result.type === "attackerWon"') && battleModalSource.includes('battle.result.type === "defenderWon"'), "Battle modal displays sorted dice without troop-icon badges and keeps final dice in victory layouts.");
  assert(gameStateSource.includes('const MORIA_ID = "moria"') && gameStateSource.includes("battle.targetTerritoryId === MORIA_ID") && gameStateSource.includes("(attackerDiceUnits.length + defenderDiceUnits.length) / 20") && gameStateSource.includes("function resolveBalrogRoll") && gameStateSource.includes("function resolveBalrogCasualties"), "Moria battle rolls check Balrog probability before rolling dice and resolve direct selected-unit casualties.");
  const balrogGif = gifStats(balrogGifBytes);
  assert(battleModalSource.includes("BALROG_ANIMATION_MS = 1400") && battleModalSource.includes("balrog/balrog.gif") && battleModalSource.includes("battle-balrog-background") && battleModalSource.includes("battle.latestRoll.id") && battleModalSource.includes("function BattleModalFrame") && battleModalSource.includes("completedBalrogRollKey !== balrogRollKey") && battleModalSource.includes('url.searchParams.set("roll"') && stylesSource.includes("opacity: 0.5") && stylesSource.includes("object-fit: cover") && serviceWorkerSource.includes("./balrog/balrog.gif") && serviceWorkerSource.includes("cachedRequestFor(request)"), "Balrog modal UI uses one stable roll id, a fresh per-roll image URL, and a shared frame for the immediate 50% opacity cover background.");
  assert(balrogGif.frameCount === 19 && balrogGif.totalMs === 1330 && !balrogGif.hasLoopExtension, "Balrog GIF keeps its original 1330ms timing and does not loop.");
  assert(gameTypesSource.includes("export type PendingResolution") && gameTypesSource.includes("export type HostTransferState") && gameStateSource.includes("function confirmPendingElimination") && gameStateSource.includes("function restartVictoryGameToSetup") && gameStateSource.includes("function transferHostAuthority"), "Game state has explicit pending elimination, victory restart, and host-transfer helpers.");
  assert(gameViewSource.includes('type: "elimination"') && gameViewSource.includes('type: "victory"') && overlaysSource.includes("function EliminationDialog") && overlaysSource.includes("function VictoryDialog"), "Elimination and victory render through explicit overlay types.");
  assert(!gameStateSource.includes("markDeadSpiesForEliminatedPlayers") && gameStateSource.includes("beginPostBattleResolution") && gameStateSource.includes("killPlayerSpy"), "Conquest does not silently kill eliminated spies before the elimination confirmation.");
  assert(syncMessagesSource.includes('type: "hostTransfer"') && syncMessagesSource.includes('type: "hostTransferAccepted"') && appSource.includes("acceptHostTransfer") && appSource.includes('type: "hostTransfer"') && appSource.includes('type: "hostTransferAccepted"') && appSource.includes('setSyncRole("host")'), "Sync host transfer uses an explicit acknowledged terminal transfer message and the selected joiner becomes host authority.");
  assert(appSource.includes("if (rawMessage.revision < lastSnapshotRevisionRef.current)") && appSource.includes("acceptHostTransfer(rawMessage.game, rawMessage.revision)"), "Host-transfer terminal snapshots accept the current revision instead of being rejected like duplicate ordinary snapshots.");
  assert(gameViewSource.includes("connectedSyncPlayers.length > 1") && gameViewSource.includes("hostTransferRequired || connectedSyncPlayers.length > 1") && !appSource.includes("!game.hostTransfer)"), "Host transfer is available on normal sync pause, not only forced host-transfer pause.");
  assert(combatSource.includes("COMBAT_SCORE_VALUES") && combatSource.includes("challengeScoreForTroops") && combatSource.includes("scorePercentileForTroops") && combatSource.includes("troopScoreAtPercentile") && combatSource.includes("rollCombatDie") && combatSource.includes("sampleCasualty"), "Combat math stores centralized score, percentile, per-die, and casualty helpers.");
  assert(gameStateSource.includes("function selectBattleDiceUnits") && gameStateSource.includes("function resolveBattleCasualties") && gameStateSource.includes("function applyBattleCasualtiesToAllocation") && !gameStateSource.includes("rollCombatDice"), "Battle rolls sample dice units and resolve casualties in one game-state helper.");
  assert(gameStateSource.includes("function randomCompleteAllAllocations") && gameStateSource.includes("function randomArmyMarker") && gameStateSource.includes("function bordersOpponentTerritory"), "Random allocation has dedicated army and border placement helpers.");
  assert(gameStateSource.includes("outgoingTerritoryIds(territoryId, edgeState).some") && gameStateSource.includes("ownership[connectedId] !== playerId"), "Random allocation uses active outgoing directed connections to find opponent borders.");
  assert(setupPanelsSource.includes("Territory Draft") && setupPanelsSource.includes("Troop Allocation") && setupPanelsSource.includes("Allocation style"), "Setup UI has draft and troop allocation config sections.");
  assert(!appSource.includes("SegmentedControl") && !stylesSource.includes(".segmented-control"), "Old segmented draft config UI is removed.");
  assert(!gameTypesSource.includes("allocationWaiting"), "AppPhase does not include allocationWaiting.");
  assert(gameStateSource.includes('return { ...state, phase: "allocation", allocation: nextAllocation };'), "Sync ready keeps the shared phase in allocation.");
  assert(gameStateSource.includes("const readyAllocation = markAllocationReady(allocation, playerId)") && gameStateSource.includes("allAllocationsReady(readyAllocation, state.players)"), "Sync ready preserves the allocation timer until every player is ready.");
  assert(gameStateSource.includes("function completeTimedOutDraftPick") && gameStateSource.includes("function completeTimedOutAllocation") && appSource.includes("completeTimedOutDraftPick(current") && appSource.includes("completeTimedOutAllocation(current") && !appSource.includes("completeTimedOutSyncAllocations(current)") && !appSource.includes("randomCompleteAllocationForPlayer(current"), "Timer expiry resolution lives in game-state helpers instead of App effects.");
  assert(gameStateSource.includes("currentPlayerAllocation.ready || currentPlayerAllocation.randomCompleted"), "Host ignores stale allocation updates after a player is ready or random-completed.");
  assert(appSource.includes("applySyncAllocationUpdate(current, playerId, rawMessage.allocation)"), "Host allocation updates go through the sync allocation merge contract.");
  assert(gameStateSource.includes('value === "allocationWaiting" ? "allocation"'), "Old allocationWaiting saves normalize to allocation.");
  assert(gameViewSource.includes('game.mode === "sync" && game.phase === "allocation" && localAllocationReady') && gameViewSource.includes('type: "allocationWaiting"') && !appSource.includes("layout.statusSection"), "Ready page is derived from this device's ready state inside the single section projection.");
  assert(gameSectionsSource.includes("function ReadyColumn") && gameSectionsSource.includes('title="Ready"') && gameSectionsSource.includes('title="Waiting"'), "Allocation ready page uses ready and waiting columns.");
  assert(gameViewSource.includes("function playerBarTimerRemaining") && appSource.includes("const timerRemaining = playerBarTimerRemaining(game, now, pausedReturnPhase)") && playerChromeSource.includes("timerRemaining !== null && timerRemaining !== undefined"), "A persistent player bar keeps relevant timers visible through one timer helper, including zero remaining time.");
  assert(!appSource.includes('detail="ready"') && !appSource.includes("allocating</span>"), "Allocation ready page does not show row-level ready labels.");
  assert(qrCodeUiSource.includes("data-qr-text") && qrCodeUiSource.includes("handlePaste") && (setupPanelsSource.includes("QrPanel") || pausePanelSource.includes("QrPanel")) && appSource.includes("QrScanner"), "QR UI is centralized and scanner supports paste-driven verification.");
  assert(!appSource.includes("QRCode.toString") && !appSource.includes("function QrScanner") && !appSource.includes("function QrPanel"), "App imports QR UI instead of defining scanner/rendering internals.");
  assert(!qrCodeUiSource.includes("qr-placeholder") && !pausePanelSource.includes("qr-placeholder") && !stylesSource.includes("qr-placeholder"), "QR UI never renders or styles a blank placeholder box.");
  assert(appSource.includes('from "./sync/syncErrors"') && syncErrorsSource.includes("function formatQrHandshakeError") && !appSource.includes("function formatQrHandshakeError"), "Sync QR error text formatting is imported instead of defined inline.");
  assert(gameViewSource.includes("function canAdvanceAllocationWaiting") && appSource.includes("canAdvanceAllocationWaiting(game, isSyncHost)") && appSource.includes("onAdvance={startAllocatedGame}") && !appSource.includes("game.players.every((player) => game.allocation?.playerAllocations[player.id]?.ready)"), "Allocation waiting advance eligibility is projected outside App.");
  assert(syncTransportSource.includes("ardature-sync-offer") && syncTransportSource.includes("ARO:"), "Sync transport uses Ardatúrë QR payloads.");
  assert(syncTransportSource.includes("isAnswer && fields.length === 6") && syncTransportSource.includes("isRecoveryAnswer && fields.length === 6") && syncTransportSource.includes("playerColor: playerColor as PlayerColor"), "Compact sync QR answers carry validated player colors.");
  assert(mapViewSource.includes("viewBox") && mapViewSource.includes("MapViewport"), "Map view owns the viewport camera.");
  assert(mapViewSource.includes("orientationCameraBounds") && mapViewSource.includes("orientationKeyRef") && mapViewSource.includes("cameraBoundsRef"), "Map view keeps stable orientation-derived camera bounds.");
  assert(mapViewSource.includes("constrainViewport(nextViewport, cameraBoundsRef.current)") && mapViewSource.includes("constrainViewport(targetViewport, cameraBoundsRef.current)"), "Map view constrains pan, zoom, and focus against stable camera bounds.");
  assert(mapViewSource.includes("viewportTransitionDistance"), "Map view uses combined pan and zoom focus distance.");
  assert(mapViewSource.includes("onMapPress"), "Map view supports map-background presses.");
  assert(mapViewSource.includes("setPointerCapture") && mapViewSource.includes("territoryIdFromTarget"), "Map view captures and classifies every pointer gesture.");
  assert(mapViewSource.includes("hadMultiplePointersRef") && mapViewSource.includes("onLostPointerCapture"), "Map view cleans up multi-touch and lost pointer capture state.");
  assert(mapViewSource.includes('pointer.pointerType === "touch"') && mapViewSource.includes("startPanMomentum") && mapViewSource.includes("stopPanMomentum"), "Map view applies momentum only to touch panning.");
  assert(mapViewSource.includes("PAN_MOMENTUM_DECAY_MS = 300") && mapViewSource.includes("PAN_MOMENTUM_MAX_MS = 900"), "Touch momentum uses restrained fixed tuning.");
  assert(!hitTargetSource.includes("onPointerDown") && !hitTargetSource.includes("onPointerUp") && !hitTargetSource.includes("pendingPress"), "Hit targets do not duplicate map pointer gesture state.");
  assert(mapViewSource.includes("Maximize") && mapViewSource.includes("Return to map view"), "Map view uses a corner-only return-to-map control.");
  assert(mapViewSource.includes("Crosshair") && mapViewSource.includes("Disable automatic focus") && mapViewSource.includes("Enable automatic focus"), "Map view exposes an auto-focus toggle.");
  assert(mapViewSource.includes("canShowCameraControls") && !mapViewSource.includes("showCameraControls && !isAnimating") && mapViewSource.includes("aria-disabled={isAnimating}"), "Map camera controls stay mounted during camera animations when the visible aperture has room.");
  assert(!mapViewSource.includes("ResizeObserver") && !mapViewSource.includes("flushSync") && !mapViewSource.includes("preservedResizeViewport") && !mapViewSource.includes("resizeAnchor") && !mapViewSource.includes("preserveAspectRatio={"), "Map view does not mutate camera state to correct persistent section changes.");
  assert(appSource.includes("useMapVisibleInsets") && appSource.includes("visibleInsets={visibleInsets}") && mapViewSource.includes("visibleInsets?: MapVisibleInsets") && mapViewSource.includes("viewportForApertureTarget"), "Map focus and return-to-map use a measured visible aperture.");
  assert(stylesSource.includes(".game-action-slot") && stylesSource.includes("position: fixed") && !stylesSource.includes(".game-layout .map-shell"), "Game-stage sections overlay the full-screen map instead of resizing it.");
  assert(mapPreferencesSource.includes("ardature.mapPreferences.v1") && mapPreferencesSource.includes("autoFocusEnabled: false"), "Map preferences persist auto-focus with a default-off state.");
  assert(mapTypesSource.includes('"suggested"') && territoryFillSource.includes("SUGGESTED_WHITE_MIX = 0.35"), "Territory fill supports subtle suggested highlights.");
  assert(territoryFillSource.includes("mixWithWhite") && territoryFillSource.includes("SELECTED_WHITE_MIX = 0.55"), "Selected territory fill uses a brighter blend of the current color with white.");
  assert(appSource.includes("suggestedTerritoryIdsForMap") && appSource.includes("outgoingTerritoryIds") && appSource.includes("directedOwnedSourcesReachingTarget"), "Suggested territory highlights use directed graph helpers.");
  assert(gameStateSource.includes("suggestedTerritoryId: string | string[] | null") && gameStateSource.includes('suggestedTerritoryIds.has(territoryId)') && appSource.includes("createTerritoryStates(game.players, ownership, mapSelectedTerritoryIds, mapSuggestedTerritoryIds, battleCue)"), "Territory state creation accepts selected and suggested ids.");
  assert(!territoryFillSource.includes('state.status === "selected" ? "#ffffff"'), "Selected territory fill is not hard-coded to white.");
  assert(troopMarkerSource.includes("data-troop-marker"), "Troop markers expose territory ids for visibility verification.");
  assert(appSource.includes("dynamicMapWeatherMarkers") && appSource.includes("pathsOfTheDeadWeatherMarkers") && appSource.includes("weatherMarkers={weatherMarkers}") && mapViewSource.includes("MapWeatherLayer") && mapWeatherSource.includes("data-weather-marker") && mapWeatherSource.includes("opacity={marker.opacity}"), "Map renders pointer-inert dynamic pass weather markers.");
  assert(pausePanelSource.includes("icon-button-spacer"), "Host self-removal leaves an aligned spacer instead of a trash button.");
  assert(pausePanelSource.includes('className="connection-label pause-row-status"') && pausePanelSource.includes("canRemove && player.id !== localPlayerId") && pausePanelSource.includes("pause-row-action"), "Pause rows keep local and sync action/status slots aligned.");
  assert(stylesSource.includes(".player-row.compact-row") && stylesSource.includes('grid-template-areas: "identity status action"') && stylesSource.includes("grid-template-columns: minmax(0, 1fr) 96px 38px") && stylesSource.includes(".player-row.compact-row > .pause-row-action"), "Pause rows use fixed name/status/action columns with the action slot on the far right.");
  assert(gameStateSource.includes("removeNonConnectedSyncLobbyPlayers") && gameStateSource.includes('state.phase === "setup" && connectionStatus !== "connected"') && gameStateSource.includes('player.connectionStatus === "connected"'), "Sync setup lobby removes reconnecting/disconnected players instead of preserving recovery slots.");
  assert(appSource.includes("restartPausedGameToSetup(current") && gameStateSource.includes("removeNonConnectedSyncLobbyPlayers({") && setupDraftDocs.includes("Restarting from sync pause returns to setup with only currently connected players"), "Sync restart to setup prunes non-connected players and documents that recovery is active-game only.");
  assert(appSource.includes('from "./ui/PlayerChrome"') && setupPanelsSource.includes('from "./PlayerChrome"') && playerChromeSource.includes("function PlayerIdentity") && (playerChromeSource.match(/className=\"player-dot\"/g) ?? []).length === 1 && !appSource.includes("function PlayerIdentity"), "Read-only player identity rows share one imported dot/name component.");
  assert(playerChromeSource.includes("function PlayerBar") && gameViewSource.includes("showPlayerBar") && gameSectionsSource.includes("allocation-waiting-panel") && !appSource.includes("function PlayerBar"), "Game stages use the shared persistent player bar.");
  assert(gameViewSource.includes("function playerBarPlayerForGame") && gameViewSource.includes("function playerBarDraftProgress") && appSource.includes("const playerBarPlayer = playerBarPlayerForGame") && !appSource.includes("const playerBarIsDraft ="), "Persistent player-bar identity and progress use named helpers.");
  assert(setupPanelsSource.includes('from "./FormControls"') && formControlsSource.includes("function ConfigSelectSection") && formControlsSource.includes("function SelectField") && formControlsSource.includes("function ColorSelect") && formControlsSource.includes("function PanelHeader") && !appSource.includes("function ConfigSelectSection"), "Setup form controls share imported form primitives.");
  assert(appSource.includes('from "./ui/SetupPanels"') && setupPanelsSource.includes("function HomePanel") && setupPanelsSource.includes("function SetupPanel") && setupPanelsSource.includes("function SyncEntryPanel") && !appSource.includes("function HomePanel") && !appSource.includes("function SetupPanel"), "Home, sync entry, and setup panels are imported instead of defined inline.");
  assert(localPauseRecoverySource.includes('current.phase !== "home" && current.phase !== "setup"'), "Pagehide local recovery does not overwrite storage from home or setup.");
  assert(!appSource.includes("draft-status") && !appSource.includes("allocation-summary"), "Old game-stage header markup is removed.");
  assert(troopControlsSource.includes("TroopIconCount") && troopIconsSource.includes("troopIconSrc") && troopIconsSource.includes("function TroopIconImage"), "Allocation UI uses troop image icons.");
  for (const iconName of ["crow", "crow-captured", "dwarf", "elf", "orc", "rohirrim", "smeagul", "smeagul-captured", "uruk-hai", "warg", "witch-king", "wizard"]) {
    assert(troopIconFiles.includes(`${iconName}.png`), `Committed troop icon exists: ${iconName}.png.`);
    assert(troopIconsSource.includes(`"${iconName}"`), `Troop icon preload list includes ${iconName}.`);
    assert(serviceWorkerSource.includes(`./troops/icons/${iconName}.png`), `Service worker precaches ${iconName}.png.`);
  }
  assert(appSource.includes('from "./game/troopIcons"') && appSource.includes("preloadTroopIcons();"), "App preloads troop and spy icons at startup.");
  assert(troopIconsSource.includes("function preloadTroopIcons") && troopIconsSource.includes("troopIconSources") && troopIconsSource.includes("new Image()"), "Troop icon helper owns eager image preloading.");
  assert(troopIconsSource.includes('loading="eager"') && troopIconsSource.includes('decoding="async"'), "Troop icon images are requested eagerly and decoded asynchronously.");
  assert(troopMarkerSource.includes('circle r="187"') && troopMarkerSource.includes('dy="0.08em"') && troopMarkerSource.includes('dominantBaseline="middle"') && stylesSource.includes("font-size: 184px"), "Territory troop total markers use larger circles with unchanged visually centered text.");
  assert(troopIconsSource.includes('from "./playerColors"') && formControlsSource.includes('from "../game/playerColors"') && playerColorsSource.includes("function colorCss") && playerColorsSource.includes("function colorLabel") && playerColorsSource.includes("function isLightColor"), "Player color display helpers are centralized.");
  assert(!appSource.includes("function TroopIconCount") && !appSource.includes("const TROOP_ICON_BY_SIDE") && !appSource.includes("function troopIconSrc"), "App imports troop icon primitives instead of defining duplicate troop asset mappings.");
  assert(stylesSource.includes("box-sizing: border-box") && stylesSource.includes("border: var(--icon-ring-width, 4px) solid var(--owner-color") && stylesSource.includes("background: #ffffff") && !stylesSource.includes("padding: 2px;"), "Troop icons use one border-box owner ring with a white interior and no padding gap.");
  assert(appSource.includes('from "./ui/ArmyBuildModal"') && !appSource.includes("function ArmyBuildModal") && !appSource.includes("function ArmyTriangle"), "App imports army build UI instead of defining it inline.");
  assert(armyBuildModalSource.includes("const iconRingWidth = 4") && armyBuildModalSource.includes("stroke: colorCss(player.color)") && armyBuildModalSource.includes('fill: "#ffffff"'), "Army triangle icons match the shared owner-ring geometry.");
  assert(!appSource.includes("TroopBadge") && !appSource.includes("troopLabel"), "Old letter troop badge components are removed.");
  assert(!stylesSource.includes(".troop-badge") && !stylesSource.includes(".troop-chip") && !stylesSource.includes(".army-builder"), "Old troop badge styles are removed.");
  assert(!appSource.includes("troop-step-grid") && !appSource.includes("troop-stepper"), "Old troop stepper markup is removed.");
  assert(!stylesSource.includes(".troop-step-grid") && !stylesSource.includes(".troop-stepper"), "Old troop stepper styles are removed.");
  assert(gameSectionsSource.includes('from "./TroopControls"') && troopControlsSource.includes("function TroopPlacementRows") && troopControlsSource.includes("function TroopActionRow") && troopControlsSource.includes("function visibleTroopTypes") && (troopControlsSource.match(/className=\"troop-action-row\"/g) ?? []).length === 1 && !appSource.includes("function TroopPlacementRows"), "Initial allocation and reinforcement share one filtered troop placement row component.");
  assert(troopControlsSource.includes("onAddAll") && troopControlsSource.includes("onRemoveAll") && troopControlsSource.includes('aria-label={`${actionLabel} all`}'), "Troop row plus/minus affordances are pressable bulk action buttons.");
  assert(appSource.includes("LEAVE_BEHIND_TROOP_TYPES") && appSource.includes("MOVE_FIRST_TROOP_TYPES") && appSource.includes("function movableTroopsLeavingReserve"), "Bulk moves share one leave-behind priority helper.");
  assert(!stylesSource.includes(".army-triangle text"), "Army triangle does not style text labels.");
  assert(!mapViewSource.includes("isImmediatePress") && !mapViewSource.includes("pressImmediately"), "Old immediate territory press workaround is removed.");
  assert(indexSource.includes("./app-icons/icon-192.png") && indexSource.includes("./app-icons/apple-touch-icon.png"), "Index references organized app icons.");
  assert(manifestSource.includes("app-icons/icon-192.png") && manifestSource.includes("app-icons/icon-512.png"), "Manifest references organized app icons.");
  assert(manifestSource.includes('"orientation": "portrait"'), "Mobile PWA manifest requests portrait orientation.");
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

function generatedTerritoryFocusTarget(source, territoryId) {
  const start = source.indexOf(`id: "${territoryId}",`);

  if (start < 0) {
    throw new Error(`Missing generated territory ${territoryId}.`);
  }

  const next = source.indexOf("\n    {", start + 1);
  const block = source.slice(start, next > start ? next : undefined);
  const match = block.match(/focusBounds: \{ minX: ([^,]+), minY: ([^,]+), maxX: ([^,]+), maxY: ([^ }]+) \},/);

  if (!match) {
    throw new Error(`Missing generated focus bounds for ${territoryId}.`);
  }

  const minX = Number(match[1]);
  const minY = Number(match[2]);
  const maxX = Number(match[3]);
  const maxY = Number(match[4]);

  assert([minX, minY, maxX, maxY].every(Number.isFinite), `Generated focus bounds for ${territoryId} are finite.`);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
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

async function assertViewBoxInsideCameraBounds(page, message) {
  const result = {
    bounds: await cameraBoundsForPage(page),
    viewport: parseViewBox(await viewBox(page)),
  };
  const epsilon = 0.001;
  const { bounds, viewport } = result;

  assert(viewport.x >= bounds.x - epsilon, message);
  assert(viewport.y >= bounds.y - epsilon, message);
  assert(viewport.x + viewport.width <= bounds.x + bounds.width + epsilon, message);
  assert(viewport.y + viewport.height <= bounds.y + bounds.height + epsilon, message);
}

async function cameraBoundsForPage(page) {
  return page.evaluate(() => {
    const svg = document.querySelector(".map-svg");
    const background = document.querySelector("[data-background-piece]");

    if (!(svg instanceof SVGSVGElement) || !(background instanceof SVGElement)) {
      throw new Error("Missing map SVG or background.");
    }

    const mapWidth = Number(background.getAttribute("width"));
    const mapHeight = Number(background.getAttribute("height"));
    function orientationCameraBoundsForTest(mapWidth, mapHeight) {
      const aspect = window.innerWidth / window.innerHeight;
      const mapAspect = mapWidth / mapHeight;
      const centerX = mapWidth / 2;
      const centerY = mapHeight / 2;

      if (aspect > mapAspect) {
        const width = mapHeight * aspect;
        return { x: centerX - width / 2, y: 0, width, height: mapHeight };
      }

      const height = mapWidth / aspect;
      return { x: 0, y: centerY - height / 2, width: mapWidth, height };
    }
    return orientationCameraBoundsForTest(mapWidth, mapHeight);
  });
}

function homeViewportFromSize(size) {
  return {
    x: 1500,
    y: 1500,
    width: size.width - 3000,
    height: size.height - 3000,
  };
}

async function apertureViewBoxForTarget(page, target) {
  return page.evaluate((targetViewport) => {
    const svg = document.querySelector(".map-svg");
    const background = document.querySelector("[data-background-piece]");

    if (!(svg instanceof SVGSVGElement) || !(background instanceof SVGElement)) {
      throw new Error("Missing map SVG or background.");
    }

    const svgRect = svg.getBoundingClientRect();
    const playerBar = document.querySelector(".player-bar")?.getBoundingClientRect() ?? null;
    const upperSection = document.querySelector(".game-upper-slot")?.getBoundingClientRect() ?? null;
    const actionSection = document.querySelector(".game-action-slot")?.getBoundingClientRect() ?? null;
    const top = upperSection?.bottom ?? playerBar?.bottom ?? 0;
    const bottom = actionSection ? window.innerHeight - actionSection.top : 0;
    const aperture = {
      height: svgRect.height - top - bottom,
      left: 0,
      svgHeight: svgRect.height,
      svgWidth: svgRect.width,
      top,
      width: svgRect.width,
    };
    const mapWidth = Number(background.getAttribute("width"));
    const mapHeight = Number(background.getAttribute("height"));
    function orientationCameraBoundsForTest(mapWidth, mapHeight) {
      const aspect = window.innerWidth / window.innerHeight;
      const mapAspect = mapWidth / mapHeight;
      const centerX = mapWidth / 2;
      const centerY = mapHeight / 2;

      if (aspect > mapAspect) {
        const width = mapHeight * aspect;
        return { x: centerX - width / 2, y: 0, width, height: mapHeight };
      }

      const height = mapWidth / aspect;
      return { x: 0, y: centerY - height / 2, width: mapWidth, height };
    }
    const bounds = orientationCameraBoundsForTest(mapWidth, mapHeight);
    const aspect = aperture.width / aperture.height;
    const targetAspect = targetViewport.width / targetViewport.height;
    const targetCenterX = targetViewport.x + targetViewport.width / 2;
    const targetCenterY = targetViewport.y + targetViewport.height / 2;
    const fitted = aspect > targetAspect
      ? {
        x: targetCenterX - (targetViewport.height * aspect) / 2,
        y: targetViewport.y,
        width: targetViewport.height * aspect,
        height: targetViewport.height,
      }
      : {
        x: targetViewport.x,
        y: targetCenterY - (targetViewport.width / aspect) / 2,
        width: targetViewport.width,
        height: targetViewport.width / aspect,
      };
    const scale = aperture.width / fitted.width;
    const requested = {
      x: fitted.x - aperture.left / scale,
      y: fitted.y - aperture.top / scale,
      width: aperture.svgWidth / scale,
      height: aperture.svgHeight / scale,
    };
    const minimumScale = Math.max(400 / requested.width, 400 / requested.height, 1);
    const width = Math.max(Math.min(requested.width * minimumScale, bounds.width), Math.min(400, bounds.width));
    const height = Math.max(Math.min(requested.height * minimumScale, bounds.height), Math.min(400, bounds.height));
    const centerX = requested.x + requested.width / 2;
    const centerY = requested.y + requested.height / 2;
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

    return {
      x: clamp(centerX - width / 2, bounds.x, bounds.x + bounds.width - width),
      y: clamp(centerY - height / 2, bounds.y, bounds.y + bounds.height - height),
      width,
      height,
    };
  }, target);
}

function assertViewBoxEquals(value, expected, message) {
  const viewport = parseViewBox(value);
  const epsilon = 0.001;

  assert(Math.abs(viewport.x - expected.x) <= epsilon, message);
  assert(Math.abs(viewport.y - expected.y) <= epsilon, message);
  assert(Math.abs(viewport.width - expected.width) <= epsilon, message);
  assert(Math.abs(viewport.height - expected.height) <= epsilon, message);
}

async function assertMapShellFullScreen(page, message) {
  const box = await page.locator(".map-shell").boundingBox();
  const viewport = page.viewportSize();

  assert(box && viewport, message);
  assert(Math.abs(box.x) < 1 && Math.abs(box.y) < 1, message);
  assert(Math.abs(box.width - viewport.width) < 1 && Math.abs(box.height - viewport.height) < 1, message);
}

async function assertCameraControlsInsideVisibleAperture(page, message) {
  const aperture = await page.evaluate(() => {
    const playerBar = document.querySelector(".player-bar")?.getBoundingClientRect() ?? null;
    const upperSection = document.querySelector(".game-upper-slot")?.getBoundingClientRect() ?? null;
    const actionSection = document.querySelector(".game-action-slot")?.getBoundingClientRect() ?? null;
    const mapShell = document.querySelector(".map-shell");
    const mapShellStyle = mapShell ? getComputedStyle(mapShell) : null;
    const returnButton = document.querySelector('button[aria-label="Return to map view"]');
    const returnStyle = returnButton ? getComputedStyle(returnButton) : null;

    return {
      bottom: actionSection?.top ?? window.innerHeight,
      buttonBottom: returnStyle?.bottom ?? "",
      controlBottom: mapShellStyle?.getPropertyValue("--map-camera-control-bottom").trim() ?? "",
      innerHeight: window.innerHeight,
      left: 0,
      right: window.innerWidth,
      top: upperSection?.bottom ?? playerBar?.bottom ?? 0,
    };
  });
  const returnBox = await page.getByRole("button", { name: "Return to map view" }).boundingBox();
  const focusBox = await page.locator(".map-auto-focus").boundingBox();

  assert(returnBox && focusBox, message);
  for (const box of [returnBox, focusBox]) {
    const details = `${message} Box: ${JSON.stringify(box)} Aperture: ${JSON.stringify(aperture)}`;
    assert(box.x >= aperture.left - 1, details);
    assert(box.x + box.width <= aperture.right + 1, details);
    assert(box.y >= aperture.top - 1, details);
    assert(box.y + box.height <= aperture.bottom + 1, details);
  }
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

async function assertPlayerBarFullWidth(page, selector, message) {
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

    return dot && name && action
      ? {
          actionRight: action.right,
          actionLeft: action.left,
          dotRight: dot.right,
          nameLeft: name.left,
          rowRight: row.getBoundingClientRect().right,
          statusLeft: status?.left ?? null,
          statusRight: status?.right ?? null,
        }
      : null;
  }));
  const completeRows = rows.filter(Boolean);

  assert(completeRows.length >= 2, `${message}: expected at least two complete rows.`);
  for (const row of completeRows) {
    assert(row.nameLeft >= row.dotRight + 4, `${message}: names sit immediately to the right of colors.`);
    if (row.statusRight !== null) {
      assert(row.statusRight <= row.actionLeft - 4, `${message}: statuses sit to the left of the action slot.`);
    }
    assert(row.actionRight >= row.rowRight - 8, `${message}: action slots sit on the far right.`);
  }

  const nameLefts = completeRows.map((row) => row.nameLeft);
  const statusRights = completeRows.map((row) => row.statusRight).filter((right) => right !== null);
  assert(Math.max(...nameLefts) - Math.min(...nameLefts) < 1, `${message}: names are left-aligned.`);
  if (statusRights.length > 1) {
    assert(Math.max(...statusRights) - Math.min(...statusRights) < 1, `${message}: statuses are right-aligned.`);
  }
}

async function assertBattleLayoutSymmetric(page, message) {
  const battlePlayerNames = await page.locator(".battle-player-name").evaluateAll((elements) =>
    elements.map((element) => element.textContent ?? ""));
  assert(battlePlayerNames.length === 2 && battlePlayerNames.every((name) => name.includes(" at ")), `${message}: battle player labels include territory names.`);

  const gaps = await page.locator(".battle-modal").evaluate((modal) => {
    const playerNames = Array.from(modal.querySelectorAll(".battle-player-name")).map((element) => element.getBoundingClientRect());
    const troopSlots = Array.from(modal.querySelectorAll(".battle-troops")).map((element) => element.getBoundingClientRect());
    const scores = Array.from(modal.querySelectorAll(".battle-score")).map((element) => element.getBoundingClientRect());
    const defenderDice = modal.querySelector(".battle-dice-row:first-child")?.getBoundingClientRect();
    const attackerDice = modal.querySelector(".battle-dice-row:last-child")?.getBoundingClientRect();

    if (playerNames.length !== 2 || troopSlots.length !== 2 || scores.length !== 2 || !defenderDice || !attackerDice) {
      return null;
    }

    return {
      nameToTroopsBottom: playerNames[1].top - troopSlots[1].bottom,
      nameToTroopsTop: troopSlots[0].top - playerNames[0].bottom,
      scoreToDiceBottom: scores[1].top - attackerDice.bottom,
      scoreToDiceTop: defenderDice.top - scores[0].bottom,
      troopRowHeightBottom: troopSlots[1].height,
      troopRowHeightTop: troopSlots[0].height,
      troopsToScoreBottom: troopSlots[1].top - scores[1].bottom,
      troopsToScoreTop: scores[0].top - troopSlots[0].bottom,
    };
  });

  assert(gaps, "Battle layout exposes the expected rows for spacing checks.");
  assert(Math.abs(gaps.troopRowHeightTop - gaps.troopRowHeightBottom) <= 1, `${message}: troop row heights match.`);
  assert(Math.abs(gaps.nameToTroopsTop - gaps.nameToTroopsBottom) <= 1, `${message}: player-to-troops spacing is symmetric.`);
  assert(Math.abs(gaps.troopsToScoreTop - gaps.troopsToScoreBottom) <= 1, `${message}: troops-to-score spacing is symmetric.`);
  assert(Math.abs(gaps.scoreToDiceTop - gaps.scoreToDiceBottom) <= 1, `${message}: score-to-dice spacing is symmetric.`);
}

async function assertBattleTroopRows(page, message) {
  const rows = await page.locator(".battle-troops").evaluateAll((elements) => elements.map((row) => {
    const rowBox = row.getBoundingClientRect();
    const icons = Array.from(row.querySelectorAll(".troop-icon-count, .captured-spy-icon")).map((icon) => {
      const box = icon.getBoundingClientRect();
      return {
        height: box.height,
        left: box.left,
        right: box.right,
        width: box.width,
      };
    });
    const left = icons.length > 0 ? Math.min(...icons.map((icon) => icon.left)) : rowBox.left;
    const right = icons.length > 0 ? Math.max(...icons.map((icon) => icon.right)) : rowBox.right;

    return {
      centerDelta: icons.length > 0 ? Math.abs((left + (right - left) / 2) - (rowBox.left + rowBox.width / 2)) : 0,
      count: icons.length,
      height: rowBox.height,
      icons,
    };
  }));

  assert(rows.length === 2, `${message}: battle renders two troop slots.`);
  assert(rows.every((row) => row.height >= 54), `${message}: troop slots reserve stable height.`);
  assert(rows.every((row) => row.centerDelta <= 1), `${message}: visible battle units are centered.`);
  for (const row of rows) {
    for (const icon of row.icons) {
      assert(Math.abs(icon.width - 46) <= 1 && Math.abs(icon.height - 46) <= 1, `${message}: battle unit icons keep compact size.`);
    }
  }
}

async function assertBattleResultLayout(page, { dicePosition, iconCount, message, spyCount = 0 }) {
  await page.getByRole("dialog", { name: "Battle result" }).waitFor();
  assert((await page.locator(".battle-result-message").getByText(message).count()) === 1, "Battle result layout shows the winner and loser.");
  assert((await page.locator(".battle-result-modal .battle-troops").count()) === 1, "Battle result layout shows one winning troop row.");
  assert((await page.locator(".battle-result-modal .troop-icon-count").count()) === iconCount, "Battle result layout shows only surviving winning troop icons.");
  assert((await page.locator(".battle-result-modal .captured-spy-icon").count()) === spyCount, "Battle result layout shows the expected spy icons.");
  assert((await page.locator(".battle-result-modal .battle-dice-row").count()) === 2, "Battle result layout keeps final dice.");
  const positions = await page.locator(".battle-result-modal").evaluate((modal) => {
    const diceRows = Array.from(modal.querySelectorAll(".battle-dice-row"));
    const troopRow = modal.querySelector(".battle-troops");
    const firstDice = diceRows[0]?.getBoundingClientRect();
    const lastDice = diceRows[diceRows.length - 1]?.getBoundingClientRect();
    const troops = troopRow?.getBoundingClientRect();

    return firstDice && lastDice && troops
      ? {
          diceAboveTroops: lastDice.bottom < troops.top,
          diceBelowTroops: firstDice.top > troops.bottom,
        }
      : null;
  });
  assert(positions && (dicePosition === "above" ? positions.diceAboveTroops : positions.diceBelowTroops), `Battle result final dice appear ${dicePosition} the winning army.`);
  assert((await page.locator(".battle-result-modal .battle-score").count()) === 0, "Battle result layout does not show scores.");
  assert((await page.locator(".battle-result-modal .battle-player-name").count()) === 0, "Battle result layout does not show regular player rows.");
}

async function assertArmyBuildRowOneLine(page, expectedIconCount, message) {
  const row = page.locator(".army-build-modal > .troop-count-row.large");
  const details = await row.evaluate((element) => {
    const rowBox = element.getBoundingClientRect();
    const iconBoxes = Array.from(element.querySelectorAll(".troop-icon-count")).map((icon) => icon.getBoundingClientRect());
    return {
      count: iconBoxes.length,
      flexWrap: getComputedStyle(element).flexWrap,
      height: rowBox.height,
      topSpread: iconBoxes.length > 0
        ? Math.max(...iconBoxes.map((box) => box.top)) - Math.min(...iconBoxes.map((box) => box.top))
        : 0,
    };
  });

  assert(details.count === expectedIconCount, `${message} Expected ${expectedIconCount} visible troop icons.`);
  assert(details.flexWrap === "nowrap", `${message} Large army count row does not wrap.`);
  assert(details.height <= 70 && details.topSpread <= 1, `${message} Large army count row stays on one line.`);
}

async function assertArmyBuildModalHeightStableDuringMarkerMoves(page) {
  const modal = page.locator(".army-build-modal");
  const triangleBox = await page.locator(".army-triangle").boundingBox();
  const initialBox = await modal.boundingBox();
  assert(triangleBox && initialBox, "Army build modal and triangle are visible.");

  await page.mouse.click(triangleBox.x + triangleBox.width * 0.5, triangleBox.y + triangleBox.height * 0.16);
  await page.waitForTimeout(50);
  const movedBox = await modal.boundingBox();
  await page.mouse.click(triangleBox.x + triangleBox.width * 0.5, triangleBox.y + triangleBox.height * 0.616);
  await page.waitForTimeout(50);
  const restoredBox = await modal.boundingBox();

  assert(movedBox && restoredBox && Math.abs(movedBox.height - initialBox.height) <= 1 && Math.abs(restoredBox.height - initialBox.height) <= 1, "Army build modal height stays stable while projected counts change.");
}

async function waitForBattleRollOrResult(page) {
  await page.waitForFunction(() => document.querySelector(".battle-pip.visible") || document.querySelector(".battle-result-modal"));
}

async function assertActionCancelCentered(page, label) {
  const centers = await page.locator(".turn-action-panel").evaluate((panel, buttonLabel) => {
    const button = Array.from(panel.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(String(buttonLabel)));
    const panelBox = panel.getBoundingClientRect();
    const buttonBox = button?.getBoundingClientRect();

    return buttonBox
      ? {
          buttonCenter: buttonBox.left + buttonBox.width / 2,
          panelCenter: panelBox.left + panelBox.width / 2,
        }
      : null;
  }, label);

  assert(centers, `${label} is present in the action bar.`);
  assert(Math.abs(centers.buttonCenter - centers.panelCenter) <= 1, `${label} is centered in the action bar.`);
}

async function assertActionCancelGroupCentered(page, labels) {
  const centers = await page.locator(".turn-action-panel").evaluate((panel, buttonLabels) => {
    const buttons = Array.from(panel.querySelectorAll("button"))
      .filter((candidate) => buttonLabels.some((label) => candidate.textContent?.includes(String(label))));
    const panelBox = panel.getBoundingClientRect();
    const left = Math.min(...buttons.map((button) => button.getBoundingClientRect().left));
    const right = Math.max(...buttons.map((button) => button.getBoundingClientRect().right));

    return buttons.length === buttonLabels.length
      ? {
          groupCenter: (left + right) / 2,
          panelCenter: panelBox.left + panelBox.width / 2,
        }
      : null;
  }, labels);

  assert(centers, `${labels.join(" and ")} are present in the action bar.`);
  assert(Math.abs(centers.groupCenter - centers.panelCenter) <= 1, `${labels.join(" and ")} are centered as an action group.`);
}

async function assertTroopAffordanceButtons(page, scope, message) {
  const rows = page.locator(`${scope} .troop-action-row`);
  assert((await rows.count()) === 2, `${message} Expected add and remove rows.`);

  for (let index = 0; index < 2; index += 1) {
    const row = rows.nth(index);
    if ((await row.locator(".troop-icon-button").count()) === 0) {
      continue;
    }

    assert((await row.locator(".troop-row-affordance").evaluate((node) => node.tagName.toLowerCase())) === "button", `${message} Row affordance is a button.`);
    assert((await row.locator(".troop-icon-button .troop-row-affordance").count()) === 0, `${message} Row affordance is not nested in a troop icon button.`);
  }
}

async function rowBubbleTotal(page, rowLocator) {
  const texts = await rowLocator.locator(".troop-count-bubble").allTextContents();
  return texts.map(Number).reduce((sum, count) => sum + count, 0);
}

async function troopCountFromState(page, territoryId) {
  return page.evaluate((targetId) => {
    const state = JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null");
    const ownerId = state?.draft?.ownership?.[targetId];
    const troops = state?.allocation?.playerAllocations?.[ownerId]?.territories?.[targetId] ?? {};
    return (troops.heavy ?? 0) + (troops.cavalry ?? 0) + (troops.elite ?? 0) + (troops.leader ?? 0);
  }, territoryId);
}

async function troopMarkerCount(page, territoryId) {
  const text = await page.locator(`[data-troop-marker="${territoryId}"] text`).textContent();
  return Number(text);
}

async function waitForTroopMarkerCount(page, territoryId, expectedCount) {
  await page.waitForFunction(
    ({ targetId, count }) => document.querySelector(`[data-troop-marker="${targetId}"] text`)?.textContent === String(count),
    { targetId: territoryId, count: expectedCount },
  );
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

function totalTroops(counts) {
  return (counts?.heavy ?? 0) + (counts?.cavalry ?? 0) + (counts?.elite ?? 0) + (counts?.leader ?? 0);
}

async function findAttackPair(page) {
  return page.evaluate(async () => {
    const { generatedDirectedMapConnections } = await import("/src/map/generated/mapConnections.ts");
    const state = JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null");
    const ownership = state?.draft?.ownership ?? {};
    const allocation = state?.allocation;
    const attackerId = state?.turn?.currentPlayerId;

    function troopsOnTerritory(territoryId) {
      for (const playerAllocation of Object.values(allocation?.playerAllocations ?? {})) {
        const troops = playerAllocation.territories?.[territoryId];
        if (troops) {
          return troops;
        }
      }

      return { heavy: 0, cavalry: 0, elite: 0, leader: 0 };
    }

    function total(troops) {
      return troops.heavy + troops.cavalry + troops.elite + troops.leader;
    }

    const pairs = [];
    for (const [sourceTerritoryId, ownerId] of Object.entries(ownership)) {
      if (ownerId !== attackerId || total(troopsOnTerritory(sourceTerritoryId)) < 2) {
        continue;
      }

      for (const targetTerritoryId of generatedDirectedMapConnections[sourceTerritoryId] ?? []) {
        const targetOwnerId = ownership[targetTerritoryId];
        if (targetOwnerId && targetOwnerId !== attackerId) {
          pairs.push({
            sourceTerritoryId,
            targetTerritoryId,
            sourceTotal: total(troopsOnTerritory(sourceTerritoryId)),
            targetTotal: total(troopsOnTerritory(targetTerritoryId)),
          });
        }
      }
    }

    const preferred = pairs.find((pair) => pair.sourceTotal >= 3 && pair.targetTotal >= 2) ??
      pairs.find((pair) => pair.sourceTotal >= 3) ??
      pairs[0];

    if (!preferred) {
      throw new Error("No legal attack pair found.");
    }

    return preferred;
  });
}

async function findAttackPairBySkins(page, sourceSkin, targetSkin) {
  const connections = await generatedConnections();
  const sourceIds = new Set(await page.locator(`[data-territory-fill][data-territory-skin="${sourceSkin}"]`).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-territory-fill")).filter(Boolean),
  ));
  const targetIds = new Set(await page.locator(`[data-territory-fill][data-territory-skin="${targetSkin}"]`).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-territory-fill")).filter(Boolean),
  ));

  for (const sourceTerritoryId of sourceIds) {
    for (const targetTerritoryId of connections[sourceTerritoryId] ?? []) {
      if (targetIds.has(targetTerritoryId)) {
        return { sourceTerritoryId, targetTerritoryId };
      }
    }
  }

  throw new Error(`No attack pair found from ${sourceSkin} to ${targetSkin}.`);
}

async function generatedConnections() {
  const source = await readFile(new URL("../src/map/generated/mapConnections.ts", import.meta.url), "utf8");
  const json = source
    .replace(/^export const generatedDirectedMapConnections = /, "")
    .replace(/\s+as const;\s*$/, "");

  return JSON.parse(json);
}

async function findOwnedBorderTerritory(page) {
  return page.evaluate(async () => {
    const { generatedDirectedMapConnections } = await import("/src/map/generated/mapConnections.ts");
    const state = JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null");
    const ownership = state?.draft?.ownership ?? {};
    const playerId = state?.turn?.currentPlayerId;

    for (const [territoryId, ownerId] of Object.entries(ownership)) {
      if (ownerId !== playerId) {
        continue;
      }

      const bordersOpponent = (generatedDirectedMapConnections[territoryId] ?? []).some((connectedId) => {
        const connectedOwnerId = ownership[connectedId];
        return connectedOwnerId && connectedOwnerId !== playerId;
      });

      if (bordersOpponent) {
        return territoryId;
      }
    }

    return null;
  });
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
  assert(await page.title() === "Ardatúrë", "Browser title renders Ardatúrë with real Unicode characters.");
  assert(await page.locator(".brand-row h1").textContent() === "Ardatúrë", "Home title renders Ardatúrë with real Unicode characters.");
  await capture(page, "01-home-mobile.png");
  assert((await page.getByRole("button", { name: "Open challenge test page" }).count()) === 1, "Home shows the challenge test launcher.");
  await page.getByRole("button", { name: "Open challenge test page" }).click();
  await page.locator(".challenge-test-page").waitFor();
  assert((await page.locator(".map-shell").count()) === 0, "Challenge test page is separate from the map shell.");
  assert(await page.getByText("Attempts").isVisible() && await page.getByText("Sigma").isVisible(), "Challenge test score labels are visible.");
  assert((await page.locator(".challenge-score-item strong").allTextContents()).join(",") === "0,0", "Challenge test score values start at zero.");
  await page.getByRole("button", { name: "Restart challenge" }).click();
  assert((await page.locator(".challenge-test-page").count()) === 1, "Challenge test restart is currently inert.");
  await capture(page, "01b-challenge-test-page-mobile.png");
  await page.getByRole("button", { name: "Return home" }).click();
  await page.locator(".home-panel").waitFor();
  await assertNoMapCameraControls(page, "Home overlay hides map camera controls.");

  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Aragorn");
  await setPlayerColor(page, 0, "green");
  await setPlayerName(page, 1, "Gimli");
  await setPlayerColor(page, 1, "blue");
  await setPlayerName(page, 2, "Legolas");
  await setPlayerColor(page, 2, "yellow");
  assert((await page.getByRole("heading", { name: "Territory Draft" }).count()) === 1, "Setup shows the Territory Draft section.");
  assert((await page.getByRole("heading", { name: "Troop Allocation" }).count()) === 1, "Setup shows the Troop Allocation section.");
  assert((await page.getByRole("heading", { name: "Attack Style" }).count()) === 1, "Setup shows the Attack Style section.");
  assert((await page.locator('select[aria-label="Attack style"]').inputValue()) === "regular", "Regular attack style is the setup default.");
  await page.getByLabel("Draft style").selectOption("roundRobin");
  await page.getByLabel("Pick time").selectOption("10");
  await page.getByLabel("Allocation time").selectOption("120");
  await page.getByLabel("Draft style").selectOption("random");
  assert((await page.getByLabel("Pick time").inputValue()) === "0", "Random draft forces pick time to unlimited.");
  assert(await page.getByLabel("Pick time").isDisabled(), "Random draft locks pick time after forcing unlimited.");
  await page.getByLabel("Draft style").selectOption("roundRobin");
  await page.getByLabel("Pick time").selectOption("10");
  await page.getByLabel("Allocation style").selectOption("random");
  assert((await page.getByLabel("Allocation time").inputValue()) === "0", "Random allocation forces allocation time to unlimited.");
  assert(await page.getByLabel("Allocation time").isDisabled(), "Random allocation locks allocation time after forcing unlimited.");
  await page.getByLabel("Allocation style").selectOption("manual");
  await page.getByLabel("Allocation time").selectOption("120");
  await page.getByRole("button", { name: "Randomize" }).click();
  const savedLocalNames = await playerNames(page);
  await checkColorMenuDismissal(page);
  await capture(page, "02-local-setup-mobile.png");
  await assertNoMapCameraControls(page, "Local setup/config overlay hides map camera controls.");
  await closeActiveSetup(page);

  await page.getByRole("button", { name: "Local" }).click();
  assert(JSON.stringify(await playerNames(page)) === JSON.stringify(savedLocalNames), "Local names and order persist.");
  assert((await page.getByLabel("Draft style").inputValue()) === "roundRobin", "Draft style persists.");
  assert((await page.getByLabel("Pick time").inputValue()) === "10", "Pick time persists.");
  assert((await page.getByLabel("Allocation style").inputValue()) === "manual", "Allocation style persists.");
  assert((await page.getByLabel("Allocation time").inputValue()) === "120", "Troop time persists.");
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
  assert((await page.getByLabel("Pick time").inputValue()) === "10", "Sync host uses saved pick time.");
  assert((await page.getByLabel("Allocation style").inputValue()) === "manual", "Sync host uses saved allocation style.");
  assert((await page.getByLabel("Allocation time").inputValue()) === "120", "Sync host uses saved troop time.");
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
  await assertViewBoxInsideCameraBounds(page, "Initial draft viewBox stays inside the stable camera bounds.");
  assert((await page.locator("[data-territory-fill]").count()) === 42, "Map renders 42 territory fill groups.");
  assert((await page.locator("[data-territory-hit]").count()) === 42, "Draft renders 42 hit targets.");
  const controlsBox = await page.locator(".player-bar").boundingBox();
  const mapBox = await page.locator(".map-shell").boundingBox();
  await assertMapShellFullScreen(page, "Draft map stays full-screen under the player bar.");
  assert(controlsBox && mapBox && controlsBox.y >= mapBox.y && controlsBox.y + controlsBox.height <= mapBox.y + mapBox.height, "Draft player bar overlays the full-screen map.");
  assert((await page.locator(".player-bar").count()) === 1, "Draft uses the shared player bar.");
  assert((await page.locator(".player-bar .player-dot").count()) === 0, "Player bar does not use player dots.");
  const playerBarBox = await page.locator(".player-bar").boundingBox();
  const endButtonBox = await page.locator(".player-bar").getByRole("button", { name: "End game" }).boundingBox();
  const pauseButtonBox = await page.locator(".player-bar").getByRole("button", { name: "Pause draft" }).boundingBox();
  assert(playerBarBox && endButtonBox && pauseButtonBox && endButtonBox.x < playerBarBox.x + playerBarBox.width * 0.2, "Player bar keeps X on the left.");
  assert(playerBarBox && pauseButtonBox && pauseButtonBox.x + pauseButtonBox.width > playerBarBox.x + playerBarBox.width * 0.8, "Player bar keeps pause on the right.");
  await page.getByText("0 / 21").waitFor();
  assert((await page.getByText("42 left").count()) === 0, "Draft player bar shows active-player progress instead of territories left.");
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

  for (const [territoryId, territoryName] of [
    ["lorien", "Lórien"],
    ["sea-of-rhun", "Sea of Rhûn"],
    ["udun", "Udûn"],
    ["druwaith-iaur", "Drúwaith Iaur"],
  ]) {
    await clickTerritory(page, territoryId);
    const renderedName = await page.getByRole("dialog", { name: "Confirm territory" }).locator("h2").textContent();
    assert(renderedName === territoryName, `${territoryName} renders with required special characters in draft confirmation.`);
    await page.getByRole("dialog", { name: "Confirm territory" }).getByRole("button", { name: "Cancel pick" }).click();
    await page.getByRole("dialog", { name: "Confirm territory" }).waitFor({ state: "detached" });
  }

  const beforeDefaultSelection = await viewBox(page);
  await clickTerritory(page, "shire");
  const confirmDialog = page.getByRole("dialog", { name: "Confirm territory" });
  await confirmDialog.waitFor();
  const confirmBox = await confirmDialog.boundingBox();
  const viewport = page.viewportSize();
  assert(confirmBox && viewport && confirmBox.y > viewport.height * 0.55, "Confirm sheet appears at the bottom.");
  assert(confirmBox && viewport && confirmBox.width > 280 && confirmBox.width <= viewport.width - 32, "Confirm sheet uses the wider bottom-sheet layout.");
  assert((await page.locator(".player-bar").count()) === 1, "Draft player bar stays visible during territory confirmation.");
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
  assert((await confirmDialog.count()) === 1, "Confirm sheet freezes map background taps.");
  await confirmDialog.getByRole("button", { name: "Cancel pick" }).click();
  await confirmDialog.waitFor({ state: "detached" });
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 0, "Cancel button clears the pending pick.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Return-to-map control returns after confirm cancellation.");
  assert((await page.getByRole("button", { name: "Enable automatic focus" }).count()) === 1, "Auto-focus control returns after confirm cancellation.");

  await page.getByRole("button", { name: "Enable automatic focus" }).click();
  assert((await page.getByRole("button", { name: "Disable automatic focus" }).count()) === 1, "Auto-focus can be enabled.");
  assert(await page.evaluate(() => localStorage.getItem("ardature.mapPreferences.v1")?.includes('"autoFocusEnabled":true')), "Auto-focus preference is persisted.");
  await page.reload();
  await page.waitForSelector("[data-background-piece]");
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await capture(page, "06b-local-refresh-pause-mobile.png");
  assert((await page.locator(".player-bar").count()) === 1, "Local refresh restores into pause while keeping the player bar visible.");
  await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Resume" }).click();
  await page.getByText("0 / 21").waitFor();
  assert((await page.getByRole("button", { name: "Disable automatic focus" }).count()) === 1, "Auto-focus enabled state persists after reload.");
  const beforeFocusedSelection = await viewBox(page);
  await clickTerritory(page, "shire");
  await confirmDialog.waitFor();
  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeFocusedSelection);
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "false");
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Auto-focus still selects the pending territory.");

  await confirmDialog.getByRole("button", { name: "Cancel pick" }).click();
  await confirmDialog.waitFor({ state: "detached" });
  await clickTerritory(page, "bree");
  await confirmDialog.getByRole("heading", { name: "Bree" }).waitFor();
  await page.getByRole("button", { name: "Confirm pick" }).click();
  await confirmDialog.waitFor({ state: "detached" });
  await capture(page, "07-local-draft-after-confirm-mobile.png");
  assert((await page.getByRole("status").count()) === 0, "Draft confirm does not show a result notification.");
  await page.getByText("0 / 21").waitFor();
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Return-to-map control returns immediately after draft confirmation.");
  assert((await page.getByRole("button", { name: "Disable automatic focus" }).count()) === 1, "Auto-focus control returns immediately after draft confirmation.");

  await clickTerritory(page, "shire");
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor();
  await page.getByRole("button", { name: "Confirm pick" }).click();
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor({ state: "detached" });
  await page.getByText("1 / 21").waitFor();

  await page.getByRole("button", { name: "Pause draft" }).click();
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await capture(page, "08-local-pause-mobile.png");
  assert((await page.locator(".player-bar").count()) === 1, "Pause keeps the player bar visible.");
  await assertCompactPlayerRowsAligned(page, ".pause-modal .player-row.compact-row", "Local pause player rows align names and actions");
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
  assert((await page.getByRole("dialog", { name: "Paused" }).getByText(/territories remain/i).count()) === 0, "Pause modal does not show draft territory progress.");
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByText("1 / 21").waitFor();
  await page.getByRole("button", { name: "Return to map view" }).click();
  await waitForViewBox(page, await apertureViewBoxForTarget(page, homeViewport));

  const box = await page.locator(".map-svg").boundingBox();
  assert(box, "Map SVG has a bounding box.");
  const beforeWheel = await viewBox(page);
  for (let step = 0; step < 8; step += 1) {
    await page.locator(".map-svg").dispatchEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      deltaY: 500,
    });
  }
  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeWheel);
  const zoomedOutViewport = parseViewBox(await viewBox(page));
  assert(zoomedOutViewport.width > homeViewport.width, "Manual wheel zoom can zoom out past the home viewport.");
  assertViewBoxEquals(await viewBox(page), await cameraBoundsForPage(page), "Manual wheel zoom-out reaches the stable orientation camera bounds.");
  const beforeSameOrientationResize = await viewBox(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(80);
  assert((await viewBox(page)) === beforeSameOrientationResize, "Same-orientation viewport changes do not recalculate camera bounds or move the viewBox.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(80);
  assert((await viewBox(page)) === beforeSameOrientationResize, "Restoring the same orientation keeps the stable camera bounds.");
  await page.getByRole("button", { name: "Return to map view" }).click();
  const expectedHomeAperture = await apertureViewBoxForTarget(page, homeViewport);
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
    expectedHomeAperture,
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
  const afterWheelMapBox = await page.locator(".map-shell").boundingBox();
  const afterWheelReturnBox = await page.getByRole("button", { name: "Return to map view" }).boundingBox();
  assert(afterWheelMapBox && afterWheelReturnBox, "Map and camera control boxes are measurable.");
  const sideOffset = Math.round(afterWheelReturnBox.x - afterWheelMapBox.x);
  const bottomOffset = Math.round(afterWheelMapBox.y + afterWheelMapBox.height - (afterWheelReturnBox.y + afterWheelReturnBox.height));
  assert(Math.abs(sideOffset - bottomOffset) <= 1, "Return-to-map control uses equal side and bottom spacing.");

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
  const expectedHomeAperture = await apertureViewBoxForTarget(page, homeViewport);
  await waitForViewBox(page, expectedHomeAperture);
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), expectedHomeAperture, "Return-to-map cancels touch momentum.");

  // A fast edge swipe remains constrained and settles without bouncing.
  await touchDrag(client, center, { x: center.x + 170, y: center.y, id: 9 });
  await page.waitForTimeout(950);
  await assertViewBoxInsideCameraBounds(page, "Touch momentum remains inside stable camera bounds.");
  const atMomentumRest = parseViewBox(await viewBox(page));
  await page.waitForTimeout(140);
  assertViewBoxEquals(await viewBox(page), atMomentumRest, "Touch momentum stops at the map edge.");
  await page.getByRole("button", { name: "Return to map view" }).click();
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "true");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Return-to-map control remains visible during camera animation.");
  assert((await page.getByRole("button", { name: "Enable automatic focus" }).count()) === 1, "Auto-focus control remains visible during camera animation.");
  await page.waitForFunction(() => {
    if (document.querySelector(".map-svg")?.getAttribute("data-map-animating") !== "true") {
      return false;
    }

    const button = document.querySelector('button[aria-label="Enable automatic focus"]');
    button?.click();
    return Boolean(button);
  });
  assert((await page.getByRole("button", { name: "Enable automatic focus" }).count()) === 1, "Auto-focus press is inert during camera animation.");
  await waitForViewBox(page, expectedHomeAperture);

  // Confirm sheets freeze map selection until the sheet is dismissed.
  await page.getByRole("button", { name: "Enable automatic focus" }).click();
  await clickTerritory(page, "shire");
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "true");
  await page.getByRole("dialog", { name: "Confirm territory" }).getByRole("heading", { name: "Shire" }).waitFor();
  await page.getByRole("dialog", { name: "Confirm territory" }).getByRole("button", { name: "Cancel pick" }).click();
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor({ state: "detached" });
  await clickTerritory(page, "bree");
  await page.getByRole("dialog", { name: "Confirm territory" }).getByRole("heading", { name: "Bree" }).waitFor();
  await page.waitForFunction(() => document.querySelector(".map-svg")?.getAttribute("data-map-animating") === "false");
}

async function runRandomAllocationChecks(page) {
  console.log("Checking random draft allocation");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");

  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Frodo");
  await setPlayerColor(page, 0, "yellow");
  await setPlayerName(page, 1, "Sauron");
  await setPlayerColor(page, 1, "red");
  await page.getByLabel("Draft style").selectOption("random");
  await page.getByLabel("Allocation style").selectOption("manual");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.waitForSelector('.app-shell[data-app-phase="allocationHandoff"]');
  await capture(page, "10-allocation-handoff-mobile.png");
  assert((await page.locator(".player-bar").count()) === 1, "Allocation handoff shows the next player in the player bar.");
  assert((await page.getByRole("dialog", { name: "Allocation handoff" }).getByRole("button", { name: "Begin allocation" }).count()) === 1, "Allocation handoff popup is only the continue arrow.");
  assert((await page.locator('[data-territory-fill][data-territory-skin="background"]').count()) < 42, "Random draft colors territories.");
  await page.getByRole("button", { name: "Begin allocation" }).click();
  await page.waitForSelector(".army-build-modal .army-triangle");
  await capture(page, "11-allocation-army-mobile.png");
  assert((await page.locator(".army-build-modal .troop-icon-count").count()) === 4, "Army build shows three troop classes plus leader.");
  await assertArmyBuildRowOneLine(page, 4, "Initial army build row");
  await assertArmyBuildModalHeightStableDuringMarkerMoves(page);
  assert((await page.locator(".army-triangle .army-triangle-icon").count()) === 3, "Army triangle uses three troop icons.");
  assert((await page.locator(".army-triangle text").count()) === 0, "Army triangle has no H/C/E text labels.");
  const projectedCounts = (await page.locator(".army-build-modal .troop-count-bubble").evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim()))).sort((left, right) => Number(left) - Number(right));
  assert(projectedCounts.join(",") === "1,13,13,13", "Two-player center army reserves one leader and spends 39 triangle budget.");
  await page.getByRole("button", { name: "Confirm army" }).click();
  await page.waitForSelector(".army-build-modal", { state: "detached" });
  assert((await page.locator(".troop-placement-controls").count()) === 0, "Allocation troop section is hidden before selecting a territory.");
  const ownedTerritoryId = await page.locator('[data-territory-fill][data-territory-skin="yellow"]').first().getAttribute("data-territory-fill");
  assert(ownedTerritoryId, "Random draft gives the allocating player at least one territory.");
  await clickTerritory(page, ownedTerritoryId);
  await page.waitForSelector(".allocation-target");
  await capture(page, "12-allocation-territory-mobile.png");
  assert((await page.locator(".player-bar").count()) === 1, "Allocation uses the shared player bar.");
  assert((await page.locator(".allocation-target span").count()) === 0, "Allocation target does not repeat the territory troop total.");
  assert((await page.locator(".troop-action-row").count()) === 2, "Territory allocation has add and remove rows.");
  assert((await page.locator(".troop-action-row").nth(0).locator(".troop-icon-button").count()) > 0, "Add row shows available troop icon buttons.");
  assert((await page.locator(".troop-action-row").nth(1).locator(".troop-icon-button").count()) === 0, "Empty remove row hides troop icon buttons.");
  assert((await page.locator(".troop-action-row").nth(1).locator(".troop-row-affordance").count()) === 0, "Empty remove row hides the minus affordance.");
  await assertTroopAffordanceButtons(page, ".troop-placement-controls", "Initial allocation");
  const allocationBox = await page.locator(".troop-placement-controls").boundingBox();
  const addIconsBox = await page.locator(".troop-action-icons").nth(0).boundingBox();
  const removeIconsBox = await page.locator(".troop-action-icons").nth(1).boundingBox();
  assert(allocationBox && addIconsBox && Math.abs((addIconsBox.x + addIconsBox.width / 2) - (allocationBox.x + allocationBox.width / 2)) < 2, "Add troop icons are centered independent of the plus icon.");
  assert(allocationBox && removeIconsBox && Math.abs((removeIconsBox.x + removeIconsBox.width / 2) - (allocationBox.x + allocationBox.width / 2)) < 2, "Remove troop icons are centered independent of the minus icon.");
  const allocationChildClasses = await page.locator(".troop-placement-controls").evaluate((node) => Array.from(node.children).map((child) => child.className));
  assert(String(allocationChildClasses[0]).includes("troop-action-row") && String(allocationChildClasses[1]).includes("allocation-target") && String(allocationChildClasses[2]).includes("troop-action-row"), "Allocation controls order add row, territory name, remove row.");
  await clickTerritory(page, ownedTerritoryId);
  assert((await page.locator(".troop-placement-controls").count()) === 0, "Pressing the selected allocation territory again hides the troop section.");
  await clickTerritory(page, ownedTerritoryId);
  await page.waitForSelector(".troop-placement-controls");
  await clickMapBackground(page);
  assert((await page.locator(".troop-placement-controls").count()) === 0, "Pressing the background unselects the selected allocation territory.");
  const invalidAllocationTerritoryId = await page.locator('[data-territory-fill][data-territory-skin="red"]').first().getAttribute("data-territory-fill");
  assert(invalidAllocationTerritoryId, "Random draft gives a non-allocatable territory for allocation unselection.");
  await clickTerritory(page, ownedTerritoryId);
  await page.waitForSelector(".troop-placement-controls");
  await clickTerritory(page, invalidAllocationTerritoryId);
  assert((await page.locator(".troop-placement-controls").count()) === 0, "Pressing an unselectable territory unselects the selected allocation territory.");
  await clickTerritory(page, ownedTerritoryId);
  await page.waitForSelector(".troop-placement-controls");
  await page.getByRole("button", { name: "Add all" }).click();
  assert((await page.locator(".troop-marker").count()) >= 1, "Adding a troop shows a troop marker.");
  assert(await rowBubbleTotal(page, page.locator(".troop-action-row").nth(1)) > 1, "Bulk allocation add places every currently legal troop.");
  assert((await page.locator(".troop-action-row").nth(0).getByRole("button", { name: "Add heavy" }).count()) === 1, "Bulk allocation add reserves heavy first when troops must be left behind.");
  assert((await page.locator(".troop-action-row").nth(0).getByRole("button", { name: "Add leader" }).count()) === 0, "Bulk allocation add moves the leader before leaving heavy reserve troops behind.");
  await page.getByRole("button", { name: "Remove all" }).click();
  assert(await rowBubbleTotal(page, page.locator(".troop-action-row").nth(1)) === 0, "Bulk allocation remove clears removable troops.");
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
  await page.waitForSelector(".army-build-modal", { state: "detached" });
  await finishAllocationTurn(page, "red");
  await page.waitForSelector('.app-shell[data-app-phase="turnHandoff"]');
  await capture(page, "13-turn-handoff-mobile.png");
  assert((await page.locator(".player-bar").count()) === 1, "Turn handoff shows the next player in the player bar.");
  assert((await page.getByRole("dialog", { name: "Turn handoff" }).getByRole("button", { name: "Begin turn" }).count()) === 1, "Turn handoff popup is only the continue arrow.");
  await page.getByRole("button", { name: "Begin turn" }).click();
  await dismissQueuedNotifications(page);
  await page.waitForSelector(".turn-action-panel");
  await capture(page, "14-turn-ready-mobile.png");
  const turnMapBox = await page.locator(".map-shell").boundingBox();
  const turnActionBox = await page.locator(".turn-action-panel").boundingBox();
  await assertMapShellFullScreen(page, "Turn map stays full-screen under the action section.");
  assert(turnMapBox && turnActionBox && turnActionBox.y < turnMapBox.y + turnMapBox.height, "Turn action bar overlays the full-screen map.");
  await assertCameraControlsInsideVisibleAperture(page, "Turn camera controls stay inside the visible map aperture.");
  assert((await page.getByRole("button", { name: "Spy" }).count()) === 1, "Turn controls include the spy button.");
  await assertNoBrokenTroopIconImages(page, "Turn spy button image is loaded.");
  assert((await page.getByRole("button", { name: "Reinforcements" }).count()) === 1, "Turn starts at reinforcements.");
  assert((await page.locator(".turn-action-instruction").getByText("Choose an action").count()) === 1, "Turn action bar starts with an instruction row.");
  const opponentTerritoryId = await page.locator('[data-territory-fill][data-territory-skin="red"]').first().getAttribute("data-territory-fill");
  assert(opponentTerritoryId, "Random draft gives the opponent at least one territory.");
  const ownedInspectTerritoryId = await page.locator('[data-territory-fill][data-territory-skin="yellow"]').first().getAttribute("data-territory-fill");
  assert(ownedInspectTerritoryId, "Current player owns a territory for default inspection.");
  await clickTerritory(page, ownedInspectTerritoryId);
  await page.waitForSelector(".troop-section-info");
  assert((await page.locator(`[data-territory-fill="${ownedInspectTerritoryId}"][data-territory-fill-state="selected"]`).count()) === 1, "Explore selection uses the bright selected highlight.");
  assert((await page.locator('[data-territory-fill-state="suggested"]').count()) > 0, "Explore selection subtly highlights outgoing directed connections.");
  const exploreSuggestedFill = await page.locator('[data-territory-fill-state="suggested"] [data-territory-fill-piece]').first().getAttribute("fill");
  assert(exploreSuggestedFill && exploreSuggestedFill.toLowerCase() !== "#ffffff", "Suggested explore highlight is not pure white.");
  await clickMapBackground(page);
  assert((await page.locator(".troop-section-info").count()) === 0, "Pressing the background clears the selected explore territory.");
  await clickTerritory(page, ownedInspectTerritoryId);
  await page.waitForSelector(".troop-section-info");
  await page.getByRole("button", { name: "Spy" }).click();
  assert((await page.locator(".troop-section-info").count()) === 0, "Starting spy clears the default inspected territory.");
  assert((await page.locator('[data-territory-fill-state="suggested"]').count()) === 0, "Starting spy clears explore suggested highlights.");
  assert((await page.locator(".turn-action-instruction").getByText("Select a territory to spy on").count()) === 1, "Spy targeting changes the action instruction.");
  assert((await page.getByRole("button", { name: "Cancel Spy" }).count()) === 1, "Spy targeting replaces action buttons with one cancel button.");
  await assertActionCancelCentered(page, "Cancel Spy");
  assert((await page.locator(".turn-action-buttons.action-cancel-row").count()) === 1, "Spy targeting uses the centered cancel action row.");
  await clickTerritory(page, opponentTerritoryId);
  await page.getByRole("dialog", { name: "Confirm spy" }).waitFor();
  await capture(page, "15-spy-confirm-mobile.png");
  assert((await page.locator(".player-bar").count()) === 1, "Player bar remains visible during spy confirmation.");
  assert((await page.locator(".turn-action-panel").count()) === 0, "Turn action bar hides during spy confirmation.");
  assert((await page.getByRole("dialog", { name: "Confirm spy" }).getByText("% captured").count()) === 1, "Spy confirmation shows capture probability.");
  await page.getByRole("button", { name: "Cancel spy" }).click();
  assert((await page.locator(".troop-section-info").count()) === 0, "Canceling spy returns to the default turn view with no inspected territory.");
  await page.getByRole("button", { name: "Reinforcements" }).click();
  await page.waitForSelector(".army-build-modal .army-triangle");
  await capture(page, "16-reinforcement-army-mobile.png");
  const reinforcementBuildIconCount = await page.locator(".army-build-modal .troop-icon-count").count();
  assert(reinforcementBuildIconCount > 0 && reinforcementBuildIconCount <= 3, "Reinforcement army build shows only nonzero regular troop icons.");
  assert((await page.locator(".army-build-modal .troop-count-bubble").evaluateAll((nodes) => nodes.some((node) => (node.textContent ?? "").trim() === "0"))) === false, "Reinforcement army build hides zero-count icons.");
  await page.getByRole("button", { name: "Confirm army" }).click();
  await page.waitForSelector(".army-build-modal", { state: "detached" });
  assert((await page.locator(".troop-section-reinforcement").count()) === 0, "Reinforcement troop section is hidden before selecting a territory.");
  assert((await page.locator(".turn-action-instruction").getByText("Select a territory").count()) === 1, "Reinforcement placement asks for a territory before selection.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Map camera controls are available before reinforcement territory selection.");
  await assertMapShellFullScreen(page, "Map shell is full-screen before selecting reinforcement territory.");
  await assertCameraControlsInsideVisibleAperture(page, "Reinforcement camera controls start inside the visible map aperture.");
  const beforeShrinkViewBox = await viewBox(page);
  const reinforcementTerritoryId = await findOwnedBorderTerritory(page);
  assert(reinforcementTerritoryId, "Current player still owns a territory for reinforcements.");
  await clickTerritory(page, reinforcementTerritoryId);
  await page.waitForSelector(".troop-section-reinforcement .allocation-target");
  await assertMapShellFullScreen(page, "Map shell stays full-screen when troop section appears.");
  await assertCameraControlsInsideVisibleAperture(page, "Reinforcement camera controls stay inside the visible aperture when troop section appears.");
  const afterShrinkViewBox = await viewBox(page);
  assert(afterShrinkViewBox === beforeShrinkViewBox, "Showing the troop section does not change the current map viewBox.");
  await page.waitForTimeout(40);
  assert((await viewBox(page)) === afterShrinkViewBox, "Showing the troop section does not apply a delayed camera correction.");
  const reinforcementTerritoryName = (await page.locator(".troop-section-reinforcement .allocation-target").textContent())?.trim();
  assert(reinforcementTerritoryName, "Selected reinforcement territory shows its name.");
  assert((await page.locator(".turn-action-instruction").getByText(`Add troops to ${reinforcementTerritoryName}`).count()) === 1, "Reinforcement placement instruction names the selected territory.");
  await capture(page, "17-reinforcement-placement-mobile.png");
  assert((await page.locator(".troop-section-reinforcement .troop-action-row").count()) === 2, "Reinforcement placement has add and remove rows.");
  await assertTroopAffordanceButtons(page, ".troop-section-reinforcement", "Reinforcement placement");
  assert((await page.locator(".troop-section-reinforcement .troop-action-row").nth(0).locator(".troop-icon-button").count()) > 0, "Reinforcement add row shows nonzero available troop icons.");
  assert((await page.locator(".troop-section-reinforcement .troop-action-row").nth(0).getByRole("button", { name: "Add leader" }).count()) === 0, "Reinforcement add row omits the zero leader slot.");
  const reinforcementBottomCounts = (await page.locator(".troop-section-reinforcement .troop-action-row").nth(1).locator(".troop-count-bubble").allTextContents()).map(Number);
  assert(reinforcementBottomCounts.reduce((sum, count) => sum + count, 0) > 0, "Reinforcement remove row shows existing territory troops.");
  assert((await page.locator(".troop-section-reinforcement .troop-action-row").nth(1).locator(".troop-icon-button:not(:disabled)").count()) === 0, "Existing troops shown during reinforcement cannot be removed.");
  await clickTerritory(page, opponentTerritoryId);
  assert((await page.locator(".troop-section-reinforcement").count()) === 0, "Pressing an unselectable territory unselects the selected reinforcement territory.");
  await clickTerritory(page, reinforcementTerritoryId);
  await page.waitForSelector(".troop-section-reinforcement .allocation-target");
  await clickMapBackground(page);
  assert((await page.locator(".troop-section-reinforcement").count()) === 0, "Pressing the background unselects the selected reinforcement territory.");
  await clickTerritory(page, reinforcementTerritoryId);
  await page.waitForSelector(".troop-section-reinforcement .allocation-target");
  const existingReinforcementTotal = await rowBubbleTotal(page, page.locator(".troop-section-reinforcement .troop-action-row").nth(1));
  await page.locator(".troop-section-reinforcement .troop-action-row").nth(0).getByRole("button", { name: "Add all" }).click();
  assert(await rowBubbleTotal(page, page.locator(".troop-section-reinforcement .troop-action-row").nth(1)) > existingReinforcementTotal, "Bulk reinforcement add places all remaining reinforcement troops on the selected territory.");
  await page.locator(".troop-section-reinforcement .troop-action-row").nth(1).getByRole("button", { name: "Remove all" }).click();
  assert(await rowBubbleTotal(page, page.locator(".troop-section-reinforcement .troop-action-row").nth(1)) === existingReinforcementTotal, "Bulk reinforcement remove leaves locked pre-existing territory troops.");
  const beforeExpandViewBox = await viewBox(page);
  await clickTerritory(page, reinforcementTerritoryId);
  assert((await page.locator(".troop-section-reinforcement").count()) === 0, "Pressing the selected reinforcement territory again hides the troop section.");
  await assertMapShellFullScreen(page, "Map shell stays full-screen when troop section hides.");
  const afterExpandViewBox = await viewBox(page);
  assert(afterExpandViewBox === beforeExpandViewBox, "Hiding the troop section does not change the current map viewBox.");
  await page.waitForTimeout(40);
  assert((await viewBox(page)) === afterExpandViewBox, "Hiding the troop section does not apply a delayed camera correction.");
  await page.getByRole("button", { name: "Enable automatic focus" }).click();
  const beforeFocusedReinforcement = await viewBox(page);
  await clickTerritory(page, reinforcementTerritoryId);
  await page.waitForSelector(".troop-section-reinforcement .allocation-target");
  const expectedReinforcementFocus = await apertureViewBoxForTarget(page, generatedTerritoryFocusTarget(mapDataSource, reinforcementTerritoryId));
  await waitForViewBox(page, expectedReinforcementFocus);
  assert((await viewBox(page)) !== beforeFocusedReinforcement, "Auto-focus creates an explicit camera move after reinforcement selection.");
  await finishReinforcementPlacement(page);
  await page.waitForSelector(".turn-action-panel");
  assert((await page.locator(".troop-section-info").count()) === 0, "Finishing reinforcements returns to the default turn view with no inspected territory.");
  await capture(page, "18-turn-actions-mobile.png");
  assert(!(await page.getByRole("button", { name: "Attack" }).isDisabled()), "Attack is enabled after reinforcements.");
  await page.getByRole("button", { name: "Attack" }).click();
  assert((await page.locator(".turn-action-instruction").getByText("Select a territory to attack from").count()) === 1, "Attack setup first asks for an attacking territory.");
  assert((await page.getByRole("button", { name: "Cancel Attack" }).count()) === 1, "Attack setup replaces action buttons with one cancel button.");
  await assertActionCancelCentered(page, "Cancel Attack");
  const attackPair = await findAttackPair(page);
  await clickTerritory(page, attackPair.sourceTerritoryId);
  assert((await page.locator(".turn-action-instruction").getByText("Select a territory to attack").count()) === 1, "Attack setup asks for a target after source selection.");
  assert((await page.locator(`[data-territory-fill="${attackPair.sourceTerritoryId}"][data-territory-fill-state="selected"]`).count()) === 1, "Attack source uses the bright selected highlight.");
  assert((await page.locator(`[data-territory-fill="${attackPair.targetTerritoryId}"][data-territory-fill-state="suggested"]`).count()) === 1, "Attack source selection subtly highlights valid directed targets.");
  await clickTerritory(page, attackPair.targetTerritoryId);
  await page.waitForSelector(".troop-section-attack .allocation-target");
  assert((await page.locator(`[data-territory-fill="${attackPair.targetTerritoryId}"][data-territory-fill-state="selected"]`).count()) === 1, "Attack target becomes a bright selected highlight after selection.");
  assert((await page.locator('[data-territory-fill-state="suggested"]').count()) === 0, "Attack target suggestions clear once a target is selected.");
  assert((await page.locator(".turn-action-instruction").getByText("Choose attacking troops").count()) === 1, "Attack setup asks for committed troops after source and target selection.");
  assert((await page.locator(".troop-section-attack .allocation-target").textContent())?.includes(" to "), "Attack troop section names the source and target.");
  await assertTroopAffordanceButtons(page, ".troop-section-attack", "Attack setup");
  const sourceTotalBeforeBulkAttack = await troopCountFromState(page, attackPair.sourceTerritoryId);
  await page.locator(".troop-section-attack .troop-action-row").nth(0).getByRole("button", { name: "Add all" }).click();
  assert(await rowBubbleTotal(page, page.locator(".troop-section-attack .troop-action-row").nth(1)) === sourceTotalBeforeBulkAttack - 1, "Bulk attack commits every troop except the required leave-behind troop.");
  await page.getByRole("button", { name: "Confirm attack" }).click();
  await page.getByRole("dialog", { name: "Battle" }).waitFor();
  await capture(page, "18b-battle-modal-mobile.png");
  await assertBattleLayoutSymmetric(page, "Main battle modal layout");
  assert((await page.locator(".turn-action-panel").count()) === 0, "Turn action bar hides during a locked battle.");
  assert((await page.locator(".troop-section-attack").count()) === 0, "Attack troop section hides during a locked battle.");
  assert((await page.getByRole("button", { name: "Roll dice" }).count()) === 1, "Battle modal exposes dice as the roll control.");
  assert((await page.locator(".battle-score").first().textContent())?.includes("/ 10"), "Battle modal scores are shown out of ten.");
  assert((await page.locator(".battle-die-defender").count()) > 0 && (await page.locator(".battle-die-attacker").count()) > 0, "Battle modal shows defender and attacker dice.");
  assert((await page.locator(".battle-pip.visible").count()) === 0, "Battle dice are blank before the first roll.");
  await page.getByRole("button", { name: "Roll dice" }).click();
  await waitForBattleRollOrResult(page);
  if ((await page.locator(".battle-result-modal").count()) > 0) {
    await page.getByRole("button", { name: "Dismiss battle" }).click();
  } else if ((await page.getByRole("button", { name: "Retreat" }).isEnabled().catch(() => false))) {
    await page.getByRole("button", { name: "Retreat" }).click();
    await page.getByRole("dialog", { name: "Retreat from this attack?" }).getByRole("button", { name: "Retreat" }).click();
  } else {
    await page.getByRole("button", { name: "Dismiss battle" }).click();
  }
  await page.waitForSelector(".turn-action-panel");
  assert((await page.locator(".troop-section-info").count()) === 0, "Dismissing battle returns to default turn view with no inspected territory.");
  await page.getByRole("button", { name: "Fortify" }).click();
  assert((await page.getByRole("button", { name: "Cancel Fortify" }).count()) === 1, "Fortify setup replaces action buttons with cancel.");
  assert((await page.getByRole("button", { name: "Skip" }).count()) === 1, "Fortify setup can skip directly to the next turn.");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForSelector('.app-shell[data-app-phase="turnHandoff"]');
  await waitForViewBox(page, await apertureViewBoxForTarget(page, homeViewportFromSize(await mapSize(page))));
  await capture(page, "19-next-turn-handoff-mobile.png");
}

async function runConfiguredRandomAllocationChecks(page) {
  console.log("Checking configured random troop allocation");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Faramir");
  await setPlayerColor(page, 0, "blue");
  await setPlayerName(page, 1, "Gothmog");
  await setPlayerColor(page, 1, "black");
  await page.getByLabel("Draft style").selectOption("random");
  await page.getByLabel("Allocation style").selectOption("random");
  assert((await page.getByLabel("Allocation time").inputValue()) === "0", "Random allocation displays unlimited allocation time.");
  assert(await page.getByLabel("Allocation time").isDisabled(), "Random allocation locks allocation timing.");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.waitForSelector('.app-shell[data-app-phase="turnHandoff"]');
  await capture(page, "20-random-allocation-turn-handoff-mobile.png");
  assert((await page.locator(".army-build-modal").count()) === 0, "Random allocation skips army build UI.");
  assert((await page.locator(".troop-placement-controls").count()) === 0, "Random allocation skips manual allocation controls.");

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null"));
  assert(state?.config?.allocationStyle === "random", "Saved game records random allocation style.");
  assert(state?.allocation, "Random allocation creates authoritative allocation state.");

  for (const player of state.players) {
    const allocation = state.allocation.playerAllocations[player.id];
    assert(allocation?.buildSubmitted, "Random allocation submits every army build.");
    assert(allocation?.ready && allocation?.randomCompleted, "Random allocation marks every player ready and random-completed.");

    const ownedTerritories = Object.entries(state.draft.ownership)
      .filter(([, ownerId]) => ownerId === player.id)
      .map(([territoryId]) => territoryId);
    for (const territoryId of ownedTerritories) {
      assert(totalTroops(allocation.territories[territoryId]) > 0, `Random allocation placed a troop on ${territoryId}.`);
    }
  }
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
  await assertKnownTroopRow(page, "Read-only map shows own nonzero territory breakdown.");
  await clickTerritory(page, "shire");
  assert((await page.locator(".troop-section-info").count()) === 0, "Pressing the selected read-only territory again hides the troop section.");
  await clickTerritory(page, "bree");
  assert((await page.locator(".troop-section-info .selected-territory-name").getByText("Bree").count()) === 1, "Read-only map shows connected opponent territory name.");
  await assertUnknownTroopRow(page, "Read-only map shows connected opponent troop icons as unknown.", "orc");
  await clickTerritory(page, "nurn");
  assert((await page.locator(".troop-section-info .selected-territory-name").getByText("Nurn").count()) === 1, "Read-only map shows distant opponent territory name.");
  await assertUnknownTroopRow(page, "Read-only map shows distant opponent troop icons as unknown.", "orc");
  await clickTerritory(page, "nurn");
  assert((await page.locator(".troop-section-info").count()) === 0, "Pressing the selected opponent territory again hides the troop section.");
  await page.getByRole("button", { name: "Change viewer" }).click();
  assert((await page.locator('[data-troop-marker="nurn"]').count()) === 1, "Cycling local viewer shows that player's own distant territory total.");
  await clickTerritory(page, "nurn");
  await assertKnownTroopRow(page, "Cycling local viewer reveals that player's own nonzero distant breakdown.");
}

async function runDynamicPassChecks(page) {
  console.log("Checking dynamic pass edges");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const preTurnState = readOnlyVisibilityGameState(territoryIds);
  preTurnState.caradhrasPassState = 5;
  preTurnState.pathsOfTheDeadState = 5;
  await loadLocalGameFixture(page, preTurnState, '.app-shell[data-app-phase="gameMap"]');
  assert((await page.locator('[data-weather-marker="caradhras-pass"]').count()) === 0, "Caradhras pass icon is hidden before regular turns even if old state exists.");
  assert((await page.locator('[data-weather-marker="paths-of-the-dead"]').count()) === 0, "Paths of the Dead icon is hidden before regular turns even if old state exists.");

  const openState = turnSpyGameState(territoryIds);
  openState.caradhrasPassState = 5;
  openState.pathsOfTheDeadState = 4;
  await loadLocalGameFixture(page, openState, '.app-shell[data-app-phase="turn"]');
  await page.locator('[data-weather-marker="caradhras-pass"]').waitFor({ timeout: 15000 });
  await page.locator('[data-weather-marker="paths-of-the-dead"]').waitFor({ timeout: 15000 });
  await clickTerritory(page, "rivendell");
  assert((await page.locator('[data-weather-marker="caradhras-pass"]').getAttribute("href"))?.includes("pass-05.svg"), "Open Caradhras pass state renders the matching icon.");
  assert((await page.locator('[data-territory-fill="caradhras"][data-territory-fill-state="suggested"]').count()) === 1, "Open Caradhras pass keeps Rivendell to Caradhras as an active explore connection.");
  assert((await page.locator('[data-weather-marker="paths-of-the-dead"]').getAttribute("href"))?.includes("ghost-head.png"), "Open Paths of the Dead state renders the ghost icon.");
  const pathsStateFourOpacity = Number(await page.locator('[data-weather-marker="paths-of-the-dead"]').getAttribute("opacity"));
  assert(Math.abs(pathsStateFourOpacity - 1 / 3) < 0.01, "Paths of the Dead state 4 renders at one-third opacity.");
  await clickTerritory(page, "edoras");
  assert((await page.locator('[data-territory-fill="lamedon"][data-territory-fill-state="suggested"]').count()) === 1, "Open Paths of the Dead keeps Edoras to Lamedon as an active explore connection.");
  await capture(page, "13ba-caradhras-pass-open-mobile.png");

  const graphProbe = await page.evaluate(async () => {
    const graph = await import("/src/game/mapGraph.ts");
    const blockedCaradhras = { caradhrasPassState: 6, pathsOfTheDeadState: 4 };
    const openCaradhras = { caradhrasPassState: 5, pathsOfTheDeadState: 4 };
    const nullCaradhras = { caradhrasPassState: null, pathsOfTheDeadState: 4 };
    const closedPaths = { caradhrasPassState: 5, pathsOfTheDeadState: 2 };
    const openPaths = { caradhrasPassState: 5, pathsOfTheDeadState: 4 };
    const nullPaths = { caradhrasPassState: 5, pathsOfTheDeadState: null };

    return {
      blockedDistance: graph.directedDistanceFromAny(["rivendell"], "caradhras", blockedCaradhras),
      blockedForward: graph.hasDirectedConnection("rivendell", "caradhras", blockedCaradhras),
      blockedReverse: graph.hasDirectedConnection("caradhras", "rivendell", blockedCaradhras),
      driftFromTenHigh: graph.driftCaradhrasPassState(10, () => 0.999),
      driftFromTenLow: graph.driftCaradhrasPassState(10, () => 0),
      driftFromTenThirty: graph.driftCaradhrasPassState(10, () => 0.3),
      nullForward: graph.hasDirectedConnection("rivendell", "caradhras", nullCaradhras),
      openDistance: graph.directedDistanceFromAny(["rivendell"], "caradhras", openCaradhras),
      openForward: graph.hasDirectedConnection("rivendell", "caradhras", openCaradhras),
      openReverse: graph.hasDirectedConnection("caradhras", "rivendell", openCaradhras),
      pathsClosedForward: graph.hasDirectedConnection("edoras", "lamedon", closedPaths),
      pathsDriftFromSixHigh: graph.driftPathsOfTheDeadState(6, () => 0.999),
      pathsDriftFromSixLow: graph.driftPathsOfTheDeadState(6, () => 0),
      pathsInitialHigh: graph.createPathsOfTheDeadState(() => 0.999),
      pathsInitialLow: graph.createPathsOfTheDeadState(() => 0),
      pathsNullForward: graph.hasDirectedConnection("edoras", "lamedon", nullPaths),
      pathsOpenDistance: graph.directedDistanceFromAny(["edoras"], "lamedon", openPaths),
      pathsOpenForward: graph.hasDirectedConnection("edoras", "lamedon", openPaths),
      pathsOpenReverse: graph.hasDirectedConnection("lamedon", "edoras", openPaths),
    };
  });
  assert(graphProbe.nullForward, "Null Caradhras pass state uses the base generated graph.");
  assert(graphProbe.openForward && graphProbe.openReverse && graphProbe.openDistance === 1, "Open Caradhras pass keeps both generated directed edges active.");
  assert(!graphProbe.blockedForward && !graphProbe.blockedReverse && graphProbe.blockedDistance !== 1, "Blocked Caradhras pass removes both direct edges from active graph traversal.");
  assert(graphProbe.driftFromTenLow === 8 && graphProbe.driftFromTenThirty === 8 && graphProbe.driftFromTenHigh === 10, "Caradhras pass drift discards and normalizes out-of-range moves before sampling.");
  assert(graphProbe.pathsInitialLow === 1 && graphProbe.pathsInitialHigh === 6, "Paths of the Dead initial state samples uniformly across 1-6.");
  assert(!graphProbe.pathsNullForward && !graphProbe.pathsClosedForward, "Null and low Paths of the Dead states keep Edoras to Lamedon closed.");
  assert(graphProbe.pathsOpenForward && !graphProbe.pathsOpenReverse && graphProbe.pathsOpenDistance === 1, "Open Paths of the Dead activates only Edoras to Lamedon.");
  assert(graphProbe.pathsDriftFromSixLow === 5 && graphProbe.pathsDriftFromSixHigh === 6, "Paths of the Dead drift discards and normalizes out-of-range moves before sampling.");

  await loadLocalGameFixture(page, { ...openState, caradhrasPassState: 6 }, '.app-shell[data-app-phase="turn"]');
  await page.locator('[data-weather-marker="caradhras-pass"]').waitFor({ timeout: 15000 });
  await clickTerritory(page, "rivendell");
  assert((await page.locator('[data-weather-marker="caradhras-pass"]').getAttribute("href"))?.includes("pass-06.svg"), "Blocked Caradhras pass state renders the matching icon.");
  assert((await page.locator('[data-territory-fill="caradhras"][data-territory-fill-state="suggested"]').count()) === 0, "Blocked Caradhras pass removes Rivendell to Caradhras from explore connections.");
  await capture(page, "13bb-caradhras-pass-blocked-mobile.png");

  await loadLocalGameFixture(page, { ...openState, pathsOfTheDeadState: 3 }, '.app-shell[data-app-phase="turn"]');
  await clickTerritory(page, "edoras");
  assert((await page.locator('[data-weather-marker="paths-of-the-dead"]').count()) === 0, "Paths of the Dead state 3 renders no icon.");
  assert((await page.locator('[data-territory-fill="lamedon"][data-territory-fill-state="suggested"]').count()) === 0, "Closed Paths of the Dead removes Edoras to Lamedon from explore connections.");
  await capture(page, "13bc-paths-of-the-dead-closed-mobile.png");

  await loadLocalGameFixture(page, { ...openState, pathsOfTheDeadState: 6 }, '.app-shell[data-app-phase="turn"]');
  await page.locator('[data-weather-marker="paths-of-the-dead"]').waitFor({ timeout: 15000 });
  assert((await page.locator('[data-weather-marker="paths-of-the-dead"]').getAttribute("opacity")) === "1", "Paths of the Dead state 6 renders at full opacity.");
  await capture(page, "13bd-paths-of-the-dead-open-full-mobile.png");
}

async function loadLocalGameFixture(page, state, selector) {
  if (!fixtureInitPages.has(page)) {
    await page.addInitScript(({ prefix }) => {
      if (window.name.startsWith(prefix)) {
        localStorage.clear();
        localStorage.setItem("ardature.localGame.v1", window.name.slice(prefix.length));
      }
    }, { prefix: fixtureWindowNamePrefix });
    fixtureInitPages.add(page);
  }

  await page.evaluate(({ fixture, prefix }) => {
    window.name = `${prefix}${JSON.stringify(fixture)}`;
  }, { fixture: state, prefix: fixtureWindowNamePrefix }).catch(() => undefined);
  await page.goto(baseUrl);
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.evaluate(({ prefix }) => {
    if (window.name.startsWith(prefix)) {
      window.name = "";
    }
  }, { prefix: fixtureWindowNamePrefix });
}

async function assertUnknownTroopRow(page, message, expectedHeavyIcon = null) {
  const bubbles = await page.locator(".troop-section-info .troop-count-bubble").evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? "").trim()),
  );

  assert(bubbles.length === 4 && bubbles.every((text) => text === "?"), message);
  assert((await page.locator('.troop-section-info .troop-icon-count[data-muted="true"]').count()) === 4, `${message} Unknown troop icons are muted.`);
  assert((await page.locator(".troop-section-info .captured-spy-icon").count()) === 0, `${message} Unknown rows never show captured spies.`);
  if (expectedHeavyIcon) {
    const heavyIconSrc = await page.locator(".troop-section-info .troop-icon-count").first().locator("img").getAttribute("src");
    assert(heavyIconSrc?.includes(`/troops/icons/${expectedHeavyIcon}.png`), `${message} Unknown troop icons use the territory owner's side.`);
  }
}

async function assertKnownTroopRow(page, message) {
  const bubbles = await page.locator(".troop-section-info .troop-count-bubble").evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? "").trim()),
  );

  assert(bubbles.length > 0 && bubbles.every((text) => text !== "?" && Number(text) > 0), message);
  assert((await page.locator('.troop-section-info .troop-icon-count[data-muted="true"]').count()) === 0, `${message} Known nonzero troop icons are not muted.`);
}

async function assertNoBrokenTroopIconImages(page, message) {
  const images = page.locator(".troop-icon-frame img");

  await images.first().waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".troop-icon-frame img")).every((image) => image instanceof HTMLImageElement && image.complete),
  );

  const brokenSources = await images.evaluateAll((nodes) =>
    nodes
      .filter((node) => node instanceof HTMLImageElement && node.naturalWidth === 0)
      .map((node) => node.getAttribute("src") ?? ""),
  );

  assert(brokenSources.length === 0, `${message} Broken sources: ${brokenSources.join(", ")}`);
}

async function dismissQueuedNotifications(page) {
  while ((await page.getByRole("alertdialog", { name: "Game notification" }).count()) > 0) {
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  }
}

async function runTurnSpyOutcomeChecks(browser) {
  console.log("Checking spy outcomes");
  const success = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const failure = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  success.setDefaultTimeout(10000);
  failure.setDefaultTimeout(10000);

  await loadTurnSpyFixture(success, 0.99);
  assert((await success.locator('[data-troop-marker="rivendell"]').count()) === 0, "Spy fixture starts with non-adjacent same-owner total hidden.");
  assert((await success.locator(".turn-action-instruction").getByText("Choose an action").count()) === 1, "Turn spy fixture starts with the default action instruction.");
  await success.getByRole("button", { name: "Spy" }).click();
  assert((await success.locator(".turn-action-instruction").getByText("Select a territory to spy on").count()) === 1, "Spy targeting updates the action instruction.");
  assert((await success.getByRole("button", { name: "Cancel Spy" }).count()) === 1, "Spy targeting shows a cancel button.");
  await success.getByRole("button", { name: "Cancel Spy" }).click();
  assert((await success.locator(".turn-action-instruction").getByText("Choose an action").count()) === 1, "Toggling spy off restores the default action instruction.");
  await clickTerritory(success, "shire");
  assert((await success.locator(".troop-section-info .selected-territory-name").getByText("Shire").count()) === 1, "Toggling spy off returns territory taps to normal inspection.");
  await assertKnownTroopRow(success, "Normal inspection shows own nonzero troop breakdown after spy is toggled off.");
  await clickTerritory(success, "shire");
  assert((await success.locator(".troop-section-info").count()) === 0, "Pressing the selected turn-inspection territory again hides the troop section.");
  await success.getByRole("button", { name: "Spy" }).click();
  await clickTerritory(success, "bree");
  await success.getByRole("dialog", { name: "Confirm spy" }).getByText("20% captured").waitFor();
  await success.getByRole("button", { name: "Send spy" }).click();
  await success.getByRole("button", { name: "Dismiss" }).waitFor();
  await capture(success, "13c-spy-success-mobile.png");
  assert((await success.locator(".turn-action-instruction").getByText("View territory").count()) === 1, "Successful spy intel uses the view-territory instruction.");
  assert((await success.locator(".troop-section-info .selected-territory-name").getByText("Bree").count()) === 1, "Successful spy shows the target territory name.");
  assert((await success.locator('[data-territory-fill="bree"][data-territory-fill-state="suggested"]').count()) === 1, "Successful spy subtly highlights the spied territory.");
  assert((await success.locator('[data-territory-fill="rivendell"][data-territory-fill-state="suggested"]').count()) === 1, "Successful spy subtly highlights same-owner outgoing directed connections.");
  assert((await success.locator(".troop-section-info .troop-icon-count").count()) === 1, "Successful spy shows only nonzero target troop types.");
  assert((await success.locator(".troop-section-info .captured-spy-icon").count()) === 1, "Successful spy shows captured spies imprisoned on the target.");
  await assertNoBrokenTroopIconImages(success, "Successful spy troop and captured-spy icons are loaded.");
  const capturedSpySource = await success.locator(".troop-section-info .captured-spy-icon img").first().getAttribute("src");
  assert(capturedSpySource?.includes("-captured.png"), "Captured spy icon uses the captured spy asset.");
  const spyIconSources = await success.locator(".troop-section-info .troop-icon-count img").evaluateAll((images) =>
    images.map((image) => image.getAttribute("src") ?? ""),
  );
  assert(spyIconSources.length === 1 && spyIconSources[0].includes("orc"), "Successful spy uses the target owner's visible nonzero troop icons.");
  assert((await success.locator('[data-troop-marker="rivendell"]').count()) === 1, "Successful spy reveals same-opponent adjacent troop totals.");
  await success.getByRole("button", { name: "Dismiss" }).click();
  assert(!(await success.getByRole("button", { name: "Spy" }).isDisabled()), "Spy remains available after a successful spy is dismissed.");

  await loadTurnSpyFixture(failure, 0);
  await failure.getByRole("button", { name: "Spy" }).click();
  await clickTerritory(failure, "bree");
  await failure.getByRole("button", { name: "Send spy" }).click();
  await failure.getByRole("alertdialog", { name: "Game notification" }).waitFor();
  await failure.getByText("Your spy was captured in Bree").waitFor();
  await capture(failure, "13d-spy-failure-mobile.png");
  await failure.waitForTimeout(1200);
  assert((await failure.getByText("Your spy was captured in Bree").count()) === 1, "Spy capture notification waits for explicit dismissal.");
  await failure.getByRole("button", { name: "Dismiss notification" }).click();
  const capturedSpyState = await failure.evaluate(() => JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null").turn.spies.viewer);
  assert(capturedSpyState.status === "captured" && capturedSpyState.territoryId === "bree" && capturedSpyState.custodianPlayerId === "opponent", "Failed spy stores captured territory and custodian.");
  assert((await failure.getByRole("button", { name: "Spy" }).count()) === 0, "Lost spy button is removed after capture.");
  assert((await failure.locator(".turn-spy-spacer").count()) === 1, "Lost spy leaves spacing intact.");

  await success.close();
  await failure.close();
}

async function runTurnAttackChecks(browser) {
  console.log("Checking turn attacks");
  const regular = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const challenge = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  regular.setDefaultTimeout(10000);
  challenge.setDefaultTimeout(10000);

  await loadTurnAttackFixture(regular, { attackStyle: "regular", randomValue: 0.5 });
  await capture(regular, "18c-attack-actions-fixture-mobile.png");
  await commitFixtureAttack(regular);
  await regular.getByRole("dialog", { name: "Battle" }).waitFor();
  await capture(regular, "18d-regular-battle-before-roll-mobile.png");
  await assertBattleLayoutSymmetric(regular, "Regular battle modal layout");
  await assertBattleTroopRows(regular, "Regular battle modal troop rows");
  assert((await regular.locator(".battle-troops").nth(0).locator(".troop-icon-count").count()) === 1, "Battle defender row omits zero-count troop types.");
  assert((await regular.locator(".battle-troops").nth(0).locator(".captured-spy-icon").count()) === 1, "Battle defender row shows captured spies inline.");
  assert((await regular.locator(".battle-troops").nth(1).locator(".troop-icon-count").count()) < 4, "Battle attacker row omits zero-count troop types.");
  assert(((await regular.locator(".battle-message").textContent()) ?? "").trim() === "", "Battle message row is reserved when empty.");
  assert((await regular.locator(".battle-score").first().textContent())?.includes("/ 10"), "Regular battle shows scores out of ten.");
  assert((await regular.locator(".battle-pip.visible").count()) === 0, "Regular battle dice are blank before rolling.");
  await regular.getByRole("button", { name: "Roll dice" }).click();
  await waitForBattleRollOrResult(regular);
  await capture(regular, "18e-regular-battle-after-roll-mobile.png");
  if ((await regular.locator(".battle-result-modal").count()) > 0) {
    await regular.getByRole("button", { name: "Dismiss battle" }).click();
  } else {
    await regular.getByRole("button", { name: "Retreat" }).click();
    await regular.getByRole("dialog", { name: "Retreat from this attack?" }).getByRole("button", { name: "Retreat" }).click();
  }
  await regular.waitForSelector(".battle-modal", { state: "detached" });
  assert((await regular.locator(".turn-action-panel").count()) === 1, "Closing the battle modal returns to turn actions.");

  await loadTurnAttackFixture(challenge, { attackStyle: "challenge", randomValue: 0.5 });
  await commitFixtureAttack(challenge);
  await challenge.getByRole("dialog", { name: "Battle challenge" }).waitFor();
  await capture(challenge, "18f-challenge-battle-button-mobile.png");
  assert((await challenge.getByRole("dialog", { name: "Battle challenge" }).getByRole("button", { name: "Challenge" }).count()) === 1, "Challenge battle shows one challenge button.");
  assert((await challenge.locator(".battle-challenge-modal .battle-troops").count()) === 1, "Challenge modal shows the challenged player's battle army row.");
  assert((await challenge.locator(".battle-challenge-modal .battle-score, .battle-challenge-modal .battle-player-name").count()) === 0, "Challenge modal is not embedded in the regular mirrored battle layout.");
  assert((await challenge.locator(".battle-dice-button").count()) === 0, "Challenge modal does not show dice before score submission.");
  assert((await challenge.getByRole("button", { name: "Retreat" }).count()) === 0, "Challenge modal does not show retreat before score submission.");
  await challenge.getByRole("button", { name: "Challenge" }).click();
  await challenge.getByRole("dialog", { name: "Battle" }).waitFor();
  await capture(challenge, "18g-challenge-battle-after-score-mobile.png");
  await assertBattleLayoutSymmetric(challenge, "Challenge battle modal layout after score");
  await assertBattleTroopRows(challenge, "Challenge battle modal troop rows after score");
  assert((await challenge.locator(".battle-dice-button").count()) === 1, "Submitted challenge score switches to the dice battle layout.");

  const pathsGhostBattle = await createPathsBattleState(challenge, {
    attackStyle: "challenge",
    committedTroops: { heavy: 3, cavalry: 0, elite: 0, leader: 0 },
    randomValues: [0.999],
  });
  assert(pathsGhostBattle.turn.battle.pathsOfTheDeadSwing === 3, "Paths of the Dead can add the maximum ghost soldiers before battle.");
  assert(battleFixtureUnitCount(pathsGhostBattle.turn.battle.attackingUnits, "ghost") === 3, "Positive Paths swing stores battle-only ghost units.");
  assert(pathsGhostBattle.turn.battle.attackingUnits.every((unit) => unit.score === null), "Paths ghosts do not replace the attacker's challenge score.");
  await loadLocalGameFixture(challenge, pathsGhostBattle, ".battle-challenge-modal");
  await capture(challenge, "18ga-paths-ghost-challenge-mobile.png");
  assert((await challenge.locator('.battle-challenge-modal [aria-label="Ghost soldiers: 3"]').count()) === 1, "Challenge modal shows Paths ghost soldiers in the attacker army.");
  assert(((await challenge.locator('.battle-challenge-modal [aria-label="Ghost soldiers: 3"] img').getAttribute("src")) ?? "").includes("/troops/icons/ghost.png"), "Battle ghost soldiers use the ghost soldier icon.");
  await challenge.getByRole("button", { name: "Challenge" }).click();
  await challenge.getByRole("dialog", { name: "Battle" }).waitFor();
  await capture(challenge, "18gb-paths-ghost-battle-mobile.png");
  assert((await challenge.locator('.battle-modal [aria-label="Ghost soldiers: 3"]').count()) === 1, "Battle modal keeps Paths ghost soldiers after challenge submission.");

  const pathsInstantLossBattle = await createPathsBattleState(challenge, {
    attackStyle: "challenge",
    committedTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    randomValues: [0, 0],
  });
  assert(pathsInstantLossBattle.turn.battle.result?.type === "defenderWon", "Negative Paths swing can kill all committed attackers and skip the challenge.");
  assert(pathsInstantLossBattle.turn.battle.attackingUnits.length === 0, "Instant Paths defender win stores no surviving attacker units.");
  await loadLocalGameFixture(challenge, pathsInstantLossBattle, ".battle-result-modal");
  await capture(challenge, "18gc-paths-instant-defender-win-mobile.png");
  await assertBattleResultLayout(challenge, { dicePosition: "below", iconCount: 1, message: "Sauron defeated Frodo", spyCount: 0 });

  const ghostFirstRollBattle = await rollBattleState(challenge, {
    attackerScore: 0,
    attackingGhostTroops: 2,
    attackingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    defenderScore: 10,
    defendingTroops: { heavy: 2, cavalry: 0, elite: 0, leader: 0 },
  }, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert(battleFixtureUnitCount(ghostFirstRollBattle.turn.battle.attackingUnits, "ghost") === 0, "Battle casualties remove ghost soldiers before real attacking troops.");
  assert(battleFixtureUnitCount(ghostFirstRollBattle.turn.battle.attackingUnits, "heavy") === 1, "Ghost-first casualties leave real attackers untouched until ghosts are gone.");

  const moriaNormalRollBattle = await rollBattleState(challenge, {
    targetTerritoryId: "moria",
  }, [0, 0, 0.99, 0.99, 0.99]);
  assert(moriaNormalRollBattle.turn.battle.latestRoll?.type === "dice", "Moria rolls proceed normally when the Balrog does not awaken.");

  const nonMoriaRollBattle = await rollBattleState(challenge, {
    targetTerritoryId: "bree",
  }, [0, 0, 0, 0, 0]);
  assert(nonMoriaRollBattle.turn.battle.latestRoll?.type === "dice", "Non-Moria battles never use the Balrog roll branch.");

  const moriaBalrogContinueBattle = await rollBattleState(challenge, {
    attackingTroops: { heavy: 4, cavalry: 0, elite: 0, leader: 0 },
    committedAttackingTroops: { heavy: 4, cavalry: 0, elite: 0, leader: 0 },
    defendingTroops: { heavy: 3, cavalry: 0, elite: 0, leader: 0 },
    initialDefendingTroops: { heavy: 3, cavalry: 0, elite: 0, leader: 0 },
    targetTerritoryId: "moria",
  }, [0, 0, 0, 0, 0, 0]);
  assert(moriaBalrogContinueBattle.turn.battle.latestRoll?.type === "balrog", "Moria can store a Balrog latest roll with blank dice.");
  assert(moriaBalrogContinueBattle.turn.battle.hasRolled && moriaBalrogContinueBattle.turn.battle.result === null, "Balrog rolls count as rolls and can leave the battle active.");
  assert(moriaBalrogContinueBattle.turn.battle.attackingUnits.length === 1 && moriaBalrogContinueBattle.turn.battle.defendingUnits.length === 1, "Balrog casualties kill selected dice units directly while leaving non-dice units.");

  const moriaLeaderKilledBattle = await rollBattleState(challenge, {
    attackingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 1 },
    committedAttackingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 1 },
    defendingTroops: { heavy: 3, cavalry: 0, elite: 0, leader: 0 },
    initialDefendingTroops: { heavy: 3, cavalry: 0, elite: 0, leader: 0 },
    targetTerritoryId: "moria",
  }, [0, 0, 0, 0, 0]);
  assert(moriaLeaderKilledBattle.turn.battle.latestRoll?.attackerLosses.some((loss) => loss.unitType === "leader"), "Balrog casualties can kill selected leaders.");
  assert(moriaLeaderKilledBattle.turn.battle.result?.type === "defenderWon", "Balrog defender win resolves when all attackers are taken.");

  const moriaSingleSurvivorBattle = await rollBattleState(challenge, {
    attackingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    committedAttackingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    defendingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 1 },
    initialDefendingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 1 },
    targetTerritoryId: "moria",
  }, [0, 0, 0, 0]);
  assert(moriaSingleSurvivorBattle.turn.battle.result?.type === "defenderWon" && moriaSingleSurvivorBattle.turn.battle.attackingUnits.length === 0 && moriaSingleSurvivorBattle.turn.battle.defendingUnits.length === 1, "Balrog both-sides-wiped path keeps one random defender and resolves Moria as defended.");

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    defenderScore: null,
    result: null,
  });
  assert((await challenge.locator(".battle-message").getByText("Waiting...").count()) === 1, "Battle message row shows waiting text while a score is missing.");

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    attackingTroops: { heavy: 2, cavalry: 0, elite: 0, leader: 0 },
    defenderScore: 6.2,
    defendingTroops: { heavy: 3, cavalry: 0, elite: 0, leader: 0 },
    hasRolled: true,
    latestRoll: {
      attackerDice: [4, 6, 5],
      attackerLosses: ["cavalry"],
      defenderDice: [2, 3],
      defenderLosses: [],
    },
    result: null,
  });
  assert((await challenge.locator(".battle-dice-row").nth(1).locator(".battle-die").count()) === 3, "Latest attacker roll keeps every die that was rolled even after casualties.");
  assert((await challenge.locator(".battle-dice-row").nth(0).locator(".battle-die").count()) === 2, "Latest defender roll keeps every die that was rolled.");
  const displayedRoll = await challenge.locator(".battle-dice-row").evaluateAll((rows) => rows.map((row) =>
    Array.from(row.querySelectorAll(".battle-die")).map((die) => die.querySelectorAll(".battle-pip.visible").length),
  ));
  assert(JSON.stringify(displayedRoll[0]) === JSON.stringify([3, 2]) && JSON.stringify(displayedRoll[1]) === JSON.stringify([6, 5, 4]), "Latest roll dice display sorted largest to smallest.");
  assert((await challenge.locator(".battle-die-unit").count()) === 0, "Latest roll dice do not show troop icon badges.");

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    attackingTroops: { heavy: 2, cavalry: 0, elite: 0, leader: 0 },
    defenderScore: 6.2,
    defendingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    latestRoll: null,
    result: null,
  });
  assert((await challenge.locator(".battle-dice-row").nth(1).locator(".battle-die").count()) === 2, "Blank next-roll attacker dice use the reduced surviving troop count.");
  assert((await challenge.locator(".battle-dice-row").nth(0).locator(".battle-die").count()) === 1, "Blank next-roll defender dice use the reduced surviving troop count.");

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    attackingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    defenderScore: 6.2,
    defendingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    hasRolled: true,
    latestRoll: {
      attackerDice: [{ score: 7.3, unitId: "attacker-leader-0", unitType: "leader" }],
      attackerLosses: ["leader"],
      defenderDice: [{ score: 6.2, unitId: "defender-heavy-0", unitType: "heavy" }],
      defenderLosses: ["heavy"],
      type: "balrog",
    },
    result: null,
    targetTerritoryId: "moria",
  });
  await challenge.locator(".battle-balrog-background img").waitFor();
  await capture(challenge, "18ka-moria-balrog-gif-mobile.png");
  const balrogBackground = await challenge.locator(".battle-balrog-background img").evaluate((image) => {
    const modal = image.closest(".battle-modal")?.getBoundingClientRect();
    const box = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return {
      coversModal: Boolean(modal && box.width >= modal.width && box.height >= modal.height),
      objectFit: style.objectFit,
      opacity: style.opacity,
    };
  });
  assert(balrogBackground.coversModal && balrogBackground.objectFit === "cover" && balrogBackground.opacity === "0.5", "Balrog GIF covers the full modal background at 50% opacity.");
  assert((await challenge.locator('.battle-die[data-balrog="true"]').count()) === 2, "Balrog dice appear immediately while the GIF plays.");
  assert((await challenge.locator(".battle-pip.visible").count()) === 0, "Balrog dice have no pips during the GIF.");
  assert((await challenge.locator(".battle-die-unit").count()) === 0, "Balrog dice do not show troop icon badges.");
  assert(await challenge.getByRole("button", { name: "Roll dice" }).isDisabled(), "Balrog animation disables the dice button.");
  assert(await challenge.getByRole("button", { name: "Retreat" }).isDisabled(), "Balrog animation disables retreat.");
  await challenge.waitForTimeout(1500);
  await capture(challenge, "18kb-moria-balrog-blank-dice-mobile.png");
  assert((await challenge.locator(".battle-balrog-background").count()) === 0, "Balrog GIF disappears after one fixed-duration play.");
  assert((await challenge.locator('.battle-die[data-balrog="true"]').count()) === 2, "Balrog dice remain as black blank dice after the GIF.");
  assert((await challenge.locator(".battle-pip.visible").count()) === 0, "Balrog blank dice have no pips.");
  assert((await challenge.locator(".battle-die-unit").count()) === 0, "Balrog blank dice still have no troop icon badges.");
  assert(!(await challenge.getByRole("button", { name: "Retreat" }).isDisabled()), "A continuing Balrog event enables retreat because it counts as a roll.");

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    attackingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
    defenderScore: 6.2,
    defendingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    hasRolled: true,
    latestRoll: {
      attackerDice: [{ score: 7.3, unitId: "attacker-leader-0", unitType: "leader" }],
      attackerLosses: ["leader"],
      defenderDice: [{ score: 6.2, unitId: "defender-heavy-0", unitType: "heavy" }],
      defenderLosses: [],
      type: "balrog",
    },
    result: { type: "defenderWon" },
    targetTerritoryId: "moria",
  });
  await challenge.locator(".battle-result-modal .battle-balrog-background img").waitFor();
  await capture(challenge, "18kc-moria-balrog-result-gif-mobile.png");
  assert((await challenge.locator('.battle-result-modal .battle-die[data-balrog="true"]').count()) === 2, "Balrog result modal shows black blank dice while the GIF plays.");
  assert(await challenge.getByRole("button", { name: "Dismiss battle" }).isDisabled(), "Balrog result dismissal waits for the GIF to complete.");
  await challenge.waitForTimeout(1500);
  assert((await challenge.locator(".battle-result-modal .battle-balrog-background").count()) === 0, "Balrog result GIF disappears after one fixed-duration play.");
  assert(!(await challenge.getByRole("button", { name: "Dismiss battle" }).isDisabled()), "Balrog result dismissal unlocks after the GIF completes.");

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    attackingGhostTroops: 2,
    attackingTroops: { heavy: 1, cavalry: 1, elite: 0, leader: 0 },
    defenderScore: 6.2,
    defendingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
    latestRoll: {
      attackerDice: [6, 5],
      attackerLosses: [],
      defenderDice: [4],
      defenderLosses: ["heavy"],
    },
    releasedAttackerSpy: true,
    result: { type: "attackerWon" },
  });
  await capture(challenge, "18h-attacker-battle-result-mobile.png");
  await assertBattleResultLayout(challenge, { dicePosition: "above", iconCount: 3, message: "Frodo defeated Sauron", spyCount: 2 });
  assert((await challenge.locator('.battle-result-modal [aria-label="Ghost soldiers: 2"]').count()) === 1, "Attacker victory result shows surviving Paths ghosts until dismissal.");
  const attackerResultSpySources = await challenge.locator(".battle-result-modal .captured-spy-icon img").evaluateAll((images) =>
    images.map((image) => image.getAttribute("src") ?? ""),
  );
  assert(attackerResultSpySources.some((source) => source.includes("smeagul.png")) && attackerResultSpySources.some((source) => source.includes("-captured.png")), "Attacker victory shows the released own spy unbarred and other spies still captured.");
  await challenge.getByRole("button", { name: "Dismiss battle" }).click();
  await challenge.waitForSelector(".battle-modal", { state: "detached" });

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    attackingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
    defenderScore: 6.2,
    defendingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    latestRoll: {
      attackerDice: [2],
      attackerLosses: ["heavy"],
      defenderDice: [4],
      defenderLosses: [],
    },
    result: { type: "defenderWon" },
  });
  await capture(challenge, "18i-defender-battle-result-mobile.png");
  await assertBattleResultLayout(challenge, { dicePosition: "below", iconCount: 1, message: "Sauron defeated Frodo", spyCount: 1 });

  await loadBattleStateFixture(challenge, {
    attackerScore: 7.3,
    attackingTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
    defenderScore: 6.2,
    defendingTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    latestRoll: {
      attackerDice: [2],
      attackerLosses: ["heavy"],
      defenderDice: [4],
      defenderLosses: [],
    },
    result: { type: "defenderWon" },
  }, { capturedSpyCount: 5 });
  await capture(challenge, "18j-battle-result-wrapped-spies-mobile.png");
  await assertBattleResultLayout(challenge, { dicePosition: "below", iconCount: 1, message: "Sauron defeated Frodo", spyCount: 5 });
  const wrappedResultBox = await challenge.locator(".battle-result-modal .battle-troops").boundingBox();
  assert(wrappedResultBox && wrappedResultBox.height > 46, "Battle result unit row wraps when spies push it beyond five icons.");

  await loadResolutionFixture(challenge, "elimination");
  await capture(challenge, "18k-elimination-modal-mobile.png");
  assert((await challenge.getByRole("alertdialog", { name: "Player eliminated" }).getByText("Sauron has been eliminated").count()) === 1, "Pending elimination shows the eliminated player message.");
  await challenge.getByRole("button", { name: "Confirm elimination" }).click();
  const eliminatedState = await readGameState(challenge);
  assert(!eliminatedState.players.some((player) => player.id === "opponent"), "Confirming elimination removes the eliminated player.");
  assert(eliminatedState.turn.spies.opponent.status === "dead", "Confirming elimination kills the eliminated player's spy.");

  await loadResolutionFixture(challenge, "victory");
  await capture(challenge, "18l-victory-modal-mobile.png");
  assert((await challenge.getByRole("alertdialog", { name: "Game over" }).getByText("Frodo wins").count()) === 1, "Pending victory shows the winner message.");
  assert((await challenge.getByRole("alertdialog", { name: "Game over" }).getByRole("button", { name: "Exit" }).count()) === 1, "Victory modal shows an explicit Exit button.");
  assert((await challenge.getByRole("alertdialog", { name: "Game over" }).getByRole("button", { name: "Restart" }).count()) === 1, "Victory modal shows an explicit Restart button.");
  assert((await challenge.getByRole("alertdialog", { name: "Game over" }).getByRole("button", { name: "Continue" }).count()) === 0, "Victory modal does not show a Continue button.");
  await challenge.getByRole("button", { name: "Restart" }).click();
  await challenge.waitForSelector('.app-shell[data-app-phase="setup"]');
  const restartedState = await readGameState(challenge);
  assert(restartedState.players.length === 2 && restartedState.players.some((player) => player.id === "viewer") && restartedState.players.some((player) => player.id === "opponent"), "Victory restart returns only the final two players to setup.");
  assert(!restartedState.players.some((player) => player.id === "previously-eliminated"), "Victory restart forgets earlier eliminated players.");

  await regular.close();
  await challenge.close();
}

async function runTurnFortifyChecks(browser) {
  console.log("Checking fortify action");
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);

  await loadTurnFortifyFixture(page);
  await page.getByRole("button", { name: "Fortify" }).click();
  await capture(page, "19a-fortify-start-mobile.png");
  assert((await page.locator(".turn-action-instruction").getByText("Select a territory to fortify").count()) === 1, "Fortify starts by asking for a target.");
  assert((await page.getByRole("button", { name: "Cancel Fortify" }).count()) === 1, "Fortify setup shows a cancel button.");
  assert((await page.getByRole("button", { name: "Skip" }).count()) === 1, "Fortify setup shows a skip button.");
  assert((await page.getByRole("button", { name: "Skip" }).getAttribute("class"))?.includes("primary"), "Fortify skip button uses the black primary action style.");
  await assertActionCancelGroupCentered(page, ["Cancel Fortify", "Skip"]);
  const fortifyCancelWidths = await page.locator(".turn-action-buttons.action-cancel-row button").evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().width));
  assert(fortifyCancelWidths.every((width) => width <= 180), "Fortify cancel and skip buttons stay compact instead of reaching screen edges.");

  await clickTerritory(page, "shire");
  await capture(page, "19b-fortify-target-mobile.png");
  assert((await page.locator(".turn-action-instruction").getByText("Select territories to fortify from").count()) === 1, "Fortify asks for sources after target selection.");
  assert((await page.locator(".troop-section-fortify").count()) === 0, "Fortify target selection alone does not show the troop section.");
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Fortify target uses the bright selected highlight.");
  assert((await page.locator('[data-territory-fill="bree"][data-territory-fill-state="suggested"]').count()) === 1, "Fortify subtly highlights adjacent valid sources.");
  assert((await page.locator('[data-territory-fill="rivendell"][data-territory-fill-state="suggested"]').count()) === 1, "Fortify subtly highlights remote directed-path valid sources.");

  await clickTerritory(page, "bree");
  await page.waitForSelector(".troop-section-fortify .allocation-target");
  await capture(page, "19c-fortify-adjacent-source-mobile.png");
  assert((await page.locator('[data-territory-fill="bree"][data-territory-fill-state="selected"]').count()) === 1, "Selected fortify source becomes a bright selected highlight.");
  assert((await page.locator('[data-territory-fill="rivendell"][data-territory-fill-state="suggested"]').count()) === 1, "Other eligible fortify sources remain subtly highlighted after source selection.");
  assert(((await page.locator(".troop-section-fortify .allocation-target").textContent()) ?? "").includes("Bree to Shire"), "Fortify troop section names source and target.");
  await assertTroopAffordanceButtons(page, ".troop-section-fortify", "Fortify adjacent source");
  assert((await page.locator(".troop-section-fortify .troop-action-row").nth(0).locator(".troop-icon-button:not(:disabled)").count()) >= 5, "Adjacent fortify source can move regular troops, cavalry, leader, and local captured spies.");
  assert((await page.getByRole("button", { name: "Remove Boromir spy" }).isDisabled()), "Captured spies originally on the target are visible but disabled.");
  await clickMapBackground(page);
  assert((await page.locator(".troop-section-fortify").count()) === 0, "Pressing the background clears only the selected fortify source.");
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Fortify target stays selected after background source unselection.");
  await clickTerritory(page, "bree");
  await page.waitForSelector(".troop-section-fortify .allocation-target");
  await clickTerritory(page, "shire");
  assert((await page.locator(".troop-section-fortify").count()) === 0, "Pressing an unselectable fortify source clears the selected source.");
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Fortify target stays selected after invalid source unselection.");
  await clickTerritory(page, "bree");
  await page.waitForSelector(".troop-section-fortify .allocation-target");

  const breeMarkerBeforeFortify = await troopMarkerCount(page, "bree");
  const shireMarkerBeforeFortify = await troopMarkerCount(page, "shire");
  await page.locator(".troop-section-fortify .troop-action-row").nth(0).getByRole("button", { name: "Add all" }).click();
  await waitForTroopMarkerCount(page, "bree", 1);
  await waitForTroopMarkerCount(page, "shire", shireMarkerBeforeFortify + breeMarkerBeforeFortify - 1);
  assert(await troopMarkerCount(page, "bree") === 1, "Fortify locally previews removed source troops on the map marker before commit.");
  assert(await troopMarkerCount(page, "shire") === shireMarkerBeforeFortify + breeMarkerBeforeFortify - 1, "Fortify locally previews added target troops on the map marker before commit.");
  const targetAfterBreeMove = await fortifyTargetUnitSummary(page);
  assert(targetAfterBreeMove.troops >= 5 && targetAfterBreeMove.spies >= 2, "Bulk adjacent fortify moves regular troops, cavalry, leader, and legal captured spies.");

  await clickTerritory(page, "north-downs");
  await page.waitForFunction(() => document.querySelector(".troop-section-fortify .allocation-target")?.textContent?.includes("North Downs to Shire"));
  await capture(page, "19d-fortify-regular-lane-mobile.png");
  assert(await page.locator(".troop-section-fortify .troop-action-row").nth(0).getByRole("button", { name: "Add heavy" }).isDisabled(), "A second adjacent source cannot move regular troops while the regular lane is occupied.");

  await clickTerritory(page, "rivendell");
  await page.waitForFunction(() => document.querySelector(".troop-section-fortify .allocation-target")?.textContent?.includes("Rivendell to Shire"));
  await capture(page, "19e-fortify-remote-source-mobile.png");
  assert(!(await page.locator(".troop-section-fortify .troop-action-row").nth(0).getByRole("button", { name: "Add cavalry" }).isDisabled()), "Remote fortify source can move cavalry.");
  assert(await page.locator(".troop-section-fortify .troop-action-row").nth(0).getByRole("button", { name: "Add elite" }).isDisabled(), "Remote fortify source cannot move regular troops.");
  assert(await page.getByRole("button", { name: "Add Elrond spy" }).isDisabled(), "Remote captured spy cannot move before same-source cavalry.");
  await page.locator(".troop-section-fortify .troop-action-row").nth(0).getByRole("button", { name: "Add all" }).click();
  assert(!(await page.locator(".troop-section-fortify .troop-action-row").nth(1).getByRole("button", { name: "Remove cavalry" }).isDisabled()), "Bulk remote fortify moves cavalry even when another troop type is the leave-behind reserve.");
  assert((await page.locator(".troop-section-fortify .troop-action-row").nth(1).locator(".captured-spy-icon").count()) >= 3, "Target row includes spies moved from the current remote source.");
  await page.locator(".troop-section-fortify .troop-action-row").nth(1).getByRole("button", { name: "Remove all" }).click();
  assert((await page.getByRole("button", { name: "Remove Elrond spy" }).count()) === 0, "Removing remote cavalry automatically returns remote spies to their source.");

  await page.getByRole("button", { name: "Cancel Fortify" }).click();
  await waitForTroopMarkerCount(page, "bree", breeMarkerBeforeFortify);
  await waitForTroopMarkerCount(page, "shire", shireMarkerBeforeFortify);
  assert((await page.locator(".turn-action-instruction").getByText("Choose an action").count()) === 1, "Canceling fortify returns to normal action choice.");
  assert((await page.locator(".troop-section-fortify").count()) === 0, "Canceling fortify hides the fortify troop section.");
  assert(await troopMarkerCount(page, "bree") === breeMarkerBeforeFortify, "Canceling fortify clears the local source troop marker preview.");
  assert(await troopMarkerCount(page, "shire") === shireMarkerBeforeFortify, "Canceling fortify clears the local target troop marker preview.");

  await page.getByRole("button", { name: "Fortify" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForSelector('.app-shell[data-app-phase="turnHandoff"]');
  const skippedState = await page.evaluate(() => JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null"));
  assert(skippedState.draft.ownership.shire === "viewer" && skippedState.allocation.playerAllocations.viewer.territories.shire.heavy === 1, "Skipping fortify advances the turn without moving units.");

  await loadTurnFortifyFixture(page);
  await page.getByRole("button", { name: "Fortify" }).click();
  await clickTerritory(page, "shire");
  await clickTerritory(page, "bree");
  await page.waitForSelector(".troop-section-fortify .allocation-target");
  await page.locator(".troop-section-fortify .troop-action-row").nth(0).getByRole("button", { name: "Add all" }).click();
  await page.getByRole("button", { name: "Confirm fortify" }).click();
  await page.waitForSelector('.app-shell[data-app-phase="turnHandoff"]');
  await capture(page, "19f-fortify-committed-handoff-mobile.png");
  const committedState = await page.evaluate(() => JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null"));
  assert(committedState.allocation.playerAllocations.viewer.territories.shire.heavy === 2, "Committed bulk fortify adds moved troops to the target.");
  assert(committedState.allocation.playerAllocations.viewer.territories.bree.heavy === 1, "Committed bulk fortify leaves one heavy behind when possible.");
  assert(committedState.turn.spies.spyOwner.territoryId === "shire" && committedState.turn.spies.spyOwner.custodianPlayerId === "viewer", "Committed fortify moves captured spies to the target.");

  await page.close();
}

async function fortifyTargetUnitSummary(page) {
  return page.locator(".troop-section-fortify .troop-action-row").nth(1).evaluate((row) => ({
    spies: row.querySelectorAll(".captured-spy-icon").length,
    troops: Array.from(row.querySelectorAll(".troop-count-bubble"))
      .map((bubble) => Number(bubble.textContent ?? 0))
      .reduce((sum, count) => sum + count, 0),
  }));
}

async function runGameplayRemovalChecks(page) {
  console.log("Checking gameplay player removal");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const savedState = gameplayRemovalGameState(territoryIds);
  const removedTerritories = ["bree", "rivendell"];

  await page.addInitScript((state) => {
    localStorage.clear();
    Math.random = () => 0;
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(state));
  }, savedState);
  await page.goto(baseUrl);
  await page.waitForSelector('.app-shell[data-app-phase="turn"]');
  await page.getByRole("button", { name: "Pause map" }).click();
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await page.getByRole("button", { name: "Remove Sauron" }).click();
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await capture(page, "13g-gameplay-removal-paused-mobile.png");

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ardature.localGame.v1") ?? "null"));
  const game = saved;
  assert(game.phase === "paused", "Gameplay removal leaves the game paused.");
  assert(game.players.length === 2 && game.players.every((player) => player.id !== "opponent"), "Removed gameplay player is gone from the roster.");
  assert(!game.allocation.playerAllocations.opponent, "Removed gameplay player allocation is gone.");
  assert(!game.turn.spies.opponent, "Removed gameplay player spy state is gone.");
  assert(game.turn.stage === "reinforcementReady" && game.turn.reinforcement === null, "Active reinforcement action is canceled on gameplay removal.");
  for (const territoryId of removedTerritories) {
    assert(game.draft.ownership[territoryId] !== "opponent", `Removed territory ${territoryId} is reassigned.`);
    const ownerId = game.draft.ownership[territoryId];
    const troops = game.allocation.playerAllocations[ownerId].territories[territoryId];
    assert(troops && troops.leader === 0 && troopObjectTotal(troops) > 0, `Removed territory ${territoryId} keeps redistributed non-leader troops.`);
  }
}

async function runNotificationQueueChecks(browser) {
  console.log("Checking queued notifications");
  const pending = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const handoff = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const due = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  pending.setDefaultTimeout(10000);
  handoff.setDefaultTimeout(10000);
  due.setDefaultTimeout(10000);

  await loadNotificationFixture(pending, { includeSpyNotice: false, minTurnNumber: 2, turnNumber: 1 });
  assert((await pending.getByRole("alertdialog", { name: "Game notification" }).count()) === 0, "Turn-start region notification waits for the next turn number.");

  await loadNotificationFixture(handoff, { includeSpyNotice: true, minTurnNumber: 2, phase: "turnHandoff", turnNumber: 2 });
  assert((await handoff.getByRole("alertdialog", { name: "Game notification" }).count()) === 0, "Queued notifications wait until after local handoff.");
  await handoff.getByRole("button", { name: "Begin turn" }).click();
  await handoff.getByText("You control Eriador").waitFor();
  await handoff.getByRole("button", { name: "Dismiss notification" }).click();
  await handoff.getByText("You captured Sauron's spy in Bree").waitFor();
  await handoff.getByRole("button", { name: "Dismiss notification" }).click();

  await loadNotificationFixture(due, { includeSpyNotice: true, minTurnNumber: 2, turnNumber: 2 });
  await due.getByRole("alertdialog", { name: "Game notification" }).waitFor();
  await due.getByText("You control Eriador").waitFor();
  await capture(due, "13h-region-notification-mobile.png");
  await due.getByRole("button", { name: "Dismiss notification" }).click();
  await due.getByText("You captured Sauron's spy in Bree").waitFor();
  await capture(due, "13i-spy-captured-notification-mobile.png");
  await due.getByRole("button", { name: "Dismiss notification" }).click();
  assert((await due.getByRole("alertdialog", { name: "Game notification" }).count()) === 0, "Queued notifications dismiss one at a time.");

  await pending.close();
  await handoff.close();
  await due.close();
}

async function loadNotificationFixture(page, { includeSpyNotice, minTurnNumber, phase = "turn", turnNumber }) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);
  state.phase = phase;
  state.turn.turnNumber = turnNumber;
  state.notifications = {
    viewer: [
      {
        delivery: "turnStart",
        id: "region-gained",
        minTurnNumber,
        playerId: "viewer",
        regionId: "eriador",
        type: "regionGained",
      },
      ...(includeSpyNotice
        ? [{
            id: "spy-captured",
            playerId: "viewer",
            spyOwnerId: "opponent",
            territoryId: "bree",
            type: "spyCaptured",
          }]
        : []),
    ],
  };

  await page.addInitScript((savedState) => {
    localStorage.clear();
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(savedState));
  }, state);
  await page.goto(baseUrl);
  await page.waitForSelector(`.app-shell[data-app-phase="${phase}"]`);
}

function gameplayRemovalGameState(territoryIds) {
  const state = turnSpyGameState(territoryIds);
  const ownership = Object.fromEntries(territoryIds.map((territoryId) => [
    territoryId,
    territoryId === "shire" ? "viewer" : "ally",
  ]));

  return {
    ...state,
    players: [
      ...state.players,
      {
        id: "ally",
        name: "Aragorn",
        color: "green",
        nameLocked: false,
        colorLocked: false,
        connectionStatus: "connected",
      },
    ],
    draft: {
      ...state.draft,
      originalTurnOrder: ["viewer", "opponent", "ally"],
      ownership: {
        ...ownership,
        bree: "opponent",
        rivendell: "opponent",
      },
    },
    allocation: {
      ...state.allocation,
      order: ["viewer", "opponent", "ally"],
      playerAllocations: {
        ...state.allocation.playerAllocations,
        opponent: {
          ...state.allocation.playerAllocations.opponent,
          territories: {
            bree: { heavy: 1, cavalry: 0, elite: 0, leader: 1 },
            rivendell: { heavy: 0, cavalry: 1, elite: 0, leader: 0 },
          },
        },
        ally: {
          marker: { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 },
          buildSubmitted: true,
          baseTroops: { heavy: 1, cavalry: 0, elite: 0, leader: 1 },
          inheritedTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
          ready: true,
          randomCompleted: false,
          territories: {
            lamedon: { heavy: 1, cavalry: 0, elite: 0, leader: 1 },
          },
        },
      },
    },
    turn: {
      ...state.turn,
      originalTurnOrder: ["viewer", "opponent", "ally"],
      currentPlayerId: "viewer",
      stage: "reinforcementPlace",
      reinforcement: {
        marker: { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 },
        buildSubmitted: true,
        baseTroops: { heavy: 1, cavalry: 1, elite: 1, leader: 0 },
        bonusTroops: { heavy: 0, cavalry: 0, elite: 0, leader: 0 },
        territories: {
          shire: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
        },
      },
      spies: {
        ...state.turn.spies,
        ally: { status: "available", territoryId: null, custodianPlayerId: null },
      },
    },
  };
}

function troopObjectTotal(troops) {
  return troops.heavy + troops.cavalry + troops.elite + troops.leader;
}

async function loadTurnSpyFixture(page, randomValue) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);
  state.players.push({
    id: "spyOwner",
    name: "Gandalf",
    color: "blue",
    nameLocked: false,
    colorLocked: false,
    connectionStatus: "connected",
  });
  state.turn.spies.spyOwner = { status: "captured", territoryId: "bree", custodianPlayerId: "opponent" };

  await page.addInitScript(({ savedState, nextRandom }) => {
    localStorage.clear();
    Math.random = () => nextRandom;
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(savedState));
  }, { savedState: state, nextRandom: randomValue });
  await page.goto(baseUrl);
  await page.waitForSelector('.app-shell[data-app-phase="turn"]');
  await page.waitForSelector(".turn-action-panel");
}

async function loadTurnAttackFixture(page, { attackStyle, randomValue }) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);
  state.config.attackStyle = attackStyle;
  state.turn.stage = "actions";
  state.players.push({
    id: "spyOwner",
    name: "Gandalf",
    color: "blue",
    nameLocked: false,
    colorLocked: false,
    connectionStatus: "connected",
  });
  state.turn.spies.spyOwner = { status: "captured", territoryId: "bree", custodianPlayerId: "opponent" };

  await page.addInitScript(({ savedState, nextRandom }) => {
    localStorage.clear();
    Math.random = () => nextRandom;
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(savedState));
  }, { savedState: state, nextRandom: randomValue });
  await page.goto(baseUrl);
  await page.waitForSelector('.app-shell[data-app-phase="turn"]');
  await page.waitForSelector(".turn-action-panel");
}

async function loadTurnFortifyFixture(page) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);

  for (const player of [
    { id: "spyOwner", name: "Gandalf", color: "blue" },
    { id: "remoteSpyOwner", name: "Elrond", color: "green" },
    { id: "targetSpyOwner", name: "Boromir", color: "purple" },
  ]) {
    state.players.push({
      ...player,
      nameLocked: false,
      colorLocked: false,
      connectionStatus: "connected",
    });
  }

  state.draft.ownership = Object.fromEntries(territoryIds.map((territoryId) => [
    territoryId,
    ["shire", "bree", "north-downs", "rivendell"].includes(territoryId) ? "viewer" : "opponent",
  ]));
  state.allocation.playerAllocations.viewer.baseTroops = { heavy: 6, cavalry: 3, elite: 2, leader: 1 };
  state.allocation.playerAllocations.viewer.territories = {
    shire: { heavy: 1, cavalry: 0, elite: 0, leader: 0 },
    bree: { heavy: 2, cavalry: 1, elite: 1, leader: 1 },
    "north-downs": { heavy: 2, cavalry: 0, elite: 0, leader: 0 },
    rivendell: { heavy: 0, cavalry: 1, elite: 1, leader: 0 },
  };
  state.allocation.playerAllocations.opponent.territories = {
    nurn: { heavy: 2, cavalry: 0, elite: 0, leader: 0 },
  };
  state.turn.stage = "actions";
  state.turn.spies = {
    viewer: { status: "available", territoryId: null, custodianPlayerId: null },
    opponent: { status: "available", territoryId: null, custodianPlayerId: null },
    spyOwner: { status: "captured", territoryId: "bree", custodianPlayerId: "viewer" },
    remoteSpyOwner: { status: "captured", territoryId: "rivendell", custodianPlayerId: "viewer" },
    targetSpyOwner: { status: "captured", territoryId: "shire", custodianPlayerId: "viewer" },
  };

  await page.addInitScript((savedState) => {
    localStorage.clear();
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(savedState));
  }, state);
  await page.goto(baseUrl);
  await page.waitForSelector('.app-shell[data-app-phase="turn"]');
  await page.waitForSelector(".turn-action-panel");
}

const battleFixtureTroopTypes = ["heavy", "cavalry", "elite", "leader"];

function battleFixtureCounts(overrides = {}) {
  return { heavy: 0, cavalry: 0, elite: 0, leader: 0, ...overrides };
}

function battleFixtureUnits(prefix, counts, score, ghostCount = 0) {
  const units = [];

  for (const troopType of battleFixtureTroopTypes) {
    for (let index = 0; index < (counts[troopType] ?? 0); index += 1) {
      units.push({
        id: `${prefix}-${troopType}-${index}`,
        score,
        type: troopType,
      });
    }
  }

  for (let index = 0; index < ghostCount; index += 1) {
    units.push({
      id: `${prefix}-ghost-${index}`,
      score,
      type: "ghost",
    });
  }

  return units;
}

function battleFixtureUnitCount(units, unitType) {
  return units.filter((unit) => unit.type === unitType).length;
}

function battleFixtureDice(values, units) {
  return values.map((die, index) => {
    if (typeof die === "object" && die !== null) {
      return die;
    }

    const unit = units[index % Math.max(units.length, 1)];
    return {
      score: unit?.score ?? 5,
      unitId: unit?.id ?? `fixture-die-${index}`,
      unitType: unit?.type ?? "heavy",
      value: die,
    };
  });
}

function battleFixtureCasualties(losses, prefix) {
  return (losses ?? []).map((loss, index) => typeof loss === "object" && loss !== null
    ? loss
    : {
        unitId: `${prefix}-loss-${index}`,
        unitType: loss,
      });
}

function battleFixtureRoll(latestRoll, attackingUnits, defendingUnits) {
  if (!latestRoll) {
    return null;
  }

  if (latestRoll.type === "balrog") {
    return {
      attackerDice: battleFixtureBlankDice(latestRoll.attackerDice ?? [], attackingUnits),
      attackerLosses: battleFixtureCasualties(latestRoll.attackerLosses, "attacker"),
      balrogAwakened: true,
      defenderDice: battleFixtureBlankDice(latestRoll.defenderDice ?? [], defendingUnits),
      defenderLosses: battleFixtureCasualties(latestRoll.defenderLosses, "defender"),
      id: latestRoll.id ?? "fixture-balrog-roll",
      type: "balrog",
    };
  }

  return {
    attackerDice: battleFixtureDice(latestRoll.attackerDice ?? [], attackingUnits),
    attackerLosses: battleFixtureCasualties(latestRoll.attackerLosses, "attacker"),
    defenderDice: battleFixtureDice(latestRoll.defenderDice ?? [], defendingUnits),
    defenderLosses: battleFixtureCasualties(latestRoll.defenderLosses, "defender"),
    id: latestRoll.id ?? "fixture-dice-roll",
    type: "dice",
  };
}

function battleFixtureBlankDice(values, units) {
  return values.map((die, index) => {
    if (typeof die === "object" && die !== null) {
      return die;
    }

    const unit = units[index % Math.max(units.length, 1)];
    return {
      score: unit?.score ?? 5,
      unitId: unit?.id ?? `fixture-blank-die-${index}`,
      unitType: unit?.type ?? "heavy",
    };
  });
}

function battleFixtureState(battleOverrides = {}) {
  const {
    attackerScore = 7.3,
    attackingGhostTroops = 0,
    attackingTroops = battleFixtureCounts({ heavy: 1, cavalry: 1 }),
    attackingUnits,
    defenderScore = 6.2,
    defendingTroops = battleFixtureCounts({ heavy: 3 }),
    defendingUnits,
    latestRoll = null,
    ...rest
  } = battleOverrides;
  const nextAttackingUnits = attackingUnits ?? battleFixtureUnits("attacker", battleFixtureCounts(attackingTroops), attackerScore, attackingGhostTroops);
  const nextDefendingUnits = defendingUnits ?? battleFixtureUnits("defender", battleFixtureCounts(defendingTroops), defenderScore);

  return {
    id: "battle-fixture",
    attackerPlayerId: "viewer",
    defenderPlayerId: "opponent",
    sourceTerritoryId: "shire",
    targetTerritoryId: "bree",
    committedAttackingTroops: battleFixtureCounts({ heavy: 1, cavalry: 1 }),
    initialDefendingTroops: battleFixtureCounts({ heavy: 3 }),
    attackingUnits: nextAttackingUnits,
    defendingUnits: nextDefendingUnits,
    latestRoll: battleFixtureRoll(latestRoll, nextAttackingUnits, nextDefendingUnits),
    hasRolled: false,
    pathsOfTheDeadSwing: null,
    releasedAttackerSpy: false,
    result: null,
    ...rest,
  };
}

async function loadBattleStateFixture(page, battleOverrides, options = {}) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);
  const capturedSpyCount = options.capturedSpyCount ?? 1;

  for (let index = 0; index < capturedSpyCount; index += 1) {
    const playerId = `spyOwner${index}`;
    const colors = ["blue", "green", "purple", "black", "red"];

    state.players.push({
      id: playerId,
      name: `Spy ${index + 1}`,
      color: colors[index % colors.length],
      nameLocked: false,
      colorLocked: false,
      connectionStatus: "connected",
    });
    state.turn.spies[playerId] = { status: "captured", territoryId: "bree", custodianPlayerId: "opponent" };
  }

  state.turn.stage = "battle";
  state.turn.battle = battleFixtureState(battleOverrides);

  await page.addInitScript((savedState) => {
    localStorage.clear();
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(savedState));
  }, state);
  await page.goto(baseUrl);
  await page.waitForSelector(".battle-modal");
}

async function createPathsBattleState(page, { attackStyle, committedTroops, randomValues }) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);

  state.config.attackStyle = attackStyle;
  state.pathsOfTheDeadState = 6;
  state.turn.stage = "actions";
  state.draft.ownership = Object.fromEntries(territoryIds.map((territoryId) => [
    territoryId,
    territoryId === "edoras" ? "viewer" : "opponent",
  ]));
  state.allocation.playerAllocations.viewer.territories = {
    edoras: { heavy: 4, cavalry: 0, elite: 0, leader: 0 },
  };
  state.allocation.playerAllocations.opponent.territories = {
    lamedon: { heavy: 2, cavalry: 0, elite: 0, leader: 0 },
  };

  await page.goto(baseUrl);
  return page.evaluate(async ({ savedState, randomValues: values, troops }) => {
    const game = await import("/src/game/gameState.ts");
    let index = 0;
    const random = () => values[Math.min(index++, values.length - 1)];

    return game.commitAttack(savedState, "viewer", "edoras", "lamedon", troops, random);
  }, { savedState: state, randomValues, troops: committedTroops });
}

async function rollBattleState(page, battleOverrides, randomValues) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);

  state.turn.stage = "battle";
  state.turn.battle = battleFixtureState({
    attackerScore: 0,
    attackingTroops: battleFixtureCounts({ heavy: 1 }),
    defenderScore: 10,
    defendingTroops: battleFixtureCounts({ heavy: 2 }),
    committedAttackingTroops: battleFixtureCounts({ heavy: 1 }),
    initialDefendingTroops: battleFixtureCounts({ heavy: 2 }),
    ...battleOverrides,
  });

  await page.goto(baseUrl);
  return page.evaluate(async ({ savedState, randomValues: values }) => {
    const game = await import("/src/game/gameState.ts");
    let index = 0;
    const random = () => values[Math.min(index++, values.length - 1)];

    return game.rollBattle(savedState, "viewer", savedState.turn.battle.id, random);
  }, { savedState: state, randomValues });
}

async function loadResolutionFixture(page, type) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);

  state.players.push({
    id: "previously-eliminated",
    name: "Boromir",
    color: "blue",
    nameLocked: false,
    colorLocked: false,
    connectionStatus: "connected",
  });
  for (const territoryId of Object.keys(state.draft.ownership)) {
    if (state.draft.ownership[territoryId] === "opponent") {
      state.draft.ownership[territoryId] = "viewer";
    }
  }
  state.turn.spies.opponent = { status: "captured", territoryId: "shire", custodianPlayerId: "viewer" };
  state.pendingResolution = type === "victory"
    ? { eliminatedPlayerId: "opponent", type: "victory", winnerPlayerId: "viewer" }
    : { eliminatedPlayerId: "opponent", type: "elimination" };

  await page.addInitScript((savedState) => {
    localStorage.clear();
    localStorage.setItem("ardature.localGame.v1", JSON.stringify(savedState));
  }, state);
  await page.goto(baseUrl);
  await page.waitForSelector(type === "victory" ? '[aria-label="Game over"]' : '[aria-label="Player eliminated"]');
}

async function loadForcedHostTransferFixture(page) {
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const territoryIds = [...mapDataSource.matchAll(/^      id: "([^"]+)",$/gm)].map((match) => match[1]);
  const state = turnSpyGameState(territoryIds);

  state.mode = "sync";
  state.phase = "turn";
  state.players.push({
    id: "successor",
    name: "Aragorn",
    color: "green",
    nameLocked: true,
    colorLocked: true,
    connectionStatus: "connected",
  });
  state.hostTransfer = { oldHostPlayerId: "viewer" };
  state.draft.originalTurnOrder = ["viewer", "opponent", "successor"];
  state.allocation.order = ["viewer", "opponent", "successor"];
  state.turn.originalTurnOrder = ["viewer", "opponent", "successor"];

  await page.goto(baseUrl);
  await page.evaluate((savedState) => {
    localStorage.clear();
    localStorage.setItem("ardature.syncHostGame.v1", JSON.stringify({
      game: savedState,
      localPlayerId: "viewer",
      revision: 42,
    }));
  }, state);
  await page.reload();
  await page.waitForSelector('.app-shell[data-app-phase="paused"]');
  await page.waitForSelector(".host-transfer-panel");
}

async function readGameState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("ardature.localGame.v1")));
}

async function commitFixtureAttack(page) {
  await page.getByRole("button", { name: "Attack" }).click();
  await clickTerritory(page, "shire");
  await clickTerritory(page, "bree");
  await page.waitForSelector(".troop-section-attack .allocation-target");
  for (let count = 0; count < 3; count += 1) {
    const button = page.locator(".troop-section-attack .troop-action-row").nth(0).locator(".troop-icon-button:not(:disabled)").first();
    if ((await button.count()) === 0) {
      break;
    }

    await button.click();
  }
  await page.getByRole("button", { name: "Confirm attack" }).click();
}

function turnSpyGameState(territoryIds) {
  const state = readOnlyVisibilityGameState(territoryIds);
  const opponentAllocation = state.allocation.playerAllocations.opponent;

  return {
    ...state,
    phase: "turn",
    allocation: {
      ...state.allocation,
      playerAllocations: {
        ...state.allocation.playerAllocations,
        opponent: {
          ...opponentAllocation,
          territories: {
            ...opponentAllocation.territories,
            rivendell: { heavy: 2, cavalry: 0, elite: 0, leader: 0 },
          },
        },
      },
    },
    turn: {
      originalTurnOrder: ["viewer", "opponent"],
      currentPlayerId: "viewer",
      stage: "reinforcementReady",
      spyReturnStage: null,
      spies: {
        viewer: { status: "available", territoryId: null, custodianPlayerId: null },
        opponent: { status: "available", territoryId: null, custodianPlayerId: null },
      },
      spyIntel: null,
      reinforcement: null,
      battle: null,
      completedAttacks: [],
    },
  };
}

function readOnlyVisibilityGameState(territoryIds) {
  return {
    phase: "gameMap",
    mode: "local",
    caradhrasPassState: null,
    pathsOfTheDeadState: null,
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
      allocationStyle: "manual",
      troopAllocationTimeLimit: 0,
      attackStyle: "regular",
    },
    draft: {
      originalTurnOrder: ["viewer", "opponent"],
      startIndex: 0,
      step: territoryIds.length,
      ownership: Object.fromEntries(territoryIds.map((territoryId) => [
        territoryId,
        territoryId === "shire" ? "viewer" : "opponent",
      ])),
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
    regionControl: {
      eriador: null,
      gondor: null,
      mordor: null,
      rhovanion: null,
      rohan: null,
      rhun: null,
    },
  };
}

async function finishAllocationTurn(page, skin, options = {}) {
  const territoryIds = await page.locator(`[data-territory-fill][data-territory-skin="${skin}"]`).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-territory-fill")).filter(Boolean),
  );
  assert(territoryIds.length > 0, `Expected owned ${skin} territories.`);

  const covered = new Set(options.coveredTerritoryIds ?? []);
  const troopPool = options.troopPool ? [...options.troopPool] : null;

  for (const territoryId of territoryIds.filter((id) => !covered.has(id))) {
    await clickTerritory(page, territoryId);
    if (troopPool) {
      const troopType = troopPool.shift();
      assert(troopType, "Expected enough troops to cover owned territories.");
      await page.getByRole("button", { name: `Add ${troopType}` }).click();
    } else {
      await firstEnabledAddButton(page).click();
    }
  }

  await clickTerritory(page, territoryIds[0]);
  if (troopPool) {
    for (const troopType of troopPool) {
      await page.getByRole("button", { name: `Add ${troopType}` }).click();
    }
  } else {
    for (let count = 0; count < 80 && (await firstEnabledAddButton(page).count()) > 0; count += 1) {
      await firstEnabledAddButton(page).click();
    }
  }

  await page.getByRole("button", { name: "Ready" }).click();
}

function firstEnabledAddButton(page) {
  return page.locator(".troop-placement-controls .troop-action-row").nth(0).locator(".troop-icon-button:not(:disabled)").first();
}

async function finishReinforcementPlacement(page) {
  const addButtons = page.locator(".troop-section-reinforcement .troop-action-row").nth(0).locator(".troop-icon-button:not(:disabled)");
  for (let count = 0; count < 80 && (await addButtons.count()) > 0; count += 1) {
    await addButtons.first().click();
  }

  await page.getByRole("button", { name: "Finish reinforcements" }).click();
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
  await host.getByLabel("Draft style").selectOption("random");
  await host.getByRole("button", { name: "Start game" }).click();
  await host.waitForSelector(".army-build-modal .army-triangle", { timeout: 15000 });
  await host.getByRole("button", { name: "Confirm army" }).click();
  await host.waitForSelector(".army-build-modal", { state: "detached" });
  assert((await host.locator(".troop-placement-controls").count()) === 0, "Sync allocation troop section is hidden before selecting a territory.");
  await finishAllocationTurn(host, "green");
  await host.waitForSelector(".allocation-waiting-panel .ready-columns");
  await capture(host, "16-sync-ready-page-mobile.png");
  assert((await host.locator(".player-bar").count()) === 1, "Sync ready page uses the player bar.");
  await assertPlayerBarFullWidth(host, ".player-bar", "Sync ready page player bar spans the screen.");
  assert((await host.locator(".player-bar-player span").count()) === 0, "Sync ready player bar shows name only.");
  assert((await host.locator(".ready-column").count()) === 2, "Sync ready page has two columns.");
  await assertReadyColumnHeadersLeftAligned(host);
  assert((await host.locator(".ready-player-row .connection-label").count()) === 0, "Sync ready rows do not include row-level status.");

  await joiner.waitForSelector(".army-build-modal .army-triangle", { timeout: 15000 });
  await capture(joiner, "17-sync-unready-allocation-mobile.png");
  assert((await joiner.locator(".allocation-waiting-panel").count()) === 0, "Unready sync player does not see ready page.");
  await joiner.getByRole("button", { name: "Confirm army" }).click();
  await joiner.waitForSelector(".army-build-modal", { state: "detached" });
  assert((await joiner.locator(".troop-placement-controls").count()) === 0, "Sync joiner allocation troop section is hidden before selecting a territory.");
  await finishAllocationTurn(joiner, "red");
  await host.getByRole("button", { name: "Start game" }).waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Start game" }).click();
  for (let index = 0; index < 4; index += 1) {
    await host.waitForTimeout(250);
    await dismissQueuedNotifications(host);
    await dismissQueuedNotifications(joiner);
    if ((await host.locator(".turn-action-panel").count()) > 0 || (await joiner.locator(".turn-action-panel").count()) > 0) {
      break;
    }
  }
  const activeTurnPage = await Promise.race([
    host.waitForSelector(".turn-action-panel", { timeout: 15000 }).then(() => host),
    joiner.waitForSelector(".turn-action-panel", { timeout: 15000 }).then(() => joiner),
  ]);
  const passiveTurnPage = activeTurnPage === host ? joiner : host;
  await passiveTurnPage.waitForSelector(".map-svg", { timeout: 15000 });
  await capture(activeTurnPage, "17b-sync-active-turn-mobile.png");
  await capture(passiveTurnPage, "17c-sync-passive-turn-mobile.png");
  assert((await activeTurnPage.getByRole("button", { name: "Spy" }).count()) === 1, "Active sync turn player sees turn controls.");
  assert((await passiveTurnPage.locator(".turn-action-panel").count()) === 0, "Passive sync turn player does not see turn controls.");
  assert((await passiveTurnPage.locator(".troop-section-info").count()) === 0, "Passive sync turn player has no empty troop section before selecting a territory.");
  assert((await passiveTurnPage.locator(".troop-section-info .troop-icon-count").count()) === 0, "Passive sync turn player does not see private action breakdowns.");

  const activeSkin = activeTurnPage === host ? "green" : "red";
  const passiveSkin = activeTurnPage === host ? "red" : "green";
  const syncAttackPair = await findAttackPairBySkins(activeTurnPage, activeSkin, passiveSkin);
  await activeTurnPage.getByRole("button", { name: "Reinforcements" }).click();
  await activeTurnPage.waitForSelector(".army-build-modal .army-triangle");
  await activeTurnPage.getByRole("button", { name: "Confirm army" }).click();
  await activeTurnPage.waitForSelector(".army-build-modal", { state: "detached" });
  await clickTerritory(activeTurnPage, syncAttackPair.sourceTerritoryId);
  await activeTurnPage.waitForSelector(".troop-section-reinforcement .allocation-target");
  await finishReinforcementPlacement(activeTurnPage);
  await activeTurnPage.waitForSelector(".turn-action-panel");
  await activeTurnPage.getByRole("button", { name: "Attack" }).click();
  await clickTerritory(activeTurnPage, syncAttackPair.sourceTerritoryId);
  await clickTerritory(activeTurnPage, syncAttackPair.targetTerritoryId);
  await activeTurnPage.waitForSelector(".troop-section-attack .allocation-target");
  await activeTurnPage.locator(".troop-section-attack .troop-action-row").nth(0).locator(".troop-icon-button:not(:disabled)").first().click();
  await activeTurnPage.getByRole("button", { name: "Confirm attack" }).click();
  await activeTurnPage.getByRole("dialog", { name: "Battle" }).waitFor({ timeout: 15000 });
  await passiveTurnPage.getByRole("dialog", { name: "Battle" }).waitFor({ timeout: 15000 });
  await capture(activeTurnPage, "17d-sync-attacker-battle-mobile.png");
  await capture(passiveTurnPage, "17e-sync-defender-battle-mobile.png");
  await assertBattleLayoutSymmetric(activeTurnPage, "Sync attacker battle modal layout");
  await assertBattleLayoutSymmetric(passiveTurnPage, "Sync defender battle modal layout");
  assert(await activeTurnPage.getByRole("button", { name: "Roll dice" }).isEnabled(), "Sync attacker can roll battle dice.");
  assert(await passiveTurnPage.getByRole("button", { name: "Roll dice" }).isDisabled(), "Sync defender can see the battle but cannot roll.");
  await activeTurnPage.getByRole("button", { name: "Roll dice" }).click();
  await waitForBattleRollOrResult(activeTurnPage);
  await waitForBattleRollOrResult(passiveTurnPage);

  await host.close();
  await joiner.close();
}

async function runSyncRestartChecks(browser) {
  console.log("Checking sync restart cleanup");
  const host = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const joiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const newcomer = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  host.setDefaultTimeout(20000);
  joiner.setDefaultTimeout(20000);
  newcomer.setDefaultTimeout(20000);

  await connectSyncPair(host, joiner, {
    hostName: "Elrond",
    hostColor: "Green",
    joinerName: "Boromir",
    joinerColor: "Red",
  });
  await host.getByRole("button", { name: "Start game" }).click();
  await host.waitForSelector('.app-shell[data-app-phase="draft"]', { timeout: 15000 });
  await joiner.waitForSelector('.app-shell[data-app-phase="draft"]', { timeout: 15000 });
  await host.getByRole("button", { name: "Pause draft" }).click();
  await host.getByRole("dialog", { name: "Paused" }).waitFor();
  await host.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Restart game" }).click();
  await host.getByRole("dialog", { name: "Restart this game and return to setup?" }).getByRole("button", { name: "Restart game" }).click();
  await host.waitForSelector('.app-shell[data-app-phase="setup"]', { timeout: 15000 });
  await joiner.waitForSelector('.app-shell[data-app-phase="setup"]', { timeout: 15000 });
  await host.locator(".qr-code[data-qr-text]").waitFor({ timeout: 15000 });
  await capture(host, "16c-sync-restart-lobby-mobile.png");
  const restartedNames = await host.locator(".player-row input").evaluateAll((inputs) =>
    inputs.map((input) => input.value));
  assert(restartedNames.includes("Elrond") && restartedNames.includes("Boromir"), "Sync restart keeps connected player identities in the setup lobby.");
  assert((await host.locator(".recovery-slot-list").count()) === 0, "Sync restart setup lobby does not expose active-game recovery slots.");

  await newcomer.goto(baseUrl);
  await newcomer.evaluate(() => localStorage.clear());
  await newcomer.reload();
  await newcomer.getByRole("button", { name: "Sync" }).click();
  await newcomer.getByLabel("Sync player name").fill("Gimli");
  await newcomer.getByRole("button", { name: "Join" }).click();
  await pasteScannerText(newcomer, await qrText(host));
  await newcomer.waitForSelector(".qr-code[data-qr-text]", { timeout: 15000 });
  await capture(newcomer, "16d-sync-restart-normal-join-answer-mobile.png");
  assert((await newcomer.locator(".recovery-slot-list").count()) === 0, "A new player scanning after sync restart gets the normal join answer flow, not recovery slots.");
  assert((await newcomer.getByText("No disconnected players").count()) === 0, "A new player scanning after sync restart is not shown stale recovery state.");

  await host.close();
  await joiner.close();
  await newcomer.close();
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
  assert((await host.getByRole("dialog", { name: "Paused" }).locator(".qr-placeholder").count()) === 0, "Sync host pause does not show a blank QR placeholder.");
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
  assert((await host.getByRole("dialog", { name: "Paused" }).locator(".qr-placeholder").count()) === 0, "Sync host refresh recovery does not show a blank QR placeholder.");

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

async function runSyncVoluntaryHostTransferChecks(browser) {
  console.log("Checking sync voluntary host transfer");
  const host = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const joiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  host.setDefaultTimeout(20000);
  joiner.setDefaultTimeout(20000);

  await connectSyncPair(host, joiner, {
    hostName: "Elrond",
    hostColor: "Green",
    joinerName: "Boromir",
    joinerColor: "Red",
  });
  await host.getByRole("button", { name: "Start game" }).click();
  await host.waitForSelector('.app-shell[data-app-phase="draft"]', { timeout: 15000 });
  await joiner.waitForSelector('.app-shell[data-app-phase="draft"]', { timeout: 15000 });
  await host.getByRole("button", { name: "Pause draft" }).click();
  await host.getByRole("dialog", { name: "Paused" }).waitFor();
  await joiner.getByRole("dialog", { name: "Paused" }).waitFor({ timeout: 15000 });
  await capture(host, "28b-sync-voluntary-transfer-offered-mobile.png");
  assert((await host.getByRole("dialog", { name: "Paused" }).getByText("Transfer host").count()) === 1, "Normal sync host pause offers voluntary host transfer.");
  assert((await host.getByRole("dialog", { name: "Paused" }).getByText("Transfer host before resuming.").count()) === 0, "Normal sync host pause does not use forced-transfer wording.");
  assert(await host.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Resume" }).isEnabled(), "Normal sync host pause can still resume when transfer is optional.");
  await host.getByRole("button", { name: "Transfer to Boromir" }).click();
  try {
    await joiner.getByRole("dialog", { name: "Paused" }).waitFor({ timeout: 15000 });
  } catch (error) {
    const phase = await joiner.locator(".app-shell").getAttribute("data-app-phase").catch(() => "missing");
    const text = ((await joiner.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`Transferred joiner did not become paused host. phase=${phase}; text=${text}`);
  }
  await host.waitForSelector('.app-shell[data-app-phase="home"]', { timeout: 15000 });
  await joiner.getByRole("dialog", { name: "Paused" }).locator(".qr-code[data-qr-text]").waitFor({ timeout: 15000 });
  await capture(joiner, "28c-sync-voluntary-transfer-new-host-mobile.png");
  assert((await joiner.locator('.pause-modal [data-player-status="disconnected"]').filter({ hasText: "Elrond" }).count()) === 1, "Voluntary transfer keeps the old host as a disconnected recoverable player.");
  assert((await joiner.getByRole("dialog", { name: "Paused" }).locator(".qr-code[data-qr-text]").count()) === 1, "New host shows a recovery QR after voluntary transfer.");

  await host.close();
  await joiner.close();
}

async function runSyncTerminalEventChecks(browser) {
  console.log("Checking sync terminal events");
  const endedHost = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const endedJoiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const removeHost = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const removedJoiner = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const forcedTransferHost = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  endedHost.setDefaultTimeout(20000);
  endedJoiner.setDefaultTimeout(20000);
  removeHost.setDefaultTimeout(20000);
  removedJoiner.setDefaultTimeout(20000);
  forcedTransferHost.setDefaultTimeout(20000);

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

  await loadForcedHostTransferFixture(forcedTransferHost);
  await capture(forcedTransferHost, "28d-sync-forced-host-transfer-mobile.png");
  assert((await forcedTransferHost.getByRole("dialog", { name: "Paused" }).getByText("Transfer host before resuming.").count()) === 1, "Forced host transfer pause tells the host to transfer before resuming.");
  assert(await forcedTransferHost.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Resume" }).isDisabled(), "Forced host transfer pause disables resume.");

  await endedHost.close();
  await endedJoiner.close();
  await removeHost.close();
  await removedJoiner.close();
  await forcedTransferHost.close();
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
    await runConfiguredRandomAllocationChecks(mobile);
    const readOnlyMobile = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
    readOnlyMobile.setDefaultTimeout(10000);
    await runReadOnlyVisibilityChecks(readOnlyMobile);
    await readOnlyMobile.close();
    const passMobile = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
    passMobile.setDefaultTimeout(10000);
    await runDynamicPassChecks(passMobile);
    await passMobile.close();
    await runTurnSpyOutcomeChecks(browser);
    await runTurnAttackChecks(browser);
    await runTurnFortifyChecks(browser);
    const removalMobile = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
    removalMobile.setDefaultTimeout(10000);
    await runGameplayRemovalChecks(removalMobile);
    await removalMobile.close();
    await runNotificationQueueChecks(browser);
    await runSyncEntryChecks(mobile);
    await runSyncReadyPageChecks(browser);
    await runSyncRestartChecks(browser);
    await runSyncRecoveryChecks(browser);
    await runSyncHostLossChecks(browser);
    await runSyncVoluntaryHostTransferChecks(browser);
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

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
