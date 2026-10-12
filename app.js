import { BEALLIT } from "./beallit.js";
import { keszitTarolo, fajlnevNevbol } from "./tarolo.js";
import {
  esc, szoveg, ido, ujId, nevFajlhoz, osszesOtlet, hozzaszolasokCelonkent, valaszokKerdesre, kerdesek,
  megvalaszolatlanok, ujdonsagok, fejezetOsszesites, datumKiir, OTLET_ALLAPOTOK, FEJEZET_ALLAPOTOK,
} from "./logika.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function helyi(kulcs, ertek) {
  try {
    if (ertek === undefined) return localStorage.getItem(kulcs);
    localStorage.setItem(kulcs, ertek);
  } catch { /* tiltott helyi tár */ }
  return null;
}

/* ---------- állapot ---------- */
const token = (BEALLIT.darabok || []).join("");
const tarolo = token ? keszitTarolo({ repo: BEALLIT.repo, token }) : null;
const A = {
  nev: "", fajl: "", emberek: {}, allapot: null, terv: null, naplo: null,
  betoltve: false, utolsoBetoltes: 0, ota: "", ful: "attekintes",
  piszkozat: {}, szuro: { fejezet: "", allapot: "" }, nyitottHozzaszolas: new Set(),
};

/* ---------- név ---------- */
function nevBeallit(nev) {
  nev = nev.trim().slice(0, 30);
  const f = fajlnevNevbol(nev);
  if (!f) return false;
  A.nev = nev; A.fajl = f;
  helyi("tulelo:nev", nev);
  $("#nev-kiir").textContent = nev;
  tarolo?.nevBeallit(f, nev);
  return true;
}

function nevKerdez() {
  $("#nev-modal").hidden = false;
  $("#nev-mezo").value = A.nev;
  setTimeout(() => $("#nev-mezo").focus(), 50);
}

$("#nev-urlap").addEventListener("submit", (e) => {
  e.preventDefault();
  const regi = A.fajl;
  if (!nevBeallit($("#nev-mezo").value)) return;
  $("#nev-modal").hidden = true;
  if (regi !== A.fajl) betolt(); else mentesKer();
});
$("#nev-csere").addEventListener("click", nevKerdez);

/* ---------- téma ---------- */
function temaAlkalmaz(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
temaAlkalmaz(helyi("tulelo:tema"));
$("#tema").addEventListener("click", () => {
  const sotet = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const uj = sotet ? "light" : "dark";
  helyi("tulelo:tema", uj);
  temaAlkalmaz(uj);
});

/* ---------- szinkron-jelző ---------- */
function szinkronJel(allapot, szov) {
  $("#szinkron-pont").className = `pont ${allapot}`;
  $("#szinkron-szoveg").textContent = szov;
}

/* ---------- mentés: gyűjtve, sorba láncolva ---------- */
let mentesIdozito = null, mentesLanc = Promise.resolve(), varakozoMentes = false;
function mentesKer() {
  if (!tarolo || !A.fajl) return;
  varakozoMentes = true;
  szinkronJel("var", "mentés…");
  clearTimeout(mentesIdozito);
  mentesIdozito = setTimeout(mentesMost, 1200);
}
function mentesMost() {
  clearTimeout(mentesIdozito);
  if (!varakozoMentes) return mentesLanc;
  varakozoMentes = false;
  const f = A.fajl;
  mentesLanc = mentesLanc.then(async () => {
    const r = await tarolo.feltolt(f);
    if (r.mentve) szinkronJel("ok", "mentve");
    else { szinkronJel("hiba", `nincs mentve (${r.hiba}) – újrapróba`); setTimeout(() => { varakozoMentes = true; mentesMost(); }, 15000); }
  });
  return mentesLanc;
}
addEventListener("pagehide", () => { if (varakozoMentes) mentesMost(); });

function modosit(terkep, id, ertek) {
  A.emberek[A.fajl] = tarolo.modosit(A.fajl, terkep, id, ertek);
  mentesKer();
}

/* ---------- betöltés ---------- */
async function betolt({ csendes = false } = {}) {
  if (!tarolo) {
    $("#globalis-uzenet").innerHTML = `<div class="uzenet hiba">Az oldal még nincs összekötve az adattárral (hiányzik a kulcs). Szólj annak, akitől a linket kaptad.</div>`;
    $("#ful-attekintes").innerHTML = "";
    szinkronJel("hiba", "nincs kulcs");
    return;
  }
  if (!csendes) szinkronJel("var", "betöltés…");
  const [emb, all, terv, naplo] = await Promise.all([
    tarolo.mindetBetolt(A.fajl),
    tarolo.nyersOlvas("claude/allapot.json"),
    tarolo.nyersOlvas("claude/jatekterv.md"),
    tarolo.nyersOlvas("claude/naplo.md"),
  ]);
  A.emberek = emb.emberek;
  if (all.ok && all.szoveg) { try { A.allapot = JSON.parse(all.szoveg); } catch { A.allapot = A.allapot ?? null; } }
  if (terv.ok && terv.szoveg !== null) A.terv = terv.szoveg;
  if (naplo.ok && naplo.szoveg !== null) A.naplo = naplo.szoveg;
  A.utolsoBetoltes = Date.now();
  const hiba = !emb.ok ? emb.hiba : (!all.ok ? all.hiba : "");
  $("#globalis-uzenet").innerHTML = hiba
    ? `<div class="uzenet">Nem sikerült mindent betölteni (${esc(hiba)}). Amit írsz, ezen a gépen megmarad, és később feltöltődik.</div>` : "";
  if (emb.sajatValtozott) mentesKer(); else szinkronJel(hiba ? "hiba" : "ok", hiba ? "offline" : "naprakész");
  if (!A.betoltve) {
    A.betoltve = true;
    A.ota = helyi(`tulelo:utolso:${A.fajl}`) || "";
    helyi(`tulelo:utolso:${A.fajl}`, new Date().toISOString());
  }
  rajzolMind();
}

$("#frissit").addEventListener("click", () => betolt());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && A.betoltve && Date.now() - A.utolsoBetoltes > 60000) betolt({ csendes: true });
});

/* ---------- fülek ---------- */
function fulValt(ful) {
  A.ful = ful;
  helyi("tulelo:ful", ful);
  for (const b of $$("nav.fulek button")) b.setAttribute("aria-selected", String(b.dataset.ful === ful));
  for (const s of $$("main > section")) s.hidden = s.id !== `ful-${ful}`;
  scrollTo({ top: 0 });
}
for (const b of $$("nav.fulek button")) b.addEventListener("click", () => fulValt(b.dataset.ful));

/* ---------- piszkozatok: egy újrarajzolás ne vigye el a félig írt szöveget ---------- */
document.addEventListener("input", (e) => {
  const k = e.target?.dataset?.piszkozat;
  if (k) A.piszkozat[k] = e.target.value;
});
function piszkozat(k, alap = "") { return A.piszkozat[k] ?? alap; }

/* ---------- diktálás ---------- */
const Felismero = window.SpeechRecognition || window.webkitSpeechRecognition;
function szovegDoboz(kulcs, { helyorzo = "", alap = "", sorok = 4 } = {}) {
  return `<div class="szoveg-doboz">
    <textarea rows="${sorok}" data-piszkozat="${esc(kulcs)}" placeholder="${esc(helyorzo)}">${esc(piszkozat(kulcs, alap))}</textarea>
    ${Felismero ? `<button type="button" class="mikrofon" title="Diktálás" aria-label="Diktálás">🎤</button>` : ""}
  </div>`;
}
let aktivFelismero = null;
document.addEventListener("click", (e) => {
  const gomb = e.target.closest?.(".mikrofon");
  if (!gomb) return;
  const ta = gomb.parentElement.querySelector("textarea");
  if (aktivFelismero) { aktivFelismero.stop(); return; }
  const r = new Felismero();
  r.lang = "hu-HU"; r.continuous = false; r.interimResults = false;
  r.onresult = (ev) => {
    let uj = "";
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) if (ev.results[i].isFinal) uj += ev.results[i][0].transcript;
    uj = uj.trim();
    if (!uj) return;
    ta.value = (ta.value.trim() ? ta.value.trimEnd() + " " : "") + uj;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };
  r.onend = () => { gomb.classList.remove("felvesz"); aktivFelismero = null; };
  r.onerror = () => { gomb.classList.remove("felvesz"); aktivFelismero = null; };
  aktivFelismero = r;
  gomb.classList.add("felvesz");
  try { r.start(); } catch { r.onend(); }
});
const DIKTALAS_TIPP = Felismero
  ? "Tipp: a 🎤 gombbal diktálhatsz (szünet után megáll, újra bökve folytatja), vagy használd a billentyűzet mikrofonját."
  : "Tipp: diktálni a telefon billentyűzetének mikrofon-gombjával tudsz.";

/* ---------- közös elemek ---------- */
function fejezetLista() {
  const f = Array.isArray(A.allapot?.fejezetek) ? A.allapot.fejezetek : [];
  return ["Általános", ...f.map((x) => szoveg(x?.cim, 80)).filter(Boolean)];
}
function cimke(osztaly, szov) { return `<span class="cimke ${esc(osztaly)}">${esc(szov)}</span>`; }

function rajzolMind() {
  rajzolAttekintes();
  rajzolKerdesek();
  rajzolOtletek();
  rajzolMarkdown("#terv-tartalom", A.terv, { nyitva: /^(➡️|Hol tartunk|Egy mondatban)/, hozzaszolhato: true });
  rajzolMarkdown("#naplo-tartalom", A.naplo, { utolsoNyitva: 2 });
  const nyitott = megvalaszolatlanok(A.allapot, A.emberek, A.fajl).length;
  $("#kerdes-szam").hidden = !nyitott; $("#kerdes-szam").textContent = nyitott;
  const ujOtlet = osszesOtlet(A.emberek).filter((o) => o.fajl !== A.fajl && A.ota && o.letrehozva > A.ota).length;
  $("#otlet-szam").hidden = !ujOtlet; $("#otlet-szam").textContent = ujOtlet;
}

/* ---------- Áttekintés ---------- */
function rajzolAttekintes() {
  const al = A.allapot;
  const ht = al?.holTartunk ?? {};
  const o = fejezetOsszesites(al);
  const szaz = (n) => (o.osszes ? (n / o.osszes) * 100 : 0);
  const ujd = ujdonsagok(A.emberek, A.fajl, A.ota, al).slice(0, 12);
  const nyitott = megvalaszolatlanok(al, A.emberek, A.fajl);
  const fejezetek = Array.isArray(al?.fejezetek) ? al.fejezetek : [];

  $("#ful-attekintes").innerHTML = `
    ${nyitott.length ? `<div class="kartya kiemelt">
      <h3>❓ ${nyitott.length} kérdés vár a válaszodra</h3>
      <p class="halvany">${esc(szoveg(ht.lackonak, 600))}</p>
      <button class="gomb" type="button" data-ugras="kerdesek">Kérdések megnyitása</button>
    </div>` : ""}
    <div class="kartya">
      <h3>📍 Hol tartunk</h3>
      <p>${esc(szoveg(ht.osszefoglalo, 1500))}</p>
      <p><b>Következő lépés:</b> ${esc(szoveg(ht.kovetkezo, 600))}</p>
      <div class="halado" aria-label="Haladás">
        <span style="width:${szaz(o.eldontve)}%;background:var(--ok)"></span>
        <span style="width:${szaz(o.reszben)}%;background:var(--warn)"></span>
        <span style="width:${szaz(o.kovetkezo)}%;background:var(--next)"></span>
      </div>
      <p class="halvany">${o.eldontve} eldöntve · ${o.reszben} részben · ${o.kovetkezo} következik · ${o.hatravan} hátravan
        ${al?.frissitve ? ` · Claude frissítette: ${esc(datumKiir(al.frissitve))}` : ""}</p>
    </div>
    <div class="kartya">
      <h3>🆕 ${A.ota ? "Újdonságok a legutóbbi látogatásod óta" : "Legutóbbi események"}</h3>
      ${ujd.length ? `<ul class="lista-ujdonsag">${ujd.map((u) => `<li><b>${esc(u.ki)}</b> ${esc(u.mit)} <span class="halvany">· ${esc(datumKiir(u.ido))}</span></li>`).join("")}</ul>`
        : `<p class="halvany">Nincs újdonság.</p>`}
    </div>
    <h2>Fejezetek</h2>
    <div class="fejezetek">
      ${fejezetek.map((f) => `<div class="fejezet-sor">
        <span class="sz">${esc(szoveg(f?.szam, 4))}</span>
        <span class="c">${esc(szoveg(f?.cim, 80))}${f?.megjegyzes ? `<small>${esc(szoveg(f.megjegyzes, 200))}</small>` : ""}</span>
        ${cimke(f?.allapot, FEJEZET_ALLAPOTOK[f?.allapot] ?? "")}
      </div>`).join("") || `<p class="halvany">Még nincs adat.</p>`}
    </div>
    <h2>Gyors ötlet</h2>
    <div class="kartya">
      <p class="halvany">Eszedbe jutott valami? Írd vagy diktáld ide, a részleteket ráérsz később.</p>
      ${szovegDoboz("gyors-otlet", { helyorzo: "pl. Lehessen a zombikat csalinak használni hússal…" })}
      <p class="halvany">${esc(DIKTALAS_TIPP)}</p>
      <div class="gombsor"><button class="gomb" type="button" data-gyors-otlet>Beküldöm</button></div>
    </div>`;
}

/* ---------- Kérdések ---------- */
function rajzolKerdesek() {
  const lista = kerdesek(A.allapot);
  const nyitottak = lista.filter((k) => k.allapot !== "lezarva");
  const lezartak = lista.filter((k) => k.allapot === "lezarva");
  const kartya = (k) => {
    const lehet = Array.isArray(k.lehetosegek) ? k.lehetosegek : [];
    const valaszok = valaszokKerdesre(A.emberek, k.id);
    const sajat = valaszok.find((v) => v.fajl === A.fajl);
    const lezart = k.allapot === "lezarva";
    const lehetCim = (id) => szoveg(lehet.find((l) => l?.id === id)?.cim, 200);
    return `<div class="kartya ${!lezart && !sajat ? "kiemelt" : ""}" data-kerdes="${esc(k.id)}">
      <div class="otlet-fej"><h3>${esc(szoveg(k.cim, 200))}</h3>
        ${lezart ? cimke("lezarva", "lezárva") : sajat ? cimke("bekerult", "válaszoltál") : cimke("uj", k.kinek === "mindenki" ? "mindenkinek" : `${szoveg(k.kinek, 30)} válaszát várjuk`)}</div>
      ${k.fejezet ? `<p class="halvany">Fejezet: ${esc(szoveg(k.fejezet, 10))}.</p>` : ""}
      <p>${esc(szoveg(k.kontextus, 2000))}</p>
      ${lezart ? "" : lehet.map((l) => {
        const id = szoveg(l?.id, 40), valasztott = sajat?.valasztas === id;
        return `<label class="lehetoseg ${valasztott ? "valasztott" : ""}">
          <input type="radio" name="k-${esc(k.id)}" value="${esc(id)}" ${valasztott ? "checked" : ""}>
          <span><b>${esc(szoveg(l?.cim, 200))}</b>${k.javaslat && k.javaslat === id ? `<span class="javasolt">✓ javaslat</span>` : ""}
          <small>${esc(szoveg(l?.leiras, 600))}</small></span></label>`;
      }).join("")}
      ${lezart ? "" : `<label class="mezo">Saját válasz, ötlet vagy megjegyzés</label>
        ${szovegDoboz(`valasz-${k.id}`, { helyorzo: "Írd vagy diktáld ide…", alap: sajat?.szoveg ?? "" })}
        <div class="gombsor"><button class="gomb" type="button" data-valasz-ment="${esc(k.id)}">Mentés</button>
        <span class="allapotjel" data-valasz-jel="${esc(k.id)}"></span></div>`}
      ${k.dontes ? `<div class="dontes"><b>Döntés:</b> ${esc(szoveg(k.dontes, 2000))}</div>` : ""}
      ${valaszok.length ? `<div class="masok"><b>Válaszok</b>${valaszok.map((v) => `<div class="masok-sor">
        <b>${esc(v.nev)}</b>${v.valasztas ? `: ${esc(lehetCim(v.valasztas) || v.valasztas)}` : ""}
        ${v.szoveg ? `<div class="otlet-szoveg">${esc(v.szoveg)}</div>` : ""}</div>`).join("")}</div>` : ""}
    </div>`;
  };
  $("#ful-kerdesek").innerHTML = `
    <p class="halvany">Válassz egy lehetőséget, és ha van saját ötleted, írd vagy diktáld le. A választás azonnal mentődik. ${esc(DIKTALAS_TIPP)}</p>
    ${nyitottak.map(kartya).join("") || `<div class="ures">Most nincs nyitott kérdés. 🎉</div>`}
    ${lezartak.length ? `<h2>Lezárt kérdések</h2>${lezartak.map(kartya).join("")}` : ""}`;
}

/* ---------- Ötletek ---------- */
function rajzolOtletek() {
  const fejezetek = fejezetLista();
  const statusz = A.allapot?.otletAllapot && typeof A.allapot.otletAllapot === "object" ? A.allapot.otletAllapot : {};
  const hsz = hozzaszolasokCelonkent(A.emberek);
  const osszes = osszesOtlet(A.emberek).map((o) => {
    const s = statusz[o.kulcs];
    const all = typeof s === "string" ? s : szoveg(s?.allapot, 20);
    return { ...o, allapot: Object.hasOwn(OTLET_ALLAPOTOK, all) ? all : "uj", claudeMegj: typeof s === "object" ? szoveg(s?.megjegyzes, 1000) : "" };
  });
  const lista = osszes.filter((o) => (!A.szuro.fejezet || o.fejezet === A.szuro.fejezet) && (!A.szuro.allapot || o.allapot === A.szuro.allapot));
  const elozetes = piszkozat("uj-otlet-fejezet", "Általános");

  $("#ful-otletek").innerHTML = `
    <div class="kartya">
      <h3>💡 Új ötlet</h3>
      <label class="mezo" for="uj-otlet-fejezet">Melyik részhez tartozik?</label>
      <select id="uj-otlet-fejezet" data-piszkozat="uj-otlet-fejezet">
        ${fejezetek.map((f) => `<option ${f === elozetes ? "selected" : ""}>${esc(f)}</option>`).join("")}
      </select>
      <label class="mezo">Az ötlet</label>
      ${szovegDoboz("uj-otlet", { helyorzo: "Írd vagy diktáld le az ötletedet…", sorok: 5 })}
      <p class="halvany">${esc(DIKTALAS_TIPP)}</p>
      <div class="gombsor"><button class="gomb" type="button" data-otlet-kuld>Beküldöm</button></div>
    </div>
    <h2>Az összes ötlet (${osszes.length})</h2>
    <div class="szuro">
      <select data-szuro="fejezet" aria-label="Szűrés fejezetre"><option value="">Minden fejezet</option>
        ${fejezetek.map((f) => `<option ${f === A.szuro.fejezet ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>
      <select data-szuro="allapot" aria-label="Szűrés állapotra"><option value="">Minden állapot</option>
        ${Object.entries(OTLET_ALLAPOTOK).map(([k, v]) => `<option value="${k}" ${k === A.szuro.allapot ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
    </div>
    ${lista.map((o) => {
      const h = hsz[o.kulcs] ?? [];
      const nyitva = A.nyitottHozzaszolas.has(o.kulcs);
      return `<div class="kartya" data-otlet="${esc(o.kulcs)}">
        <div class="otlet-fej"><span><b>${esc(o.nev)}</b> <span class="halvany">· ${esc(o.fejezet || "Általános")} · ${esc(datumKiir(o.letrehozva))}</span></span>
          ${cimke(o.allapot, OTLET_ALLAPOTOK[o.allapot])}</div>
        <div class="otlet-szoveg">${esc(o.szoveg)}</div>
        ${o.claudeMegj ? `<div class="dontes"><b>Claude:</b> ${esc(o.claudeMegj)}</div>` : ""}
        ${h.length ? `<div class="hozzaszolasok">${h.map((x) => `<div class="hozzaszolas"><b>${esc(x.nev)}:</b> ${esc(x.szoveg)}</div>`).join("")}</div>` : ""}
        ${nyitva ? `<label class="mezo">Hozzászólás</label>${szovegDoboz(`hsz-${o.kulcs}`, { helyorzo: "Mit szólsz hozzá?", sorok: 3 })}
          <div class="gombsor"><button class="gomb kicsi" type="button" data-hsz-kuld="${esc(o.kulcs)}">Elküldöm</button>
          <button class="gomb kicsi masodlagos" type="button" data-hsz-nyit="${esc(o.kulcs)}">Mégse</button></div>`
          : `<div class="gombsor"><button class="gomb kicsi masodlagos" type="button" data-hsz-nyit="${esc(o.kulcs)}">💬 Hozzászólok</button>
          ${o.fajl === A.fajl ? `<button class="gomb kicsi masodlagos" type="button" data-otlet-torol="${esc(o.id)}">Törlés</button>` : ""}</div>`}
      </div>`;
    }).join("") || `<div class="ures">${osszes.length ? "Nincs a szűrésnek megfelelő ötlet." : "Még nincs ötlet. Legyél te az első!"}</div>`}`;
}

/* ---------- Markdown (Claude fájljai): fejezetenként lenyitható dobozok ---------- */
function rajzolMarkdown(cel, md, { nyitva = null, utolsoNyitva = 0, hozzaszolhato = false } = {}) {
  const hely = $(cel);
  if (md === null || md === undefined) { hely.innerHTML = `<div class="betolt">Betöltés…</div>`; return; }
  if (!window.marked || !window.DOMPurify) { hely.innerHTML = `<div class="uzenet">A megjelenítő nem töltődött be. Próbáld újratölteni az oldalt.</div>`; return; }
  const ideig = document.createElement("div");
  ideig.innerHTML = DOMPurify.sanitize(marked.parse(md, { gfm: true }));
  for (const t of $$("table", ideig)) { const d = document.createElement("div"); d.className = "tabla-tarto"; t.replaceWith(d); d.append(t); }
  for (const a of $$("a", ideig)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
  const kesz = document.createDocumentFragment();
  let torzs = null;
  const dobozok = [];
  for (const el of [...ideig.childNodes]) {
    if (el.nodeName === "H2") {
      const d = document.createElement("details");
      const s = document.createElement("summary");
      s.textContent = el.textContent;
      torzs = document.createElement("div"); torzs.className = "torzs";
      d.append(s, torzs);
      if (nyitva && nyitva.test(el.textContent.trim())) d.open = true;
      kesz.append(d);
      dobozok.push({ d, cim: el.textContent.trim(), torzs });
    } else if (torzs) torzs.append(el);
    else kesz.append(el);
  }
  for (const x of dobozok.slice(dobozok.length - utolsoNyitva)) if (utolsoNyitva) x.d.open = true;
  if (hozzaszolhato) {
    for (const x of dobozok) {
      const g = document.createElement("button");
      g.type = "button"; g.className = "gomb kicsi masodlagos hozzaszolok";
      g.textContent = "💬 Ötletem van ehhez a részhez";
      g.dataset.fejezetCim = x.cim;
      x.torzs.append(g);
    }
  }
  hely.replaceChildren(kesz);
}

/** "5. Skillrendszer" → a fejezetlista megfelelő eleme (szám szerint), különben "Általános". */
function fejezetSzakaszbol(cim) {
  const m = cim.match(/^(\d+)\./);
  const f = Array.isArray(A.allapot?.fejezetek) ? A.allapot.fejezetek : [];
  const talalat = m && f.find((x) => x?.szam === m[1]);
  return talalat ? szoveg(talalat.cim, 80) : "Általános";
}

/* ---------- események (delegálva, mert a fülek újrarajzolódnak) ---------- */
function jelez(elem, szov) { if (elem) { elem.textContent = szov; setTimeout(() => { elem.textContent = ""; }, 2500); } }

function otletBekuld(szov, fejezet) {
  szov = szov.trim();
  if (!szov) return false;
  const most = new Date().toISOString();
  modosit("otletek", ujId(), { fejezet, szoveg: szov.slice(0, 5000), letrehozva: most, torolve: false });
  return true;
}

document.addEventListener("click", (e) => {
  const t = e.target.closest?.("button, [data-ugras]");
  if (!t) return;
  if (t.dataset.ugras) { fulValt(t.dataset.ugras); return; }
  if (t.hasAttribute("data-gyors-otlet")) {
    if (otletBekuld(piszkozat("gyors-otlet"), "Általános")) { A.piszkozat["gyors-otlet"] = ""; rajzolMind(); fulValt("otletek"); }
    return;
  }
  if (t.hasAttribute("data-otlet-kuld")) {
    if (otletBekuld(piszkozat("uj-otlet"), piszkozat("uj-otlet-fejezet", "Általános"))) { A.piszkozat["uj-otlet"] = ""; rajzolMind(); }
    return;
  }
  if (t.dataset.otletTorol) {
    if (!t.dataset.megerosit) { t.dataset.megerosit = "1"; t.textContent = "Biztosan törlöd?"; return; }
    modosit("otletek", t.dataset.otletTorol, { torolve: true }); rajzolMind(); return;
  }
  if (t.dataset.hszNyit) {
    const k = t.dataset.hszNyit;
    if (A.nyitottHozzaszolas.has(k)) A.nyitottHozzaszolas.delete(k); else A.nyitottHozzaszolas.add(k);
    rajzolOtletek(); return;
  }
  if (t.dataset.hszKuld) {
    const k = t.dataset.hszKuld, szov = piszkozat(`hsz-${k}`).trim();
    if (!szov) return;
    modosit("hozzaszolasok", ujId(), { cel: k, szoveg: szov.slice(0, 5000), letrehozva: new Date().toISOString(), torolve: false });
    A.piszkozat[`hsz-${k}`] = ""; A.nyitottHozzaszolas.delete(k); rajzolMind(); return;
  }
  if (t.dataset.valaszMent) {
    const k = t.dataset.valaszMent;
    modosit("valaszok", k, { szoveg: piszkozat(`valasz-${k}`).slice(0, 5000) });
    rajzolMind();
    jelez($(`[data-valasz-jel="${CSS.escape(k)}"]`), "✓ mentve");
    return;
  }
  if (t.dataset.fejezetCim) {
    A.piszkozat["uj-otlet-fejezet"] = fejezetSzakaszbol(t.dataset.fejezetCim);
    if (A.piszkozat["uj-otlet-fejezet"] === "Általános" && !piszkozat("uj-otlet")) A.piszkozat["uj-otlet"] = `[${t.dataset.fejezetCim}] `;
    rajzolOtletek(); fulValt("otletek");
    setTimeout(() => $('#ful-otletek textarea')?.focus(), 50);
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.type === "radio" && t.name?.startsWith("k-")) {
    const k = t.name.slice(2);
    const kartya = t.closest("[data-kerdes]");
    const szov = kartya?.querySelector("textarea")?.value ?? "";
    modosit("valaszok", k, { valasztas: t.value, szoveg: szov.slice(0, 5000) });
    rajzolMind();
    jelez($(`[data-valasz-jel="${CSS.escape(k)}"]`), "✓ mentve");
  }
  if (t.dataset?.szuro) { A.szuro[t.dataset.szuro] = t.value; rajzolOtletek(); }
  if (t.dataset?.piszkozat) A.piszkozat[t.dataset.piszkozat] = t.value;
});

/* ---------- indulás ---------- */
(function indul() {
  const param = new URLSearchParams(location.search).get("nev");
  const mentett = helyi("tulelo:nev");
  const ful = helyi("tulelo:ful");
  if (ful && $(`nav.fulek button[data-ful="${CSS.escape(ful)}"]`)) fulValt(ful);
  if (param && nevBeallit(param)) {
    history.replaceState(null, "", location.pathname);
  } else if (!(mentett && nevBeallit(mentett))) {
    nevKerdez();
    return;
  }
  betolt();
})();
