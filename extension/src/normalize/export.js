// Monta o que o popup mostra e exporta, a partir do estado cru guardado pelo content.js.

import { buildClub } from "./players.js";
import { buildSbc } from "./sbc.js";

const OP_PT = { min: "mín.", max: "máx.", exact: "exatamente" };
const ATTR_PT = { league: "ligas", nation: "nações", club: "clubes" };
const ATTR_SAME_PT = { league: "da mesma liga", nation: "da mesma nação", club: "do mesmo clube" };
const FILTER_PT = { league: "liga", nation: "nação", club: "clube", quality: "qualidade", rarity: "raridade" };

export function describeRequirement(r) {
  const op = OP_PT[r.op ?? "min"];
  switch (r.type) {
    case "min_team_rating": return `Overall do time: mín. ${r.value}`;
    case "min_team_chemistry": return `Química do time: mín. ${r.value}`;
    case "min_player_chemistry": return `Química por jogador: mín. ${r.value}`;
    case "distinct": return `${ATTR_PT[r.attribute]} diferentes: ${op} ${r.value}`;
    case "same": return `Jogadores ${ATTR_SAME_PT[r.attribute]}: ${op} ${r.value}`;
    case "count": {
      const parts = Object.entries(r.filter).map(([k, v]) => {
        if (k === "rare") return v ? "raros" : "não raros";
        if (k === "min_rating") return `overall ≥ ${v}`;
        if (k === "max_rating") return `overall ≤ ${v}`;
        return `${FILTER_PT[k] ?? k} ${Array.isArray(v) ? v.join(" ou ") : v}`;
      });
      return `Jogadores (${parts.join(", ")}): ${op} ${r.value}`;
    }
    default: return r.type;
  }
}

export function currentChallenge(state) {
  const id = state.currentChallengeId;
  if (id === null || id === undefined) return { challenge: null, squad: null };
  return { challenge: state.challenges?.[id] ?? null, squad: state.squads?.[id] ?? null };
}

export function summarize(state) {
  const { challenge, squad } = currentChallenge(state);
  let sbc = null;
  let sbcWarnings = [];
  if (challenge) {
    ({ data: sbc, warnings: sbcWarnings } = buildSbc(challenge, squad));
  } else if (state.currentChallengeId !== null && state.currentChallengeId !== undefined) {
    sbcWarnings = ["Abri o desafio, mas não vi os requisitos dele. Volte à lista do grupo de DMEs e abra de novo."];
  }
  return {
    counts: {
      club: Object.keys(state.club ?? {}).length,
      unassigned: Object.keys(state.unassigned ?? {}).length,
      storage: Object.keys(state.storage ?? {}).length,
      names: Object.keys(state.names ?? {}).length,
    },
    sbc,
    sbcWarnings,
    loader: state.loader ?? null,
    templateInfo: state.templateInfo ?? null,
  };
}

const STAT_FIELDS = ["rareflag", "cardsubtypeid", "itemState", "pile", "untradeable"];

/**
 * Para cada campo, quantos jogadores têm cada valor, com até 3 exemplos
 * ("Nome 89"). Serve para descobrir códigos da EA (ex.: qual rareflag é "raro").
 */
export function fieldStats(state) {
  const items = [...Object.values(state.club ?? {}), ...Object.values(state.unassigned ?? {}), ...Object.values(state.storage ?? {})];
  const stats = {};
  for (const field of STAT_FIELDS) {
    const byValue = {};
    for (const it of items) {
      const v = String(it[field]);
      byValue[v] ??= { count: 0, examples: [] };
      byValue[v].count += 1;
      if (byValue[v].examples.length < 3) {
        byValue[v].examples.push(`${state.names?.[it.assetId] ?? `#${it.assetId}`} ${it.rating}`);
      }
    }
    stats[field] = byValue;
  }
  return stats;
}

/** Arquivo de diagnóstico: sem cabeçalhos/token, só estrutura e amostras. */
export function buildDiagnostic(state, version) {
  const s = summarize(state);
  return {
    kind: "fifeiros-diagnostic",
    extensionVersion: version,
    exportedAt: new Date().toISOString(),
    counts: s.counts,
    templateInfo: s.templateInfo,
    loader: s.loader,
    currentChallengeId: state.currentChallengeId ?? null,
    // Dados crus completos do DME aberto (requisitos + escalação com slots bloqueados).
    currentChallengeRaw: state.challenges?.[state.currentChallengeId] ?? null,
    currentSquadRaw: state.squads?.[state.currentChallengeId] ?? null,
    // Fase 4: formato do "salvar escalação" (sem cabeçalhos/token) e jogadores em outros DMEs.
    squadSaves: state.squadSaves ?? [],
    lastFill: state.lastFill ?? null,
    webAppProbe: state.probe ?? null,
    lastSolutionSummary: state.lastSolution
      ? {
          challengeId: state.lastSolution.challengeId ?? null,
          slotIndices: state.lastSolution.slotIndices ?? null,
          error: state.lastSolution.error ?? null,
          squad: (state.lastSolution.solution?.squad ?? []).map((s) => [s.slot, s.slot_position, s.player_id, s.name]),
        }
      : null,
    sbcHub: state.sbcHub ?? null,
    challengeIds: Object.keys(state.challenges ?? {}),
    sbcPreview: s.sbc,
    sbcWarnings: s.sbcWarnings,
    clubPreview: buildClub(state).skipped,
    clubFieldStats: fieldStats(state),
    requests: state.diag?.requests ?? [],
    samples: state.diag?.samples ?? {},
    hookErrors: state.diag?.hookErrors ?? [],
  };
}

export { buildClub, buildSbc };
