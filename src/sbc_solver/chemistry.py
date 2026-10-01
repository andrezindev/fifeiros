"""Química do Ultimate Team (sistema introduzido no FC 24, mantido até o FC 26).

Hipótese: o FC 27 mantém as mesmas regras. Se a EA mudar os limites, basta
ajustar as constantes abaixo; o solver e os testes usam só estas constantes.

Regras:
- Cada jogador tem de 0 a 3 pontos de química; a química do time é a soma (máx. 33).
- Só conta quem está NA POSIÇÃO (principal ou alternativa). Jogador fora de
  posição tem 0 de química e NÃO ajuda os companheiros.
- Para cada liga, nação e clube, conta-se quantos jogadores (em posição) o time
  tem. Ao atingir cada limite, todo jogador daquele grupo ganha +1 ponto:
      Clube: 2 / 5 / 7 jogadores  -> 1 / 2 / 3 pontos
      Nação: 2 / 5 / 8 jogadores  -> 1 / 2 / 3 pontos
      Liga:  3 / 5 / 8 jogadores  -> 1 / 2 / 3 pontos
  Os pontos das três fontes são somados, com teto de 3 por jogador.
- Ícones: sempre 3 de química (se em posição) e contam 2x para a nação.
- Heróis: sempre 3 de química (se em posição) e contam 2x para a liga.
- Fora do escopo por enquanto: técnico (+1 liga/nação) e boosts de promoções.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence

from .models import Player

THRESHOLDS: dict[str, tuple[int, int, int]] = {
    "club": (2, 5, 7),
    "nation": (2, 5, 8),
    "league": (3, 5, 8),
}
MAX_PLAYER_CHEM = 3
MAX_TEAM_CHEM = 33


def in_position(player: Player, slot_position: str) -> bool:
    return slot_position in player.positions


def group_weight(player: Player, attribute: str) -> int:
    """Quanto o jogador conta para o grupo (ícone vale 2 na nação, herói 2 na liga)."""
    if attribute == "nation" and player.is_icon:
        return 2
    if attribute == "league" and player.is_hero:
        return 2
    return 1


def has_fixed_max_chem(player: Player) -> bool:
    return player.is_icon or player.is_hero


def level(count: int, attribute: str) -> int:
    return sum(count >= t for t in THRESHOLDS[attribute])


def compute_chemistry(
    slots: Sequence[str], lineup: Sequence[Player | None]
) -> tuple[list[int], int]:
    """Química de cada slot e total do time. `lineup[j]` é o jogador no slot j."""
    counts: dict[str, Counter] = {a: Counter() for a in THRESHOLDS}
    active = [p is not None and in_position(p, pos) for p, pos in zip(lineup, slots)]
    for p, on in zip(lineup, active):
        if on:
            for attr in THRESHOLDS:
                counts[attr][getattr(p, attr)] += group_weight(p, attr)

    per_slot = []
    for p, on in zip(lineup, active):
        if not on:
            per_slot.append(0)
        elif has_fixed_max_chem(p):
            per_slot.append(MAX_PLAYER_CHEM)
        else:
            pts = sum(level(counts[a][getattr(p, a)], a) for a in THRESHOLDS)
            per_slot.append(min(MAX_PLAYER_CHEM, pts))
    return per_slot, sum(per_slot)
