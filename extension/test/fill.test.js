// Fase 4: plano de preenchimento (checagens) — função pura.
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFillPlan } from "../src/fill-plan.js";

const squad = [
  { slot: 0, slot_position: "RB", player_id: "111", name: "A", rating: 79 },
  { slot: 1, slot_position: "CB", player_id: "222", name: "B", rating: 80 },
];
const okResult = () => ({
  challengeId: 50,
  slotIndices: [1, 2], // goleiro (0) bloqueado
  solution: { valid: true, squad: structuredClone(squad), to_buy: [], warnings: [] },
});
const okState = () => ({ currentChallengeId: 50, club: { 111: {}, 222: {} }, unassigned: {}, storage: {} });

test("plano usa o slot da EA (pulando o bloqueado)", () => {
  const { plan, error } = buildFillPlan(okResult(), okState());
  assert.equal(error, undefined);
  assert.equal(plan.challengeId, 50);
  assert.deepEqual(plan.slots.map((s) => [s.index, s.itemId]), [[1, "111"], [2, "222"]]);
});

test("recusa solução de outro DME", () => {
  assert.match(buildFillPlan(okResult(), { ...okState(), currentChallengeId: 49 }).error, /outro DME/);
});

test("recusa quando precisa comprar", () => {
  const r = okResult();
  r.solution.to_buy = [{ name: "X" }];
  assert.match(buildFillPlan(r, okState()).error, /compras/);
});

test("recusa quando o DME tem requisito não entendido", () => {
  const r = okResult();
  r.solution.warnings = ["requisito X não suportado"];
  assert.match(buildFillPlan(r, okState()).error, /não entendeu/);
});

test("recusa jogador que saiu do clube", () => {
  const s = okState();
  delete s.club[222];
  assert.match(buildFillPlan(okResult(), s).error, /B não está mais no seu clube/);
});

test("recusa jogador preso em outro DME", () => {
  const s = { ...okState(), sbcHub: { squadPlayerItemIds: [222] }, squads: {} };
  assert.match(buildFillPlan(okResult(), s).error, /B está em outro DME/);
});

test("recusa solução sem ordem dos slots ou inválida", () => {
  const r = okResult();
  delete r.slotIndices;
  assert.match(buildFillPlan(r, okState()).error, /Resolver de novo/);
  assert.match(buildFillPlan({ solution: { valid: false, squad } }, okState()).error, /solução válida/);
  assert.match(buildFillPlan(null, okState()).error, /solução válida/);
});
