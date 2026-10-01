// Monta o pedido para o solver local a partir do estado capturado.
// Função pura: usada pelo background e pelos testes de ponta a ponta.

import { buildClub, summarize } from "./normalize/export.js";
import { DEFAULT_OPTIONS, toSolverOptions } from "./solver-config.js";

/** Ids dos jogadores já colocados no DME aberto (só os 11 slots de campo). */
export function placedInOpenSbc(state) {
  const cid = state.currentChallengeId;
  const known = state.lastSquadIds?.[cid];
  if (Array.isArray(known)) return known.map(String);
  const players = state.squads?.[cid]?.squad?.players ?? [];
  return players
    .filter((p) => Number(p?.index ?? 99) <= 10)
    .map((p) => String(p?.itemData?.id ?? 0))
    .filter((id) => id !== "0");
}

/** Devolve { request } pronto para POST /solve, ou { error } com mensagem para o usuário. */
export function buildSolveRequest(state) {
  const { sbc, sbcWarnings } = summarize(state);
  if (!sbc) return { error: sbcWarnings[0] ?? "Nenhum DME aberto. Abra um desafio no Web App." };
  const { data: fullClub } = buildClub(state);
  const ui = { ...DEFAULT_OPTIONS, ...(state.solverOptions ?? {}) };

  // "Substituir atletas" desligado: mantém quem já está no DME.
  const required = ui.replace_players ? [] : placedInOpenSbc(state);
  const requiredSet = new Set(required);

  // "Excluir atletas do elenco ativo" (nunca exclui quem o usuário já colocou no DME).
  const active = new Set(ui.exclude_active ? (state.activeSquadIds ?? []).map(String) : []);
  const players = fullClub.players.filter((p) => !active.has(p.id) || requiredSet.has(p.id));

  if (players.length === 0) {
    return { error: "Nenhum jogador capturado. Abra o clube e use \"Carregar clube inteiro\"." };
  }
  const options = { ...toSolverOptions(ui), required_players: required };
  return { request: { club: { players }, sbc, options } };
}
