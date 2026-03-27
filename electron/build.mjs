/**
 * electron/build.mjs
 *
 * 编译 electron TypeScript 文件为 CJS（供 electron-builder 使用）
 * 用法：node electron/build.mjs
 */

import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const electronFiles = [
  {
    entry: path.join(__dirname, "main.ts"),
    outfile: path.join(__dirname, "main.cjs"),
    format: "cjs",
  },
  {
    entry: path.join(__dirname, "preload.ts"),
    outfile: path.join(__dirname, "preload.cjs"),
    format: "cjs",
  },
];

for (const f of electronFiles) {
  await esbuild.build({
    entryPoints: [f.entry],
    outfile: f.outfile,
    bundle: true,
    platform: "node",
    format: f.format,
    target: "node18",
    sourcemap: false,
    minify: false,
    external: ["electron", "node:*"],
  });
  console.log(`✅ Compiled: ${path.basename(f.entry)} → ${path.basename(f.outfile)}`);
}

console.log("Electron build complete.");
