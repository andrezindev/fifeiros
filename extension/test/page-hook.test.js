// Roda o page-hook.js num "navegador falso" (vm do Node) com um servidor da EA simulado.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

import { item } from "./fixtures.js";

const HOOK = readFileSync(new URL("../src/page-hook.js", import.meta.url), "utf8");
const BASE = "https://utas.mob.v2.fut.ea.com/ut/game/fc26";
const SID = "SEGREDO-TOKEN-123";

function makePage({ clubSize = 45, pageSize = 20, failAtStart = null, bodyMode = "json", responses = {}, statusFor = {}, internals = null } = {}) {
  const club = Array.from({ length: clubSize }, () => item());
  const posted = [];
  const listeners = [];
  const requests = [];

  let customHandler = null;
  async function fakeServer(url, init = {}) {
    requests.push({ url, init });
    if (customHandler) {
      const r = await customHandler(url, init);
      if (r) return r;
    }
    const u = new URL(url);
    for (const [suffix, status] of Object.entries(statusFor)) {
      if (u.pathname.endsWith(suffix)) return new Response("{}", { status });
    }
    for (const [suffix, body] of Object.entries(responses)) {
      if (u.pathname.endsWith(suffix)) return new Response(JSON.stringify(body), { status: 200 });
    }
    let start = 0;
    let count = pageSize;
    if (u.searchParams.has("start")) {
      start = +u.searchParams.get("start");
      count = +u.searchParams.get("count");
    } else if (init.body) {
      ({ start, count } = JSON.parse(init.body));
    }
    if (failAtStart !== null && start >= failAtStart) return new Response("{}", { status: 429 });
    if (u.pathname.endsWith("/club")) {
      return new Response(JSON.stringify({ itemData: club.slice(start, start + count) }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const window = {
    location: { origin: "https://www.ea.com", href: "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/" },
    fetch: fakeServer,
    postMessage: (msg) => {
      posted.push(msg);
      for (const l of listeners) l({ data: msg, source: window });
    },
    addEventListener: (type, fn) => type === "message" && listeners.push(fn),
  };
  if (internals) internals(window);
  class XMLHttpRequest {}
  XMLHttpRequest.prototype.open = function () {};
  XMLHttpRequest.prototype.send = function () {};
  XMLHttpRequest.prototype.setRequestHeader = function () {};

  const ctx = vm.createContext({
    window, location: window.location, XMLHttpRequest, URL, Headers, Response,
    setTimeout: (fn) => setTimeout(fn, 0), // sem esperar as pausas no teste
    clearTimeout,
    console,
  });
  vm.runInContext(HOOK, ctx);

  const toPage = (cmd, options) => window.postMessage({ __fifeiros: true, dir: "toPage", cmd, options });
  const appSearch = () => {
    const headers = { "X-UT-SID": SID, "Content-Type": "application/json" };
    if (bodyMode === "json") {
      return window.fetch(`${BASE}/club`, { method: "POST", headers, body: JSON.stringify({ type: "player", start: 0, count: pageSize }) });
    }
    return window.fetch(`${BASE}/club?type=player&start=0&count=${pageSize}`, { headers });
  };
  const until = async (pred) => {
    for (let i = 0; i < 500 && !pred(); i++) await new Promise((r) => setTimeout(r, 1));
  };
  const fetch = (url, init) => window.fetch(url, init); // fetch já interceptado pelo hook
  const setHandler = (fn) => (customHandler = fn);
  return { posted, requests, toPage, appSearch, until, club, fetch, setHandler };
}

const captures = (posted, kind) => posted.filter((m) => m.type === "capture" && m.kind === kind);

test("captura passiva da busca do clube", async () => {
  const page = makePage();
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  const [cap] = captures(page.posted, "club");
  assert.equal(cap.items.length, 20);
  assert.equal(cap.templateInfo.paginable, true);
  assert.equal(cap.templateInfo.path, "/ut/game/fc26/club");
});

for (const bodyMode of ["json", "query"]) {
  test(`carrega o clube inteiro paginando (${bodyMode})`, async () => {
    const page = makePage({ bodyMode, clubSize: 45, pageSize: 20 });
    await page.appSearch();
    await page.until(() => captures(page.posted, "club").length);
    page.toPage("loadClub", { minDelayMs: 0, maxDelayMs: 0 });
    await page.until(() => page.posted.some((m) => m.type === "loader" && m.state.finishedAt));

    const fromLoader = captures(page.posted, "club").filter((c) => c.fromLoader);
    assert.deepEqual(fromLoader.map((c) => c.items.length), [20, 20, 5]);
    const ids = new Set(fromLoader.flatMap((c) => c.items.map((i) => i.id)));
    assert.equal(ids.size, 45);
    const done = page.posted.findLast((m) => m.type === "loader");
    assert.equal(done.state.error, null);
    assert.equal(done.state.items, 45);
    // As requisições repetidas usam o mesmo token do app.
    assert.equal(page.requests.at(-1).init.headers["X-UT-SID"], SID);
  });
}

test("para imediatamente quando a EA recusa (429)", async () => {
  const page = makePage({ clubSize: 100, pageSize: 20, failAtStart: 40 });
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.toPage("loadClub", { minDelayMs: 0, maxDelayMs: 0 });
  await page.until(() => page.posted.some((m) => m.type === "loader" && m.state.finishedAt));
  const done = page.posted.findLast((m) => m.type === "loader");
  assert.match(done.state.error, /429/);
  assert.equal(done.state.pages, 2);
  const clubRequests = page.requests.filter((r) => r.url.includes("/club"));
  assert.equal(clubRequests.length, 1 + 3); // 1 do app + 2 ok + 1 recusada, e para
});

test("sem busca do clube, o carregador pede para abrir o clube", async () => {
  const page = makePage();
  page.toPage("loadClub", {});
  await page.until(() => page.posted.some((m) => m.type === "loader"));
  assert.match(page.posted.find((m) => m.type === "loader").state.error, /Clube > Jogadores/);
});

test("o token de sessão nunca sai da página", async () => {
  const page = makePage();
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.toPage("loadClub", { minDelayMs: 0, maxDelayMs: 0 });
  await page.until(() => page.posted.some((m) => m.type === "loader" && m.state.finishedAt));
  page.toPage("ping");
  const toContent = page.posted.filter((m) => m.dir === "toContent");
  assert.ok(toContent.length > 5);
  assert.ok(!JSON.stringify(toContent).includes(SID));
});

test("busca filtrada (defId) não vira modelo do carregador", async () => {
  const page = makePage();
  await page.fetch(`${BASE}/club`, {
    method: "POST",
    headers: { "X-UT-SID": SID },
    body: JSON.stringify({ count: 21, defId: "259377", excludeLoans: true, start: 0, type: "player" }),
  });
  await page.until(() => captures(page.posted, "club").length);
  page.toPage("loadClub", { minDelayMs: 0, maxDelayMs: 0 });
  await page.until(() => page.posted.some((m) => m.type === "loader"));
  assert.match(page.posted.find((m) => m.type === "loader").state.error, /Clube > Jogadores/);
});

// ---------- Fase 4: preencher ----------

async function pageReadyToFill(opts = {}) {
  const page = makePage({ responses: { "/sbs/challenge/50/squad": {} }, ...opts });
  await page.appSearch(); // o hook aprende os cabeçalhos com uma requisição do app
  await page.until(() => captures(page.posted, "club").length);
  page.requests.length = 0;
  return page;
}
const puts = (page) => page.requests.filter((r) => r.init?.method === "PUT");
const fillResult = (page) => page.until(() => page.posted.some((m) => m.type === "fillResult"))
  .then(() => page.posted.find((m) => m.type === "fillResult"));

test("preenche com o mesmo PUT do Web App (23 posições, ids nos slots certos)", async () => {
  const page = await pageReadyToFill();
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "900000000101" }, { index: 6, itemId: "900000000102" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, true);
  assert.equal(puts(page).length, 1);
  const req = puts(page)[0];
  assert.equal(req.url, `${BASE}/sbs/challenge/50/squad`);
  assert.equal(req.init.method, "PUT");
  assert.equal(req.init.headers["X-UT-SID"], SID);
  const body = JSON.parse(req.init.body);
  assert.equal(body.players.length, 23);
  assert.deepEqual(body.players[1], { index: 1, itemData: { id: 900000000101, dream: false } });
  assert.deepEqual(body.players[6], { index: 6, itemData: { id: 900000000102, dream: false } });
  assert.equal(body.players.filter((p) => p.itemData.id !== 0).length, 2);
  assert.ok(!JSON.stringify(page.posted).includes(SID));
});

test("confere no servidor depois de preencher", async () => {
  // Servidor falso que guarda o PUT e devolve no GET.
  let stored = null;
  const page = makePage();
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.setHandler(async (url, init) => {
    if (!url.endsWith("/sbs/challenge/50/squad")) return null;
    if (init?.method === "PUT") {
      stored = JSON.parse(init.body).players.slice(0, 1); // "salva" só o primeiro: simula perda
      return new Response("", { status: 200 });
    }
    return new Response(JSON.stringify({ squad: { players: stored } }), { status: 200 });
  });
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 0, itemId: "11" }, { index: 1, itemId: "22" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, true);
  assert.equal(r.saved, 1);
  assert.deepEqual([...r.savedIds], ["0:11"]);
});

// Simula o código interno do Web App: árvore de telas com o DME aberto e o
// serviço services.SBC.loadChallengeData, que relê a escalação "do servidor".
// Simula o Web App do FC 27: loadChallenge usa o CACHE da escalação até ele vencer
// (setCacheTimestamp(0)), e a tela redesenha com _pushSquadToView.
function fakeWebApp(serverSquad, { cacheBlocks = true } = {}) {
  const calls = [];
  const install = (window) => {
    class UTSquadEntity {
      constructor() { this._players = []; this._ts = Date.now(); }
      getPlayers() { return this._players; }
      setPlayers(p) { this._players = p.map((item) => ({ _item: item })); }
      isCacheExpired() { return Date.now() - this._ts > 60000; }
      setCacheTimestamp(t) { this._ts = t; calls.push("setCacheTimestamp"); }
    }
    class UTSBCChallengeEntity {
      constructor(id) { this.id = id; this.squad = new UTSquadEntity(); }
    }
    class UTSBCSquadOverviewViewController {
      constructor() { this._challenge = new UTSBCChallengeEntity(50); }
      _pushSquadToView(squad) { calls.push(`_pushSquadToView:${squad.getPlayers().length}`); }
    }
    const overview = new UTSBCSquadOverviewViewController();
    const nav = { getCurrentController: () => overview };
    const root = { getPresentedViewController: () => nav };
    window.getAppMain = () => ({ getRootViewController: () => root });
    window.services = {
      SBC: {
        loadChallenge(challenge) {
          calls.push("loadChallenge");
          return {
            observe(scope, cb) {
              if (!cacheBlocks || challenge.squad.isCacheExpired()) {
                challenge.squad.setPlayers(serverSquad().map((id) => ({ id })));
                challenge.squad._ts = Date.now();
              }
              setTimeout(() => cb(this, { success: true }), 0);
            },
          };
        },
      },
    };
  };
  install.calls = calls;
  return install;
}

test("depois de preencher, o Web App relê a escalação e a tela atualiza (sem F5)", async () => {
  let stored = [];
  const app = fakeWebApp(() => stored);
  const page = makePage({ internals: app });
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.setHandler(async (url, init) => {
    if (!url.endsWith("/sbs/challenge/50/squad")) return null;
    if (init?.method === "PUT") {
      stored = JSON.parse(init.body).players.map((p) => p.itemData.id);
      return new Response("", { status: 200 });
    }
    return new Response(JSON.stringify({ squad: { players: stored.map((id, index) => ({ index, itemData: { id } })) } }));
  });
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "11" }, { index: 2, itemId: "22" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, true);
  assert.equal(r.refresh.refreshed, true, JSON.stringify(r.refresh));
  assert.equal(r.refresh.matched, 2);
  assert.equal(r.refresh.redraw, "_pushSquadToView");
  assert.match(r.refresh.path, /_challenge$/);
  // Primeiro tenta recarregar; o cache segura; vence o cache e recarrega de novo.
  assert.deepEqual(app.calls, ["loadChallenge", "setCacheTimestamp", "loadChallenge", `_pushSquadToView:${stored.length}`]);
  const probe = page.posted.findLast((m) => m.type === "probe").report;
  assert.equal(probe.globals.getAppMain, "function");
  assert.deepEqual([...probe.sbcServiceMethods], ["loadChallenge"]);
  assert.equal(probe.challengeOnScreen.ctor, "UTSBCChallengeEntity");
  assert.ok(probe.challengeOnScreen.squadMethods.includes("setCacheTimestamp"));
  assert.equal(probe.challengeOnScreen.slotSample.idsRead, 2);
});

// Formato real do FC 27: 23 UTSquadSlotEntity com `_item` (UTItemEntity, preenchido por update()).
function fakeWebAppFC27({ clubItems = {} } = {}) {
  const calls = [];
  const install = (window) => {
    class UTItemEntity {
      constructor(raw = {}, brick = false) {
        this.id = raw.id ?? 0;
        this.definitionId = brick ? 0 : raw.assetId ?? 0;
        this.rating = raw.rating;
        this._brick = brick;
      }
      isCustomBrick() { return this._brick; }
    }
    class UTSquadSlotEntity {
      constructor(index) { this.index = index; this._item = new UTItemEntity(); }
    }
    class UTSquadEntity {
      constructor() {
        this._slots = Array.from({ length: 23 }, (_, i) => new UTSquadSlotEntity(i));
        this.onDataUpdated = { notify: () => calls.push("notify") };
      }
      getPlayers() { return this._slots; }
      addItemToSlot(index, item) { this._slots[index]._item = item; calls.push(`addItemToSlot:${index}`); }
    }
    class UTSBCChallengeEntity {
      constructor(id) { this.id = id; this.squad = new UTSquadEntity(); }
    }
    class UTSBCSquadOverviewViewController {
      constructor() { this._challenge = new UTSBCChallengeEntity(50); }
      _pushSquadToView() { calls.push("_pushSquadToView"); }
    }
    const overview = new UTSBCSquadOverviewViewController();
    window.getAppMain = () => ({ getRootViewController: () => ({ getCurrentController: () => overview }) });
    window.services = { SBC: { loadChallenge() { calls.push("loadChallenge"); return null; } } };
    window.factories = {
      Item: {
        // Armadilha: devolve o mesmo id, mas é um "tijolo" sem foto/nome. Nunca deve ser usado.
        createCustomBrickItem(raw) { calls.push("createCustomBrickItem"); return new UTItemEntity(raw, true); },
        generateItemsFromItemData(list) { return list.map((raw) => new UTItemEntity(raw)); },
      },
    };
    const club = Object.fromEntries(Object.entries(clubItems).map(([id, raw]) => [id, new UTItemEntity(raw)]));
    window.repositories = { Item: { getClub: () => ({ getItem: (id) => club[id] }) } };
  };
  install.calls = calls;
  return install;
}

test("FC 27: põe os jogadores do app direto na escalação da memória (sem recarregar)", async () => {
  const app = fakeWebAppFC27();
  const page = makePage({ internals: app, responses: { "/sbs/challenge/50/squad": {} } });
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  const rawItems = { 111: { id: 111, assetId: 9001, rating: 81 }, 222: { id: 222, assetId: 9002, rating: 80 } };
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "111" }, { index: 2, itemId: "222" }], rawItems });
  const r = await fillResult(page);
  assert.equal(r.ok, true);
  assert.equal(r.refresh.refreshed, true, JSON.stringify(r.refresh));
  assert.equal(r.refresh.redraw, "_pushSquadToView");
  assert.ok(r.refresh.attempts.includes("criar jogadores: factories.Item.generateItemsFromItemData"), JSON.stringify(r.refresh.attempts));
  // Sem tijolo, sem loadChallenge; avisa o app e redesenha.
  assert.deepEqual(app.calls, ["addItemToSlot:1", "addItemToSlot:2", "notify", "_pushSquadToView"]);
  const probe = page.posted.findLast((m) => m.type === "probe").report;
  assert.equal(probe.challengeOnScreen.slotSample.idsRead, 2);
  assert.equal(probe.challengeOnScreen.slotSample.itemCtor, "UTItemEntity");
});

test("FC 27: prefere o jogador que o app já tem no clube", async () => {
  const app = fakeWebAppFC27({ clubItems: { 111: { id: 111, assetId: 9001, rating: 81 } } });
  const page = makePage({ internals: app, responses: { "/sbs/challenge/50/squad": {} } });
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "111" }], rawItems: { 111: { id: 111, assetId: 9001 } } });
  const r = await fillResult(page);
  assert.ok(r.refresh.attempts.includes("criar jogadores: clube do app (getClub().getItem)"), JSON.stringify(r.refresh.attempts));
});

test("se o cache não segura, recarrega uma vez só", async () => {
  let stored = [];
  const app = fakeWebApp(() => stored, { cacheBlocks: false });
  const page = makePage({ internals: app });
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.setHandler(async (url, init) => {
    if (!url.endsWith("/sbs/challenge/50/squad")) return null;
    if (init?.method === "PUT") stored = JSON.parse(init.body).players.map((p) => p.itemData.id);
    return new Response(JSON.stringify({ squad: { players: [] } }));
  });
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "11" }] });
  const r = await fillResult(page);
  assert.equal(r.refresh.refreshed, true);
  assert.deepEqual(app.calls.filter((c) => c === "loadChallenge"), ["loadChallenge"]);
});

test("sem o código interno conhecido, preenche igual e avisa para recarregar", async () => {
  const page = await pageReadyToFill();
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "11" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, true);
  assert.equal(r.refresh.refreshed, false);
  assert.match(r.refresh.reason, /não achei o DME/);
});

test("espera entre preenchimentos (proteção)", async () => {
  const page = await pageReadyToFill();
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "1" }] });
  await fillResult(page);
  page.posted.length = 0;
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "1" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, false);
  assert.match(r.error, /Espere/);
  assert.equal(puts(page).length, 1);
});

test("recusa dados inválidos sem fazer requisição", async () => {
  for (const options of [
    { challengeId: "50/submit", slots: [{ index: 1, itemId: "1" }] },
    { challengeId: 50, slots: [{ index: 11, itemId: "1" }] },
    { challengeId: 50, slots: [{ index: 1, itemId: "abc" }] },
    { challengeId: 50, slots: [{ index: 1, itemId: "1" }, { index: 1, itemId: "2" }] },
    { challengeId: 50, slots: [] },
  ]) {
    const page = await pageReadyToFill();
    page.toPage("fillSquad", options);
    const r = await fillResult(page);
    assert.equal(r.ok, false, JSON.stringify(options));
    assert.equal(page.requests.length, 0);
  }
});

test("EA recusando o preenchimento vira mensagem clara", async () => {
  const page = await pageReadyToFill({ statusFor: { "/sbs/challenge/50/squad": 429 } });
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "1" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, false);
  assert.match(r.error, /429/);
});

test("sem nenhuma requisição do app ainda, pede para reabrir o DME", async () => {
  const page = makePage();
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "1" }] });
  const r = await fillResult(page);
  assert.match(r.error, /entre de novo no DME/);
});

test("depois do F5, basta abrir o DME (sem abrir o clube) para preencher", async () => {
  const page = makePage({ responses: { "/sbs/challenge/50/squad": { squad: { formation: "f442", players: [] } } } });
  await page.fetch(`${BASE}/sbs/challenge/50/squad`, { headers: { "X-UT-SID": SID } }); // o app abre o DME
  await page.until(() => captures(page.posted, "challengeSquad").length);
  page.requests.length = 0;
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "900000000101" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, true, r.error);
  assert.equal(page.requests[0].init.method, "PUT");
  assert.equal(page.requests[0].init.headers["X-UT-SID"], SID);
});

test("requisição sem sessão (ex.: banco de nomes) não serve de modelo", async () => {
  const page = makePage({ responses: { "/players.json": { Players: [] } } });
  await page.fetch("https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/x/2027/fut/items/web/players.json");
  await page.until(() => captures(page.posted, "names").length);
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "1" }] });
  assert.match((await fillResult(page)).error, /entre de novo no DME/);
  assert.equal(page.requests.filter((r) => r.init?.method === "PUT").length, 0);
});

// ---------- Fase 5: limite de ritmo e envio ----------

test("limite de ritmo: o carregador do clube pausa e continua sozinho", async () => {
  const page = makePage({
    clubSize: 100, pageSize: 20,
    internals: (w) => { w.__FIFEIROS_RATE__ = { minGapMs: 0, maxInWindow: 2, windowMs: 40 }; },
  });
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.toPage("loadClub", { minDelayMs: 0, maxDelayMs: 0 });
  await page.until(() => page.posted.some((m) => m.type === "loader" && m.state.finishedAt));
  const done = page.posted.findLast((m) => m.type === "loader");
  assert.equal(done.state.error, null);
  assert.equal(done.state.items, 100);
  assert.ok(page.posted.some((m) => m.type === "loader" && m.state.waitingUntil), "deveria ter pausado no limite");
  assert.ok(page.posted.some((m) => m.type === "rate" && m.state.used === 2));
});

test("limite de ritmo: ação do usuário falha na hora com mensagem clara", async () => {
  const page = makePage({ internals: (w) => { w.__FIFEIROS_RATE__ = { maxInWindow: 0 }; } });
  await page.appSearch();
  await page.until(() => captures(page.posted, "club").length);
  page.requests.length = 0;
  page.toPage("fillSquad", { challengeId: 50, slots: [{ index: 1, itemId: "1" }] });
  const r = await fillResult(page);
  assert.equal(r.ok, false);
  assert.match(r.error, /Limite de 0 requisições/);
  assert.equal(page.requests.length, 0);
});

test("envio do DME pelo Web App é detectado (e o 'salvar escalação' não é confundido)", async () => {
  const page = makePage({ responses: { "/sbs/challenge/50": { grantedSetAwards: [] }, "/sbs/challenge/50/squad": {} } });
  await page.fetch(`${BASE}/sbs/challenge/50/squad`, { method: "PUT", headers: { "X-UT-SID": SID }, body: "{}" });
  await page.fetch(`${BASE}/sbs/challenge/50`, { method: "PUT", headers: { "X-UT-SID": SID } });
  await page.fetch(`${BASE}/sbs/challenge/50`); // GET não é envio
  await page.until(() => page.posted.some((m) => m.type === "challengeAction"));
  const actions = page.posted.filter((m) => m.type === "challengeAction");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].challengeId, 50);
  assert.equal(actions[0].method, "PUT");
  assert.equal(actions[0].status, 200);
});

test("registra o formato do 'salvar escalação' sem vazar o token", async () => {
  const page = makePage({ responses: { "/sbs/challenge/50/squad": {} } });
  const body = { players: [{ index: 1, itemData: { id: 123, dream: false } }] };
  await page.fetch(`${BASE}/sbs/challenge/50/squad`, {
    method: "PUT",
    headers: { "X-UT-SID": SID, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await page.until(() => page.posted.some((m) => m.type === "squadSaveSeen"));
  const seen = page.posted.find((m) => m.type === "squadSaveSeen");
  assert.equal(seen.challengeId, 50);
  assert.equal(seen.info.method, "PUT");
  assert.equal(JSON.stringify(seen.info.body), JSON.stringify(body));
  // Um PUT não pode sobrescrever a escalação capturada pelo GET.
  assert.equal(captures(page.posted, "challengeSquad").length, 0);
  page.toPage("ping");
  assert.equal(page.posted.find((m) => m.type === "pong").squadSaveKnown, true);
  assert.ok(!JSON.stringify(page.posted).includes(SID));
});

test("classifica DMEs, não atribuídos e banco de nomes", async () => {
  const responses = {
    "/sbs/setId/77/challenges": { challenges: [{ challengeId: 555, name: "X", elgReq: [] }] },
    "/sbs/challenge/555/squad": { squad: { formation: "f433", players: [] } },
    "/purchased/items": { itemData: [item()] },
    "/web-app/content/abc/2026/fut/items/web/players.json": { Players: [{ id: 7, f: "Marc", l: "Guéhi" }] },
  };
  const page = makePage({ responses });
  await page.fetch(`${BASE}/sbs/setId/77/challenges`);
  await page.fetch(`${BASE}/sbs/challenge/555/squad`);
  await page.fetch(`${BASE}/purchased/items`);
  await page.fetch("https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/abc/2026/fut/items/web/players.json");
  await page.fetch("https://www.google.com/qualquer-coisa");
  await page.until(() => page.posted.filter((m) => m.type === "capture").length >= 4);

  assert.equal(captures(page.posted, "challenges")[0].setId, 77);
  assert.equal(captures(page.posted, "challenges")[0].challenges[0].challengeId, 555);
  assert.equal(captures(page.posted, "challengeSquad")[0].challengeId, 555);
  assert.equal(captures(page.posted, "unassigned")[0].items.length, 1);
  assert.equal(JSON.stringify(captures(page.posted, "names")[0].data), JSON.stringify({ 7: "Marc Guéhi" }));
  // Requisições fora da EA são ignoradas completamente.
  assert.ok(!page.posted.some((m) => m.type === "request" && /google/.test(m.path)));
});
