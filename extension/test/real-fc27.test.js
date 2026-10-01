// Testes com o formato REAL do Web App do FC 27, tirado do primeiro diagnóstico
// (30/09/2026). Se a EA mudar o formato, estes testes mostram o que quebrou.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fieldStats } from "../src/normalize/export.js";
import { normalizeItem } from "../src/normalize/players.js";
import { buildSbc } from "../src/normalize/sbc.js";

const challenge49 = {
  challengeId: 49,
  elgOperation: "AND",
  elgReq: [
    { eligibilityKey: 5, eligibilitySlot: 1, eligibilityValue: 3, type: "SAME_LEAGUE_COUNT" },
    { eligibilityKey: 13, eligibilitySlot: 1, eligibilityValue: 0, type: "SCOPE" },
    { eligibilityKey: 6, eligibilitySlot: 2, eligibilityValue: 4, type: "SAME_CLUB_COUNT" },
    { eligibilityKey: 13, eligibilitySlot: 2, eligibilityValue: 1, type: "SCOPE" },
    { eligibilityKey: 9, eligibilitySlot: 3, eligibilityValue: 5, type: "CLUB_COUNT" },
    { eligibilityKey: 13, eligibilitySlot: 3, eligibilityValue: 1, type: "SCOPE" },
    { eligibilityKey: 3, eligibilitySlot: 4, eligibilityValue: 1, type: "PLAYER_QUALITY" },
    { eligibilityKey: 13, eligibilitySlot: 4, eligibilityValue: 0, type: "SCOPE" },
    { eligibilityKey: 35, eligibilitySlot: 5, eligibilityValue: 16, type: "CHEMISTRY_POINTS" },
    { eligibilityKey: 13, eligibilitySlot: 5, eligibilityValue: 0, type: "SCOPE" },
  ],
  formation: "f343",
  name: "Desafio 2 Destino à Glória",
  setId: 22,
  status: "IN_PROGRESS",
  type: "OPEN_CHALLENGE",
};

const brunoFernandes = {
  assetId: 212198, cardsubtypeid: 2, id: 900000000201, itemState: "free", itemType: "player",
  leagueId: 13, marketAverage: 22023, marketDataMaxPrice: 100000, marketDataMinPrice: 700, nation: 38,
  possiblePositions: ["CM", "CAM"], preferredPosition: "CAM", rareflag: 0, rating: 89,
  resourceId: 212198, teamid: 11, untradeable: true,
};

const heroOnLoan = {
  assetId: 183277, id: 900000000202, itemType: "player", leagueId: 13, loans: 5,
  loansInfo: { loanType: "MATCH_LOAN", loanValue: 5 }, marketAverage: 1728000, nation: 7,
  possiblePositions: ["LM", "CAM", "LW"], preferredPosition: "LM", rareflag: 72, rating: 89,
  teamid: 114605, untradeable: true,
};

test("desafio real 49 (Destino à Glória) é traduzido sem avisos", () => {
  const { data, warnings } = buildSbc(challenge49);
  assert.deepEqual(warnings, []);
  assert.deepEqual(data.formation, ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "LM", "RW", "ST", "LW"]);
  // "Qualidade: mín. Bronze" é sempre verdade, então não vira restrição.
  assert.deepEqual(data.requirements, [
    { type: "same", attribute: "league", op: "min", value: 3 },
    { type: "same", attribute: "club", op: "max", value: 4 },
    { type: "distinct", attribute: "club", op: "max", value: 5 },
    { type: "min_team_chemistry", value: 16 },
  ]);
});

// DME real "Melhoria 2x 79+" (FC 27): goleiro bloqueado, "Qualidade: exatamente Ouro".
const challenge50 = {
  challengeId: 50,
  elgOperation: "AND",
  elgReq: [
    { eligibilityKey: 3, eligibilitySlot: 1, eligibilityValue: 3, type: "PLAYER_QUALITY" },
    { eligibilityKey: 13, eligibilitySlot: 1, eligibilityValue: 2, type: "SCOPE" },
  ],
  formation: "f442",
  name: "Melhoria 2x 79+",
  setId: 23,
  type: "BRICK_CHALLENGE",
};
const squad50 = {
  challengeId: 50,
  playerRequirements: Array.from({ length: 11 }, (_, index) => ({ index, playerType: index === 0 ? "BRICK" : "DEFAULT" })),
  squad: { formation: "f442", players: Array.from({ length: 23 }, (_, index) => ({ index, itemData: { id: 0, itemState: "invalid" } })) },
};

test("DME real com goleiro bloqueado: 10 jogadores, sem GK", () => {
  const { data, warnings } = buildSbc(challenge50, squad50);
  assert.deepEqual(warnings, []);
  assert.deepEqual(data.formation, ["RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"]);
  assert.deepEqual(data.ea.slotIndices, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // "Qualidade: exatamente Ouro" = ninguém com overall <= 74.
  assert.deepEqual(data.requirements, [{ type: "count", filter: { max_rating: 74 }, op: "max", value: 0 }]);
});

test("DME sem slots bloqueados continua com 11", () => {
  const { data } = buildSbc(challenge49, { challengeId: 49, squad: { formation: "f343", players: [] } });
  assert.equal(data.formation.length, 11);
  assert.deepEqual(data.ea.slotIndices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("preço vem do marketAverage da EA", () => {
  const { player } = normalizeItem(brunoFernandes, { names: { 212198: "Bruno Fernandes" } });
  assert.equal(player.market_price, 22023);
  assert.equal(player.name, "Bruno Fernandes");
  assert.deepEqual(player.alt_positions, ["CM"]);
});

test("sem marketAverage, volta para a estimativa", () => {
  const { marketAverage, ...semMedia } = brunoFernandes;
  void marketAverage;
  assert.equal(normalizeItem(semMedia).player.market_price, 35000);
});

test("herói emprestado é ignorado; herói próprio é marcado", () => {
  assert.equal(normalizeItem(heroOnLoan).skip, "empréstimo");
  const { loans, loansInfo, ...owned } = heroOnLoan;
  void loans; void loansInfo;
  const { player } = normalizeItem(owned);
  assert.equal(player.is_hero, true);
  assert.equal(player.rarity, "special");
});

test("estatística de campos para o diagnóstico", () => {
  const stats = fieldStats({ club: { 1: brunoFernandes, 2: heroOnLoan }, names: { 212198: "Bruno Fernandes" } });
  assert.equal(stats.rareflag["0"].count, 1);
  assert.deepEqual(stats.rareflag["0"].examples, ["Bruno Fernandes 89"]);
  assert.deepEqual(stats.rareflag["72"].examples, ["#183277 89"]);
});
