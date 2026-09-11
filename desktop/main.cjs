const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  nativeTheme,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { DocumentStore, safeWrite } = require("./storage.cjs");
const profile = app.commandLine.getSwitchValue("user-data-dir");
if (profile) {
  require("node:fs").mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
}
let win,
  store,
  settings = {},
  ready = false,
  allowClose = false;
function fileArguments(args, directory = process.cwd()) {
  return args
    .slice(1)
    .filter((arg) => !arg.startsWith("--"))
    .map((arg) => path.resolve(directory, arg))
    .filter((file) => file !== path.resolve(app.getAppPath()));
}
let pending = fileArguments(process.argv);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
app.on("second-instance", (_event, args, directory) => {
  pending.push(...fileArguments(args, directory));
  if (win) {
    if (ready) win.webContents.send("action", "pending");
    // Windows activation can pump more handoffs. Acknowledge this one first.
    setImmediate(() => {
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.focus();
    });
  }
});
app.on("open-file", (event, file) => {
  event.preventDefault();
  pending.push(file);
  if (ready) win.webContents.send("action", "pending");
});
app.on("window-all-closed", () => app.quit());
const action = (name) => () => win?.webContents.send("action", name);
function menu() {
  const file = {
    label: "File",
    submenu: [
      {
        label: "New Text",
        accelerator: "CmdOrCtrl+N",
        click: action("new-text"),
      },
      {
        label: "New Markdown",
        accelerator: "CmdOrCtrl+Shift+N",
        click: action("new-markdown"),
      },
      { label: "Open…", accelerator: "CmdOrCtrl+O", click: action("open") },
      { type: "separator" },
      { label: "Save", accelerator: "CmdOrCtrl+S", click: action("save") },
      {
        label: "Save As…",
        accelerator: "CmdOrCtrl+Shift+S",
        click: action("save-as"),
      },
      { label: "Export HTML…", click: action("export") },
      { label: "Print…", accelerator: "CmdOrCtrl+P", click: action("print") },
      { type: "separator" },
      {
        label: "Close tab",
        accelerator: "CmdOrCtrl+W",
        click: action("close"),
      },
      { role: "quit" },
    ],
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      file,
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          {
            label: "Find and replace",
            accelerator: "CmdOrCtrl+F",
            click: action("find"),
          },
          {
            label: "Go to line",
            accelerator: "CmdOrCtrl+L",
            click: action("line"),
          },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
          {
            label: "Settings",
            accelerator: "CmdOrCtrl+,",
            click: action("settings"),
          },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "About DEFT",
            click: () =>
              dialog.showMessageBox(win, {
                message: "DEFT",
                detail:
                  "A fast, focused text and Markdown editor.\nLIFE IMITATES LIFE\nVersion " +
                  app.getVersion(),
              }),
          },
          {
            label: "Choose default apps",
            click: () => {
              if (process.platform === "win32")
                shell.openExternal("ms-settings:defaultapps");
              else
                dialog.showMessageBox(win, {
                  message: "Choose DEFT as a default app",
                  detail:
                    "In Finder, select a .md or .txt file. Choose Get Info, Open with DEFT, then Change All.",
                });
            },
          },
        ],
      },
    ]),
  );
}
function material(value) {
  const solid = value === "solid" || nativeTheme.shouldUseHighContrastColors;
  if (process.platform === "win32")
    win.setBackgroundMaterial(solid ? "none" : "mica");
  if (process.platform === "darwin") win.setVibrancy(solid ? null : "sidebar");
  return process.platform === "win32" || process.platform === "darwin";
}
function register(name, handler) {
  ipcMain.handle(`deft:${name}`, async (event, ...args) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame
    )
      throw new Error("Untrusted request.");
    return handler(...args);
  });
}
async function openFiles(files) {
  if (!files) {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    files = result.filePaths;
  }
  const opened = [];
  for (const file of files) {
    try {
      let doc;
      try {
        doc = await store.open(file);
      } catch (e) {
        if (!/^(BINARY|ENCODING):/.test(e.message)) throw e;
        const result = await dialog.showMessageBox(win, {
          type: "warning",
          message: "Open this file as text?",
          detail: e.message,
          buttons: ["Cancel", "Open as text anyway"],
          defaultId: 0,
          cancelId: 0,
        });
        if (result.response !== 1) continue;
        doc = await store.open(file, true);
      }
      opened.push(doc);
      settings.recent = [
        file,
        ...(settings.recent || []).filter((p) => p !== file),
      ].slice(0, 15);
    } catch (e) {
      await dialog.showMessageBox(win, {
        type: "error",
        message: "Could not open file",
        detail: e.message,
      });
    }
  }
  await saveSettings();
  return opened;
}
async function saveSettings() {
  const snapshot = Buffer.from(JSON.stringify(settings));
  await store.serialize(() =>
    safeWrite(path.join(app.getPath("userData"), "settings.json"), snapshot),
  );
}
function getDoc(id) {
  const doc = store.docs.get(id);
  if (!doc) throw new Error("Document is not open.");
  return doc;
}
async function localAsset(id, relative) {
  const doc = getDoc(id);
  if (!doc.path || /^[a-z]+:|^[/\\]/i.test(relative))
    throw new Error("Only relative local images are supported.");
  const base = path.dirname(doc.path),
    target = await fs.realpath(
      path.resolve(base, decodeURIComponent(relative)),
    );
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error("Image must be within the document folder.");
  const mime = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  }[path.extname(target).toLowerCase()];
  if (!mime) throw new Error("Unsupported image type.");
  if ((await fs.stat(target)).size > 10 * 1024 * 1024)
    throw new Error("Image exceeds 10 MiB.");
  return `data:${mime};base64,${(await fs.readFile(target)).toString("base64")}`;
}
async function outputHtml(html, print = false) {
  if (typeof html !== "string" || html.length > 64 * 1024 * 1024)
    throw new Error("Invalid export.");
  if (!print) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: "document.html",
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (!result.canceled) await safeWrite(result.filePath, Buffer.from(html));
    return;
  }
  const preview = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    },
  });
  try {
    await preview.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    if (print === "pdf") {
      const result = await dialog.showSaveDialog(win, {
        defaultPath: "document.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!result.canceled)
        await safeWrite(
          result.filePath,
          await preview.webContents.printToPDF({ printBackground: true }),
        );
      return;
    }
    await new Promise((resolve, reject) =>
      preview.webContents.print({ printBackground: true }, (ok, error) =>
        ok ? resolve() : reject(new Error(error)),
      ),
    );
  } finally {
    preview.destroy();
  }
}
if (locked)
  app
    .whenReady()
    .then(async () => {
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      store = new DocumentStore(path.join(app.getPath("userData"), "recovery"));
      try {
        settings = JSON.parse(
          await fs.readFile(
            path.join(app.getPath("userData"), "settings.json"),
            "utf8",
          ),
        );
      } catch (e) {
        if (e.code !== "ENOENT")
          dialog.showErrorBox("Settings could not be read", e.message);
      }
      win = new BrowserWindow({
        width: 1120,
        height: 800,
        minWidth: 620,
        minHeight: 420,
        title: "DEFT",
        backgroundColor: "#f5f6f8",
        icon: path.join(__dirname, "../assets/icon.png"),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      win.on("close", (event) => {
        if (!allowClose) {
          event.preventDefault();
          win.webContents.send("action", "quit");
        }
      });
      register("init", async () => {
        if (ready) throw new Error("Session is already initialized.");
        ready = true;
        return {
          docs: await store.restore(),
          settings,
          pending: pending.length > 0,
        };
      });
      register("create", (kind) => store.create(kind));
      register("open", openFiles);
      register("pending", () => openFiles(pending.splice(0)));
      register("save", async (id, text, copy = false, utf8 = false) => {
        const doc = getDoc(id);
        let destination;
        if (copy || !doc.path) {
          const result = await dialog.showSaveDialog(win, {
            defaultPath: doc.path || doc.name,
          });
          if (result.canceled) return null;
          destination = result.filePath;
          try {
            destination = await fs.realpath(destination);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          const duplicate = [...store.docs.values()].find(
            (d) =>
              d.id !== id &&
              d.path &&
              path.resolve(d.path).toLowerCase() ===
                path.resolve(destination).toLowerCase(),
          );
          if (duplicate)
            throw new Error("That file is already open in another tab.");
        }
        if (utf8) {
          const old = { encoding: doc.encoding, bom: doc.bom };
          Object.assign(doc, { encoding: "utf8", bom: "" });
          try {
            return await store.save(id, text, destination);
          } catch (e) {
            Object.assign(doc, old);
            throw e;
          }
        }
        return store.save(id, text, destination);
      });
      register("recover", (drafts) => store.recover(drafts));
      register("close", async (id, quit = false) => {
        if (id) await store.discard(id);
        if (quit) {
          allowClose = true;
          win.close();
        }
      });
      register("check", (id) => store.check(id));
      register("reload", (id) => store.reload(id));
      register("acceptReload", (id, fingerprint) =>
        store.acceptReload(id, fingerprint),
      );
      register("settings", async (value) => {
        settings = { ...settings, ...value };
        await saveSettings();
        material(settings.material);
        return settings;
      });
      register("material", material);
      register("reveal", (id) => {
        const doc = getDoc(id);
        if (doc.path) shell.showItemInFolder(doc.path);
      });
      register(
        "confirm",
        async (message, detail, buttons) =>
          (
            await dialog.showMessageBox(win, {
              type: "question",
              message,
              detail,
              buttons,
              defaultId: 0,
              cancelId: 0,
            })
          ).response,
      );
      register("link", async (id, href) => {
        if (/^https?:\/\//i.test(href)) {
          await shell.openExternal(new URL(href).href);
          return [];
        }
        if (/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(href))
          throw new Error("Unsafe link blocked.");
        const doc = getDoc(id);
        if (!doc.path) return [];
        return openFiles([
          path.resolve(
            path.dirname(doc.path),
            decodeURIComponent(href.split("#")[0]),
          ),
        ]);
      });
      register("asset", localAsset);
      register("image", async (id, bytes) => {
        const doc = getDoc(id);
        if (!doc.path)
          throw new Error("Save the document before adding an image.");
        if (!Array.isArray(bytes) || bytes.length > 10 * 1024 * 1024)
          throw new Error("Image exceeds 10 MiB.");
        const buffer = Buffer.from(bytes);
        if (
          !buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
          throw new Error("Paste a PNG image.");
        const directory = path.join(path.dirname(doc.path), "assets");
        await fs.mkdir(directory, { recursive: true });
        const real = await fs.realpath(directory);
        if (path.dirname(real) !== path.dirname(doc.path))
          throw new Error(
            "Assets folder must not point outside the document folder.",
          );
        const name = `image-${require("node:crypto").randomUUID()}.png`;
        await safeWrite(path.join(directory, name), buffer);
        return `assets/${name}`;
      });
      register("export", (html) => outputHtml(html));
      register("print", (html) => outputHtml(html, true));
      register("pdf", (html) => outputHtml(html, "pdf"));
      menu();
      material(settings.material || "glass");
      await win.loadFile(path.join(__dirname, "../dist/index.html"));
    })
    .catch((error) => {
      dialog.showErrorBox("DEFT could not start", error.message);
      app.quit();
    });
