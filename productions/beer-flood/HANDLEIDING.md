# Handleiding: "The Wave Made of Beer" afmaken op je eigen pc

De hele video staat als code in `studio/`. Op een pc met een videokaart rendert de 2K-versie in ongeveer 10 tot 20 minuten.

## 1. Eenmalig installeren
1. **Node.js** (versie 18 of nieuwer): https://nodejs.org (de "LTS"-knop).
2. **Python 3**: https://www.python.org. Vink bij installatie op Windows "Add Python to PATH" aan.
   Daarna in een terminal: `pip install numpy scipy`
3. **ffmpeg**:
   - Windows: `winget install ffmpeg`
   - Mac: `brew install ffmpeg`
4. Download deze repository (groene knop **Code → Download ZIP**, of `git clone`). Kies daarbij de branch `claude/vyrn-youtube-content-8w0a1v`.
5. Open een terminal in de map `productions/beer-flood/studio` en typ: `npm install`

## 2. Voice-over opnemen
- Lees het script uit `SCRIPT.md` in één rustige, vlotte toon voor. Zet er geen muziek onder.
- Sla de opname op als `studio/voice/voice.wav`. Elke samplerate werkt, het script zet hem zelf om.
- Begin direct te praten en stop meteen na het laatste woord ("lost").

## 3. Video maken
In de map `studio`:
- **Snelle preview** (halve resolutie): `npm run preview` → resultaat in `out/beer/preview.mp4`
- **Definitieve 2K-versie** (1440×2560): `npm run final` → resultaat in `out/beer/final_2k.mp4`

Dit gebeurt er automatisch:
1. Je opname wordt omgezet naar 48 kHz.
2. De woorden van het script worden op je stem uitgelijnd (`voice/words.json`). Alle shots, camerabewegingen en effecten verschuiven daarin mee.
3. De geluidseffecten en de muziek worden opnieuw gemaakt en gemixt (muziek +3 dB, effecten −6 dB, stem onveranderd).
4. De video wordt gerenderd en samengevoegd met de audio.

## 4. Timing bijstellen (optioneel)
- De automatische uitlijning zit meestal binnen ongeveer 0,1 seconde. Valt een effect net verkeerd, open dan `voice/words.json` en pas de `s` (starttijd in seconden) van dat woord aan.
- Draai daarna `node scripts/make_final.mjs --keep-words`. Je aanpassingen blijven dan bewaard.
- Live meekijken en scrubben: `npm run studio`

## Tips
- YouTube Shorts mogen tegenwoordig tot 3 minuten duren. Deze video (~68 s, verticaal) telt dus gewoon als Short.
- Titelidee: *"London Was Hit by a Tidal Wave of Beer"*. Voor thumbnail-ideeën kan ik je ook helpen.
