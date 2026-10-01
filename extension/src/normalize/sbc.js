// Converte um desafio (challenge) da EA para o formato do sbc.json do solver.
//
// Formato esperado da EA (mapeado pela comunidade, a confirmar com o diagnóstico):
//   { challengeId, name, formation: "f433", elgOperation: "AND",
//     elgReq: [ {type: "SCOPE", eligibilitySlot: 1, eligibilityValue: 0},
//               {type: "LEAGUE_ID", eligibilitySlot: 1, eligibilityValue: 13, count: 3}, ... ] }
// Entradas com o mesmo eligibilitySlot formam UM requisito: SCOPE diz se é
// mínimo/máximo/exato, a outra entrada diz o quê e o valor; `count` (quando
// existe) é a quantidade de jogadores.
//
// Regra de ouro: requisito não reconhecido NUNCA é ignorado em silêncio; vai
// para `warnings`, e o popup avisa que a solução pode não valer.

import { FORMATIONS, QUALITY_BY_LEVEL, QUALITY_RATING_RANGE, formationKey } from "./mappings.js";

// Escopo: 0 = maior/igual (mín.), 1 = menor/igual (máx.), 2 = exato.
const SCOPE = { 0: "min", 1: "max", 2: "exact", GREATER: "min", LOWER: "max", EXACT: "exact" };
const ATTR = { NATION: "nation", LEAGUE: "league", CLUB: "club" };
const COUNT_KEYS = new Set(["PLAYER_COUNT", "COUNT"]);
const SQUAD_SIZE_KEYS = new Set(["PLAYER_COUNT_COMBINED", "SQUAD_SIZE", "NUM_PLAYERS"]);

/** Agrupa as entradas cruas por requisito: [{op, count, key, values}]. */
export function groupRequirements(elgReq) {
  const groups = new Map();
  for (const e of elgReq ?? []) {
    const slot = e.eligibilitySlot ?? e.slot ?? groups.size;
    if (!groups.has(slot)) groups.set(slot, { op: "min", count: null, key: null, values: [], extraKeys: [] });
    const g = groups.get(slot);
    const type = String(e.type ?? e.key ?? "").toUpperCase();
    const value = e.eligibilityValue ?? e.value;
    if (e.count !== undefined && e.count !== null && Number(e.count) >= 0) g.count = Number(e.count);
    if (type === "SCOPE") {
      g.op = SCOPE[value] ?? SCOPE[String(value).toUpperCase()] ?? "min";
    } else if (COUNT_KEYS.has(type)) {
      g.count = Number(value);
    } else if (g.key === null || g.key === type) {
      g.key = type;
      if (value !== undefined) g.values.push(Number(value));
    } else {
      g.extraKeys.push(type);
    }
  }
  return [...groups.values()];
}

function allPlayersBetween(lo, hi, what) {
  // "Todos os jogadores com X" = "no máximo 0 jogadores fora de X".
  const reqs = [];
  if (lo > 1) reqs.push({ type: "count", filter: { max_rating: lo - 1 }, op: "max", value: 0, _what: what });
  if (hi < 99) reqs.push({ type: "count", filter: { min_rating: hi + 1 }, op: "max", value: 0, _what: what });
  return reqs;
}

/** Converte um grupo em requisitos do solver. Devolve { reqs, squadSize, warning }. */
export function convertGroup(g) {
  const { key, values, op } = g;
  const v = values[0];
  const count = g.count;
  if (g.extraKeys.length) return { warning: `requisito com várias condições (${[key, ...g.extraKeys].join(" + ")})` };
  if (key === null) return { reqs: [] };

  if (["TEAM_RATING", "TEAM_RATING_1_TO_100"].includes(key)) {
    if (op !== "min") return { warning: `overall do time com escopo "${op}" não suportado` };
    return { reqs: [{ type: "min_team_rating", value: v }] };
  }
  if (["CHEMISTRY_POINTS", "TEAM_CHEMISTRY"].includes(key)) {
    return { reqs: [{ type: "min_team_chemistry", value: v }] };
  }
  if (["ALL_PLAYERS_CHEMISTRY_POINTS", "PLAYER_CHEMISTRY"].includes(key)) {
    return { reqs: [{ type: "min_player_chemistry", value: v }] };
  }
  if (SQUAD_SIZE_KEYS.has(key)) return { reqs: [], squadSize: v };

  let m = key.match(/^(NATION|LEAGUE|CLUB)_COUNT$/);
  if (m) return { reqs: [{ type: "distinct", attribute: ATTR[m[1]], op, value: v }] };

  m = key.match(/^SAME_(NATION|LEAGUE|CLUB)_COUNT$/);
  if (m) {
    const sameOp = op === "exact" ? "min" : op;
    return {
      reqs: [{ type: "same", attribute: ATTR[m[1]], op: sameOp, value: v }],
      warning: op === "exact" ? `"${key}" exato tratado como mínimo` : undefined,
    };
  }

  m = key.match(/^(NATION|LEAGUE|CLUB)_ID$/);
  if (m) {
    if (count === null) return { warning: `${key} sem quantidade de jogadores` };
    const ids = values.map(String);
    return { reqs: [{ type: "count", filter: { [ATTR[m[1]]]: ids.length === 1 ? ids[0] : ids }, op, value: count }] };
  }

  if (["PLAYER_QUALITY", "PLAYER_LEVEL"].includes(key)) {
    const quality = QUALITY_BY_LEVEL[v];
    if (!quality) return { warning: `qualidade desconhecida (${v})` };
    if (count !== null) return { reqs: [{ type: "count", filter: { quality }, op, value: count }] };
    const [lo, hi] = QUALITY_RATING_RANGE[quality];
    // Sem quantidade = vale para o time todo ("Qualidade: mín. Prata").
    if (op === "min") return { reqs: allPlayersBetween(lo, 99, key) };
    if (op === "max") return { reqs: allPlayersBetween(1, hi, key) };
    return { reqs: allPlayersBetween(lo, hi, key) };
  }

  if (["PLAYER_RARITY", "PLAYER_RARITY_GROUP"].includes(key)) {
    if (!values.includes(1)) return { warning: `raridade ${values.join("/")} não suportada (só "raro")` };
    if (count === null) return { warning: `${key} sem quantidade de jogadores` };
    return { reqs: [{ type: "count", filter: { rare: true }, op, value: count }] };
  }

  if (key === "PLAYER_MIN_OVR") {
    if (count === null) return { reqs: allPlayersBetween(v, 99, key) };
    return { reqs: [{ type: "count", filter: { min_rating: v }, op, value: count }] };
  }
  if (key === "PLAYER_MAX_OVR") {
    if (count === null) return { reqs: allPlayersBetween(1, v, key) };
    return { reqs: [{ type: "count", filter: { max_rating: v }, op, value: count }] };
  }
  if (key === "PLAYER_EXACT_OVR") {
    if (count === null) return { reqs: allPlayersBetween(v, v, key) };
    return { reqs: [{ type: "count", filter: { min_rating: v, max_rating: v }, op, value: count }] };
  }

  return { warning: `requisito "${key}" ainda não suportado` };
}

function isBrick(slot) {
  return slot?.brick === true || slot?.itemData?.brick === true || slot?.isBrick === true;
}

/**
 * challenge: desafio cru da EA. squadResponse: resposta crua do squad do desafio (opcional).
 * Devolve { data: sbc.json, warnings: [] }.
 */
export function buildSbc(challenge, squadResponse = null) {
  const warnings = [];
  if (!challenge) return { data: null, warnings: ["nenhum DME capturado: abra um desafio no Web App"] };

  if (String(challenge.elgOperation ?? "AND").toUpperCase() !== "AND") {
    warnings.push(`operação "${challenge.elgOperation}" entre requisitos não suportada (só AND)`);
  }

  const requirements = [];
  let squadSize = null;
  for (const g of groupRequirements(challenge.elgReq)) {
    const { reqs = [], squadSize: size, warning } = convertGroup(g);
    if (warning) warnings.push(warning);
    if (size) squadSize = size;
    for (const r of reqs) {
      delete r._what;
      requirements.push(r);
    }
  }

  const squad = squadResponse?.squad ?? squadResponse;
  const rawFormation = squad?.formation ?? challenge.formation;
  const fkey = formationKey(rawFormation);
  let formation = FORMATIONS[fkey];
  if (!formation) {
    warnings.push(`formação "${rawFormation}" desconhecida; usando 4-3-3`);
    formation = FORMATIONS.f433;
  }
  // Slots bloqueados ("tijolos"). Formato confirmado no FC 27 (DME "Melhoria 2x 79+"):
  //   playerRequirements: [{index: 0, playerType: "BRICK"}, {index: 1, playerType: "DEFAULT"}, ...]
  // O índice é o slot da EA, começando pelo goleiro (mesma ordem de FORMATIONS).
  const bricks = new Set();
  for (const r of squadResponse?.playerRequirements ?? []) {
    if (String(r?.playerType).toUpperCase() === "BRICK") bricks.add(Number(r.index));
  }
  (squad?.players ?? []).forEach((p, i) => isBrick(p) && bricks.add(Number(p.index ?? i)));

  // slotIndices[j] = slot da EA onde vai o j-ésimo jogador da solução (usado na Fase 4).
  let slotIndices = formation.map((_, i) => i).filter((i) => !bricks.has(i));
  if (squadSize && squadSize < slotIndices.length) {
    warnings.push(
      `o DME pede ${squadSize} jogadores, mas não identifiquei quais slots ficam vazios; usando os ${squadSize} primeiros`,
    );
    slotIndices = slotIndices.slice(0, squadSize);
  }

  const data = {
    name: challenge.name ?? `DME ${challenge.challengeId ?? ""}`.trim(),
    formation: slotIndices.map((i) => formation[i]),
    requirements,
    ea: {
      challengeId: challenge.challengeId ?? null,
      setId: challenge.setId ?? null,
      formation: rawFormation ?? null,
      slotIndices,
    },
    warnings,
  };
  return { data, warnings };
}
