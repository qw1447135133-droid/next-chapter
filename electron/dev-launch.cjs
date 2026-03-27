const http = require('node:http');
const { spawn } = require('node:child_process');

const url = 'http://localhost:8080';
const timeoutMs = 30000;
const start = Date.now();

function waitForServer() {
  http.get(url, (res) => {
    res.resume();
    if (res.statusCode && res.statusCode < 500) {
      launchElectron();
      return;
    }
    retry();
  }).on('error', retry);
}

function retry() {
  if (Date.now() - start > timeoutMs) {
    console.error(`Timed out waiting for ${url}`);
    process.exit(1);
    return;
  }
  setTimeout(waitForServer, 500);
}

function launchElectron() {
  const env = { ...process.env, VITE_DEV_SERVER_URL: url };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn('electron', ['.'], {
    stdio: 'inherit',
    shell: true,
    env,
  });

  child.on('exit', () => {
    process.exit(0);
  });
}

waitForServer();
