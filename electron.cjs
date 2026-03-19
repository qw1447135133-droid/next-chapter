const { app, BrowserWindow } = require('electron');
const path = require('path');

// 判断是否开发模式
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  if (isDev) {
    // 开发模式：加载本地服务器
    win.loadURL('http://localhost:8080');
    win.webContents.openDevTools();
  } else {
    // 生产模式：使用 file:// 协议加载
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');
    const fileUrl = 'file:///' + indexPath.replace(/\\/g, '/');
    win.loadURL(fileUrl);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});