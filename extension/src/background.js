// Service worker: conversa com o solver local (python -m sbc_solver.server).
// Só ele faz pedidos ao 127.0.0.1; popup e painel pedem via mensagens.

import { buildSolveRequest } from "./solve-request.js";
import { SOLVER_URL } from "./solver-config.js";

async function health() {
  try {
    const r = await fetch(`${SOLVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    const body = await r.json();
    return { ok: r.ok && body.ok === true, busy: Boolean(body.busy), version: body.version };
  } catch {
    return { ok: false };
  }
}

async function solveOpenSbc() {
  const state = await chrome.storage.local.get(null);
  const base = { at: Date.now(), challengeId: state.currentChallengeId ?? null };
  const { request, error } = buildSolveRequest(state);
  if (error) return { ...base, error };
  const { options } = request;
  try {
    // O solver pode rodar o diagnóstico (vários solves) se não houver solução.
    const r = await fetch(`${SOLVER_URL}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout((Number(options.time_limit_s) || 10) * 1000 * 4 + 15000),
    });
    const body = await r.json();
    if (!r.ok) return { ...base, error: body.error ?? `O solver respondeu ${r.status}.` };
    // slotIndices: slot da EA de cada posição da solução (para preencher na Fase 4).
    return { ...base, solution: body, options, slotIndices: request.sbc.ea?.slotIndices ?? null };
  } catch (e) {
    const offline = e?.name === "TypeError" || e?.name === "AbortError" || e?.name === "TimeoutError";
    return {
      ...base,
      error: offline
        ? "O solver não está rodando. Dê dois cliques em iniciar-solver.bat e tente de novo."
        : `Erro ao falar com o solver: ${e}`,
    };
  }
}

let running = null; // evita dois "Resolver" ao mesmo tempo

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.cmd === "solverHealth") {
    health().then(reply);
    return true;
  }
  if (msg?.cmd === "solve") {
    running ??= (async () => {
      await chrome.storage.local.set({ lastSolution: { running: true, at: Date.now() } });
      const result = await solveOpenSbc();
      await chrome.storage.local.set({ lastSolution: result });
      return result;
    })().finally(() => {
      running = null;
    });
    running.then(reply);
    return true;
  }
  return false;
});
