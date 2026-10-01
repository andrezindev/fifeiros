// Tabelas de tradução do formato da EA para o formato do solver.
//
// ATENÇÃO: a EA não documenta o formato. Estes valores seguem o que a
// comunidade mapeou. Se algo vier diferente no seu Web App, o "diagnóstico"
// do popup mostra os dados crus e ajustamos AQUI.

export const POSITIONS = ["GK", "RB", "LB", "CB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"];

// Ids numéricos de posição da EA -> posições do FC 25+ (sem CF/RWB/LWB).
const POSITION_BY_ID = {
  0: "GK", 1: "CB", 2: "RB", 3: "RB", 4: "CB", 5: "CB", 6: "CB", 7: "LB", 8: "LB",
  9: "CDM", 10: "CDM", 11: "CDM", 12: "RM", 13: "CM", 14: "CM", 15: "CM", 16: "LM",
  17: "CAM", 18: "CAM", 19: "CAM", 20: "ST", 21: "ST", 22: "ST", 23: "RW", 24: "ST",
  25: "ST", 26: "ST", 27: "LW",
};

// Posições antigas/alternativas que ainda podem aparecer em texto.
const POSITION_ALIASES = { RWB: "RB", LWB: "LB", CF: "ST", LF: "ST", RF: "ST", SW: "CB" };

export function mapPosition(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return POSITION_BY_ID[value] ?? null;
  const s = String(value).toUpperCase();
  if (/^\d+$/.test(s)) return POSITION_BY_ID[Number(s)] ?? null;
  if (POSITIONS.includes(s)) return s;
  return POSITION_ALIASES[s] ?? null;
}

// rareflag: 0 = card base. No FC 27 não existe mais comum/raro: todo card base
// (ouro/prata/bronze, definido só pelo overall) vem com 0. Qualquer outro valor
// é carta de evento (ex.: 72 = Herói, 22 = promo), tratada como "special".
// O 1 (raro) é mantido por compatibilidade com jogos anteriores.
export function mapRarity(rareflag) {
  const r = Number(rareflag ?? 0);
  if (r === 0) return "common";
  if (r === 1) return "rare";
  return "special";
}

export const ICON_LEAGUE_ID = 2118;
export const ICON_RAREFLAG = 12;
// Visto no diagnóstico do FC 27: carta com rareflag 72 no clube 114605 (Heróis).
// Heróis contam para a liga real deles (leagueId), não para o clube.
export const HERO_RAREFLAG = 72;
export const HERO_CLUB_ID = 114605;

// Estimativa de preço (moedas) enquanto não lemos o preço real do mercado (Fase 5).
// Mesma curva de scripts/generate_example_data.py.
export function estimatePrice(rating, rarity) {
  let price;
  if (rating < 65) price = rarity === "rare" ? 200 : 150;
  else if (rating < 75) price = rarity === "rare" ? 300 : 200;
  else if (rating < 80) price = rarity === "rare" ? 500 : 350;
  else {
    const table = { 80: 600, 81: 700, 82: 900, 83: 1400, 84: 2800, 85: 5500, 86: 9000,
      87: 15000, 88: 23000, 89: 35000, 90: 55000, 91: 80000 };
    price = table[rating] ?? 120000;
  }
  if (rarity === "special") price = Math.round(price * 2.5);
  return price;
}

// Formações da EA (código "f433" etc.) -> posição de cada slot, no formato do solver.
// Só a lista de posições importa para o solver; a ordem dos slots será
// confirmada na Fase 4 (preenchimento).
export const FORMATIONS = {
  f442:   ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"],
  f4411:  ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "CAM", "ST"],
  f433:   ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "RW", "ST", "LW"],
  f4231:  ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "CAM", "CAM", "CAM", "ST"],
  f4321:  ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "CAM", "CAM", "ST"],
  f4312:  ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "CAM", "ST", "ST"],
  f41212: ["GK", "RB", "CB", "CB", "LB", "CDM", "RM", "LM", "CAM", "ST", "ST"],
  f4222:  ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "CAM", "CAM", "ST", "ST"],
  f4141:  ["GK", "RB", "CB", "CB", "LB", "CDM", "RM", "CM", "CM", "LM", "ST"],
  f451:   ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CAM", "CM", "LM", "ST"],
  f424:   ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "RW", "ST", "ST", "LW"],
  f352:   ["GK", "CB", "CB", "CB", "CDM", "CDM", "RM", "CAM", "LM", "ST", "ST"],
  f343:   ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "LM", "RW", "ST", "LW"],
  f3412:  ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "LM", "CAM", "ST", "ST"],
  f3421:  ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "LM", "CAM", "CAM", "ST"],
  f532:   ["GK", "RB", "CB", "CB", "CB", "LB", "CM", "CM", "CM", "ST", "ST"],
  f541:   ["GK", "RB", "CB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST"],
};

// Normaliza variações como "4-3-3", "433", "F433(2)" -> "f433".
export function formationKey(raw) {
  if (!raw) return null;
  const digits = String(raw).toLowerCase().replace(/\(.*\)/, "").replace(/[^0-9]/g, "");
  return digits ? `f${digits}` : null;
}

// Qualidade (nível) da EA: 1 = bronze, 2 = prata, 3 = ouro.
export const QUALITY_BY_LEVEL = { 1: "bronze", 2: "silver", 3: "gold" };
export const QUALITY_RATING_RANGE = { bronze: [1, 64], silver: [65, 74], gold: [75, 99] };
