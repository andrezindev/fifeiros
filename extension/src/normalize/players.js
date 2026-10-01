// Converte os itens da EA ("itemData") para o formato do club.json do solver.

import {
  HERO_CLUB_ID,
  HERO_RAREFLAG,
  ICON_LEAGUE_ID,
  ICON_RAREFLAG,
  estimatePrice,
  mapPosition,
  mapRarity,
} from "./mappings.js";

const first = (...values) => values.find((v) => v !== undefined && v !== null);

function playerName(raw, names) {
  const byAsset = names?.[raw.assetId] ?? names?.[raw.definitionId];
  if (byAsset) return byAsset;
  const sd = raw._staticData ?? raw.staticData;
  if (sd?.name) return sd.name;
  return `Jogador #${first(raw.assetId, raw.definitionId, raw.id)}`;
}

/**
 * Converte um item cru. Devolve { player } ou { skip: "motivo" }.
 * `ctx` = { source: "club"|"unassigned"|"storage", names, clubDefinitions: Set }
 */
export function normalizeItem(raw, ctx = {}) {
  if (!raw || typeof raw !== "object") return { skip: "item inválido" };
  const type = String(first(raw.itemType, raw.type, "player")).toLowerCase();
  if (type !== "player") return { skip: "não é jogador" };
  // Jogadores emprestados não podem ir para DME.
  if (raw.loans !== undefined && raw.loans !== null && Number(raw.loans) >= 0) return { skip: "empréstimo" };

  const rating = Number(raw.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 99) return { skip: "overall inválido" };

  const position = mapPosition(first(raw.preferredPosition, raw.position));
  if (!position) return { skip: `posição desconhecida (${raw.preferredPosition})` };
  const alt = (raw.possiblePositions ?? [])
    .map(mapPosition)
    .filter((p) => p && p !== position);

  const league = first(raw.leagueId, raw.league);
  const nation = first(raw.nation, raw.nationId);
  const club = first(raw.teamid, raw.teamId, raw.club);
  if ([league, nation, club].some((v) => v === undefined)) return { skip: "sem liga/nação/clube" };

  const rareflag = first(raw.rareflag, raw.rareFlag, 0);
  const rarity = mapRarity(rareflag);
  const tradeable = !raw.untradeable;
  const definitionId = String(first(raw.assetId, raw.definitionId, raw.resourceId, raw.id));

  const source = ctx.source ?? "club";
  let isDuplicate = false;
  if (source === "storage") isDuplicate = true; // o "armazém de DME" só guarda repetidos
  if (source === "unassigned") {
    isDuplicate = Number(raw.duplicateId ?? 0) > 0 || Boolean(ctx.clubDefinitions?.has(definitionId));
  }

  // Preço: média de mercado que a própria EA manda (marketAverage). Sem ela,
  // estimativa pela tabela, nunca abaixo do preço mínimo permitido.
  const average = Number(raw.marketAverage ?? 0);
  const price = average > 0 ? Math.round(average) : Math.max(estimatePrice(rating, rarity), Number(raw.marketDataMinPrice ?? 0));
  const player = {
    id: String(raw.id),
    definition_id: definitionId,
    name: playerName(raw, ctx.names),
    overall: rating,
    position,
    alt_positions: [...new Set(alt)],
    league: String(league),
    nation: String(nation),
    club: String(club),
    rarity,
    tradeable,
    untradeable: !tradeable,
    is_duplicate: isDuplicate,
    market_price: price,
  };
  if (source !== "club") player.unassigned = true;
  if (Number(league) === ICON_LEAGUE_ID || Number(rareflag) === ICON_RAREFLAG) player.is_icon = true;
  if (Number(rareflag) === HERO_RAREFLAG || Number(club) === HERO_CLUB_ID) player.is_hero = true;
  return { player };
}

const toIdSet = (list) =>
  new Set((Array.isArray(list) ? list : []).map((x) => String(x?.id ?? x?.itemId ?? x)).filter((x) => x && x !== "0"));

/**
 * Ids de jogadores que estão em escalações de OUTROS DMEs não enviados.
 * A EA manda todos em /sbs/hub (squadPlayerItemIds); os que já estão no DME
 * aberto continuam permitidos.
 */
export function lockedInOtherSbcs(state) {
  const all = toIdSet(state.sbcHub?.squadPlayerItemIds);
  const current = state.squads?.[state.currentChallengeId];
  const here = toIdSet((current?.squad?.players ?? current?.players ?? []).map((p) => p?.itemData?.id));
  return new Set([...all].filter((id) => !here.has(id)));
}

/**
 * Junta clube + não atribuídos + armazém num único club.json.
 * Devolve { data: {players}, skipped: {motivo: quantidade} }.
 */
export function buildClub(state) {
  const names = state.names ?? {};
  const players = [];
  const skipped = {};
  const seen = new Set();
  const clubDefinitions = new Set(
    Object.values(state.club ?? {}).map((r) => String(first(r.assetId, r.definitionId, r.resourceId, r.id))),
  );

  const locked = lockedInOtherSbcs(state);
  for (const source of ["club", "unassigned", "storage"]) {
    for (const raw of Object.values(state[source] ?? {})) {
      if (locked.has(String(raw?.id))) {
        skipped["em outro DME"] = (skipped["em outro DME"] ?? 0) + 1;
        continue;
      }
      const { player, skip } = normalizeItem(raw, { source, names, clubDefinitions });
      if (skip) {
        skipped[skip] = (skipped[skip] ?? 0) + 1;
        continue;
      }
      if (seen.has(player.id)) continue;
      seen.add(player.id);
      players.push(player);
    }
  }
  return { data: { players }, skipped };
}

/** Lê o banco de nomes que o Web App baixa (players.json). */
export function parseNamesDatabase(json) {
  const out = {};
  for (const list of [json?.Players, json?.LegendsPlayers, json?.players]) {
    for (const p of list ?? []) {
      const name = p.c || [p.f, p.l].filter(Boolean).join(" ");
      if (p.id !== undefined && name) out[p.id] = name;
    }
  }
  return out;
}
