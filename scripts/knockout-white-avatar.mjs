/**
 * One-off / maintenance: make near-white pixels transparent on public/home-agent-ai-avatar.png
 * Run: npm i -D sharp && node scripts/knockout-white-avatar.mjs && npm uninstall sharp
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const target = join(root, "public", "home-agent-ai-avatar.png");

const sharp = (await import("sharp")).default;

const { data, info } = await sharp(await readFile(target)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
if (channels !== 4) {
  throw new Error(`Expected RGBA, got ${channels} channels`);
}

const fuzz = 32;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r >= 255 - fuzz && g >= 255 - fuzz && b >= 255 - fuzz) {
    data[i + 3] = 0;
  }
}

const out = await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }).png().toBuffer();
const tmp = join(root, "public", "home-agent-ai-avatar.png.tmp");
await writeFile(tmp, out);
await rename(tmp, target);
console.log("Updated", target, `${width}x${height}`);
