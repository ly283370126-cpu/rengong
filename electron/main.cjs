const { app, BrowserWindow, dialog, session, shell } = require("electron");
const path = require("node:path");
const { startLocalServer } = require("./local-server.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let server;

async function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 390,
    minHeight: 720,
    title: "星灵桌面智能",
    backgroundColor: "#f8fbff",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    server = await startLocalServer({
      port: Number(process.env.PORT || 0),
      staticDir: path.join(__dirname, "../dist"),
      envDir: app.getPath("userData")
    });
    void win.loadURL(server.url);
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media" || permission === "mediaKeySystem");
  });

  void createWindow().catch((error) => {
    dialog.showErrorBox("Voice Orb Assistant 启动失败", error instanceof Error ? error.message : String(error));
    app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (server?.close) server.close();
  if (process.platform !== "darwin") app.quit();
});
