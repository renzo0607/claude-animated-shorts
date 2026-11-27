import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
const [id, out, from, to, scale = "1", conc = "4"] = process.argv.slice(2);
const chromiumOptions = { gl: process.env.GL || "swangle" };
const browserExecutable = "/opt/pw-browsers/chromium";
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id, chromiumOptions, browserExecutable });
const t0 = Date.now();
await renderMedia({ composition, serveUrl, codec: "h264", crf: 16, outputLocation: out, scale: Number(scale), frameRange: [Number(from), Number(to)],
  concurrency: Number(conc), inputProps: process.env.PROPS ? JSON.parse(process.env.PROPS) : {}, chromiumOptions, browserExecutable, timeoutInMilliseconds: 600000,
  onProgress: ({ renderedFrames }) => { console.log("frames", renderedFrames, ((Date.now() - t0) / 1000).toFixed(0) + "s"); } });
console.log("done", ((Date.now() - t0) / 1000).toFixed(1) + "s");
