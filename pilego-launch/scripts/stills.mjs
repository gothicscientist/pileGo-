// Renders frames of a composition to JPEGs and a labelled contact sheet, for
// checking motion, clipping and overlaps without rendering the whole film.
// Usage: node scripts/stills.mjs <compositionId> <outDir> <scale> <frame> [frame…]
//        node scripts/stills.mjs LaunchFilm out/sheet 0.25 every:15
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [id, outDir, scaleArg, ...frameArgs] = process.argv.slice(2);
const scale = Number(scaleArg ?? 0.5);
mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id });

let frames = [];
for (const a of frameArgs) {
  if (a.startsWith("every:")) {
    const step = Number(a.slice(6));
    for (let f = 0; f < composition.durationInFrames; f += step) frames.push(f);
  } else frames.push(Number(a));
}

const files = [];
const queue = [...frames];
const worker = async () => {
  while (queue.length) {
    const frame = queue.shift();
    const output = path.join(outDir, `${id}-${String(frame).padStart(4, "0")}.jpg`);
    await renderStill({ serveUrl, composition, frame, output, scale, imageFormat: "jpeg", jpegQuality: 85 });
    files.push(output);
  }
};
await Promise.all([worker(), worker(), worker(), worker()]);
files.sort();
execFileSync("python3", [path.resolve("scripts/contact-sheet.py"), path.join(outDir, `${id}-sheet.jpg`), ...files], { stdio: "inherit" });
console.log(`${files.length} frames → ${outDir}`);
