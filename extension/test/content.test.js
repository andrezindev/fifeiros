// content.js num "navegador falso": mensagens da página -> chrome.storage.
// Foco na Fase 5: tirar do clube os jogadores gastos depois de um envio.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

import { item } from "./fixtures.js";

const CONTENT = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");

function makeContent(initial = {}) {
  const store = structuredClone(initial);
  const listeners = [];
  const window = {
    location: { origin: "https://www.ea.com" },
    addEventListener: (type, fn) => type === "message" && listeners.push(fn),
    postMessage: () => {},
  };
  const chrome = {
    storage: {
      local: {
        get: (keys, cb) => cb(Object.fromEntries([].concat(keys).filter((k) => k in store).map((k) => [k, structuredClone(store[k])]))),
        set: (patch) => Object.assign(store, structuredClone(patch)),
        clear: (cb) => { for (const k of Object.keys(store)) delete store[k]; cb?.(); },
      },
    },
    runtime: { onMessage: { addListener() {} } },
  };
  vm.runInContext(CONTENT, vm.createContext({ window, chrome, setTimeout, clearTimeout, structuredClone, console }));
  const send = (msg) => listeners.forEach((fn) => fn({ source: window, data: { __fifeiros: true, dir: "toContent", ...msg } }));
  const flush = () => new Promise((r) => setTimeout(r, 450)); // save() agrupa em 400 ms
  return { store, send, flush };
}

const clubWith = (...items) => Object.fromEntries(items.map((i) => [i.id, i]));

test("depois de preencher e o Web App enviar, os jogadores usados saem do clube", async () => {
  const a = item(), b = item(), keep = item();
  const c = makeContent({ club: clubWith(a, b, keep) });
  c.send({ type: "fillResult", ok: true, challengeId: 50, count: 2, ids: [String(a.id), String(b.id)], at: Date.now() });
  c.send({ type: "challengeAction", challengeId: 50, method: "PUT", status: 200, keys: [] });
  await c.flush();
  assert.deepEqual(Object.keys(c.store.club), [String(keep.id)]);
  assert.equal(c.store.stats.completed[50], 1);
  assert.equal(c.store.lastSubmit.removed, 2);
});

test("o 'salvar escalação' do próprio app (usuário mexeu) define o que é gasto", async () => {
  const a = item(), b = item();
  const c = makeContent({ club: clubWith(a, b) });
  c.send({ type: "fillResult", ok: true, challengeId: 50, count: 1, ids: [String(a.id)], at: Date.now() });
  // O usuário trocou o jogador no app: agora a escalação tem só o b.
  c.send({ type: "squadSaveSeen", challengeId: 50, info: { status: 200, body: { players: [{ index: 1, itemData: { id: b.id } }, { index: 2, itemData: { id: 0 } }] } } });
  c.send({ type: "challengeAction", challengeId: 50, method: "PUT", status: 200, keys: [] });
  await c.flush();
  assert.deepEqual(Object.keys(c.store.club), [String(a.id)]);
});

test("contador 'vezes completado' também detecta o envio, sem contar duas vezes", async () => {
  const a = item(), keep = item();
  const c = makeContent({ club: clubWith(a, keep), challenges: { 50: { challengeId: 50, timesCompleted: 0 } } });
  c.send({ type: "fillResult", ok: true, challengeId: 50, count: 1, ids: [String(a.id)], at: Date.now() });
  c.send({ type: "challengeAction", challengeId: 50, method: "PUT", status: 200, keys: [] });
  c.send({ type: "capture", kind: "challenges", setId: 23, challenges: [{ challengeId: 50, timesCompleted: 1 }] });
  await c.flush();
  assert.deepEqual(Object.keys(c.store.club), [String(keep.id)]);
  assert.equal(c.store.stats.completed[50], 1);
});

test("só o contador (sem ver a requisição de envio) já basta", async () => {
  const a = item(), keep = item();
  const c = makeContent({ club: clubWith(a, keep), challenges: { 50: { challengeId: 50, timesCompleted: 3 } } });
  c.send({ type: "fillResult", ok: true, challengeId: 50, count: 1, ids: [String(a.id)], at: Date.now() });
  c.send({ type: "capture", kind: "challenges", setId: 23, challenges: [{ challengeId: 50, timesCompleted: 4 }] });
  await c.flush();
  assert.deepEqual(Object.keys(c.store.club), [String(keep.id)]);
});

test("envio recusado pela EA não tira ninguém", async () => {
  const a = item();
  const c = makeContent({ club: clubWith(a) });
  c.send({ type: "fillResult", ok: true, challengeId: 50, count: 1, ids: [String(a.id)], at: Date.now() });
  c.send({ type: "challengeAction", challengeId: 50, method: "PUT", status: 400, keys: [] });
  await c.flush();
  assert.deepEqual(Object.keys(c.store.club), [String(a.id)]);
  assert.equal(c.store.stats?.completed?.[50], undefined);
});

test("primeira vez que vê o desafio não conta como envio", async () => {
  const a = item();
  const c = makeContent({ club: clubWith(a) });
  c.send({ type: "fillResult", ok: true, challengeId: 50, count: 1, ids: [String(a.id)], at: Date.now() });
  c.send({ type: "capture", kind: "challenges", setId: 23, challenges: [{ challengeId: 50, timesCompleted: 7 }] });
  await c.flush();
  assert.deepEqual(Object.keys(c.store.club), [String(a.id)]);
});
