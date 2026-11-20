// Neon Shore entry program: copies app/ and screenshots/ from this
// repository into the output directory and writes dossier.json with the
// kit's buildDossier library. Node 22, standard library only.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-app.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || "/output");

const appSource = join(repoRoot, "app");
const shotsSource = join(repoRoot, "screenshots");
const appOut = join(outputDir, "app");
const shotsOut = join(outputDir, "screenshots");

if (!existsSync(appSource)) {
  throw new Error(`missing app/ directory: ${appSource}`);
}
if (!existsSync(shotsSource)) {
  throw new Error(`missing screenshots/ directory: ${shotsSource}`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(appOut, { recursive: true });
mkdirSync(shotsOut, { recursive: true });

cpSync(appSource, appOut, { recursive: true });
cpSync(shotsSource, shotsOut, { recursive: true });

const dossier = buildDossier(outputDir, { text_max_bytes: 163840 });
const bytes = dossier instanceof Uint8Array ? dossier : Buffer.from(String(dossier), "utf8");
writeFileSync(join(outputDir, "dossier.json"), bytes);
console.log(`wrote ${outputDir}/dossier.json (${bytes.length} bytes)`);
