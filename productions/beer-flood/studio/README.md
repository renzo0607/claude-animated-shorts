# VYRN studio: "The Wave Made of Beer"
Remotion + three.js project for the London Beer Flood short (built with the cartoon-3d-short skill).
- `src/videos/beer/`: story.ts (word-timed shots, cameras, events), world.ts (sets, vats, wall, wave), cast.ts (characters, fx).
- `voice/words.json`: word timings. Currently ESTIMATED; replace with the real voice.wav timings and everything re-times.
- `audio/beer_audio.py`: synthesized SFX + original score + mix.
- Stills: `node scripts/stills.mjs BeerFlood out/beer/x_ 100,400 0.5`
- Final: `npx remotion render src/index.ts BeerFlood out/beer/video.mp4 --codec h264 --crf 16 --scale 1.3333`, then mux mix.wav.
Setup: `npm i`, copy `templates/bridge/` to `src/videos/bridge/` (Root.tsx also registers BridgeShort).
