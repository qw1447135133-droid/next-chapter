import fs from "node:fs";
import path from "node:path";

const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("config", "builtin-api.template.json");
const targetPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve("config", "builtin-api.json");

const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));

console.log(`Wrote builtin API config: ${targetPath}`);
