// usage: node scripts/render_chunks.mjs <outDir> [chunk=150] [conc=1] [worker=0] [workers=1]  (skips chunks already rendered)
// Keep conc at 1: with several tabs in one headless browser the background tabs render a tiled 720p canvas.
// For parallelism start several processes (one browser each) with different worker indices.
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
const [outDir, chunk = "150", conc = "1", worker = "0", workers = "1"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const inputProps = process.env.PROPS ? JSON.parse(process.env.PROPS) : {};
const chromiumOptions = { gl: "swangle" }, browserExecutable = "/opt/pw-browsers/chromium";
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: "PisaShort", chromiumOptions, browserExecutable, inputProps });
const C = Number(chunk), T = composition.durationInFrames;
for (let a = 0, k = 0; a < T; a += C, k++) {
  if (k % Number(workers) !== Number(worker)) continue;
  const b = Math.min(T - 1, a + C - 1), out = path.join(outDir, `c_${String(a).padStart(4, "0")}.mp4`);
  if (fs.existsSync(out)) continue;
  const t0 = Date.now();
  await renderMedia({ composition, serveUrl, codec: "h264", crf: 17, outputLocation: out + ".tmp.mp4", frameRange: [a, b], concurrency: Number(conc),
    chromiumOptions, browserExecutable, inputProps, timeoutInMilliseconds: 900000, muted: true });
  fs.renameSync(out + ".tmp.mp4", out);
  console.log(new Date().toISOString(), "chunk", a, b, ((Date.now() - t0) / 1000).toFixed(0) + "s");
}
console.log("WORKER DONE", worker);
