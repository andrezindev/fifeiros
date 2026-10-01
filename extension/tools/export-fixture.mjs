// Simula a extensão de ponta a ponta, sem navegador:
//   data/club.json (formato do solver) -> itens "crus" no formato da EA -> estado
//   guardado pela extensão -> club.json + sbc.json exportados pelo popup.
// Usado pelo teste Python tests/test_extension_e2e.py.
//
// Uso: node extension/tools/export-fixture.mjs <pasta-de-saída> [--solve http://127.0.0.1:PORTA]
// Com --solve, também faz o mesmo POST /solve que o background da extensão faz
// e grava a resposta em <pasta>/solution.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildClub, summarize } from "../src/normalize/export.js";
import { buildSolveRequest } from "../src/solve-request.js";

const outDir = process.argv[2] ?? ".";
const root = new URL("../../", import.meta.url);
const example = JSON.parse(readFileSync(new URL("data/club.json", root), "utf8")).players;

// Ids numéricos, como a EA usa, para liga/nação/clube.
const idOf = (() => {
  const maps = { league: new Map(), nation: new Map(), club: new Map() };
  return (kind, name) => {
    if (!maps[kind].has(name)) maps[kind].set(name, 100 + maps[kind].size);
    return maps[kind].get(name);
  };
})();
const RAREFLAG = { common: 0, rare: 1, special: 3 };

const state = { club: {}, unassigned: {}, storage: {}, names: {}, challenges: {}, squads: {} };
example.forEach((p, i) => {
  const assetId = 500000 + Number(p.definition_id.replace(/\D/g, "") || i);
  const raw = {
    id: 9000000 + i,
    assetId,
    resourceId: assetId,
    itemType: "player",
    rating: p.overall,
    preferredPosition: p.position,
    possiblePositions: [p.position, ...p.alt_positions],
    leagueId: p.is_icon ? 2118 : idOf("league", p.league),
    nation: idOf("nation", p.nation),
    teamid: idOf("club", p.club),
    rareflag: p.is_icon ? 12 : RAREFLAG[p.rarity],
    untradeable: !p.tradeable,
  };
  state.names[assetId] = p.name;
  const pile = p.unassigned ? "unassigned" : "club";
  if (p.is_duplicate && !p.unassigned) raw.duplicateId = 1;
  state[pile][raw.id] = raw;
});

// DME "Liga e Nação" no formato da EA (mesmo espírito de data/sbcs/02).
const PL = idOf("league", "Premier League");
const SPAIN = idOf("nation", "Spain");
state.challenges[555] = {
  challengeId: 555,
  setId: 77,
  name: "Liga e Nação (via extensão)",
  formation: "f433",
  elgOperation: "AND",
  elgReq: [
    { type: "SCOPE", eligibilitySlot: 1, eligibilityValue: 0 },
    { type: "LEAGUE_ID", eligibilitySlot: 1, eligibilityValue: PL, count: 3 },
    { type: "SCOPE", eligibilitySlot: 2, eligibilityValue: 0 },
    { type: "NATION_ID", eligibilitySlot: 2, eligibilityValue: SPAIN, count: 2 },
    { type: "SCOPE", eligibilitySlot: 3, eligibilityValue: 0 },
    { type: "NATION_COUNT", eligibilitySlot: 3, eligibilityValue: 5 },
    { type: "SCOPE", eligibilitySlot: 4, eligibilityValue: 1 },
    { type: "SAME_CLUB_COUNT", eligibilitySlot: 4, eligibilityValue: 3 },
    { type: "SCOPE", eligibilitySlot: 5, eligibilityValue: 0 },
    { type: "TEAM_RATING", eligibilitySlot: 5, eligibilityValue: 80 },
    { type: "SCOPE", eligibilitySlot: 6, eligibilityValue: 0 },
    { type: "CHEMISTRY_POINTS", eligibilitySlot: 6, eligibilityValue: 15 },
  ],
};
state.squads[555] = { squad: { formation: "f433", players: [] } };
state.currentChallengeId = 555;

mkdirSync(outDir, { recursive: true });
const { data: club, skipped } = buildClub(state);
const { sbc, sbcWarnings } = summarize(state);
writeFileSync(join(outDir, "club.json"), JSON.stringify(club, null, 2));
writeFileSync(join(outDir, "sbc.json"), JSON.stringify(sbc, null, 2));

const solveAt = process.argv.indexOf("--solve");
let solveStatus = null;
if (solveAt > 0) {
  state.solverOptions = { max_rating: 84 };
  const { request, error } = buildSolveRequest(state);
  if (error) throw new Error(error);
  const r = await fetch(`${process.argv[solveAt + 1]}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  solveStatus = r.status;
  writeFileSync(join(outDir, "solution.json"), await r.text());
}
console.log(JSON.stringify({ players: club.players.length, skipped, warnings: sbcWarnings, solveStatus }));
