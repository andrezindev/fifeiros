// Fase 4: transforma a solução do solver no plano de preenchimento do DME,
// com todas as checagens de segurança. Função pura (testada em Node).

import { lockedInOtherSbcs } from "./normalize/players.js";

/**
 * result = lastSolution (do background); state = dados capturados.
 * Devolve { plan: { challengeId, slots: [{ index, itemId, name, rating, position }] } } ou { error }.
 */
export function buildFillPlan(result, state) {
  const sol = result?.solution;
  if (!sol?.squad?.length || !sol.valid) return { error: "Não há solução válida para preencher." };
  if (result.challengeId === null || result.challengeId === undefined || result.challengeId !== state.currentChallengeId) {
    return { error: "Esta solução é de outro DME. Clique em Resolver com o DME aberto." };
  }
  if ((sol.warnings ?? []).length) {
    return { error: "O DME tem requisitos que a extensão não entendeu. Monte à mão para não errar." };
  }
  if ((sol.to_buy ?? []).length) {
    return { error: "A solução precisa de compras; a extensão só preenche com jogadores do seu clube." };
  }
  const slotIndices = result.slotIndices;
  if (!Array.isArray(slotIndices) || slotIndices.length !== sol.squad.length) {
    return { error: "Solução antiga, sem a ordem dos slots. Clique em Resolver de novo." };
  }

  const owned = new Set(
    ["club", "unassigned", "storage"].flatMap((k) => Object.keys(state[k] ?? {})),
  );
  const locked = lockedInOtherSbcs(state);
  const slots = sol.squad.map((s) => ({
    index: slotIndices[s.slot],
    itemId: String(s.player_id),
    name: s.name,
    rating: s.rating,
    position: s.slot_position,
  }));

  const missing = slots.filter((s) => !owned.has(s.itemId));
  if (missing.length) {
    return { error: `${missing.map((s) => s.name).join(", ")} não está mais no seu clube. Clique em Resolver de novo.` };
  }
  const busy = slots.filter((s) => locked.has(s.itemId));
  if (busy.length) {
    return { error: `${busy.map((s) => s.name).join(", ")} está em outro DME. Clique em Resolver de novo.` };
  }
  if (new Set(slots.map((s) => s.index)).size !== slots.length) return { error: "Slots repetidos na solução." };

  return { plan: { challengeId: result.challengeId, slots } };
}
