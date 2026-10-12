// Futtatás: npm test (vagy: node --test teszt/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { osszefesul, osszefesulTerkep, fajlnevNevbol, keszitTarolo } from "../tarolo.js";
import { esc, szoveg, osszesOtlet, hozzaszolasokCelonkent, valaszokKerdesre, megvalaszolatlanok, ujdonsagok, fejezetOsszesites } from "../logika.js";

test("fájlnév a névből: ékezet nélkül, biztonságos", () => {
  assert.equal(fajlnevNevbol("Lackó"), "lacko.json");
  assert.equal(fajlnevNevbol("Péter Ödön"), "peter-odon.json");
  assert.equal(fajlnevNevbol("../../claude/allapot"), "claude-allapot.json");
  assert.equal(fajlnevNevbol("!!!"), null);
});

test("összefésülés: bejegyzésenként a frissebb nyer, a régi nem írja felül", () => {
  const helyi = { a: { szoveg: "x", modositva: "2026-10-13T10:00:00Z" }, b: { szoveg: "y", modositva: "2026-10-13T08:00:00Z" } };
  const tavoli = { a: { szoveg: "X", modositva: "2026-10-13T09:00:00Z" }, b: { szoveg: "Y", modositva: "2026-10-13T09:00:00Z" }, c: { szoveg: "Z" } };
  const r = osszefesulTerkep(helyi, tavoli);
  assert.equal(r.a.szoveg, "x");
  assert.equal(r.b.szoveg, "Y");
  assert.equal(r.c.szoveg, "Z");
  const teljes = osszefesul({ nev: "Lackó", otletek: {} }, { valaszok: tavoli });
  assert.equal(teljes.nev, "Lackó");
  assert.equal(teljes.valaszok.c.szoveg, "Z");
});

/* --- szimulált GitHub Contents API (adat/ + claude/) --- */
function hamisGithub() {
  const fajlok = new Map(); let n = 0;
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  async function fetchImpl(url, opt = {}) {
    const m = url.match(/contents\/(.+)$/);
    const ut = m[1];
    const valasz = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (ut === "adat") return valasz(200, [...fajlok.keys()].filter((k) => k.startsWith("adat/")).map((k) => ({ name: k.slice(5), type: "file" })));
    const van = fajlok.get(ut);
    if ((opt.method || "GET") === "GET") return van ? valasz(200, { sha: van.sha, content: b64(van.tartalom) }) : valasz(404, {});
    const torzs = JSON.parse(opt.body);
    if (van && torzs.sha !== van.sha) return valasz(409, {});
    if (!van && torzs.sha) return valasz(409, {});
    if (van && !torzs.sha) return valasz(422, {});
    const sha = "s" + ++n;
    fajlok.set(ut, { sha, tartalom: Buffer.from(torzs.content, "base64").toString("utf8") });
    return valasz(201, { content: { sha } });
  }
  return { fetchImpl, olvas: (f) => JSON.parse(fajlok.get(f).tartalom), ir: (f, s) => fajlok.set(f, { sha: "c" + ++n, tartalom: s }) };
}
function tar() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; }

test("két ember: mindenki a sajátját írja, mindenkiét látja; a claude/ fájl olvasható", async () => {
  const gh = hamisGithub();
  gh.ir("claude/allapot.json", JSON.stringify({ kerdesek: [{ id: "k1", cim: "Kérdés" }] }));
  const lacko = keszitTarolo({ repo: "x/y", token: "t", fetchImpl: gh.fetchImpl, tarhely: tar() });
  const endy = keszitTarolo({ repo: "x/y", token: "t", fetchImpl: gh.fetchImpl, tarhely: tar() });
  lacko.nevBeallit("lacko.json", "Lackó");
  lacko.modosit("lacko.json", "valaszok", "k1", { valasztas: "a", szoveg: "Szerintem így jó." });
  assert.deepEqual(await lacko.feltolt("lacko.json"), { mentve: true });
  endy.modosit("endy.json", "otletek", "o1", { fejezet: "Járművek", szoveg: "Kerékpár is legyen" });
  assert.deepEqual(await endy.feltolt("endy.json"), { mentve: true });
  const r = await endy.mindetBetolt("endy.json");
  assert.equal(r.ok, true);
  assert.equal(r.emberek["lacko.json"].valaszok.k1.valasztas, "a");
  assert.equal(r.emberek["endy.json"].otletek.o1.szoveg, "Kerékpár is legyen");
  const a = await endy.nyersOlvas("claude/allapot.json");
  assert.equal(JSON.parse(a.szoveg).kerdesek[0].cim, "Kérdés");
  const nincs = await endy.nyersOlvas("claude/nincs.md");
  assert.deepEqual([nincs.ok, nincs.szoveg], [true, null]);
});

test("ugyanaz az ember két lapon: az ütközés (409) után egyik módosítás sem vész el", async () => {
  const gh = hamisGithub();
  const lap1 = keszitTarolo({ repo: "x/y", token: "t", fetchImpl: gh.fetchImpl, tarhely: tar() });
  const lap2 = keszitTarolo({ repo: "x/y", token: "t", fetchImpl: gh.fetchImpl, tarhely: tar() });
  lap1.modosit("lacko.json", "otletek", "w1", { szoveg: "Csónak" });
  await lap1.feltolt("lacko.json");
  await lap2.mindetBetolt("lacko.json");
  lap1.modosit("lacko.json", "otletek", "w2", { szoveg: "Helikopter" });
  await lap1.feltolt("lacko.json");
  lap2.modosit("lacko.json", "otletek", "w3", { szoveg: "Motor" });
  assert.deepEqual(await lap2.feltolt("lacko.json"), { mentve: true });
  assert.deepEqual(Object.keys(gh.olvas("adat/lacko.json").otletek).sort(), ["w1", "w2", "w3"]);
});

test("hálózati hiba: nem dob, mentve:false, és a helyi adat megmarad", async () => {
  const t = keszitTarolo({ repo: "x/y", token: "t", fetchImpl: async () => { throw new Error("offline"); }, tarhely: tar() });
  t.modosit("lacko.json", "otletek", "o1", { szoveg: "x" });
  const r = await t.feltolt("lacko.json");
  assert.equal(r.mentve, false);
  assert.equal(t.helyiOlvas("lacko.json").otletek.o1.szoveg, "x");
  const b = await t.mindetBetolt("lacko.json");
  assert.equal(b.ok, false);
  assert.equal(b.emberek["lacko.json"].otletek.o1.szoveg, "x");
  const ny = await t.nyersOlvas("claude/allapot.json");
  assert.equal(ny.ok, false);
});

/* --- logika --- */
const EMBEREK = {
  "lacko.json": {
    nev: "Lackó",
    valaszok: { k1: { valasztas: "a", szoveg: "", modositva: "2026-10-14T10:00:00Z" } },
    otletek: {
      o1: { fejezet: "Járművek", szoveg: "Csónak", letrehozva: "2026-10-14T09:00:00Z", modositva: "2026-10-14T09:00:00Z" },
      o2: { szoveg: "törölt", torolve: true, letrehozva: "2026-10-14T09:30:00Z" },
    },
    hozzaszolasok: { h1: { cel: "endy.json/x1", szoveg: "Jó ötlet", letrehozva: "2026-10-14T11:00:00Z" } },
  },
  "endy.json": { nev: "Endy", otletek: { x1: { szoveg: "Kerékpár", letrehozva: "2026-10-13T20:00:00Z" } } },
};
const ALLAPOT = {
  kerdesek: [{ id: "k1", cim: "Világ" }, { id: "k2", cim: "Raid" }, { id: "k3", cim: "Kész", allapot: "lezarva" }],
  fejezetek: [{ allapot: "eldontve" }, { allapot: "eldontve" }, { allapot: "kovetkezo" }, { allapot: "rossz" }],
  ujdonsagok: [{ datum: "2026-10-14T08:00:00Z", szoveg: "Frissítés" }, { datum: "2026-10-01T08:00:00Z", szoveg: "Régi" }],
};

test("ötletek: a törölt kimarad, a legújabb elöl; hozzászólások célonként", () => {
  const o = osszesOtlet(EMBEREK);
  assert.deepEqual(o.map((x) => x.szoveg), ["Csónak", "Kerékpár"]);
  assert.equal(o[0].nev, "Lackó");
  assert.equal(hozzaszolasokCelonkent(EMBEREK)["endy.json/x1"][0].szoveg, "Jó ötlet");
});

test("kérdések: válaszok, megválaszolatlanok, a lezárt nem számít", () => {
  assert.equal(valaszokKerdesre(EMBEREK, "k1")[0].valasztas, "a");
  assert.deepEqual(megvalaszolatlanok(ALLAPOT, EMBEREK, "lacko.json").map((k) => k.id), ["k2"]);
  assert.deepEqual(megvalaszolatlanok(ALLAPOT, EMBEREK, "endy.json").map((k) => k.id), ["k1", "k2"]);
});

test("újdonságok: csak a MÁSOK által, az adott idő óta történtek + Claude frissítései", () => {
  const u = ujdonsagok(EMBEREK, "endy.json", "2026-10-14T00:00:00Z", ALLAPOT);
  assert.deepEqual(u.map((x) => x.ki), ["Lackó", "Lackó", "Lackó", "Claude"]);
  assert.ok(!u.some((x) => x.mit.includes("Kerékpár")));
  assert.ok(!u.some((x) => x.mit === "Régi"));
});

test("fejezet-összesítés: ismeretlen állapotot nem számol", () => {
  assert.deepEqual(fejezetOsszesites(ALLAPOT), { eldontve: 2, reszben: 0, kovetkezo: 1, hatravan: 0, osszes: 4 });
});

test("rosszindulatú adat: esc() semlegesít, a nem-szöveg mező üres lesz", () => {
  const rossz = '<img src=x onerror="alert(1)">';
  assert.equal(esc(rossz), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(szoveg({ toString: () => rossz }), "");
  const emb = { "x.json": { nev: { a: 1 }, otletek: { o: { szoveg: rossz, fejezet: 5, letrehozva: 12 } } } };
  const o = osszesOtlet(emb)[0];
  assert.equal(o.nev, "x");
  assert.equal(o.fejezet, "");
  assert.equal(o.letrehozva, "");
  assert.ok(!esc(o.szoveg).includes("<"));
  assert.deepEqual(osszesOtlet({ "y.json": { otletek: "nem objektum" } }), []);
  assert.deepEqual(valaszokKerdesre({ "y.json": { valaszok: [1, 2] } }, "0"), []);
});
