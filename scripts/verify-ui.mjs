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
  const gameStateSource = await readFile(new URL("../src/game/gameState.ts", import.meta.url), "utf8");
  const gameTypesSource = await readFile(new URL("../src/game/gameTypes.ts", import.meta.url), "utf8");
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const mapConnectionsSource = await readFile(new URL("../src/map/generated/mapConnections.ts", import.meta.url), "utf8");
  const mapViewSource = await readFile(new URL("../src/map/components/MapView.tsx", import.meta.url), "utf8");
  const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifestSource = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
  const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const syncMessagesSource = await readFile(new URL("../src/sync/syncMessages.ts", import.meta.url), "utf8");
  const syncTransportSource = await readFile(new URL("../src/sync/syncTransport.ts", import.meta.url), "utf8");
  const mapWidth = generatedNumber(mapDataSource, "width");
  const mapHeight = generatedNumber(mapDataSource, "height");
  const sourceWidth = generatedNumber(mapDataSource, "sourceWidth");
  const sourceHeight = generatedNumber(mapDataSource, "sourceHeight");
  const homeViewport = generatedViewport(mapDataSource, "homeViewport");

  assert(mapDataSource.includes("satisfies GeneratedMapData"), "Generated map data is typed.");
  assert(mapConnectionsSource.includes("generatedMapConnections"), "Generated map connections exist.");
  assert((mapConnectionsSource.match(/": \[/g) ?? []).length === 42, "Generated map connections include 42 playable territories.");
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
  assert(appSource.includes("viewerSelectedTerritoryId") && appSource.includes("selectedTerritoryId={viewerSelectedTerritoryId}"), "App keeps draft focus viewer-local.");
  assert(appSource.includes("RotateCcw") && appSource.includes("restartPausedGame"), "Pause can restart to setup without closing transports.");
  assert(!appSource.includes('closeLabel="End game"'), "Pause modal does not use a close X to end the game.");
  assert(appSource.includes("closeOnOutsidePress"), "Color dropdowns close on outside press.");
  assert(stylesSource.includes(".sync-entry-panel") && stylesSource.includes("padding-bottom: 112px"), "Sync entry reserves color menu space.");
  assert(syncMessagesSource.includes('type: "hostQuit"') && syncMessagesSource.includes('message.type === "hostQuit"'), "Sync messages include host quit.");
  assert(!gameTypesSource.includes("noticeTerritoryId") && !gameTypesSource.includes("noticePlayerId"), "Shared draft state does not store local notices.");
  assert(!gameStateSource.includes("timerMs(state.config.pickTimeLimit) ?? 0") && gameStateSource.includes('draft: state.mode === "sync" ? beginDraftTimer'), "Sync draft timers preserve unlimited pick time.");
  assert(gameStateSource.includes("expandRemovedTroops(removedTroopPool") && gameStateSource.includes('troopType === "leader" ? randomMixtureTroop() : troopType'), "Removed-player leaders are replaced by random regular troops.");
  assert(gameStateSource.includes('if (state.mode === "sync")') && gameStateSource.includes('phase: "allocationWaiting"') && gameStateSource.includes("startGameMapAfterAllocation"), "Sync allocation waits for host advance after everyone is ready.");
  assert(appSource.includes("canAdvance={syncRole === \"host\"") && appSource.includes("onAdvance={startAllocatedGame}"), "Allocation waiting panel exposes host-only start control.");
  assert(syncTransportSource.includes("ardature-sync-offer") && syncTransportSource.includes("ARO:"), "Sync transport uses Ardatúrë QR payloads.");
  assert(mapViewSource.includes("viewBox") && mapViewSource.includes("MapViewport"), "Map view owns the viewport camera.");
  assert(mapViewSource.includes("constrainViewport"), "Map view constrains the viewport inside the map.");
  assert(mapViewSource.includes("viewportTransitionDistance"), "Map view uses combined pan and zoom focus distance.");
  assert(mapViewSource.includes("onMapPress"), "Map view supports map-background presses.");
  assert(mapViewSource.includes("Maximize") && mapViewSource.includes("Return to map view"), "Map view uses a corner-only return-to-map control.");
  assert(appSource.includes("icon-button-spacer"), "Host self-removal leaves an aligned spacer instead of a trash button.");
  assert(appSource.includes("TroopIconCount") && appSource.includes("troopIconSrc"), "Allocation UI uses troop image icons.");
  assert(!appSource.includes("TroopBadge") && !appSource.includes("troopLabel"), "Old letter troop badge components are removed.");
  assert(!stylesSource.includes(".troop-badge") && !stylesSource.includes(".troop-chip") && !stylesSource.includes(".army-builder"), "Old troop badge styles are removed.");
  assert(!appSource.includes("troop-step-grid") && !appSource.includes("troop-stepper"), "Old troop stepper markup is removed.");
  assert(!stylesSource.includes(".troop-step-grid") && !stylesSource.includes(".troop-stepper"), "Old troop stepper styles are removed.");
  assert(!stylesSource.includes(".army-triangle text"), "Army triangle does not style text labels.");
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

async function clickTerritory(page, territoryId) {
  await page.evaluate((id) => {
    const target = document.querySelector(`[data-territory-hit="${id}"]`);

    if (!target) {
      throw new Error(`Missing hit target ${id}.`);
    }

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }, territoryId);
}

async function clickMapBackground(page) {
  await page.evaluate(() => {
    const target = document.querySelector("[data-background-piece]");

    if (!target) {
      throw new Error("Missing map background.");
    }

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
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
  await page.getByRole("button", { name: "Randomize" }).click();
  const savedLocalNames = await playerNames(page);
  await checkColorMenuDismissal(page);
  await capture(page, "02-local-setup-mobile.png");
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
  const controlsBox = await page.locator(".draft-panel").boundingBox();
  const mapBox = await page.locator(".map-shell").boundingBox();
  assert(controlsBox && mapBox && mapBox.y >= controlsBox.y + controlsBox.height - 1, "Draft controls sit above the map.");
  await page.getByText("0 / 21").waitFor();
  assert((await page.getByText("42 left").count()) === 0, "Draft controls show active-player progress instead of territories left.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 1, "Map shows the return-to-map control.");
  assert(
    await page.locator(".static-map-ink").evaluate((node) => getComputedStyle(node).pointerEvents === "none"),
    "Static ink layer is pointer inert.",
  );

  await clickTerritory(page, "shire");
  const confirmDialog = page.getByRole("dialog", { name: "Confirm territory" });
  await confirmDialog.waitFor();
  const confirmBox = await confirmDialog.boundingBox();
  const viewport = page.viewportSize();
  assert(confirmBox && viewport && confirmBox.y > viewport.height * 0.55, "Confirm sheet appears at the bottom.");
  assert((await page.getByRole("button", { name: "Return to map view" }).count()) === 0, "Confirm modal hides the return-to-map control.");
  assert(await confirmDialog.getByRole("heading", { name: "Shire" }).isVisible(), "Confirm modal shows the territory name.");
  assert((await confirmDialog.locator(".territory-preview-shape").count()) === 0, "Confirm sheet has no territory preview.");
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 1, "Pending territory is selected on the map.");
  assert((await page.locator('[data-territory-fill="shire"] [data-territory-fill-piece="shire"]').first().getAttribute("fill")) === "#ffffff", "Pending territory is filled white on the map.");
  await capture(page, "06-local-draft-confirm-mobile.png");
  await clickMapBackground(page);
  await confirmDialog.waitFor({ state: "detached" });
  assert((await page.locator('[data-territory-fill="shire"][data-territory-fill-state="selected"]').count()) === 0, "Tapping the map background cancels the pending pick.");

  await clickTerritory(page, "shire");
  await confirmDialog.waitFor();
  await clickTerritory(page, "bree");
  await confirmDialog.getByRole("heading", { name: "Bree" }).waitFor();
  const replacedConfirmBox = await confirmDialog.boundingBox();
  await page.getByRole("button", { name: "Confirm pick" }).click();
  const resultDialog = page.getByRole("status");
  await resultDialog.waitFor();
  const resultBox = await resultDialog.boundingBox();
  await capture(page, "07-local-draft-result-mobile.png");
  assert(replacedConfirmBox && resultBox && Math.abs(replacedConfirmBox.width - resultBox.width) < 1, "Result sheet matches confirm sheet width.");
  assert(replacedConfirmBox && resultBox && Math.abs(replacedConfirmBox.height - resultBox.height) < 1, "Result sheet matches confirm sheet height.");
  assert((await resultDialog.getByRole("button", { name: "Next player" }).count()) === 0, "Result modal has no next button.");
  assert((await resultDialog.locator(".territory-preview-shape").count()) === 0, "Result sheet has no territory preview.");
  await page.getByText("0 / 21").waitFor();
  await waitForViewBox(page, homeViewport);
  assertViewBoxEquals(await viewBox(page), homeViewport, "Local result dismissal returns to the home viewport.");

  await clickTerritory(page, "shire");
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor();
  await page.getByRole("button", { name: "Confirm pick" }).click();
  await page.locator(".pick-result-scrim").click();
  await page.getByText("1 / 21").waitFor();

  await page.getByRole("button", { name: "Pause draft" }).click();
  await page.getByRole("dialog", { name: "Paused" }).waitFor();
  await capture(page, "08-local-pause-mobile.png");
  assert((await page.locator(".draft-panel").count()) === 0, "Pause hides draft controls.");
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
  assert((await page.locator(".allocation-target span").count()) === 0, "Allocation target does not repeat the territory troop total.");
  assert((await page.locator(".troop-action-row").count()) === 2, "Territory allocation has add and remove rows.");
  assert((await page.locator(".troop-action-row").nth(0).locator(".troop-icon-button").count()) === 4, "Add row has four troop icon buttons.");
  assert((await page.locator(".troop-action-row").nth(1).locator(".troop-icon-button").count()) === 4, "Remove row has four troop icon buttons.");
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
  assert((await page.getByLabel("Current viewer").count()) === 1, "Local game map can switch viewer perspective.");
  assert((await page.locator(".troop-marker").count()) > 0, "Read-only game map shows troop totals.");
  await clickTerritory(page, ownedTerritoryId);
  assert((await page.locator(".game-map-panel .troop-icon-count").count()) === 4, "Read-only breakdown uses troop icon counts.");
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
  await assertBelow(page, page.locator(".qr-code"), page.getByRole("button", { name: "Scan" }), "Sync scan sits below the host QR.");
  await assertBelow(page, page.locator(".player-list"), page.getByRole("button", { name: "Randomize" }), "Sync randomize sits below player names.");
  assert((await page.locator(".player-row").count()) === 1, "Host lobby starts with the host player.");
  assert((await page.getByRole("button", { name: "Remove Galadriel" }).count()) === 0, "Host cannot remove themselves in the lobby.");
  assert(await page.getByRole("button", { name: "Start game" }).isDisabled(), "Sync host cannot start with one player.");
  assert((await page.locator("[data-sync-role='host']").count()) === 1, "App records host sync role.");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("dialog", { name: "End this game and return home?" }).waitFor();
  await capture(page, "15-sync-exit-confirm-mobile.png");
  assert((await page.getByRole("dialog", { name: "End this game and return home?" }).getByRole("button").count()) === 2, "Exit confirmation has two icon buttons.");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForSelector("[data-sync-role='host']");
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
    await runSetupPreferenceChecks(mobile);
    await runLocalDraftChecks(mobile);
    await runRandomAllocationChecks(mobile);
    await runSyncEntryChecks(mobile);

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
