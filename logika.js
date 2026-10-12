/**
 * Tiszta függvények (DOM nélkül, node-ból tesztelhetők).
 * ⚠️ Más fájljából jövő minden mező megbízhatatlan (a token gyakorlatilag nyilvános):
 * HTML-be csak esc()-en át, szöveg csak szoveg()-en át, típust ellenőrizve.
 */

export const OTLET_ALLAPOTOK = {
  uj: "új",
  megbeszelve: "megbeszélve",
  bekerult: "bekerült a tervbe",
  elvetve: "elvetve",
};

export const FEJEZET_ALLAPOTOK = {
  eldontve: "eldöntve",
  reszben: "részben",
  kovetkezo: "következik",
  hatravan: "hátravan",
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (k) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[k]));
}

/** Csak szöveg mehet át, levágva; minden más üres szöveg lesz. */
export function szoveg(x, max = 5000) {
  return typeof x === "string" ? x.slice(0, max) : "";
}

/** ISO időbélyeg vagy üres szöveg (az összehasonlításhoz és a rendezéshez). */
export function ido(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x) ? x : "";
}

export function ujId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function nevFajlhoz(emberek, fajl) {
  return szoveg(emberek?.[fajl]?.nev, 30).trim() || fajl.replace(/\.json$/, "");
}

function terkep(adat, nev) {
  const t = adat?.[nev];
  return t && typeof t === "object" && !Array.isArray(t) ? t : {};
}

/** Mindenki nem törölt ötlete, a legújabb elöl. */
export function osszesOtlet(emberek) {
  const lista = [];
  for (const [fajl, adat] of Object.entries(emberek ?? {})) {
    for (const [id, o] of Object.entries(terkep(adat, "otletek"))) {
      if (!o || typeof o !== "object" || o.torolve === true) continue;
      const szov = szoveg(o.szoveg).trim();
      if (!szov) continue;
      lista.push({
        fajl, id, kulcs: `${fajl}/${id}`, nev: nevFajlhoz(emberek, fajl),
        fejezet: szoveg(o.fejezet, 80), szoveg: szov,
        letrehozva: ido(o.letrehozva) || ido(o.modositva), modositva: ido(o.modositva),
      });
    }
  }
  return lista.sort((a, b) => b.letrehozva.localeCompare(a.letrehozva));
}

/** cél ("<fajl>/<otletId>") → hozzászólások időrendben. */
export function hozzaszolasokCelonkent(emberek) {
  const m = {};
  for (const [fajl, adat] of Object.entries(emberek ?? {})) {
    for (const [id, h] of Object.entries(terkep(adat, "hozzaszolasok"))) {
      if (!h || typeof h !== "object" || h.torolve === true) continue;
      const cel = szoveg(h.cel, 200), szov = szoveg(h.szoveg).trim();
      if (!cel || !szov) continue;
      (m[cel] ||= []).push({ fajl, id, nev: nevFajlhoz(emberek, fajl), szoveg: szov, ido: ido(h.letrehozva) || ido(h.modositva) });
    }
  }
  for (const l of Object.values(m)) l.sort((a, b) => a.ido.localeCompare(b.ido));
  return m;
}

/** Egy kérdésre adott válaszok (választás és/vagy szöveg), személyenként. */
export function valaszokKerdesre(emberek, kerdesId) {
  const lista = [];
  for (const [fajl, adat] of Object.entries(emberek ?? {})) {
    const v = terkep(adat, "valaszok")[kerdesId];
    if (!v || typeof v !== "object") continue;
    const valasztas = szoveg(v.valasztas, 40), szov = szoveg(v.szoveg).trim();
    if (!valasztas && !szov) continue;
    lista.push({ fajl, nev: nevFajlhoz(emberek, fajl), valasztas, szoveg: szov, modositva: ido(v.modositva) });
  }
  return lista.sort((a, b) => a.nev.localeCompare(b.nev, "hu"));
}

export function kerdesek(allapot) {
  return Array.isArray(allapot?.kerdesek) ? allapot.kerdesek.filter((k) => k && typeof k.id === "string") : [];
}

/** Nyitott kérdések, amelyekre ez a fájl (ember) még nem válaszolt. */
export function megvalaszolatlanok(allapot, emberek, sajatFajl) {
  return kerdesek(allapot).filter((k) => k.allapot !== "lezarva"
    && !valaszokKerdesre({ [sajatFajl]: emberek?.[sajatFajl] }, k.id).length);
}

/** Mi történt `ota` óta, amit MÁS csinált (és Claude frissítései). Legújabb elöl. */
export function ujdonsagok(emberek, sajatFajl, ota, allapot) {
  const o = ido(ota);
  const lista = [];
  for (const u of Array.isArray(allapot?.ujdonsagok) ? allapot.ujdonsagok : []) {
    const d = ido(u?.datum);
    if (d && (!o || d > o)) lista.push({ ki: "Claude", mit: szoveg(u.szoveg, 500), ido: d });
  }
  const masok = Object.fromEntries(Object.entries(emberek ?? {}).filter(([f]) => f !== sajatFajl));
  for (const x of osszesOtlet(masok)) {
    if (!o || x.letrehozva > o) lista.push({ ki: x.nev, mit: `új ötlet: ${x.szoveg.slice(0, 120)}`, ido: x.letrehozva });
  }
  for (const k of kerdesek(allapot)) {
    for (const v of valaszokKerdesre(masok, k.id)) {
      if (!o || v.modositva > o) lista.push({ ki: v.nev, mit: `válaszolt: ${szoveg(k.cim, 120)}`, ido: v.modositva });
    }
  }
  for (const l of Object.values(hozzaszolasokCelonkent(masok))) {
    for (const h of l) if (!o || h.ido > o) lista.push({ ki: h.nev, mit: `hozzászólt: ${h.szoveg.slice(0, 120)}`, ido: h.ido });
  }
  return lista.sort((a, b) => b.ido.localeCompare(a.ido));
}

/** A fejezetek állapotának összesítése a haladásjelzőhöz. */
export function fejezetOsszesites(allapot) {
  const f = Array.isArray(allapot?.fejezetek) ? allapot.fejezetek : [];
  const db = { eldontve: 0, reszben: 0, kovetkezo: 0, hatravan: 0 };
  for (const x of f) if (x && Object.hasOwn(db, x.allapot)) db[x.allapot] += 1;
  return { ...db, osszes: f.length };
}

export function datumKiir(iso) {
  const d = ido(iso);
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
