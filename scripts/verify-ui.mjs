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
  }
  assert(appSource.includes("createInitialTerritoryStates"), "App creates territory state from generated data.");
  assert(mapViewSource.includes("viewBox") && mapViewSource.includes("MapViewport"), "Map view owns the viewport camera.");
  assert(mapViewSource.includes("data-map-animating"), "Map view exposes animation state.");
  assert(mapViewSource.includes("focusAnimationDuration"), "Map view uses adaptive focus duration.");
  assert(mapViewSource.includes("easeInOutCubic"), "Map view eases focus animation.");
  assert(!appSource.includes("isMapAnimating"), "App does not globally lock game input during camera animation.");
  assert(!mapViewSource.includes("isAnimatingRef.current || suppressClickRef.current"), "Map animation does not suppress territory hits.");
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

async function pressTerritory(page, territoryId) {
  await page.evaluate((id) => {
    const target = document.querySelector(`[data-territory-hit="${id}"]`);

    if (!target) {
      throw new Error(`Missing hit target ${id}.`);
    }

    target.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0,
    }));
  }, territoryId);
}

async function viewBox(page) {
  const value = await page.locator(".map-svg").getAttribute("viewBox");

  if (!value) {
    throw new Error("Map SVG has no viewBox.");
  }

  return value;
}

async function waitForTerritoryState(page, territoryId, state) {
  await page.waitForFunction(
    ({ id, expectedState }) =>
      document.querySelector(`[data-territory-fill="${id}"]`)?.getAttribute("data-territory-fill-state") === expectedState,
    { id: territoryId, expectedState: state },
  );
}

async function waitForTerritorySkin(page, territoryId, skin) {
  await page.waitForFunction(
    ({ id, expectedSkin }) =>
      document.querySelector(`[data-territory-fill="${id}"]`)?.getAttribute("data-territory-skin") === expectedSkin,
    { id: territoryId, expectedSkin: skin },
  );
}

async function runMapChecks(page) {
  console.log("Opening app");
  await page.goto(baseUrl);
  await page.waitForSelector("[data-territory-hit]");

  console.log("Checking layers");
  assert((await page.locator("[data-territory-fill]").count()) === 42, "Map renders 42 territory fill groups.");
  assert((await page.locator("[data-territory-hit]").count()) === 42, "Map renders 42 territory hit targets.");
  assert((await page.locator("[data-background-piece]").count()) === 1, "Map renders one background component.");
  assert(
    await page.locator(".static-map-ink").evaluate((node) => getComputedStyle(node).pointerEvents === "none"),
    "Static ink layer is pointer inert.",
  );

  console.log("Checking selection");
  const initialViewBox = await viewBox(page);
  await clickTerritory(page, "shire");
  await waitForTerritoryState(page, "shire", "selected");
  await page.waitForSelector('.map-svg[data-map-animating="true"]');
  assert((await page.locator("[data-skin-picker]").count()) === 1, "Selecting a territory shows the skin picker.");
  assert(!(await page.getByRole("button", { name: "blue" }).isDisabled()), "Skin swatches stay enabled during focus animation.");
  await page.getByRole("button", { name: "blue" }).click();
  await waitForTerritorySkin(page, "shire", "blue");

  await pressTerritory(page, "bree");
  await waitForTerritoryState(page, "bree", "selected");
  assert(
    (await page.locator('[data-territory-fill="shire"][data-territory-fill-state="unselected"]').count()) === 1,
    "Clicking another territory during focus animation changes selection.",
  );
  await page.waitForSelector('.map-svg[data-map-animating="false"]');
  const breeFocusedViewBox = await viewBox(page);
  assert(initialViewBox !== breeFocusedViewBox, "Selecting a territory changes the map viewBox.");

  await clickTerritory(page, "bree");
  await waitForTerritoryState(page, "bree", "unselected");
  assert((await page.locator("[data-skin-picker]").count()) === 0, "Clicking a selected territory hides the skin picker.");
  await page.waitForTimeout(120);
  assert((await viewBox(page)) === breeFocusedViewBox, "Unselecting a territory does not change the viewBox.");

  await clickTerritory(page, "bree");
  await waitForTerritoryState(page, "bree", "selected");
  await page.waitForTimeout(80);
  assert((await viewBox(page)) === breeFocusedViewBox, "Selecting an already-focused territory keeps the current viewBox.");
  assert(
    (await page.locator('.map-svg[data-map-animating="false"]').count()) === 1,
    "Selecting an already-focused territory does not require an animation lock.",
  );
  assert(!(await page.getByRole("button", { name: "blue" }).isDisabled()), "Skin swatches stay enabled after instant focus.");

  await clickTerritory(page, "bree");
  await waitForTerritoryState(page, "bree", "unselected");

  await clickTerritory(page, "shire");
  await waitForTerritoryState(page, "shire", "selected");
  await page.waitForSelector('.map-svg[data-map-animating="true"]');
  await pressTerritory(page, "shire");
  await waitForTerritoryState(page, "shire", "unselected");
  await page.waitForSelector('.map-svg[data-map-animating="false"]');
  const canceledViewBox = await viewBox(page);
  await page.waitForTimeout(160);
  assert((await viewBox(page)) === canceledViewBox, "Unselecting during focus animation stops the camera where it is.");

  console.log("Checking pan and zoom");
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
  const afterWheel = await viewBox(page);
  assert(beforeWheel !== afterWheel, "Wheel zoom changes the map viewBox.");

  const beforeDrag = await viewBox(page);

  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction((previous) => document.querySelector(".map-svg")?.getAttribute("viewBox") !== previous, beforeDrag);
  const afterDrag = await viewBox(page);
  assert(beforeDrag !== afterDrag, "Drag pan changes the map viewBox.");
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
    console.log("Running mobile checks");
    await runMapChecks(mobile);
    await mobile.screenshot({ path: outputPath("map-sandbox-mobile.png") });

    const desktop = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1100, height: 820 } });
    desktop.setDefaultTimeout(10000);
    console.log("Running desktop checks");
    await runMapChecks(desktop);
    await desktop.screenshot({ path: outputPath("map-sandbox-desktop.png") });

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
