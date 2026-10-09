// Jogadores "conceito" (que você não tem): viram lista de compras, nunca clube.
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFillPlan } from "../src/fill-plan.js";
import { buildMarket } from "../src/normalize/players.js";
import { buildSolveRequest } from "../src/solve-request.js";
import { toSolverOptions } from "../src/solver-config.js";
import { challenge, item } from "./fixtures.js";

const concept = (o = {}) => item({ concept: true, untradeable: false, ...o });

test("conceito vira jogador de mercado, com preço da EA ou estimado", () => {
  const a = concept({ marketAverage: 1200, rating: 83 });
  const b = concept({ rating: 75 });
  const { data } = buildMarket({ concept: { [a.assetId]: a, [b.assetId]: b } });
  const byDef = Object.fromEntries(data.players.map((p) => [p.definition_id, p]));
  const pa = byDef[String(a.assetId)];
  assert.equal(pa.id, `conceito-${a.assetId}`);
  assert.equal(pa.market_price, 1200);
  assert.equal(pa.price_estimated, false);
  assert.equal(pa.unassigned, undefined);
  assert.equal(byDef[String(b.assetId)].price_estimated, true);
});

test("'Usar atletas de conceito' manda o mercado para o solver", () => {
  const owned = item();
  const c = concept();
  const state = {
    club: { [owned.id]: owned },
    concept: { [c.assetId]: c },
    challenges: { 555: challenge },
    squads: { 555: { squad: { formation: "f433", players: [] } } },
    currentChallengeId: 555,
    solverOptions: { allow_market: true },
  };
  const { request } = buildSolveRequest(state);
  assert.equal(request.options.allow_market, true);
  assert.equal(request.market.players.length, 1);
  state.solverOptions = { allow_market: false };
  const off = buildSolveRequest(state).request;
  assert.equal(off.options.allow_market, false);
  assert.equal(off.market, undefined);
  assert.equal(toSolverOptions({}).allow_market, false);
});

test("ligado mas sem conceito capturado: avisa em vez de fingir", () => {
  const owned = item();
  const state = {
    club: { [owned.id]: owned }, concept: {},
    challenges: { 555: challenge },
    squads: { 555: { squad: { formation: "f433", players: [] } } },
    currentChallengeId: 555,
    solverOptions: { allow_market: true },
  };
  const { request, notice } = buildSolveRequest(state);
  assert.ok(request);
  assert.match(notice, /conceito/);
});

test("preenche só os jogadores do clube e devolve a lista de compras", () => {
  const result = {
    challengeId: 50,
    slotIndices: [1, 2, 3],
    solution: {
      valid: true, warnings: [],
      squad: [
        { slot: 0, slot_position: "RB", player_id: "111", name: "A", rating: 79, category: "untradeable" },
        { slot: 1, slot_position: "CB", player_id: "conceito-9", name: "Comprar Este", rating: 83, category: "market", coin_cost: 1500 },
        { slot: 2, slot_position: "CB", player_id: "222", name: "B", rating: 80, category: "tradeable" },
      ],
      to_buy: [{ name: "Comprar Este", price: 1500 }],
    },
  };
  const state = { currentChallengeId: 50, club: { 111: {}, 222: {} } };
  const { plan, error } = buildFillPlan(result, state);
  assert.equal(error, undefined);
  assert.deepEqual(plan.slots.map((s) => [s.index, s.itemId]), [[1, "111"], [3, "222"]]);
  assert.deepEqual(plan.toBuy.map((b) => [b.name, b.position, b.price]), [["Comprar Este", "CB", 1500]]);
});

test("se todos precisam ser comprados, não há o que preencher", () => {
  const result = {
    challengeId: 50, slotIndices: [1],
    solution: { valid: true, warnings: [], to_buy: [{}], squad: [{ slot: 0, slot_position: "ST", player_id: "conceito-1", name: "X", rating: 80, category: "market" }] },
  };
  assert.match(buildFillPlan(result, { currentChallengeId: 50, club: {} }).error, /precisam ser comprados/);
});
