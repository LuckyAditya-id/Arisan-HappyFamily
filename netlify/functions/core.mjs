// Logika arisan di sisi server (dipisah dari Netlify agar mudah diuji)
import { randomInt, createHash } from "node:crypto";

export const IDS = ["damara","pratiwi1","gilang1","lucky","agit","yogi1","yogi2","pratiwi2","gilang2"];
export const DEFAULT_NAMES = {
  damara: "Damara", pratiwi1: "Pratiwi 1", gilang1: "Gilang 1", lucky: "Lucky", agit: "Agit",
  yogi1: "Yogi 1", yogi2: "Yogi 2", pratiwi2: "Pratiwi 2", gilang2: "Gilang 2",
};
export const MAX_NAME = 16;
export const BASE = [
  { round: 1, id: "damara" },
  { round: 2, id: "pratiwi1" },
  { round: 3, id: "gilang1" },
];

const hashPin = (id, pin) => createHash("sha256").update(id + ":" + pin + ":arisan-v1").digest("hex");
const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function derive(state) {
  const fin = BASE.slice();
  for (const d of Object.values(state.rounds || {})) {
    if (d && Number.isInteger(d.round) && d.round >= 4 && IDS.includes(d.winner)) fin.push({ round: d.round, id: d.winner });
  }
  fin.sort((a, b) => a.round - b.round);
  const seen = new Set(), clean = [];
  for (const f of fin) if (!seen.has(f.id)) { seen.add(f.id); clean.push(f); }
  const last = clean[clean.length - 1].round;
  return { finished: clean, current: last + 1 };
}

// Mengembalikan state baru (atau null bila tidak ada perubahan) dan pesan.
export function applyAction(state, action, id, rnd = randomInt, body = {}) {
  const s = { v: state.v || 0, ready: { ...(state.ready || {}) }, rounds: { ...(state.rounds || {}) }, names: { ...(state.names || {}) }, accounts: { ...(state.accounts || {}) } };
  const name = body.name;
  if (!IDS.includes(id)) return { error: "Nama tidak dikenal", status: 400 };
  const { finished, current } = derive(s);
  const key = "r" + current + "_" + id;
  const eligIds = IDS.filter((i) => !finished.some((f) => f.id === i));
  const isElig = eligIds.includes(id);

  if (action === "ready") {
    if (!isElig) return { error: "Kamu sudah pernah menang, hanya bisa melihat", status: 409 };
    if (s.ready[key]) return { state: null };
    s.ready[key] = { round: current, id, at: Date.now() };
  } else if (action === "unready") {
    if (!s.ready[key]) return { state: null };
    delete s.ready[key];
  } else if (action === "stop") {
    if (!isElig) return { error: "Hanya peserta yang belum menang yang bisa menekan STOP", status: 409 };
    const readyIds = Object.values(s.ready).filter((d) => d && d.round === current).map((d) => d.id);
    const elig = eligIds;
    if (!elig.length) return { state: null, note: "arisan selesai" };
    if (!elig.every((i) => readyIds.includes(i))) return { state: null, note: "belum semua ready" };
    s.rounds["r" + current] = { round: current, winner: elig[rnd(elig.length)], stoppedBy: id, at: Date.now() };
    for (const k of Object.keys(s.ready)) if (s.ready[k].round <= current) delete s.ready[k]; // bersihkan
  } else if (action === "rename") {
    const nm = typeof name === "string" ? name.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
    if (!nm || nm === DEFAULT_NAMES[id]) {
      if (!s.names[id]) return { state: null };
      delete s.names[id];
    } else {
      for (const o of IDS) {
        if (o !== id && (s.names[o] || DEFAULT_NAMES[o]).toLowerCase() === nm.toLowerCase()) {
          return { error: "Nama itu sudah dipakai peserta lain", status: 409 };
        }
      }
      if (s.names[id] === nm) return { state: null };
      s.names[id] = nm;
    }
  } else if (action === "account") {
    if (!isElig) return { error: "Rekening hanya diisi peserta yang belum menang", status: 409 };
    const bank = clean(body.bank, 24), holder = clean(body.holder, 40);
    const number = typeof body.number === "string" ? body.number.replace(/[\s.-]/g, "") : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (bank.length < 2) return { error: "Isi nama bank / e-wallet", status: 400 };
    if (!/^\d{5,25}$/.test(number)) return { error: "Nomor rekening harus angka (5–25 digit)", status: 400 };
    if (holder.length < 2) return { error: "Isi nama pemilik rekening", status: 400 };
    if (!/^\d{4,6}$/.test(pin)) return { error: "PIN harus 4–6 angka", status: 400 };
    const old = s.accounts[id];
    if (old && old.pinHash !== hashPin(id, pin)) return { error: "PIN salah", status: 403 };
    if (old && old.bank === bank && old.number === number && old.holder === holder) return { state: null };
    s.accounts[id] = { bank, number, holder, pinHash: old ? old.pinHash : hashPin(id, pin) };
  } else {
    return { error: "Aksi tidak dikenal", status: 400 };
  }
  s.v += 1;
  return { state: s };
}

// Yang dikirim ke browser: rekening hanya milik pemenang terbaru + rekening milik peserta itu sendiri; PIN tidak pernah dikirim.
export function publicView(state, meIds = []) {
  const { finished } = derive(state);
  const lastLive = finished.filter((f) => f.round >= 4).pop();
  const show = new Set(meIds.filter((i) => IDS.includes(i)));
  if (lastLive) show.add(lastLive.id);
  const accounts = {};
  for (const id of show) {
    const a = (state.accounts || {})[id];
    if (a) accounts[id] = { bank: a.bank, number: a.number, holder: a.holder };
  }
  return { v: state.v || 0, ready: state.ready || {}, rounds: state.rounds || {}, names: state.names || {}, accounts };
}

// store: objek dengan getWithMetadata / setJSON (Netlify Blobs)
export async function handle(store, method, body, meIds = []) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await store.getWithMetadata("state", { type: "json" });
    const state = cur ? cur.data : { v: 0, ready: {}, rounds: {}, names: {}, accounts: {} };
    if (method === "GET") return { status: 200, body: publicView(state, meIds) };
    const r = applyAction(state, body && body.action, body && body.id, undefined, body || {});
    if (r.error) return { status: r.status, body: { error: r.error } };
    if (!r.state) return { status: 200, body: publicView(state, [body && body.id]) };
    const res = cur
      ? await store.setJSON("state", r.state, { onlyIfMatch: cur.etag })
      : await store.setJSON("state", r.state, { onlyIfNew: true });
    if (res.modified) return { status: 200, body: publicView(r.state, [body && body.id]) };
  }
  return { status: 503, body: { error: "Sibuk, coba lagi" } };
}
