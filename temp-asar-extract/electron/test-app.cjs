const { app, BrowserWindow } = require('electron');

console.log('app:', typeof app);
console.log('BrowserWindow:', typeof BrowserWindow);

app.whenReady().then(() => {
  console.log('App is ready!');
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadURL('https://example.com');
  console.log('Window created and loading example.com');
});