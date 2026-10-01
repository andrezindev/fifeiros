import assert from "node:assert/strict";
import { test } from "node:test";

import { formationKey, mapPosition, mapRarity } from "../src/normalize/mappings.js";
import { buildClub, normalizeItem, parseNamesDatabase } from "../src/normalize/players.js";
import { buildSbc, convertGroup, groupRequirements } from "../src/normalize/sbc.js";
import { challenge, item } from "./fixtures.js";

// ---------- mapeamentos ----------

test("posições: texto, id numérico e aliases antigos", () => {
  assert.equal(mapPosition("ST"), "ST");
  assert.equal(mapPosition(25), "ST");
  assert.equal(mapPosition("0"), "GK");
  assert.equal(mapPosition("RWB"), "RB");
  assert.equal(mapPosition("CF"), "ST");
  assert.equal(mapPosition("XYZ"), null);
});

test("raridade pelo rareflag", () => {
  assert.equal(mapRarity(0), "common");
  assert.equal(mapRarity(1), "rare");
  assert.equal(mapRarity(3), "special");
});

test("códigos de formação", () => {
  assert.equal(formationKey("f433"), "f433");
  assert.equal(formationKey("4-2-3-1"), "f4231");
  assert.equal(formationKey("F433(2)"), "f433");
});

// ---------- jogadores ----------

test("item da EA vira jogador do club.json", () => {
  const raw = item({ rating: 83, preferredPosition: "CB", possiblePositions: ["CB", "RB"], untradeable: false });
  const { player } = normalizeItem(raw, { source: "club", names: { [raw.assetId]: "Marc Guéhi" } });
  assert.deepEqual(
    { ...player },
    {
      id: String(raw.id), definition_id: String(raw.assetId), name: "Marc Guéhi", overall: 83,
      position: "CB", alt_positions: ["RB"], league: "13", nation: "14", club: "10", rarity: "rare",
      tradeable: true, untradeable: false, is_duplicate: false, market_price: 1400,
    },
  );
});

test("descarta não-jogadores, empréstimos e posições desconhecidas", () => {
  assert.equal(normalizeItem(item({ itemType: "training" })).skip, "não é jogador");
  assert.equal(normalizeItem(item({ loans: 3 })).skip, "empréstimo");
  assert.match(normalizeItem(item({ preferredPosition: "??" })).skip, /posição desconhecida/);
});

test("nome ausente vira 'Jogador #id'", () => {
  const raw = item();
  assert.equal(normalizeItem(raw).player.name, `Jogador #${raw.assetId}`);
});

test("ícone detectado pela liga ou rareflag", () => {
  assert.equal(normalizeItem(item({ leagueId: 2118, rareflag: 12 })).player.is_icon, true);
});

test("buildClub junta clube, não atribuídos e armazém, marcando duplicados", () => {
  const inClub = item({ rating: 84 });
  const dupOfClub = item({ assetId: inClub.assetId, rating: 84 });       // mesmo jogador
  const newUnassigned = item({ rating: 70 });                             // não é duplicado
  const flaggedDup = item({ duplicateId: 999 });                          // EA marcou duplicado
  const stored = item({ rating: 75 });                                    // armazém de DME
  const loan = item({ loans: 5 });
  const state = {
    club: { [inClub.id]: inClub, [loan.id]: loan },
    unassigned: { [dupOfClub.id]: dupOfClub, [newUnassigned.id]: newUnassigned, [flaggedDup.id]: flaggedDup },
    storage: { [stored.id]: stored },
  };
  const { data, skipped } = buildClub(state);
  const byId = Object.fromEntries(data.players.map((p) => [p.id, p]));
  assert.equal(data.players.length, 5);
  assert.equal(skipped["empréstimo"], 1);
  assert.equal(byId[inClub.id].is_duplicate, false);
  assert.equal(byId[dupOfClub.id].is_duplicate, true);
  assert.equal(byId[dupOfClub.id].unassigned, true);
  assert.equal(byId[newUnassigned.id].is_duplicate, false);
  assert.equal(byId[flaggedDup.id].is_duplicate, true);
  assert.equal(byId[stored.id].is_duplicate, true);
});

test("jogadores presos em outro DME ficam de fora; os do DME aberto não", () => {
  const free = item(), inOther = item(), inThis = item();
  const state = {
    club: { [free.id]: free, [inOther.id]: inOther, [inThis.id]: inThis },
    sbcHub: { squadPlayerItemIds: [inOther.id, inThis.id] },
    currentChallengeId: 50,
    squads: { 50: { squad: { players: [{ index: 1, itemData: { id: inThis.id } }, { index: 2, itemData: { id: 0 } }] } } },
  };
  const { data, skipped } = buildClub(state);
  assert.deepEqual(data.players.map((p) => p.id).sort(), [String(free.id), String(inThis.id)].sort());
  assert.equal(skipped["em outro DME"], 1);
});

test("banco de nomes do Web App", () => {
  const names = parseNamesDatabase({
    Players: [{ id: 1, f: "Marc", l: "Guéhi", r: 83 }, { id: 2, f: "Vinícius", l: "Júnior", c: "Vini Jr.", r: 89 }],
    LegendsPlayers: [{ id: 3, f: "Ronaldo", l: "de Assis", c: "Ronaldinho", r: 90 }],
  });
  assert.deepEqual(names, { 1: "Marc Guéhi", 2: "Vini Jr.", 3: "Ronaldinho" });
});

// ---------- DME ----------

test("agrupa requisitos por slot", () => {
  const groups = groupRequirements(challenge.elgReq);
  assert.equal(groups.length, 6);
  assert.deepEqual(groups[1], { op: "min", count: 3, key: "LEAGUE_ID", values: [13], extraKeys: [] });
  assert.equal(groups[3].op, "max");
});

test("desafio da EA vira sbc.json", () => {
  const { data, warnings } = buildSbc(challenge);
  assert.deepEqual(warnings, []);
  assert.equal(data.name, "Liga e Nação");
  assert.deepEqual(data.formation, ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "RW", "ST", "LW"]);
  assert.deepEqual(data.requirements, [
    { type: "min_team_rating", value: 80 },
    { type: "count", filter: { league: "13" }, op: "min", value: 3 },
    { type: "distinct", attribute: "nation", op: "min", value: 5 },
    { type: "same", attribute: "club", op: "max", value: 3 },
    { type: "count", filter: { rare: true }, op: "min", value: 2 },
    { type: "min_team_chemistry", value: 20 },
  ]);
  assert.equal(data.ea.challengeId, 555);
});

test("qualidade sem quantidade vale para o time todo", () => {
  const g = { op: "min", count: null, key: "PLAYER_QUALITY", values: [2], extraKeys: [] };
  assert.deepEqual(convertGroup(g).reqs, [{ type: "count", filter: { max_rating: 64 }, op: "max", value: 0, _what: "PLAYER_QUALITY" }]);
  const exactGold = convertGroup({ ...g, op: "exact", values: [3] }).reqs;
  assert.deepEqual(exactGold.map((r) => r.filter), [{ max_rating: 74 }]);
});

test("várias ligas no mesmo requisito viram lista (OU)", () => {
  const g = { op: "min", count: 2, key: "LEAGUE_ID", values: [13, 53], extraKeys: [] };
  assert.deepEqual(convertGroup(g).reqs[0].filter, { league: ["13", "53"] });
});

test("requisito desconhecido gera aviso, não some", () => {
  const { data, warnings } = buildSbc({
    ...challenge,
    elgReq: [...challenge.elgReq, { type: "FIRST_OWNER_PLAYERS_COUNT", eligibilitySlot: 9, eligibilityValue: 3 }],
  });
  assert.equal(data.requirements.length, 6);
  assert.match(warnings[0], /FIRST_OWNER_PLAYERS_COUNT/);
});

test("formação desconhecida e operação OR geram aviso", () => {
  const { data, warnings } = buildSbc({ ...challenge, formation: "f999", elgOperation: "OR" });
  assert.equal(data.formation.length, 11);
  assert.equal(warnings.length, 2);
});

test("slots bloqueados (tijolos) são removidos", () => {
  const players = Array.from({ length: 11 }, (_, i) => ({ index: i, brick: i >= 5 }));
  const { data } = buildSbc(challenge, { squad: { formation: "f433", players } });
  assert.equal(data.formation.length, 5);
});

test("sem desafio capturado", () => {
  const { data, warnings } = buildSbc(null);
  assert.equal(data, null);
  assert.match(warnings[0], /abra um desafio/);
});
