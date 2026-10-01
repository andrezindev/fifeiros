// Roda DENTRO da página do Web App (world: MAIN), antes dos scripts da EA.
//
// 1. Escuta (sem alterar) as respostas que o Web App recebe do servidor da EA
//    e manda uma cópia para o content.js.
// 2. "Carregar clube inteiro": repete a MESMA requisição de busca do clube que
//    o Web App fez, trocando só o "start" (página), com pausas aleatórias.
//
// Segurança: os cabeçalhos da requisição (incluindo o token de sessão X-UT-SID)
// ficam só na memória desta página. Nunca são enviados ao content.js, salvos
// ou exportados.
(() => {
  if (window.__fifeirosHook) return;
  window.__fifeirosHook = true;

  const TAG = "__fifeiros";
  const UTAS = /\/ut\/game\/fc\d+\//;
  const originalFetch = window.fetch.bind(window);

  const post = (msg) => window.postMessage({ [TAG]: true, dir: "toContent", ...msg }, window.location.origin);

  function classify(rawUrl) {
    let path;
    try {
      path = new URL(rawUrl, location.href).pathname;
    } catch {
      return null;
    }
    if (/players\.json$/i.test(path)) return { kind: "names", path };
    if (!UTAS.test(path)) return null;
    const tail = path.replace(/^.*\/ut\/game\/fc\d+/, "");
    let m;
    if (/^\/club\/?$/.test(tail)) return { kind: "club", path: tail };
    if (/^\/purchased\/items\/?$/.test(tail)) return { kind: "unassigned", path: tail };
    if (/^\/storagepile/.test(tail)) return { kind: "storage", path: tail };
    if ((m = tail.match(/^\/sbs\/setId\/(\d+)\/challenges/))) return { kind: "challenges", path: tail, setId: +m[1] };
    if ((m = tail.match(/^\/sbs\/challenge\/(\d+)\/squad/))) return { kind: "challengeSquad", path: tail, challengeId: +m[1] };
    if (/^\/sbs\/hub/.test(tail)) return { kind: "sbcHub", path: tail };
    if (/^\/squad\/active\/?$/.test(tail)) return { kind: "activeSquad", path: tail };
    // Ação no desafio (provavelmente o ENVIO): endereço do desafio sem /squad.
    if ((m = tail.match(/^\/sbs\/challenge\/(\d+)\/?$/))) return { kind: "challengeAction", path: tail, challengeId: +m[1] };
    return { kind: "other", path: tail };
  }

  // Nomes: transforma o players.json (grande) em {assetId: nome} aqui mesmo.
  function compactNames(json) {
    const out = {};
    for (const list of [json?.Players, json?.LegendsPlayers, json?.players]) {
      for (const p of list ?? []) {
        const name = p.c || [p.f, p.l].filter(Boolean).join(" ");
        if (p.id !== undefined && name) out[p.id] = name;
      }
    }
    return out;
  }

  let clubTemplate = null; // { method, url, headers, body } da última busca do clube
  let squadSaveTemplate = null; // idem, do último "salvar escalação" de um DME (Fase 4)

  function parseBody(body) {
    try {
      return body ? JSON.parse(body) : null;
    } catch {
      return "(não-JSON)";
    }
  }

  // Parâmetros de uma busca "normal" do clube; qualquer outro é filtro.
  const CLUB_SEARCH_KEYS = new Set(["count", "start", "type", "sort", "sortBy", "searchAltPositions", "ovrMin", "ovrMax", "excludeLoans"]);

  function isFullClubSearch(t) {
    const u = new URL(t.url, location.href);
    if ([...u.searchParams.keys()].some((k) => !CLUB_SEARCH_KEYS.has(k))) return false;
    const b = parseBody(t.body);
    if (b && typeof b === "object") {
      if (Object.keys(b).some((k) => !CLUB_SEARCH_KEYS.has(k))) return false;
      if ((b.ovrMin ?? 0) > 45 || (b.ovrMax ?? 99) < 99) return false;
    }
    return true;
  }

  // Qualquer requisição do Web App à EA leva o cabeçalho de sessão (X-UT-SID).
  // Guardamos a última (só na memória da página) para o preenchimento funcionar
  // logo após abrir um DME, sem precisar abrir o clube antes.
  let sessionTemplate = null;
  const hasSession = (headers) => Object.keys(headers ?? {}).some((k) => /^x-ut-sid$/i.test(k));

  function handle(info, status, text) {
    const c = classify(info.url);
    if (!c) return;
    if (c.kind !== "names" && status >= 200 && status < 300 && hasSession(info.headers)) sessionTemplate = info;

    // "Salvar escalação" do DME: qualquer método que não seja GET no caminho do squad.
    // Guardamos o modelo (com cabeçalhos) só aqui na página; para fora vai só
    // método, caminho, corpo e status, para o diagnóstico.
    if (c.kind === "challengeSquad" && info.method !== "GET") {
      if (info.method !== "OPTIONS") squadSaveTemplate = { ...info, challengeId: c.challengeId };
      post({
        type: "squadSaveSeen",
        challengeId: c.challengeId,
        info: { method: info.method, path: c.path, body: parseBody(info.body), status, response: text ? text.slice(0, 2000) : null },
      });
      post({ type: "request", method: info.method, path: c.path, kind: "squadSave", status, keys: [] });
      return;
    }
    let data = null;
    if (status >= 200 && status < 300 && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    const keys = data && typeof data === "object" ? Object.keys(data).slice(0, 20) : [];
    post({ type: "request", method: info.method, path: c.path, kind: c.kind, status, keys });

    // Fase 5: envio do DME pelo usuário (feito pelo Web App, nunca pela extensão).
    if (c.kind === "challengeAction" && info.method !== "GET" && info.method !== "OPTIONS") {
      post({ type: "challengeAction", challengeId: c.challengeId, method: info.method, status, keys });
    }
    if (!data) return;

    if (c.kind === "names") {
      post({ type: "capture", kind: "names", data: compactNames(data) });
    } else if (c.kind === "club") {
      // Só uma busca SEM filtro serve de modelo para "Carregar clube inteiro"
      // (o Web App também busca um jogador específico, com defId, ao montar DMEs).
      if (info.method !== "OPTIONS" && isFullClubSearch(info)) clubTemplate = { ...info };
      post({ type: "capture", kind: "club", items: data.itemData ?? [], templateInfo: describeTemplate(clubTemplate) });
    } else if (c.kind === "unassigned" || c.kind === "storage") {
      post({ type: "capture", kind: c.kind, items: data.itemData ?? [] });
    } else if (c.kind === "challenges") {
      post({ type: "capture", kind: "challenges", setId: c.setId, challenges: data.challenges ?? [] });
    } else if (c.kind === "challengeSquad") {
      post({ type: "capture", kind: "challengeSquad", challengeId: c.challengeId, data });
    } else if (c.kind === "sbcHub") {
      post({ type: "capture", kind: "sbcHub", data: { squadPlayerItemIds: data.squadPlayerItemIds ?? null } });
    } else if (c.kind === "activeSquad" && info.method === "GET") {
      // Time titular + reservas: só os ids (para a opção "Excluir atletas do elenco ativo").
      const ids = (data.players ?? []).map((p) => String(p?.itemData?.id ?? 0)).filter((id) => id !== "0");
      post({ type: "capture", kind: "activeSquad", ids });
    }
  }

  // ---------- interceptação de XHR ----------
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const xhrHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__fif = { method: String(method).toUpperCase(), url: String(url), headers: {} };
    return xhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__fif) this.__fif.headers[k] = v;
    return xhrHeader.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__fif;
    if (info && classify(info.url)) {
      info.body = typeof body === "string" ? body : null;
      this.addEventListener("load", () => {
        try {
          const rt = this.responseType;
          const text = rt === "" || rt === "text" ? this.responseText : rt === "json" ? JSON.stringify(this.response) : null;
          handle(info, this.status, text);
        } catch (e) {
          post({ type: "hookError", message: String(e) });
        }
      });
    }
    return xhrSend.call(this, body);
  };

  // ---------- interceptação de fetch ----------
  function headersToObject(h) {
    if (!h) return {};
    if (h instanceof Headers) return Object.fromEntries(h.entries());
    if (Array.isArray(h)) return Object.fromEntries(h);
    return { ...h };
  }

  window.fetch = async function (input, init = {}) {
    const response = await originalFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      if (classify(url)) {
        const info = {
          method: String(init.method ?? input?.method ?? "GET").toUpperCase(),
          url,
          headers: headersToObject(init.headers ?? input?.headers),
          body: typeof init.body === "string" ? init.body : null,
        };
        response.clone().text().then((text) => handle(info, response.status, text), () => {});
      }
    } catch (e) {
      post({ type: "hookError", message: String(e) });
    }
    return response;
  };

  // ---------- carregador do clube inteiro ----------
  function paginator(t) {
    if (!t) return null;
    const u = new URL(t.url, location.href);
    if (u.searchParams.has("start")) {
      return {
        count: Number(u.searchParams.get("count")) || null,
        make(start) {
          const x = new URL(u);
          x.searchParams.set("start", String(start));
          return { url: x.toString(), body: t.body };
        },
      };
    }
    if (t.body) {
      try {
        const b = JSON.parse(t.body);
        if (b && typeof b === "object" && "start" in b) {
          return { count: Number(b.count) || null, make: (start) => ({ url: t.url, body: JSON.stringify({ ...b, start }) }) };
        }
      } catch {
        /* corpo não é JSON */
      }
    }
    return null;
  }

  // Descreve a busca SEM cabeçalhos (sem token): só método, caminho e parâmetros.
  function describeTemplate(t) {
    if (!t) return null;
    const u = new URL(t.url, location.href);
    let bodyKeys = null;
    try {
      bodyKeys = t.body ? JSON.parse(t.body) : null;
    } catch {
      bodyKeys = "(não-JSON)";
    }
    return {
      method: t.method,
      path: u.pathname.replace(/^.*\/ut\/game/, "/ut/game"),
      query: Object.fromEntries(u.searchParams.entries()),
      body: bodyKeys,
      paginable: Boolean(paginator(t)),
    };
  }

  // ---------- Fase 5: limite de ritmo de TODAS as requisições da extensão ----------
  // (As do próprio Web App não passam por aqui.) Mínimo de 3 s entre requisições
  // e no máximo 40 a cada 10 minutos.
  const RATE = { minGapMs: 3000, windowMs: 10 * 60 * 1000, maxInWindow: 40, ...(window.__FIFEIROS_RATE__ ?? {}) };
  const ourRequests = []; // horários das requisições da extensão
  let lastOurRequestAt = 0;

  class RateLimitError extends Error {}

  function rateStatus() {
    const now = Date.now();
    while (ourRequests.length && now - ourRequests[0] > RATE.windowMs) ourRequests.shift();
    return { used: ourRequests.length, max: RATE.maxInWindow, windowMin: Math.round(RATE.windowMs / 60000) };
  }

  /**
   * fetch com limite. waitForWindow=true (carregador): espera a janela liberar.
   * false (ações do usuário): falha na hora com mensagem clara.
   */
  async function limitedFetch(url, init, { waitForWindow = false, onWait } = {}) {
    for (;;) {
      const st = rateStatus();
      if (st.used < RATE.maxInWindow) break;
      const waitMs = RATE.windowMs - (Date.now() - ourRequests[0]) + 50;
      if (!waitForWindow) {
        throw new RateLimitError(`Limite de ${st.max} requisições em ${st.windowMin} min atingido. Espere ${Math.ceil(waitMs / 60000)} min.`);
      }
      onWait?.(waitMs);
      await sleep(Math.min(waitMs, 60000));
    }
    const gap = RATE.minGapMs - (Date.now() - lastOurRequestAt);
    if (gap > 0) await sleep(gap);
    lastOurRequestAt = Date.now();
    ourRequests.push(lastOurRequestAt);
    post({ type: "rate", state: rateStatus() });
    return originalFetch(url, init);
  }

  // Códigos em que paramos imediatamente para proteger a conta.
  const STOP_STATUSES = new Set([401, 403, 409, 426, 429, 458, 460, 461, 494, 512, 521]);
  let loader = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loadClub(opts = {}) {
    if (loader?.running) return;
    const minDelay = Math.max(1500, Number(opts.minDelayMs ?? 2000));
    const maxDelay = Math.max(minDelay, Number(opts.maxDelayMs ?? 4000));
    const maxPages = Number(opts.maxPages ?? 500);
    const pg = paginator(clubTemplate);
    if (!pg) {
      post({
        type: "loader",
        state: { running: false, error: clubTemplate
          ? "Não encontrei o parâmetro de página na busca do clube. Exporte o diagnóstico e me envie."
          : "Abra Clube > Jogadores no Web App primeiro (a extensão precisa ver uma busca do clube)." },
      });
      return;
    }
    loader = { running: true, stop: false, pages: 0, items: 0, error: null };
    post({ type: "loader", state: { ...loader, startedAt: Date.now() }, reset: true });

    let start = 0;
    try {
      while (!loader.stop && loader.pages < maxPages) {
        const req = pg.make(start);
        const res = await limitedFetch(
          req.url,
          { method: clubTemplate.method, headers: clubTemplate.headers, body: req.body },
          {
            waitForWindow: true, // clube grande: pausa no limite em vez de desistir
            onWait: (ms) => post({ type: "loader", state: { ...loader, waitingUntil: Date.now() + ms } }),
          },
        );
        if (loader.stop) break;
        if (!res.ok) {
          loader.error = STOP_STATUSES.has(res.status)
            ? `A EA respondeu ${res.status}. Parei para proteger sua conta. Espere alguns minutos antes de tentar de novo.`
            : `A EA respondeu ${res.status}. Parei o carregamento.`;
          break;
        }
        const data = await res.json();
        const items = data.itemData ?? [];
        loader.pages += 1;
        loader.items += items.length;
        post({ type: "capture", kind: "club", items, fromLoader: true });
        post({ type: "loader", state: { ...loader } });
        const pageSize = pg.count ?? items.length;
        if (items.length === 0 || (pg.count && items.length < pg.count)) break;
        start += pageSize;
        await sleep(minDelay + Math.random() * (maxDelay - minDelay));
      }
    } catch (e) {
      loader.error = `Erro no carregamento: ${e}`;
    }
    loader.running = false;
    post({ type: "loader", state: { ...loader, finishedAt: Date.now(), stopped: loader.stop } });
  }

  // ---------- Fase 4b: atualizar a tela do Web App sem recarregar ----------
  // O Web App guarda a escalação do DME na memória e só busca na EA uma vez
  // por sessão. Depois de salvar pela API, pedimos ao PRÓPRIO app que releia
  // a escalação (services.SBC.loadChallengeData, nome usado nas versões
  // anteriores do Web App). Tudo protegido: se algo não existir, só reporta.

  const safe = (fn, fallback = null) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const ctorName = (o) => safe(() => o?.constructor?.name ?? typeof o, "?");

  function methodNames(obj, limit = 120) {
    const out = new Set();
    let p = obj;
    // Para antes do protótipo base (Object.prototype de qualquer contexto).
    for (let i = 0; p && safe(() => Object.getPrototypeOf(p)) !== null && i < 6; i++, p = safe(() => Object.getPrototypeOf(p))) {
      for (const k of safe(() => Object.getOwnPropertyNames(p), [])) {
        if (k !== "constructor" && safe(() => typeof obj[k] === "function", false)) out.add(k);
      }
    }
    return [...out].sort().slice(0, limit);
  }

  const NAV_KEY = /controller|presented|child|current|navigation|split|left|right|view/i;
  const NAV_GETTERS = ["getRootViewController", "getPresentedViewController", "getCurrentViewController", "getCurrentController", "getChildViewControllers"];

  /** Percorre a árvore de telas (controllers) do Web App, só lendo. visit() → true para parar. */
  function walkControllers(visit) {
    const root = safe(() => (typeof window.getAppMain === "function" ? window.getAppMain() : null));
    if (!root) return false;
    const seen = new Set();
    const queue = [[root, 0, "getAppMain()"]];
    while (queue.length) {
      const [obj, depth, path] = queue.shift();
      if (!obj || typeof obj !== "object" || seen.has(obj) || depth > 8 || seen.size > 500) continue;
      seen.add(obj);
      if (safe(() => visit(obj, path), false) === true) return true;
      const push = (v, p) => {
        if (Array.isArray(v)) v.slice(0, 20).forEach((x, i) => queue.push([x, depth + 1, `${p}[${i}]`]));
        else if (v && typeof v === "object") queue.push([v, depth + 1, p]);
      };
      for (const m of NAV_GETTERS) {
        if (safe(() => typeof obj[m] === "function", false)) push(safe(() => obj[m]()), `${path}.${m}()`);
      }
      for (const k of safe(() => Object.keys(obj), [])) {
        if (NAV_KEY.test(k)) push(safe(() => obj[k]), `${path}.${k}`);
      }
    }
    return false;
  }

  /** Acha o objeto do DME (challenge) que está na tela. */
  function findChallengeOnScreen(challengeId) {
    let found = null;
    walkControllers((obj, path) => {
      for (const k of safe(() => Object.keys(obj), [])) {
        if (!/challenge/i.test(k)) continue;
        const v = safe(() => obj[k]);
        if (v && typeof v === "object" && Number(safe(() => v.id)) === challengeId && safe(() => v.squad)) {
          found = { challenge: v, controller: obj, path: `${path}.${k}` };
          return true;
        }
      }
      return false;
    });
    return found;
  }

  // No FC 27 cada slot é um UTSquadSlotEntity com o jogador em `_item` (UTItemEntity).
  const slotItem = (p) => safe(() => p?._item ?? p?.item ?? p?.getItem?.() ?? null);

  function squadSlots(squad) {
    return [...(safe(() => (typeof squad?.getPlayers === "function" ? squad.getPlayers() : squad?._players ?? squad?.players), []) ?? [])];
  }

  function squadItemIds(squad) {
    return squadSlots(squad).map((p) => Number(safe(() => slotItem(p)?.id ?? p?.id, 0)) || 0);
  }

  /** Chama uma função do app que devolve um "observable" (ou promise) e espera terminar. */
  function callAndWait(fn, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve("tempo esgotado"), timeoutMs);
      const done = (x) => {
        clearTimeout(timer);
        resolve(x ?? "ok");
      };
      let r;
      try {
        r = fn();
      } catch (e) {
        return done(`erro: ${e?.message ?? e}`);
      }
      if (r && typeof r.observe === "function") {
        try {
          r.observe(window, (_sender, response) => done(response?.success === false ? "falhou" : "ok"));
        } catch (e) {
          done(`erro: ${e?.message ?? e}`);
        }
      } else if (r && typeof r.then === "function") {
        r.then(() => done("ok"), (e) => done(`erro: ${e}`));
      } else {
        setTimeout(() => done("sem retorno"), 1500);
      }
    });
  }

  // Nomes confirmados no FC 27 (diagnóstico de 01/10/2026):
  //   services.SBC.loadChallenge(challenge)  — (re)carrega o DME
  //   UTSquadEntity.setCacheTimestamp / isCacheExpired — a escalação fica em cache
  //   UTSBCSquadOverviewViewController._pushSquadToView / setSquad — redesenha o campo
  /**
   * Obtém o jogador do próprio app (UTItemEntity) para um item do clube.
   * Ordem (nomes confirmados no FC 27):
   *   1. repositories.Item.getClub().getItem(id) — o objeto que o app já tem carregado;
   *   2. factories.Item.generateItemsFromItemData([itemData]) — como o app lê a resposta da EA.
   * Nunca aceita "tijolo" (createCustomBrickItem gera um bloco sem foto/nome/overall).
   */
  function makeAppItem(raw) {
    const want = Number(raw.id);
    const isRealPlayer = (it) =>
      it && Number(safe(() => it.id)) === want && safe(() => it.isCustomBrick?.()) !== true && Number(safe(() => it.definitionId ?? it._assetId ?? 0)) > 0;

    const fromClub = safe(() => window.repositories?.Item?.getClub?.()?.getItem?.(want));
    if (isRealPlayer(fromClub)) return { item: fromClub, how: "clube do app (getClub().getItem)" };

    const fac = safe(() => window.factories?.Item);
    if (typeof fac?.generateItemsFromItemData === "function") {
      const list = safe(() => fac.generateItemsFromItemData([raw]));
      const it = Array.isArray(list) ? list[0] : safe(() => list?.[0]);
      if (isRealPlayer(it)) return { item: it, how: "factories.Item.generateItemsFromItemData" };
    }
    return { item: null, how: "não consegui criar o jogador do app (nem pelo clube, nem pela fábrica)" };
  }

  /** Coloca os jogadores na escalação da memória do app (sem salvar: o PUT já salvou). */
  function placeInAppSquad(squad, entries, attempts) {
    const ok = () => entries.every((e) => Number(safe(() => slotItem(squadSlots(squad)[e.index])?.id)) === Number(e.item.id));
    if (typeof squad?.addItemToSlot === "function") {
      for (const e of entries) safe(() => squad.addItemToSlot(e.index, e.item));
      attempts.push(`addItemToSlot: ${ok() ? "ok" : "não refletiu"}`);
      if (ok()) return true;
    }
    if (typeof squad?.setPlayers === "function") {
      const arr = squadSlots(squad).map(slotItem);
      for (const e of entries) arr[e.index] = e.item;
      safe(() => squad.setPlayers(arr, true));
      attempts.push(`setPlayers: ${ok() ? "ok" : "não refletiu"}`);
      if (ok()) return true;
    }
    return false;
  }

  function redrawSquad(ctrl, squad, attempts) {
    for (const m of ["_pushSquadToView", "setSquad"]) {
      if (typeof ctrl?.[m] !== "function") continue;
      try {
        ctrl[m](squad);
        attempts.push(`redesenho: ${m}`);
        return m;
      } catch (e) {
        attempts.push(`${m}: erro ${e?.message ?? e}`);
      }
    }
    attempts.push("redesenho: nenhum método funcionou");
    return null;
  }

  async function refreshAppSquad(challengeId, expectedIds, slots = [], rawItems = {}) {
    const attempts = [];
    let target = findChallengeOnScreen(challengeId);
    if (!target) return { refreshed: false, reason: "não achei o DME na tela do Web App" };

    // Estratégia 1 (como o FUTGenie): põe os jogadores do app direto na escalação da memória.
    const squad = target.challenge.squad;
    const entries = [];
    const hows = new Set();
    for (const s of slots) {
      const raw = rawItems?.[String(s.itemId)];
      if (!raw) {
        attempts.push(`sem dados do jogador ${s.itemId}`);
        break;
      }
      const { item, how } = makeAppItem(raw);
      hows.add(how);
      if (!item) break;
      entries.push({ index: Number(s.index), item });
    }
    attempts.push(`criar jogadores: ${[...hows].join(" / ") || "-"}`);
    if (entries.length === slots.length && entries.length > 0 && placeInAppSquad(squad, entries, attempts)) {
      // Avisa o app que a escalação mudou: ele recalcula química, overall e requisitos.
      attempts.push(`avisar app: ${safe(() => (squad.onDataUpdated?.notify?.(), "ok"), "erro")}`);
      const redraw = redrawSquad(target.controller, squad, attempts);
      return { refreshed: true, matched: entries.length, redraw, attempts, path: target.path };
    }

    // Estratégia 2: pedir ao app para recarregar o DME.
    const sbc = safe(() => window.services?.SBC);
    const loader = ["loadChallenge", "loadChallengeData"].find((m) => typeof sbc?.[m] === "function");
    if (!loader) return { refreshed: false, reason: "o Web App não tem loadChallenge nesta versão", path: target.path };

    const matched = () => {
      const now = squadItemIds(target.challenge.squad);
      return expectedIds.filter((id) => now.includes(Number(id))).length;
    };

    // 1) Recarrega normalmente; 2) se o cache segurar a cópia velha, vence o cache e recarrega.
    for (const step of ["recarregar", "cache vencido"]) {
      if (step === "cache vencido") {
        const squad = target.challenge.squad;
        attempts.push(`setCacheTimestamp: ${typeof squad?.setCacheTimestamp === "function" ? (safe(() => (squad.setCacheTimestamp(0), "ok"), "erro")) : "não existe"}`);
      }
      const result = await callAndWait(() => sbc[loader](target.challenge));
      target = findChallengeOnScreen(challengeId) ?? target; // o app pode trocar o objeto
      const m = matched();
      attempts.push(`${loader} (${step}): ${result}, ${m}/${expectedIds.length} na memória do app`);
      if (m === expectedIds.length) break;
    }

    const inMemory = matched();
    if (inMemory !== expectedIds.length) {
      return { refreshed: false, matched: inMemory, reason: "o Web App não releu a escalação", attempts, path: target.path };
    }

    // A memória do app já tem o time: manda a tela redesenhar.
    const redraw = redrawSquad(target.controller, target.challenge.squad, attempts);
    return { refreshed: true, matched: inMemory, redraw, attempts, path: target.path };
  }

  /** Relatório só com NOMES do código interno (sem dados), para ajustar a Fase 4b. */
  function probe() {
    const report = {
      globals: {
        getAppMain: typeof window.getAppMain,
        services: safe(() => Object.keys(window.services ?? {}).slice(0, 60), null),
        repositories: safe(() => Object.keys(window.repositories ?? {}).slice(0, 60), null),
        factories: safe(() => Object.keys(window.factories ?? {}).slice(0, 60), null),
      },
      sbcServiceMethods: safe(() => methodNames(window.services?.SBC), null),
      itemRepositoryMethods: safe(() => methodNames(window.repositories?.Item), null),
      itemFactoryMethods: safe(() => methodNames(window.factories?.Item), null),
      squadFactoryMethods: safe(() => methodNames(window.factories?.Squad), null),
      clubCache: safe(() => {
        const c = window.repositories?.Item?.getClub?.();
        return { ctor: ctorName(c), keys: Object.keys(c ?? {}).slice(0, 20), methods: methodNames(c, 40) };
      }),
      controllers: [],
      challengeOnScreen: null,
    };
    walkControllers((obj, path) => {
      if (report.controllers.length < 40) {
        report.controllers.push({
          path,
          ctor: ctorName(obj),
          keys: safe(() => Object.keys(obj).filter((k) => /squad|challenge|pitch|item|slot/i.test(k)).slice(0, 20), []),
        });
      }
      for (const k of safe(() => Object.keys(obj), [])) {
        const v = safe(() => obj[k]);
        if (/challenge/i.test(k) && v && typeof v === "object" && safe(() => v.squad) && !report.challengeOnScreen) {
          report.challengeOnScreen = {
            path: `${path}.${k}`,
            ctor: ctorName(v),
            id: safe(() => v.id),
            methods: methodNames(v, 80),
            squadCtor: ctorName(v.squad),
            squadMethods: methodNames(v.squad, 120),
            // Formato de um slot (sem dados do jogador além do id), para ler a escalação da memória.
            slotSample: safe(() => {
              const list = squadSlots(v.squad);
              const p = list.find((x) => Number(slotItem(x)?.id ?? 0) > 0) ?? list[1];
              const item = slotItem(p);
              return {
                count: list.length,
                ctor: ctorName(p),
                keys: Object.keys(p ?? {}).slice(0, 25),
                slotMethods: methodNames(p, 60),
                itemCtor: ctorName(item),
                itemKeys: Object.keys(item ?? {}).slice(0, 40),
                itemMethods: methodNames(item, 120),
                idsRead: squadItemIds(v.squad).filter((x) => x > 0).length,
              };
            }),
            cacheExpired: safe(() => v.squad.isCacheExpired?.()),
            controllerCtor: ctorName(obj),
            controllerMethods: methodNames(obj, 150),
          };
        }
      }
      return false;
    });
    return report;
  }

  // ---------- Fase 4: preencher a escalação do DME ----------
  // Faz o mesmo "salvar escalação" que o Web App faz quando você coloca um
  // jogador (formato confirmado no FC 27):
  //   PUT /ut/game/fc27/sbs/challenge/{id}/squad
  //   {"players": [{"index": 0..22, "itemData": {"id": <item ou 0>, "dream": false}}]}
  // NUNCA envia o DME: a única URL permitida é a do "salvar escalação".
  const SQUAD_SLOTS = 23; // 11 titulares + 12 reservas
  const FILL_COOLDOWN_MS = 8000;
  let lastFillAt = 0;

  function authTemplate() {
    return sessionTemplate ?? squadSaveTemplate ?? clubTemplate;
  }

  function squadSaveUrl(challengeId) {
    const u = new URL(authTemplate().url, location.href);
    u.pathname = u.pathname.replace(/(\/ut\/game\/fc\d+)\/.*$/, `$1/sbs/challenge/${challengeId}/squad`);
    u.search = "";
    return u.toString();
  }

  function assertSafeFill(url, method) {
    const path = new URL(url).pathname;
    if (method !== "PUT" || !/^\/ut\/game\/fc\d+\/sbs\/challenge\/\d+\/squad$/.test(path) || /submit/i.test(url)) {
      throw new Error(`bloqueado por segurança: ${method} ${path}`);
    }
  }

  function validateSlots(slots) {
    if (!Array.isArray(slots) || slots.length === 0 || slots.length > 11) return "lista de jogadores inválida";
    const idx = new Set();
    const ids = new Set();
    for (const s of slots) {
      const i = Number(s?.index);
      const id = String(s?.itemId ?? "");
      if (!Number.isInteger(i) || i < 0 || i > 10) return `slot inválido: ${s?.index}`;
      if (!/^\d+$/.test(id) || id === "0") return `jogador inválido: ${s?.itemId}`;
      if (idx.has(i) || ids.has(id)) return "slot ou jogador repetido";
      idx.add(i);
      ids.add(id);
    }
    return null;
  }

  // rawItems: {itemId: itemData cru da EA} dos jogadores do plano, para criar os
  // objetos do app na memória (Fase 4b). Opcional.
  async function fillSquad({ challengeId, slots, rawItems = {} } = {}) {
    const fail = (error) => post({ type: "fillResult", ok: false, challengeId, error, at: Date.now() });
    post({ type: "request", method: "FILL", path: `/sbs/challenge/${challengeId}/squad`, kind: "fill", status: 0, keys: (slots ?? []).map((s) => `${s?.index}:${s?.itemId}`) });
    if (!Number.isInteger(challengeId)) return fail("DME inválido.");
    const invalid = validateSlots(slots);
    if (invalid) return fail(`Não preenchi: ${invalid}.`);
    if (!authTemplate()) return fail("Saia e entre de novo no DME (a extensão precisa ver o Web App falar com a EA) e tente outra vez.");
    const wait = FILL_COOLDOWN_MS - (Date.now() - lastFillAt);
    if (wait > 0) return fail(`Espere ${Math.ceil(wait / 1000)}s antes de preencher de novo.`);

    const players = Array.from({ length: SQUAD_SLOTS }, (_, index) => ({ index, itemData: { id: 0, dream: false } }));
    for (const s of slots) players[Number(s.index)].itemData.id = Number(s.itemId);
    const url = squadSaveUrl(challengeId);
    try {
      assertSafeFill(url, "PUT");
    } catch (e) {
      return fail(String(e.message));
    }
    const headers = { ...authTemplate().headers, "Content-Type": "application/json" };
    lastFillAt = Date.now();
    try {
      const res = await limitedFetch(url, { method: "PUT", headers, body: JSON.stringify({ players }) });
      if (!res.ok) {
        return fail(STOP_STATUSES.has(res.status)
          ? `A EA recusou (${res.status}). Não tente de novo agora; espere alguns minutos.`
          : `A EA respondeu ${res.status}. Nada foi alterado.`);
      }
    } catch (e) {
      lastFillAt = 0; // nada foi enviado: não precisa esperar
      return fail(e instanceof RateLimitError ? e.message : `Erro de rede: ${e}`);
    }
    const ids = slots.map((s) => String(s.itemId));

    // Fase 4b: coloca os jogadores na escalação da memória do app e redesenha a tela.
    const refresh = await refreshAppSquad(challengeId, ids, slots, rawItems).catch((e) => ({
      refreshed: false, reason: String(e),
    }));

    // Conferência no servidor só se a tela não atualizou (economiza requisições).
    let saved = null;
    let savedIds = [];
    if (!refresh.refreshed) {
      try {
        const check = await limitedFetch(url, { method: "GET", headers: authTemplate().headers });
        if (check.ok) {
          const data = await check.json();
          const list = data?.squad?.players ?? data?.players ?? [];
          savedIds = list.filter((p) => Number(p?.itemData?.id) > 0).map((p) => `${p.index}:${p.itemData.id}`);
          const wanted = new Set(slots.map((s) => `${Number(s.index)}:${String(s.itemId)}`));
          saved = savedIds.filter((x) => wanted.has(x)).length;
        }
      } catch {
        saved = null; // conferência é opcional
      }
    }
    post({ type: "fillResult", ok: true, challengeId, count: slots.length, ids, saved, savedIds, refresh, at: Date.now() });
    post({ type: "probe", report: probe() });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (event.source !== window || !msg || msg[TAG] !== true || msg.dir !== "toPage") return;
    if (msg.cmd === "loadClub") loadClub(msg.options);
    if (msg.cmd === "fillSquad") fillSquad(msg.options);
    if (msg.cmd === "stopLoad" && loader) loader.stop = true;
    if (msg.cmd === "ping") {
      post({ type: "pong", templateInfo: describeTemplate(clubTemplate), loader, squadSaveKnown: Boolean(squadSaveTemplate) });
      post({ type: "probe", report: probe() });
    }
  });

  post({ type: "hookReady" });
})();
