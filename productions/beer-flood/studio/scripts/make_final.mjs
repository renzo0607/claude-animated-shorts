// One command for the final short on your own PC (needs Node 18+, Python 3 with numpy + scipy, ffmpeg):
//   node scripts/make_final.mjs            -> aligns voice/voice.wav, makes the sound, renders 2K video, muxes
//   node scripts/make_final.mjs --preview  -> fast half-size preview instead of 2K
// Put your recording at voice/voice.wav first (any sample rate; it is converted to 48 kHz mono).
import { execSync } from "node:child_process";
import fs from "node:fs";
const preview = process.argv.includes("--preview");
const py = process.platform === "win32" ? "python" : "python3";
const run = (c) => { console.log("\n> " + c); execSync(c, { stdio: "inherit" }); };
fs.mkdirSync("out/beer/audio", { recursive: true });
if (fs.existsSync("voice/voice.wav")) {
  run(`ffmpeg -y -loglevel error -i voice/voice.wav -ar 48000 -ac 1 -c:a pcm_s24le voice/voice48.wav`);
  const keep = process.argv.includes("--keep-words") || fs.existsSync("voice/asr_words.json");
  if (keep) console.log("Keeping voice/words.json (speech-recognition timings).");
  else run(`${py} scripts/align_voice.py SCRIPT.md voice/voice48.wav voice/words.json`);
  fs.copyFileSync("voice/words.json", "src/videos/beer/words.json");
  run(`${py} audio/beer_audio.py voice/words.json out/beer/audio voice/voice48.wav`);
} else {
  console.log("No voice/voice.wav yet: using the estimated timings, music + effects only.");
  run(`${py} audio/beer_audio.py voice/words.json out/beer/audio`);
}
const props = preview ? `--scale 0.5 --props "{\\"post\\":{\\"dpr\\":0.5,\\"msaa\\":2,\\"shadow\\":1024}}"` : "--scale 1.3333";
run(`npx remotion render src/index.ts BeerFlood out/beer/video.mp4 --codec h264 --crf ${preview ? 20 : 16} ${props}`);
const final = preview ? "out/beer/preview.mp4" : "out/beer/final_2k.mp4";
run(`ffmpeg -y -loglevel error -i out/beer/video.mp4 -i out/beer/audio/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -shortest ${final}`);
console.log("\nDone: " + final);
