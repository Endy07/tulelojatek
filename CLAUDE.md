# CLAUDE.md — Túlélőjáték közös tervezőoldal

https://endy07.github.io/tulelojatek/ — a Túlélőjáték GDD-jének közös oldala. A felhasználó és Lackó itt követi az állást,
válaszol a kérdésekre, ötletel és diktál. Szerver nincs: a böngésző a GitHub Contents API-n egy **külön, privát
adatrepót** (`Endy07/tulelojatek-adat`) olvas és ír. Ez a repó nyilvános, és csak a keretet tartalmazza.

A teljes leírás, a döntések indoklása és a hibamentes újraépítés a szülőmappában van: `../docs/runbook-kozos-oldal.md`.

## Fájlok

| Fájl | Szerep |
|---|---|
| `index.html` | Felület + stílus (témafüggő tokenek, világos/sötét, mobilra tervezve). CDN: marked + DOMPurify, SRI-vel. |
| `app.js` | Felület: fülek, kérdések, ötletek, hozzászólások, Markdown-nézet, diktálás, mentési sor. |
| `logika.js` | Tiszta függvények (DOM nélkül): szűrés, összesítés, újdonságok. |
| `tarolo.js` | GitHub-tároló (az Ötletgép mintájára): helyi tár → hálózat, összefésülés, 409-kezelés, `nyersOlvas`. |
| `beallit.js` | Az adatrepó neve + a token 4 darabban (**nem titkosítás**, csak a titok-szkenner ellen). |
| `teszt/logika.test.mjs` | `npm test`: összefésülés, ütközés, hálózati hiba, XSS-adat. |

## Adatmodell (az adatrepóban)

- `claude/allapot.json`, `claude/jatekterv.md`, `claude/naplo.md`: **csak Claude írja** (git), a lap csak olvassa.
- `adat/<név>.json`: mindenki a sajátját írja, mindenkiét olvassa.
```json
{ "nev": "Lackó",
  "valaszok":      { "<kerdesId>": { "valasztas": "a", "szoveg": "…", "modositva": "ISO" } },
  "otletek":       { "<id>": { "fejezet": "Járművek", "szoveg": "…", "letrehozva": "ISO", "torolve": false, "modositva": "ISO" } },
  "hozzaszolasok": { "<id>": { "cel": "<fájl>/<otletId>", "szoveg": "…", "letrehozva": "ISO", "torolve": false, "modositva": "ISO" } } }
```
- Törlés: `torolve: true` (különben az összefésülés visszahozná).

## Szabályok

1. **Push előtt `git pull --rebase`.**
2. **Más fájljából jövő adat megbízhatatlan:** HTML-be csak `esc()`-en át, szöveg csak `szoveg()`-en át, idő csak `ido()`-n át. Markdown csak DOMPurify-on át. Új mező = új szűrés + teszt `<img onerror>` adattal.
3. A tároló szabályait (`tarolo.js` fejléce) ne lazítsd.
4. A token csak az adatrepó Contents jogát kaphatja. Csere: új token → publikálás → ellenőrzés → a régi visszavonása.
5. Teszt után az `adat/teszt-*.json` fájlokat töröld az adatrepóból.
