import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(projectRoot, "public");
const speedDir = path.join(publicDir, "__speed");
const payloadSize = 4 * 1024 * 1024;

await mkdir(speedDir, { recursive: true });
await writeFile(path.join(speedDir, "payload.bin"), randomBytes(payloadSize));
await writeFile(
  path.join(publicDir, "probe.txt"),
  `2024612-speed-probe\n${new Date().toISOString()}\n`,
  "utf8"
);

console.log(`Generated ${payloadSize / 1024 / 1024} MiB speed-test payload in public/__speed/.`);
