// Background com "chrome" e "fetch" simulados.
import assert from "node:assert/strict";
import { test } from "node:test";

import { challenge, item } from "./fixtures.js";

function setup({ fetchImpl, state = {} }) {
  const store = { ...state };
  const listeners = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => (keys === null ? { ...store } : Object.fromEntries([].concat(keys).map((k) => [k, store[k]]))),
        set: async (obj) => Object.assign(store, obj),
      },
    },
    runtime: { onMessage: { addListener: (fn) => listeners.push(fn) } },
  };
  globalThis.fetch = fetchImpl;
  const send = (msg) => new Promise((resolve) => listeners.forEach((fn) => fn(msg, {}, resolve)));
  return { store, send };
}

const readyState = () => {
  const a = item(), b = item();
  return {
    club: { [a.id]: a, [b.id]: b },
    challenges: { 555: challenge },
    squads: { 555: { squad: { formation: "f433", players: [] } } },
    currentChallengeId: 555,
    solverOptions: { max_rating: 85 },
  };
};

// Cada teste importa uma cópia nova do módulo (query string muda a URL).
let n = 0;
const loadBackground = () => import(`../src/background.js?v=${n++}`);

test("resolver: envia clube, DME e opções e guarda a solução", async () => {
  let sent = null;
  const { store, send } = setup({
    state: readyState(),
    fetchImpl: async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ status: "OPTIMAL", squad: [{}], sbc: "Liga e Nação" }), { status: 200 });
    },
  });
  await loadBackground();
  const result = await send({ cmd: "solve" });
  assert.equal(sent.url, "http://127.0.0.1:8127/solve");
  assert.equal(sent.body.club.players.length, 2);
  assert.equal(sent.body.sbc.name, "Liga e Nação");
  assert.equal(sent.body.options.max_rating, 85);
  assert.equal(sent.body.options.untradeable_value, 0.3); // padrão preenchido
  assert.equal(result.solution.status, "OPTIMAL");
  assert.equal(store.lastSolution.challengeId, 555);
});

test("solver desligado vira mensagem clara", async () => {
  const { store, send } = setup({
    state: readyState(),
    fetchImpl: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  await loadBackground();
  const result = await send({ cmd: "solve" });
  assert.match(result.error, /iniciar-solver\.bat/);
  assert.match(store.lastSolution.error, /iniciar-solver\.bat/);
});

test("sem DME aberto não chama o solver", async () => {
  let called = false;
  const { send } = setup({ state: { club: readyState().club }, fetchImpl: async () => { called = true; } });
  await loadBackground();
  const result = await send({ cmd: "solve" });
  assert.equal(called, false);
  assert.match(result.error, /Abra um desafio/);
});

test("erro do solver (400) é repassado", async () => {
  const { send } = setup({
    state: readyState(),
    fetchImpl: async () => new Response(JSON.stringify({ error: "entrada inválida: x" }), { status: 400 }),
  });
  await loadBackground();
  assert.equal((await send({ cmd: "solve" })).error, "entrada inválida: x");
});

test("health", async () => {
  const { send } = setup({ fetchImpl: async () => new Response(JSON.stringify({ ok: true, version: "0.1.0", busy: false })) });
  await loadBackground();
  assert.deepEqual(await send({ cmd: "solverHealth" }), { ok: true, busy: false, version: "0.1.0" });
});
