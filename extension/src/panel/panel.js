// Painel flutuante dentro do Web App que mostra a solução do DME.
// Só exibe informação: não clica em nada, não altera o DME.
(() => {
  if (window.__fifeirosPanel) return;
  window.__fifeirosPanel = true;

  const CATEGORY = {
    untradeable_duplicate: ["dup. intransf.", "dup"],
    untradeable: ["intransferível", "untr"],
    tradeable: ["negociável", "trade"],
    market: ["COMPRAR", "buy"],
  };

  // Mesmo visual do popup: azul-marinho, destaque verde-água, cartões com borda.
  const CSS = `
    :host { all: initial; }
    .panel {
      --bg: #0b1220; --bg-2: #0f1a2e; --card: #121d33; --line: #22314f; --line-2: #2c3e63;
      --fg: #e8eefb; --muted: #8a9ab8; --accent: #2ee6b6; --accent-2: #1fb894; --ink: #062b22;
      --blue: #4c8dff; --danger: #ff6b7a; --warn-bg: #3a2f12; --warn-fg: #f3d27a;
      position: fixed; top: 90px; right: 16px; width: 392px; max-height: calc(100vh - 110px);
      display: flex; flex-direction: column; z-index: 2147483000;
      color: var(--fg); font: 13px/1.45 "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(120% 40% at 100% 0%, rgba(46,230,182,.10), transparent 60%),
        radial-gradient(90% 35% at 0% 0%, rgba(76,141,255,.12), transparent 60%),
        var(--bg);
      border: 1px solid var(--line-2); border-radius: 14px;
      box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.02) inset;
      overflow: hidden;
    }
    .panel[hidden] { display: none; }
    .panel.min .body { display: none; }

    header {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px;
      cursor: move; user-select: none; border-bottom: 1px solid var(--line);
      background: rgba(15,26,46,.7);
    }
    .logo {
      width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center;
      font-weight: 800; font-size: 13px; color: var(--ink);
      background: linear-gradient(135deg, var(--accent), var(--blue));
    }
    .title { flex: 1; font-weight: 700; letter-spacing: .4px; }

    button {
      font: inherit; font-weight: 600; color: var(--fg); background: var(--bg-2);
      border: 1px solid var(--line-2); border-radius: 8px; padding: 6px 11px; cursor: pointer;
      transition: border-color .15s, background .15s, transform .05s, box-shadow .15s;
    }
    button:hover:not(:disabled) { border-color: var(--accent); background: #13223b; }
    button:active:not(:disabled) { transform: translateY(1px); }
    button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(46,230,182,.3); }
    button:disabled { opacity: .45; cursor: default; }
    button.primary {
      color: var(--ink); border-color: var(--accent);
      background: linear-gradient(180deg, var(--accent), var(--accent-2));
      box-shadow: 0 4px 14px rgba(46,230,182,.22);
    }
    button.primary:hover:not(:disabled) { background: linear-gradient(180deg, #4cf0c6, var(--accent)); }
    button.icon { width: 30px; padding: 6px 0; text-align: center; }
    button.big { width: 100%; padding: 10px 12px; font-size: 13.5px; }

    .body { overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
    .body > * { flex: none; } /* nenhum bloco encolhe: a área rola */
    .body::-webkit-scrollbar { width: 8px; }
    .body::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 8px; }
    .muted { color: var(--muted); }
    .small { font-size: 11.5px; }
    .small:empty { display: none; }
    .head-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .head-line b { font-size: 14px; }
    .badge {
      font-size: 10.5px; padding: 2px 7px; border-radius: 999px; white-space: nowrap;
      border: 1px solid rgba(46,230,182,.4); color: var(--accent); background: rgba(46,230,182,.07);
    }
    .warn, .err {
      border-radius: 8px; padding: 7px 9px; font-size: 12px;
    }
    .warn { background: var(--warn-bg); color: var(--warn-fg); border: 1px solid rgba(243,210,122,.25); }
    .err { background: rgba(255,107,122,.08); color: #ffb3bb; border: 1px solid rgba(255,107,122,.35); }

    .squad { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--card); }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    td { padding: 6px 6px; border-bottom: 1px solid var(--line); white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(76,141,255,.06); }
    td.name { white-space: normal; font-weight: 600; }
    td.num { text-align: right; }
    .pos {
      width: 38px; text-align: center; font-size: 10.5px; font-weight: 700; color: #c9d5ee;
    }
    .pos span { display: inline-block; min-width: 30px; padding: 2px 0; border-radius: 6px; background: var(--bg-2); border: 1px solid var(--line-2); }
    .ovr { font-weight: 700; }
    .oop { color: #ffb86b; font-weight: 500; font-size: 11px; }
    .chem { letter-spacing: 1px; color: var(--accent); font-size: 10px; }
    .tag { font-size: 10px; font-weight: 600; border-radius: 999px; padding: 2px 7px; border: 1px solid transparent; }
    .tag.dup { background: rgba(46,230,182,.10); color: #8ff0d4; border-color: rgba(46,230,182,.3); }
    .tag.untr { background: rgba(76,141,255,.10); color: #a9c4ff; border-color: rgba(76,141,255,.3); }
    .tag.trade { background: rgba(243,210,122,.10); color: #f3d27a; border-color: rgba(243,210,122,.3); }
    .tag.buy { background: rgba(255,107,122,.10); color: #ffb3bb; border-color: rgba(255,107,122,.35); }

    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center; }
    .totals div { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px 4px; }
    .totals b { display: block; font-size: 18px; }
    .totals span { font-size: 10.5px; color: var(--muted); }

    ul.reqs { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
    ul.reqs li { display: flex; gap: 7px; align-items: baseline; font-size: 12px; }
    ul.reqs li::before { flex: none; width: 16px; height: 16px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 10px; font-weight: 800; }
    li.ok::before { content: "✓"; color: var(--ink); background: var(--accent); }
    li.bad::before { content: "✕"; color: #fff; background: var(--danger); }

    .fill { display: grid; gap: 8px; padding-top: 2px; }
    .okmsg { color: var(--accent); font-size: 12px; }
    .foot { font-size: 11px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; }
  `;

  const host = document.createElement("div");
  host.id = "fifeiros-panel-host";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;
  root.append(style, panel);

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }

  const btnSolve = el("button", { className: "primary", textContent: "Resolver" });
  const btnMin = el("button", { className: "icon", textContent: "–", title: "Minimizar" });
  const btnClose = el("button", { className: "icon", textContent: "×", title: "Fechar" });
  const header = el("header", {},
    el("span", { className: "logo", textContent: "F" }),
    el("span", { className: "title", textContent: "FIFEIROS" }),
    btnSolve, btnMin, btnClose);
  const body = el("div", { className: "body" });
  panel.append(header, body);

  // ---------- arrastar ----------
  let drag = null;
  header.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const x = Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - 120);
    const y = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - 40);
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, right: "auto" });
  });
  header.addEventListener("pointerup", () => (drag = null));

  // ---------- renderização ----------
  const chemDots = (n) => "◆".repeat(n) + "◇".repeat(3 - n);
  const coins = (n) => (n ?? 0).toLocaleString("pt-BR");

  function renderSolution(result, currentChallengeId, completed = {}) {
    const sol = result.solution;
    const parts = [];
    const done = completed?.[result.challengeId] ?? 0;
    const statusPt = { OPTIMAL: "ótima", FEASIBLE: "válida" }[sol.status] ?? sol.status;
    parts.push(el("div", { className: "head-line" },
      el("b", { textContent: sol.sbc }),
      el("span", { className: "badge", textContent: `solução ${statusPt} · ${sol.solve_time_s}s` })));
    if (done) parts.push(el("div", { className: "muted small", textContent: `Enviados nesta conta: ${done}` }));

    if (result.challengeId !== null && currentChallengeId !== null && result.challengeId !== currentChallengeId) {
      parts.push(el("div", { className: "warn", textContent: "Esta solução é de outro DME. Clique em Resolver para o DME aberto." }));
    }
    for (const w of sol.warnings ?? []) {
      parts.push(el("div", { className: "warn", textContent: `⚠ ${w} Confira no jogo antes de enviar.` }));
    }

    if (!sol.squad?.length) {
      parts.push(el("div", { className: "err", textContent: `Sem solução: ${sol.reason}` }));
      if (sol.diagnostics?.length) parts.push(el("ul", { className: "reqs" }, sol.diagnostics.map((d) => el("li", { className: "bad", textContent: d }))));
      return parts;
    }

    const rows = sol.squad.map((s) =>
      el("tr", {},
        el("td", { className: "pos" }, el("span", { textContent: s.slot_position })),
        el("td", { className: "name" }, s.name, s.in_position ? null : el("span", { className: "oop", textContent: ` (${s.position})` })),
        el("td", { className: "num ovr", textContent: String(s.rating) }),
        el("td", { className: "chem", textContent: chemDots(s.chemistry), title: `Química ${s.chemistry}` }),
        el("td", {}, el("span", { className: `tag ${CATEGORY[s.category][1]}`, textContent: CATEGORY[s.category][0] })),
        el("td", { className: "num muted", textContent: s.coin_cost ? coins(s.coin_cost) : "–" })));
    parts.push(el("div", { className: "squad" }, el("table", {}, el("tbody", {}, rows))));

    parts.push(el("div", { className: "totals" },
      el("div", {}, el("b", { textContent: String(sol.team_rating) }), el("span", { textContent: "overall" })),
      el("div", {}, el("b", { textContent: `${sol.team_chemistry}/33` }), el("span", { textContent: "química" })),
      el("div", {}, el("b", { textContent: coins(sol.total_cost) }), el("span", { textContent: "moedas" }))));

    if (sol.to_buy?.length) {
      parts.push(el("div", { className: "warn", textContent: `Comprar: ${sol.to_buy.map((b) => `${b.name} (${coins(b.price)})`).join(", ")}` }));
    }
    const reqs = (sol.requirements ?? []).filter((r) => !/^(Time completo|Sem jogador repetido)/.test(r.description));
    parts.push(el("ul", { className: "reqs" }, reqs.map((r) => el("li", { className: r.ok ? "ok" : "bad", textContent: `${r.description} (atual: ${r.actual})` }))));

    const btnFill = el("button", { className: "primary big", textContent: "Preencher no DME" });
    btnFill.addEventListener("click", fill);
    parts.push(el("div", { className: "fill" }, btnFill, fillStatus));
    parts.push(el("div", { className: "foot", textContent: "\"Preencher\" só coloca os jogadores; o Enviar é sempre seu. Posição em laranja = fora de posição." }));
    return parts;
  }

  // ---------- Fase 4: preencher ----------
  const fillStatus = el("div", { className: "small" });
  let planModule = null;

  function setFillStatus(text, kind = "muted") {
    fillStatus.className = `small ${kind}`;
    fillStatus.textContent = text;
  }

  async function fill() {
    planModule ??= await import(chrome.runtime.getURL("src/fill-plan.js"));
    const state = await chrome.storage.local.get([
      "lastSolution", "club", "unassigned", "storage", "sbcHub", "squads", "currentChallengeId",
    ]);
    const { plan, error } = planModule.buildFillPlan(state.lastSolution, state);
    if (error) return setFillStatus(error, "err");
    const list = plan.slots.map((s) => `${s.position}: ${s.name} (${s.rating})`).join("\n");
    const ok = confirm(
      `Colocar estes ${plan.slots.length} jogadores no DME aberto?\n\n${list}\n\n` +
      "O DME NÃO será enviado. Depois, recarregue o Web App (F5) para ver o time, confira e aperte Enviar você mesmo.",
    );
    if (!ok) return setFillStatus("Cancelado.");
    setFillStatus("Preenchendo…");
    // Dados crus da EA de cada jogador, para a extensão criá-los na memória do Web App.
    const rawItems = {};
    for (const s of plan.slots) {
      rawItems[s.itemId] = state.club?.[s.itemId] ?? state.unassigned?.[s.itemId] ?? state.storage?.[s.itemId];
    }
    window.postMessage({
      __fifeiros: true, dir: "toPage", cmd: "fillSquad",
      options: { challengeId: plan.challengeId, slots: plan.slots.map(({ index, itemId }) => ({ index, itemId })), rawItems },
    }, window.location.origin);
  }

  function showFillResult(r) {
    if (!r) return;
    if (r.ok && r.saved !== null && r.saved !== undefined && r.saved < r.count) {
      setFillStatus(`A EA aceitou o pedido, mas só ${r.saved} de ${r.count} jogadores ficaram salvos. Exporte o diagnóstico e me envie.`, "err");
    } else if (r.ok && r.refresh?.refreshed) {
      setFillStatus(`✓ ${r.count} jogadores colocados no DME. Confira na tela e aperte Enviar você mesmo.`, "okmsg");
    } else if (r.ok) {
      // Não conseguimos atualizar a tela do Web App: ele mostra a cópia antiga
      // até a página ser recarregada.
      const check = r.saved === r.count ? ` (${r.saved}/${r.count} conferidos na EA)` : "";
      setFillStatus(
        `✓ ${r.count} jogadores salvos${check}. O Web App só mostra depois de RECARREGAR a página. ` +
        "Não mexa no DME antes disso (o app apagaria o time). Depois de recarregar, volte ao DME, confira e aperte Enviar.",
        "okmsg",
      );
      if (r.refresh?.reason || r.refresh?.matched !== undefined) {
        const why = r.refresh.reason ?? `o Web App releu, mas só ${r.refresh.matched}/${r.count} apareceram`;
        fillStatus.append(el("div", { className: "muted small", textContent: `(tela não atualizou: ${why})` }));
      }
      const reload = el("button", { className: "primary", textContent: "Recarregar Web App agora" });
      reload.addEventListener("click", () => location.reload());
      fillStatus.append(el("div", {}, reload));
    } else {
      setFillStatus(r.error, "err");
    }
  }

  async function render() {
    const { lastSolution: result, currentChallengeId = null, stats } = await chrome.storage.local.get(["lastSolution", "currentChallengeId", "stats"]);
    let parts;
    if (!result) {
      parts = [el("div", { className: "muted", textContent: "Abra um DME e clique em Resolver." })];
    } else if (result.running) {
      parts = [el("div", { className: "muted", textContent: "Resolvendo… (até alguns segundos)" })];
    } else if (result.error) {
      parts = [el("div", { className: "err", textContent: result.error })];
    } else {
      parts = renderSolution(result, currentChallengeId, stats?.completed);
    }
    btnSolve.disabled = Boolean(result?.running);
    body.replaceChildren(...parts);
  }

  function show() {
    if (!host.isConnected) document.documentElement.append(host);
    panel.hidden = false;
    panel.classList.remove("min");
    render();
  }

  btnSolve.addEventListener("click", () => {
    show();
    chrome.runtime.sendMessage({ cmd: "solve" }).catch(() => {});
  });
  btnMin.addEventListener("click", () => panel.classList.toggle("min"));
  btnClose.addEventListener("click", () => (panel.hidden = true));

  // Fase 5: depois de um envio detectado, convida para o próximo.
  function showSubmit(s) {
    if (!s) return;
    show();
    setFillStatus(
      `✓ DME enviado. ${s.removed} jogadores usados saíram da lista da extensão. Clique em Resolver para o próximo.`,
      "okmsg",
    );
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastSubmit?.newValue) {
      showSubmit(changes.lastSubmit.newValue);
      return;
    }
    if (changes.lastFill) showFillResult(changes.lastFill.newValue);
    if (changes.lastSolution) {
      setFillStatus("");
      if (changes.lastSolution.newValue) show();
      else render();
    } else if (changes.currentChallengeId && !panel.hidden) {
      render();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.cmd === "showPanel") {
      show();
      reply({ ok: true }); // o popup usa a resposta para saber se a página está com a versão atual
    }
    return false;
  });

  // Para a pré-visualização (tools/panel-preview.html).
  window.__fifeirosPanelShow = show;
})();
