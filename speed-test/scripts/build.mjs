import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src");
const output = path.join(root, "dist");
const speedDir = path.join(output, "__speed");

await rm(output, { recursive: true, force: true });
await mkdir(speedDir, { recursive: true });
await cp(source, output, { recursive: true });

// A deterministic 4 MiB payload keeps deployments reproducible while still
// being large enough for a useful browser-side throughput sample.
const payload = Buffer.allocUnsafe(4 * 1024 * 1024);
for (let index = 0; index < payload.length; index += 1) {
  payload[index] = (index * 31 + 17) & 0xff;
}

await writeFile(path.join(speedDir, "payload.bin"), payload);
await writeFile(path.join(output, "probe.txt"), `2024612-speed-probe\n${Date.now()}\n`, "utf8");

console.log(`Built ${output} with a ${payload.length / 1024 / 1024} MiB test payload.`);
