import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
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
  const mapDataSource = await readFile(new URL("../src/map/generated/mapData.ts", import.meta.url), "utf8");
  const mapViewSource = await readFile(new URL("../src/map/components/MapView.tsx", import.meta.url), "utf8");
  const syncTransportSource = await readFile(new URL("../src/sync/syncTransport.ts", import.meta.url), "utf8");
  const mapWidth = generatedNumber(mapDataSource, "width");
  const mapHeight = generatedNumber(mapDataSource, "height");

  assert(mapDataSource.includes("satisfies GeneratedMapData"), "Generated map data is typed.");
  assert(!mapDataSource.includes("NaN"), "Generated map data has no NaN values.");
  assert(!mapDataSource.includes("Infinity"), "Generated map data has no Infinity values.");
  assert((mapDataSource.match(/id: "/g) ?? []).length === 42, "Generated app data has 42 playable territories.");
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
  assert(appSource.includes("noticeTerritoryId"), "App supports nonblocking sync draft notices.");
  assert(syncTransportSource.includes("ardature-sync-offer") && syncTransportSource.includes("ARO:"), "Sync transport uses Ardature QR payloads.");
  assert(mapViewSource.includes("viewBox") && mapViewSource.includes("MapViewport"), "Map view owns the viewport camera.");
  assert(mapViewSource.includes("constrainViewport"), "Map view constrains the viewport inside the map.");
  assert(mapViewSource.includes("viewportTransitionDistance"), "Map view uses combined pan and zoom focus distance.");
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

async function clickTerritory(page, territoryId) {
  await page.evaluate((id) => {
    const target = document.querySelector(`[data-territory-hit="${id}"]`);

    if (!target) {
      throw new Error(`Missing hit target ${id}.`);
    }

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }, territoryId);
}

async function setPlayerName(page, index, name) {
  await page.getByLabel("Player name").fill(name);
  await page.getByLabel("Add player").click();
  await page.locator(".player-row").nth(index).waitFor();
}

async function setPlayerColor(page, index, color) {
  await page.locator(".player-row").nth(index).getByRole("button", { name: color }).click();
}

async function startLocalSnakeDraft(page) {
  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Aragorn");
  await setPlayerColor(page, 0, "green");
  await setPlayerName(page, 1, "Gimli");
  await setPlayerColor(page, 1, "blue");
  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await page.waitForSelector("[data-territory-hit]");
}

async function runLocalDraftChecks(page) {
  console.log("Checking local draft");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("[data-background-piece]");
  await startLocalSnakeDraft(page);

  const size = await mapSize(page);
  assertViewBoxInside(await viewBox(page), size, "Initial draft viewBox stays inside the map.");
  assert((await page.locator("[data-territory-fill]").count()) === 42, "Map renders 42 territory fill groups.");
  assert((await page.locator("[data-territory-hit]").count()) === 42, "Draft renders 42 hit targets.");
  assert(
    await page.locator(".static-map-ink").evaluate((node) => getComputedStyle(node).pointerEvents === "none"),
    "Static ink layer is pointer inert.",
  );

  await clickTerritory(page, "shire");
  await page.getByRole("dialog", { name: "Confirm territory" }).waitFor();
  await page.getByRole("button", { name: "Confirm pick" }).click();
  await page.getByRole("status").waitFor();
  await page.getByRole("button", { name: "Next player" }).click();
  await page.getByText("41 left").waitFor();

  await page.getByRole("button", { name: "Pause draft" }).click();
  await page.getByRole("heading", { name: "Paused" }).waitFor();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByText("41 left").waitFor();

  const box = await page.locator(".map-svg").boundingBox();
  assert(box, "Map SVG has a bounding box.");
  const beforeWheel = await viewBox(page);
  await page.locator(".map-svg").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
    deltaY: -500,
  });
  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeWheel);
  assertViewBoxInside(await viewBox(page), size, "Wheel zoom keeps the viewBox inside the map.");
}

async function runRandomReviewChecks(page) {
  console.log("Checking random draft review");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Local" }).click();
  await setPlayerName(page, 0, "Frodo");
  await setPlayerColor(page, 0, "yellow");
  await setPlayerName(page, 1, "Sauron");
  await setPlayerColor(page, 1, "red");
  await page.getByRole("button", { name: "Random" }).click();
  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await page.waitForSelector('.app-shell[data-app-phase="review"]');
  assert((await page.locator("[data-territory-hit]").count()) === 0, "Review map has no territory hit targets.");
  assert((await page.locator('[data-territory-fill][data-territory-skin="background"]').count()) < 42, "Random draft colors territories.");
}

async function runSyncEntryChecks(page) {
  console.log("Checking sync entry");
  await page.goto(baseUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Sync" }).click();
  await page.getByLabel("Sync player name").fill("Galadriel");
  await page.locator(".sync-entry-panel").getByRole("button", { name: "purple" }).click();
  await page.getByRole("button", { name: "Host" }).click();
  await page.waitForSelector(".qr-code svg", { timeout: 10000 });
  assert((await page.locator(".player-row").count()) === 1, "Host lobby starts with the host player.");
  assert(await page.getByRole("button", { name: "Draft", exact: true }).isDisabled(), "Sync host cannot start with one player.");
  assert((await page.locator("[data-sync-role='host']").count()) === 1, "App records host sync role.");
}

async function main() {
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
    mobile.on("dialog", (dialog) => dialog.accept());
    await runLocalDraftChecks(mobile);
    await mobile.screenshot({ path: outputPath("draft-local-mobile.png") });

    const desktop = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1100, height: 820 } });
    desktop.setDefaultTimeout(10000);
    desktop.on("dialog", (dialog) => dialog.accept());
    await runRandomReviewChecks(desktop);
    await desktop.screenshot({ path: outputPath("draft-review-desktop.png") });
    await runSyncEntryChecks(desktop);
    await desktop.screenshot({ path: outputPath("sync-host-desktop.png") });

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
