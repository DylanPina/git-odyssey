import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..");

const requiredPaths = [
  path.join(repoRoot, "frontend", "dist", "index.html"),
  path.join(desktopDir, "dist", "main.js"),
  path.join(desktopDir, "dist", "preload.js"),
];

for (const targetPath of requiredPaths) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Desktop smoke check failed. Missing required artifact: ${targetPath}`);
  }
}

console.log("Desktop smoke check passed.");
