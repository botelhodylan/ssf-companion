const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const APP_VERSION = require("../package.json").version;
const MAX_BUILD_BYTES = 1_500_000;
const MAX_TREE_EXPORT_BYTES = 12_000_000;
const MAX_ATLAS_TREE_BYTES = 12_000_000;
const MAX_FILTER_BYTES = 8_000_000;
const MAX_EXPORT_BYTES = 8_000_000;
const ALLOWED_EXTERNAL_HOSTS = new Set(["filterblade.xyz", "www.filterblade.xyz", "pathofexile.com", "www.pathofexile.com", "github.com"]);
let mainWindow;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertTrustedRenderer(event) {
  const frame = event.senderFrame;
  if (!mainWindow || event.sender !== mainWindow.webContents || !frame || frame !== event.sender.mainFrame) {
    throw new Error("This request did not come from the SSF Companion window.");
  }

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      const expected = new URL(process.env.VITE_DEV_SERVER_URL);
      const actual = new URL(frame.url);
      if (actual.protocol === "http:" && actual.origin === expected.origin) return;
    } else if (fileURLToPath(frame.url) === path.resolve(__dirname, "..", "dist", "index.html")) {
      return;
    }
  } catch {}
  throw new Error("This request came from an untrusted page.");
}

function canonicalBuildRequest(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid HTTPS build link.");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Only secure public build links are supported.");
  }

  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (host === "pobb.in" || host === "www.pobb.in") {
    let id;
    if (pathParts.length === 1) [id] = pathParts;
    else if (pathParts.length === 2 && pathParts[1] === "raw") [id] = pathParts;
    else if (pathParts.length === 4 && pathParts[0] === "u" && pathParts[3] === "raw") id = pathParts[2];
    else if (pathParts.length === 3 && pathParts[0] === "u" && pathParts[2] === "raw") id = pathParts[1];
    else throw new Error("Use a pobb.in build link or its /raw link.");

    if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) throw new Error("That pobb.in build ID is not valid.");
    const canonicalPath = pathParts[0] === "u"
      ? `/u/${encodeURIComponent(pathParts[1])}/${encodeURIComponent(id)}/raw`
      : `/${encodeURIComponent(id)}/raw`;
    return { kind: "pobb.in", url: `https://pobb.in${canonicalPath}` };
  }

  if (host === "maxroll.gg" || host === "www.maxroll.gg") {
    if (pathParts.length !== 3 || pathParts[0] !== "poe" || pathParts[1] !== "pob") {
      throw new Error("Use a Maxroll Path of Building share URL (/poe/pob/…). Guide pages do not expose a supported build payload.");
    }
    const id = pathParts[2];
    if (!/^[A-Za-z0-9_-]{4,100}$/.test(id)) throw new Error("That Maxroll build ID is not valid.");
    return { kind: "maxroll", url: `https://maxroll.gg/poe/api/pob/${encodeURIComponent(id)}` };
  }

  throw new Error("For link imports, use pobb.in or a Maxroll Path of Building share URL. Other build sources can be pasted as a PoB code.");
}

function validateContact(contact) {
  if (typeof contact !== "string" || contact.trim().length < 4 || contact.length > 220 || /[\r\n]/.test(contact)) {
    throw new Error("Add a public contact URL or email in Settings before fetching from Pobb.in.");
  }
  return contact.trim();
}

async function readLimited(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_BUILD_BYTES) throw new Error("The build response is too large to import safely.");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BUILD_BYTES) {
      await reader.cancel();
      throw new Error("The build response is too large to import safely.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

async function fetchBuildUrl(rawUrl, contact) {
  const request = canonicalBuildRequest(rawUrl);
  const headers = { Accept: "text/plain, application/xml, */*" };
  if (request.kind === "pobb.in") {
    headers["User-Agent"] = `SSF-Companion/${APP_VERSION} (contact: ${validateContact(contact)})`;
  } else {
    headers["User-Agent"] = `SSF-Companion/${APP_VERSION}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(request.url, { headers, signal: controller.signal, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const redirect = response.headers.get("location");
      if (!redirect) throw new Error("The build host returned an invalid redirect.");
      const target = new URL(redirect, request.url);
      if (target.protocol !== "https:" || target.hostname.toLowerCase() !== new URL(request.url).hostname.toLowerCase()) {
        throw new Error("The build host redirected outside its own domain. Open the build link in your browser and paste the PoB code instead.");
      }
      const redirected = await fetch(target, { headers, signal: controller.signal, redirect: "error" });
      if (!redirected.ok) throw new Error(`The build host returned ${redirected.status}.`);
      return { kind: request.kind, raw: await readLimited(redirected) };
    }
    if (!response.ok) throw new Error(`The build host returned ${response.status}.`);
    return { kind: request.kind, raw: await readLimited(response) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The build host took too long to respond.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#121617",
    title: "SSF Companion",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === "https:" && ALLOWED_EXTERNAL_HOSTS.has(target.hostname.toLowerCase())) {
        shell.openExternal(target.href);
      }
    } catch {}
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = undefined;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("org.ssfc.companion");
  ipcMain.handle("app:version", (event) => {
    assertTrustedRenderer(event);
    return APP_VERSION;
  });
  ipcMain.handle("build:open-file", async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog({
      title: "Import a Path of Building export",
      properties: ["openFile"],
      filters: [{ name: "Path of Building exports", extensions: ["pob", "xml", "txt"] }, { name: "All files", extensions: ["*"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const stats = await fs.stat(result.filePaths[0]);
    if (!stats.isFile() || stats.size > MAX_BUILD_BYTES) throw new Error("The selected file is too large to import safely.");
    const content = await fs.readFile(result.filePaths[0], "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_BUILD_BYTES) throw new Error("The selected file is too large to import safely.");
    return { name: path.basename(result.filePaths[0]), content };
  });
  ipcMain.handle("tree:open-file", async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog({
      title: "Import a local PoE 1 passive-tree JSON export",
      properties: ["openFile"],
      filters: [{ name: "Passive tree JSON", extensions: ["json"] }, { name: "All files", extensions: ["*"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const stats = await fs.stat(result.filePaths[0]);
    if (!stats.isFile() || stats.size > MAX_TREE_EXPORT_BYTES) throw new Error("The selected tree export is too large to import safely.");
    const content = await fs.readFile(result.filePaths[0], "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_TREE_EXPORT_BYTES) throw new Error("The selected tree export is too large to import safely.");
    return { name: path.basename(result.filePaths[0]), content };
  });
  ipcMain.handle("atlas:open-file", async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog({
      title: "Import a PoE 1 Atlas URL, GGG data export, or local snapshot",
      properties: ["openFile"],
      filters: [{ name: "Atlas tree links and snapshots", extensions: ["txt", "json", "atlas"] }, { name: "All files", extensions: ["*"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const stats = await fs.stat(result.filePaths[0]);
    if (!stats.isFile() || stats.size > MAX_ATLAS_TREE_BYTES) throw new Error("The selected Atlas tree file is too large to import safely.");
    const content = await fs.readFile(result.filePaths[0], "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_ATLAS_TREE_BYTES) throw new Error("The selected Atlas tree file is too large to import safely.");
    return { name: path.basename(result.filePaths[0]), content };
  });
  ipcMain.handle("filter:open-file", async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog({
      title: "Audit an exported PoE 1 loot filter",
      properties: ["openFile"],
      filters: [{ name: "Path of Exile filters", extensions: ["filter", "txt"] }, { name: "All files", extensions: ["*"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const stats = await fs.stat(result.filePaths[0]);
    if (!stats.isFile() || stats.size > MAX_FILTER_BYTES) throw new Error("The selected filter is too large to audit safely.");
    const content = await fs.readFile(result.filePaths[0], "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_FILTER_BYTES) throw new Error("The selected filter is too large to audit safely.");
    return { name: path.basename(result.filePaths[0]), content };
  });
  ipcMain.handle("build:fetch-url", async (event, payload) => {
    assertTrustedRenderer(event);
    if (!isPlainObject(payload) || typeof payload.url !== "string" || payload.url.length > 600) throw new Error("Invalid build link.");
    return fetchBuildUrl(payload.url, payload.contact);
  });
  ipcMain.handle("export:save", async (event, payload) => {
    assertTrustedRenderer(event);
    if (!isPlainObject(payload) || typeof payload.content !== "string" || Buffer.byteLength(payload.content, "utf8") > MAX_EXPORT_BYTES) throw new Error("The export is too large.");
    const format = payload.format === "csv" || payload.format === "markdown" ? payload.format : "json";
    const extension = format === "markdown" ? "md" : format;
    const defaultName = typeof payload.name === "string" && /^[\w .-]{1,100}$/.test(payload.name)
      ? payload.name
      : "ssf-priority-plan";
    const result = await dialog.showSaveDialog({
      title: format === "markdown" ? "Export FilterBlade handoff guide" : "Export SSF priority plan",
      defaultPath: `${defaultName}.${extension}`,
      filters: [{ name: format === "markdown" ? "Markdown guide" : format === "csv" ? "CSV" : "JSON", extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.writeFile(result.filePath, payload.content, "utf8");
    return { saved: true, path: result.filePath };
  });
  ipcMain.handle("external:open-trusted", async (event, rawUrl) => {
    assertTrustedRenderer(event);
    if (typeof rawUrl !== "string") return false;
    try {
      const target = new URL(rawUrl);
      if (target.protocol !== "https:" || !ALLOWED_EXTERNAL_HOSTS.has(target.hostname.toLowerCase())) return false;
      await shell.openExternal(target.href);
      return true;
    } catch {
      return false;
    }
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
