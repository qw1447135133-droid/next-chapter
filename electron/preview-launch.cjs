const { spawn } = require("node:child_process");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const launcher = process.platform === "win32" ? "npx.cmd" : "npx";

const child = spawn(launcher, ["electron", "."], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

child.on("error", (error) => {
  console.error("[preview-launch] Failed to start Electron:", error);
  process.exit(1);
});
