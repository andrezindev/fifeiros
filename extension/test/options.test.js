// Opções do solver (popup) -> pedido enviado ao solver local.
import assert from "node:assert/strict";
import { test } from "node:test";

import { placedInOpenSbc, buildSolveRequest } from "../src/solve-request.js";
import { toSolverOptions } from "../src/solver-config.js";
import { challenge, item } from "./fixtures.js";

const baseState = (extra = {}) => {
  const a = item(), b = item(), c = item();
  return {
    a, b, c,
    state: {
      club: { [a.id]: a, [b.id]: b, [c.id]: c },
      challenges: { 555: challenge },
      squads: { 555: { squad: { formation: "f433", players: [] } } },
      currentChallengeId: 555,
      ...extra,
    },
  };
};

test("padrões: sem limite de overall, menor custo, pode usar negociáveis", () => {
  assert.deepEqual(toSolverOptions({}), {
    min_rating: null, max_rating: null, untradeable_value: 0.3,
    allow_special: false, allow_tradeable: true, time_limit_s: 10,
  });
});

test("faixa de overall, prioridade e 'somente não negociáveis'", () => {
  const o = toSolverOptions({ min_rating: 75, max_rating: 84, priority: "rating", only_untradeable: true, allow_special: true });
  assert.equal(o.min_rating, 75);
  assert.equal(o.max_rating, 84);
  assert.equal(o.untradeable_value, 0);
  assert.equal(o.allow_tradeable, false);
  assert.equal(o.allow_special, true);
  assert.equal(toSolverOptions({ priority: "protect" }).untradeable_value, 0.5);
});

test("opções salvas por versões antigas continuam valendo", () => {
  const o = toSolverOptions({ max_rating: null, allow_tradeable: false, untradeable_value: 0.5, priority: undefined });
  assert.equal(o.max_rating, null);
  assert.equal(o.allow_tradeable, false);
});

test("excluir elenco ativo tira os titulares do pedido", () => {
  const { a, b, state } = baseState();
  state.activeSquadIds = [String(a.id)];
  state.solverOptions = { exclude_active: true };
  const { request } = buildSolveRequest(state);
  const ids = request.club.players.map((p) => p.id);
  assert.ok(!ids.includes(String(a.id)));
  assert.ok(ids.includes(String(b.id)));
  state.solverOptions = { exclude_active: false };
  assert.equal(buildSolveRequest(state).request.club.players.length, 3);
});

test("'Substituir atletas' desligado: mantém quem já está no DME", () => {
  const { a, state } = baseState();
  state.lastSquadIds = { 555: [String(a.id)] };
  state.solverOptions = { replace_players: false };
  assert.deepEqual(buildSolveRequest(state).request.options.required_players, [String(a.id)]);
  state.solverOptions = { replace_players: true };
  assert.deepEqual(buildSolveRequest(state).request.options.required_players, []);
});

test("jogador já no DME não é excluído mesmo estando no elenco ativo", () => {
  const { a, state } = baseState();
  state.activeSquadIds = [String(a.id)];
  state.lastSquadIds = { 555: [String(a.id)] };
  state.solverOptions = { exclude_active: true, replace_players: false };
  assert.ok(buildSolveRequest(state).request.club.players.some((p) => p.id === String(a.id)));
});

test("sem escalação conhecida da extensão, usa a que o Web App baixou (só os 11 de campo)", () => {
  const state = {
    currentChallengeId: 50,
    squads: { 50: { squad: { players: [
      { index: 0, itemData: { id: 0 } },
      { index: 1, itemData: { id: 111 } },
      { index: 12, itemData: { id: 999 } }, // reserva: não conta
    ] } } },
  };
  assert.deepEqual(placedInOpenSbc(state), ["111"]);
});
