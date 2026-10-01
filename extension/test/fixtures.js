// Amostras FICTÍCIAS no formato (presumido) das respostas da EA.
// Quando tivermos um diagnóstico real, trocar por dados reais anonimizados.

let nextId = 1000;

export function item(overrides = {}) {
  const id = nextId++;
  return {
    id,
    assetId: 200000 + id,
    resourceId: 200000 + id,
    itemType: "player",
    rating: 80,
    preferredPosition: "CM",
    possiblePositions: ["CM", "CDM"],
    leagueId: 13,
    nation: 14,
    teamid: 10,
    rareflag: 1,
    untradeable: true,
    discardValue: 800,
    marketDataMinPrice: 200,
    marketDataMaxPrice: 10000,
    ...overrides,
  };
}

export const challenge = {
  challengeId: 555,
  setId: 77,
  name: "Liga e Nação",
  formation: "f433",
  elgOperation: "AND",
  elgReq: [
    { type: "SCOPE", eligibilitySlot: 1, eligibilityValue: 0 },
    { type: "TEAM_RATING", eligibilitySlot: 1, eligibilityValue: 80 },
    { type: "SCOPE", eligibilitySlot: 2, eligibilityValue: 0 },
    { type: "LEAGUE_ID", eligibilitySlot: 2, eligibilityValue: 13, count: 3 },
    { type: "SCOPE", eligibilitySlot: 3, eligibilityValue: 0 },
    { type: "NATION_COUNT", eligibilitySlot: 3, eligibilityValue: 5 },
    { type: "SCOPE", eligibilitySlot: 4, eligibilityValue: 1 },
    { type: "SAME_CLUB_COUNT", eligibilitySlot: 4, eligibilityValue: 3 },
    { type: "SCOPE", eligibilitySlot: 5, eligibilityValue: 0 },
    { type: "PLAYER_RARITY", eligibilitySlot: 5, eligibilityValue: 1, count: 2 },
    { type: "SCOPE", eligibilitySlot: 6, eligibilityValue: 0 },
    { type: "CHEMISTRY_POINTS", eligibilitySlot: 6, eligibilityValue: 20 },
  ],
};
