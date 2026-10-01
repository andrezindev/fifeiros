import { buildClub, buildDiagnostic, describeRequirement, summarize } from "../normalize/export.js";
import { DEFAULT_OPTIONS } from "../solver-config.js";

const $ = (id) => document.getElementById(id);
const WEB_APP = /^https:\/\/www\.ea\.com\/.*ultimate-team\/web-app/;
const VERSION = chrome.runtime.getManifest().version;

let tab = null;

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function message(text) {
  $("msg").textContent = text;
}

async function getState() {
  return chrome.storage.local.get(null);
}

function sendToTab(cmd, options) {
  if (!tab) return Promise.resolve(null);
  return chrome.tabs.sendMessage(tab.id, { cmd, options }).catch(() => {
    message("Não consegui falar com a página. Recarregue o Web App (F5) e tente de novo.");
    return null;
  });
}

function renderLoader(loader, templateInfo) {
  const el = $("loader-status");
  const running = Boolean(loader?.running);
  $("btn-load").hidden = running;
  $("btn-stop").hidden = !running;
  $("btn-load").disabled = !tab;
  if (running && loader.waitingUntil && loader.waitingUntil > Date.now()) {
    const min = Math.ceil((loader.waitingUntil - Date.now()) / 60000);
    el.textContent = `Pausado pelo limite de ritmo (${loader.items} itens até agora). Continua sozinho em ~${min} min.`;
  } else if (running) {
    el.textContent = `Carregando… ${loader.pages} página(s), ${loader.items} itens.`;
  } else if (loader?.error) {
    el.textContent = loader.error;
  } else if (loader?.finishedAt) {
    const when = new Date(loader.finishedAt).toLocaleTimeString("pt-BR");
    el.textContent = `${loader.stopped ? "Interrompido" : "Concluído"} às ${when}: ${loader.items} itens em ${loader.pages} página(s).`;
  } else if (templateInfo && !templateInfo.paginable) {
    el.textContent = "Vi a busca do clube, mas sem parâmetro de página. Exporte o diagnóstico e me envie.";
  } else {
    el.textContent = templateInfo ? "pronto para carregar" : "";
  }
}

async function render() {
  const state = await getState();
  const s = summarize(state);
  $("n-club").textContent = s.counts.club.toLocaleString("pt-BR");
  $("n-unassigned").textContent = s.counts.unassigned.toLocaleString("pt-BR");
  $("n-storage").textContent = s.counts.storage.toLocaleString("pt-BR");
  $("n-names").textContent = s.counts.names.toLocaleString("pt-BR");
  renderLoader(s.loader, s.templateInfo);

  $("sbc-name").textContent = s.sbc
    ? `${s.sbc.name} · ${s.sbc.formation.length} jogadores`
    : "Nenhum desafio capturado. Abra um desafio no Web App.";
  $("sbc-name").className = s.sbc ? "sbc-name" : "sbc-name muted";
  $("sbc-reqs").replaceChildren(
    ...(s.sbc?.requirements ?? []).map((r) => Object.assign(document.createElement("li"), { textContent: describeRequirement(r) })),
  );
  $("sbc-warnings").replaceChildren(
    ...s.sbcWarnings.map((w) => Object.assign(document.createElement("li"), { textContent: `⚠ ${w}` })),
  );
  $("btn-sbc").disabled = !s.sbc;

  // Fase 5: limite de ritmo e DMEs enviados.
  const rate = state.rate;
  const fresh = rate && Date.now() - rate.at < (rate.windowMin ?? 10) * 60000;
  const done = Object.values(state.stats?.completed ?? {}).reduce((a, b) => a + b, 0);
  const used = fresh ? rate.used : 0;
  const max = rate?.max ?? 40;
  $("rate-bar").style.width = `${Math.min(100, (used / max) * 100)}%`;
  $("rate-info").textContent =
    `Ritmo da extensão: ${used}/${max} requisições em ${rate?.windowMin ?? 10} min` +
    (done ? ` · ${done} DME(s) enviado(s)` : "");
  $("btn-club").disabled = s.counts.club + s.counts.unassigned + s.counts.storage === 0;
}

$("btn-load").addEventListener("click", async () => {
  if (!confirm("Carregar o clube inteiro?\n\nA extensão vai repetir a busca do clube do Web App, página por página, com pausas de 2 a 4 segundos. Ela para sozinha se a EA recusar alguma requisição.")) return;
  await sendToTab("loadClub", { minDelayMs: 2000, maxDelayMs: 4000 });
});
$("btn-stop").addEventListener("click", () => sendToTab("stopLoad"));

$("btn-club").addEventListener("click", async () => {
  const { data, skipped } = buildClub(await getState());
  download("club.json", data);
  const extra = Object.entries(skipped).map(([k, n]) => `${n} ${k}`).join(", ");
  message(`${data.players.length} jogadores exportados${extra ? ` (ignorados: ${extra})` : ""}. Preços são estimativas.`);
});

$("btn-sbc").addEventListener("click", async () => {
  const s = summarize(await getState());
  if (!s.sbc) return;
  download("sbc.json", s.sbc);
  message(s.sbcWarnings.length ? "Exportado COM AVISOS: confira os requisitos antes de confiar na solução." : "sbc.json exportado.");
});

$("btn-diag").addEventListener("click", async () => {
  download("fifeiros-diagnostico.json", buildDiagnostic(await getState(), VERSION));
  message("Diagnóstico exportado (não contém seu token de sessão).");
});

$("btn-clear").addEventListener("click", async () => {
  if (!confirm("Apagar todos os dados capturados pela extensão?")) return;
  if (tab) await sendToTab("clear");
  else await chrome.storage.local.clear();
  message("Dados apagados.");
  render();
});

// ---------- solver ----------

async function checkSolver() {
  const h = await chrome.runtime.sendMessage({ cmd: "solverHealth" }).catch(() => ({ ok: false }));
  $("solver-status").className = `dot ${h?.ok ? "on" : "off"}`;
  $("solver-status").title = h?.ok ? `solver ${h.version} rodando` : "solver desligado";
  $("solver-label").textContent = h?.ok ? "Solver ligado" : "Solver desligado";
  $("solver-msg").textContent = h?.ok
    ? (h.busy ? "Solver ocupado resolvendo outro DME…" : "Solver rodando no seu PC.")
    : "Solver desligado: dê dois cliques em iniciar-solver.bat.";
  return h?.ok;
}

function renderSolveResult(result) {
  const out = $("solve-result");
  out.className = "small";
  if (!result) {
    out.textContent = "";
  } else if (result.running) {
    out.textContent = "Resolvendo…";
  } else if (result.error) {
    out.className = "small err-text";
    out.textContent = result.error;
  } else if (!result.solution.squad.length) {
    out.className = "small err-text";
    out.textContent = `Sem solução: ${result.solution.reason}`;
  } else {
    const s = result.solution;
    out.className = "small ok-text";
    out.textContent = `Solução: overall ${s.team_rating}, química ${s.team_chemistry}/33, ${s.total_cost.toLocaleString("pt-BR")} moedas. Veja o painel no Web App.`;
  }
  $("btn-solve").disabled = Boolean(result?.running);
}

// ---------- opções ----------
const clampRating = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? Math.min(99, Math.max(45, n)) : fallback;
};

/** Mantém barra dupla, campos e texto da faixa de overall em sincronia. */
function setRange(min, max) {
  if (min > max) [min, max] = [max, min];
  $("opt-min-range").value = min;
  $("opt-max-range").value = max;
  $("opt-min").value = min;
  $("opt-max").value = max;
  const pct = (v) => ((v - 45) / (99 - 45)) * 100;
  $("range-fill").style.left = `${pct(min)}%`;
  $("range-fill").style.right = `${100 - pct(max)}%`;
  $("range-text").textContent = min === 45 && max === 99 ? "sem limite (45 a 99)" : `${min} a ${max}`;
}

async function loadOptions() {
  const { solverOptions } = await chrome.storage.local.get("solverOptions");
  const saved = solverOptions ?? {};
  const o = { ...DEFAULT_OPTIONS, ...saved };
  // Versões antigas guardavam max_rating null, allow_tradeable e untradeable_value.
  setRange(clampRating(o.min_rating, 45), clampRating(o.max_rating ?? 99, 99));
  $("opt-priority").value = saved.priority ?? ({ 0: "rating", 0.5: "protect" }[saved.untradeable_value] ?? "cost");
  $("opt-replace").checked = o.replace_players;
  $("opt-untradeable").checked = saved.only_untradeable ?? (saved.allow_tradeable === false);
  $("opt-active").checked = o.exclude_active;
  $("opt-special").checked = o.allow_special;
}

async function saveOptions() {
  await chrome.storage.local.set({
    solverOptions: {
      ...DEFAULT_OPTIONS,
      min_rating: clampRating($("opt-min").value, 45),
      max_rating: clampRating($("opt-max").value, 99),
      priority: $("opt-priority").value,
      replace_players: $("opt-replace").checked,
      only_untradeable: $("opt-untradeable").checked,
      exclude_active: $("opt-active").checked,
      allow_special: $("opt-special").checked,
    },
  });
}

// Barra dupla: arrastar atualiza ao vivo; soltar salva.
for (const id of ["opt-min-range", "opt-max-range"]) {
  $(id).addEventListener("input", () => {
    let min = Number($("opt-min-range").value);
    let max = Number($("opt-max-range").value);
    if (min > max) {
      if (id === "opt-min-range") min = max;
      else max = min;
    }
    setRange(min, max);
  });
  $(id).addEventListener("change", saveOptions);
}
for (const id of ["opt-min", "opt-max"]) {
  $(id).addEventListener("change", () => {
    setRange(clampRating($("opt-min").value, 45), clampRating($("opt-max").value, 99));
    saveOptions();
  });
}
for (const id of ["opt-priority", "opt-replace", "opt-untradeable", "opt-active", "opt-special"]) {
  $(id).addEventListener("change", saveOptions);
}
$("btn-reset-opts").addEventListener("click", async () => {
  await chrome.storage.local.set({ solverOptions: { ...DEFAULT_OPTIONS } });
  loadOptions();
});

function showSolveError(text) {
  const out = $("solve-result");
  out.className = "small err-text";
  out.textContent = text;
}

$("btn-solve").addEventListener("click", async () => {
  showSolveError("");
  if (!(await checkSolver())) {
    showSolveError("⚠ O solver está DESLIGADO. Dê dois cliques em iniciar-solver.bat (pasta do projeto), deixe a janela aberta e clique em Resolver de novo.");
    return;
  }
  if (!tab) {
    showSolveError("⚠ Abra esta janela com a aba do Web App selecionada.");
    return;
  }
  const alive = await chrome.tabs.sendMessage(tab.id, { cmd: "showPanel" }).then(() => true, () => false);
  if (!alive) {
    showSolveError("⚠ A página do Web App está com a versão antiga da extensão. Aperte F5 no Web App e tente de novo.");
    return;
  }
  chrome.runtime.sendMessage({ cmd: "solve" }).catch(() => {});
});
$("btn-panel").addEventListener("click", () => {
  if (tab) chrome.tabs.sendMessage(tab.id, { cmd: "showPanel" }).catch(() => message("Recarregue o Web App (F5)."));
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastSolution) renderSolveResult(changes.lastSolution.newValue);
  render();
});

(async () => {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = active && WEB_APP.test(active.url ?? "") ? active : null;
  $("tab-warning").hidden = Boolean(tab);
  $("btn-panel").disabled = !tab;
  if (tab) sendToTab("ping");
  loadOptions();
  checkSolver();
  renderSolveResult((await chrome.storage.local.get("lastSolution")).lastSolution);
  render();
})();
