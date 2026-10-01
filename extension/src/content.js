// Ponte entre a página (page-hook.js) e o armazenamento da extensão.
// Guarda os dados crus capturados em chrome.storage.local; quem converte para o
// formato do solver é o popup (src/normalize/).
(() => {
  const TAG = "__fifeiros";
  const MAX_LOG = 200;
  const SAMPLE_ITEMS = 5;

  const state = {
    club: {}, unassigned: {}, storage: {}, names: {},
    challenges: {}, squads: {}, currentChallengeId: null,
    sbcHub: null,       // { squadPlayerItemIds }: jogadores presos em DMEs não enviados
    squadSaves: [],     // últimos "salvar escalação" vistos (formato, para a Fase 4)
    lastFill: null,     // resultado do último "Preencher no DME"
    probe: null,        // nomes do código interno do Web App (sem dados), para a Fase 4b
    // Fase 5: loop de DMEs
    lastSquadIds: {},   // {challengeId: [itemIds]} última escalação conhecida de cada DME
    stats: { completed: {} }, // {challengeId: quantas vezes enviado (detectado)}
    lastSubmit: null,   // último envio detectado
    rate: null,         // uso do limite de ritmo da extensão
    activeSquadIds: [], // jogadores do elenco ativo (opção "Excluir atletas do elenco ativo")
    loader: null, templateInfo: null,
    diag: { requests: [], samples: {}, hookErrors: [] },
    updatedAt: null,
  };
  let loaded = false;
  const pending = [];

  // Só as chaves deste script (opções e soluções pertencem ao background/popup).
  const OWN_KEYS = Object.keys(state);
  chrome.storage.local.get(OWN_KEYS, (saved) => {
    Object.assign(state, saved ?? {});
    state.diag ??= { requests: [], samples: {}, hookErrors: [] };
    loaded = true;
    pending.splice(0).forEach(apply);
  });

  // Grava só as chaves que mudaram (o clube pode ter milhares de itens).
  let saveTimer = null;
  const dirty = new Set();
  function save(...keys) {
    keys.forEach((k) => dirty.add(k));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      state.updatedAt = Date.now();
      const patch = { updatedAt: state.updatedAt };
      for (const k of dirty) patch[k] = state[k];
      dirty.clear();
      chrome.storage.local.set(patch);
    }, 400);
  }

  function sample(kind, value) {
    if (!state.diag.samples[kind]) state.diag.samples[kind] = value;
  }

  function upsertItems(target, items) {
    for (const it of items) if (it && it.id !== undefined) target[it.id] = it;
  }

  const CONSUME_KEYS = ["club", "unassigned", "storage", "lastSquadIds", "stats", "lastSubmit", "diag"];
  const KEYS_BY_MSG = {
    request: ["diag"], hookError: ["diag"], loader: ["loader", "club"], pong: ["templateInfo"],
    names: ["names"], club: ["club", "diag", "templateInfo"], storage: ["storage", "diag"],
    unassigned: ["unassigned", "diag"], challenges: ["challenges", ...CONSUME_KEYS],
    challengeSquad: ["squads", "currentChallengeId", "diag"],
    sbcHub: ["sbcHub"], squadSaveSeen: ["squadSaves", "lastSquadIds"],
    fillResult: ["lastFill", "lastSquadIds", "diag"], probe: ["probe"],
    challengeAction: CONSUME_KEYS, rate: ["rate"], activeSquad: ["activeSquadIds"],
  };

  // ---------- Fase 5: depois de um envio, tira do clube os jogadores gastos ----------
  // Regra de segurança: é melhor tirar por engano (o solver só deixa de usar o
  // jogador até o próximo "Carregar clube") do que deixar um jogador já gasto.
  const nonZeroIds = (players) =>
    (players ?? []).map((p) => String(p?.itemData?.id ?? 0)).filter((id) => id !== "0");

  function consume(challengeId, how) {
    const ids = state.lastSquadIds?.[challengeId] ?? [];
    const recent = state.lastSubmit?.challengeId === challengeId && Date.now() - (state.lastSubmit?.at ?? 0) < 120000;
    if (!ids.length && recent) return; // o mesmo envio já foi contado pelo outro sinal
    let removed = 0;
    for (const id of ids) {
      for (const pile of ["club", "unassigned", "storage"]) {
        if (state[pile]?.[id]) {
          delete state[pile][id];
          removed += 1;
        }
      }
    }
    state.stats ??= { completed: {} };
    state.stats.completed[challengeId] = (state.stats.completed[challengeId] ?? 0) + 1;
    delete state.lastSquadIds[challengeId];
    state.lastSubmit = { challengeId, removed, how, at: Date.now() };
    state.diag.requests.push({ t: Date.now(), method: "SUBMIT", kind: "consume", status: how, keys: [`${removed} jogadores removidos`, ...ids] });
  }

  function apply(msg) {
    applyMessage(msg);
    save(...(KEYS_BY_MSG[msg.type === "capture" ? msg.kind : msg.type] ?? []));
  }

  function applyMessage(msg) {
    if (msg.type === "request") {
      state.diag.requests.push({ t: Date.now(), method: msg.method, path: msg.path, kind: msg.kind, status: msg.status, keys: msg.keys });
      if (state.diag.requests.length > MAX_LOG) state.diag.requests.splice(0, state.diag.requests.length - MAX_LOG);
    } else if (msg.type === "hookError") {
      state.diag.hookErrors.push({ t: Date.now(), message: msg.message });
      state.diag.hookErrors = state.diag.hookErrors.slice(-20);
    } else if (msg.type === "capture") {
      const k = msg.kind;
      if (k === "names") {
        Object.assign(state.names, msg.data);
      } else if (k === "club" || k === "storage") {
        upsertItems(state[k], msg.items);
        sample(k, msg.items.slice(0, SAMPLE_ITEMS));
        if (msg.templateInfo) state.templateInfo = msg.templateInfo;
      } else if (k === "unassigned") {
        // A resposta traz a pilha inteira de "não atribuídos": substitui.
        state.unassigned = {};
        upsertItems(state.unassigned, msg.items);
        sample(k, msg.items.slice(0, SAMPLE_ITEMS));
      } else if (k === "challenges") {
        for (const c of msg.challenges) {
          if (c?.challengeId === undefined) continue;
          // Sinal 2 de envio: o contador "vezes completado" aumentou.
          const before = state.challenges[c.challengeId]?.timesCompleted;
          if (before !== undefined && Number(c.timesCompleted) > Number(before)) consume(c.challengeId, "contador aumentou");
          state.challenges[c.challengeId] = { ...c, setId: c.setId ?? msg.setId };
        }
        sample("challenges", msg.challenges.slice(0, 3));
      } else if (k === "challengeSquad") {
        state.squads[msg.challengeId] = msg.data;
        state.currentChallengeId = msg.challengeId;
        state.diag.samples.challengeSquad = msg.data;
      } else if (k === "sbcHub") {
        state.sbcHub = msg.data;
      } else if (k === "activeSquad") {
        state.activeSquadIds = msg.ids ?? [];
      }
    } else if (msg.type === "probe") {
      state.probe = msg.report;
    } else if (msg.type === "challengeAction") {
      // Sinal 1 de envio: o Web App mandou uma ação no desafio e a EA aceitou.
      state.diag.requests.push({ t: Date.now(), method: msg.method, path: `/sbs/challenge/${msg.challengeId}`, kind: "challengeAction", status: msg.status, keys: msg.keys });
      if (msg.status >= 200 && msg.status < 300) consume(msg.challengeId, `${msg.method} no desafio`);
    } else if (msg.type === "rate") {
      state.rate = { ...msg.state, at: Date.now() };
    } else if (msg.type === "fillResult") {
      if (msg.ok && msg.ids?.length) {
        state.lastSquadIds ??= {};
        state.lastSquadIds[msg.challengeId] = msg.ids.map(String);
      }
      state.lastFill = {
        ok: msg.ok, challengeId: msg.challengeId, error: msg.error ?? null, count: msg.count ?? 0,
        saved: msg.saved ?? null, savedIds: msg.savedIds ?? [], refresh: msg.refresh ?? null, at: msg.at,
      };
      state.diag.requests.push({
        t: Date.now(), method: "FILL", kind: "fillResult", status: msg.ok ? "ok" : "erro",
        keys: [msg.error ?? `${msg.count} enviados, ${msg.saved ?? "?"} conferidos no servidor`, ...(msg.savedIds ?? [])],
      });
    } else if (msg.type === "squadSaveSeen") {
      state.squadSaves = [...(state.squadSaves ?? []), { t: Date.now(), challengeId: msg.challengeId, ...msg.info }].slice(-5);
      // O usuário mexeu na escalação pelo próprio app: essa passa a ser a escalação do DME.
      if (msg.info?.status >= 200 && msg.info?.status < 300 && Array.isArray(msg.info?.body?.players)) {
        state.lastSquadIds ??= {};
        state.lastSquadIds[msg.challengeId] = nonZeroIds(msg.info.body.players);
      }
    } else if (msg.type === "loader") {
      if (msg.reset) state.club = {}; // carregamento completo: começa do zero
      state.loader = msg.state;
    } else if (msg.type === "pong") {
      if (msg.templateInfo) state.templateInfo = msg.templateInfo;
    }
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (event.source !== window || !msg || msg[TAG] !== true || msg.dir !== "toContent") return;
    if (loaded) apply(msg);
    else pending.push(msg);
  });

  // Comandos vindos do popup.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.cmd === "loadClub" || msg?.cmd === "stopLoad" || msg?.cmd === "ping") {
      window.postMessage({ [TAG]: true, dir: "toPage", cmd: msg.cmd, options: msg.options }, window.location.origin);
      reply({ ok: true });
    } else if (msg?.cmd === "clear") {
      for (const k of ["club", "unassigned", "storage", "challenges", "squads"]) state[k] = {};
      state.currentChallengeId = null;
      state.sbcHub = null;
      state.squadSaves = [];
      state.lastSquadIds = {};
      state.stats = { completed: {} };
      state.lastSubmit = null;
      state.loader = null;
      state.diag = { requests: [], samples: {}, hookErrors: [] };
      // Apaga os dados capturados e a última solução; mantém as opções do solver.
      chrome.storage.local.get("solverOptions", ({ solverOptions }) => {
        chrome.storage.local.clear(() => {
          if (solverOptions) chrome.storage.local.set({ solverOptions });
          save(...OWN_KEYS.filter((k) => k !== "updatedAt"));
          reply({ ok: true });
        });
      });
      return true;
    }
    return false;
  });
})();
