"""Modelos de dados do solver: jogadores, requisitos, opções e o DME em si.

Os nomes dos campos JSON ficam em inglês (como a extensão da Fase 2 vai exportar),
mas as mensagens para o usuário ficam em português.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

RARITIES = ("common", "rare", "special")
QUALITIES = ("bronze", "silver", "gold")
GROUP_ATTRIBUTES = ("league", "nation", "club")
OPS = ("min", "max", "exact")

REQUIREMENT_TYPES = (
    "min_team_rating",       # overall mínimo do time
    "min_team_chemistry",    # química mínima do time (0-33)
    "min_player_chemistry",  # química mínima de CADA jogador (0-3)
    "count",                 # mín/máx/exato de jogadores que batem com um filtro
    "distinct",              # mín/máx/exato de ligas/nações/clubes DIFERENTES
    "same",                  # mín/máx de jogadores do MESMO clube/liga/nação
)

# Categorias de custo, na ordem de prioridade de uso (1 = usar primeiro).
CATEGORIES = ("untradeable_duplicate", "untradeable", "tradeable", "market")


def quality_of(rating: int) -> str:
    """Bronze até 64, prata de 65 a 74, ouro a partir de 75 (regra da EA)."""
    if rating < 65:
        return "bronze"
    if rating < 75:
        return "silver"
    return "gold"


@dataclass(frozen=True)
class Player:
    id: str
    name: str
    rating: int
    position: str
    league: str
    nation: str
    club: str
    alt_positions: tuple[str, ...] = ()
    rarity: str = "common"
    tradeable: bool = False
    is_duplicate: bool = False
    market_price: int = 0
    # Mesma pessoa em cartas diferentes (ex.: versão base e TOTW) tem o mesmo
    # definition_id. O jogo não deixa a mesma pessoa duas vezes no time.
    definition_id: str = ""
    source: str = "club"  # "club" ou "market" (jogador "conceito", precisa comprar)
    is_icon: bool = False
    is_hero: bool = False
    unassigned: bool = False  # está na pilha de "não atribuídos"

    def __post_init__(self) -> None:
        if not self.definition_id:
            object.__setattr__(self, "definition_id", self.id)

    @property
    def untradeable(self) -> bool:
        return not self.tradeable

    @property
    def positions(self) -> tuple[str, ...]:
        return (self.position, *self.alt_positions)

    @property
    def quality(self) -> str:
        return quality_of(self.rating)

    @property
    def is_rare(self) -> bool:
        """Para requisitos de "raro", cartas especiais também contam.

        No FC 27 não existe mais comum/raro nos cards base, então na prática só
        cartas de evento ("special") contam como raras.
        """
        return self.rarity in ("rare", "special")

    @property
    def is_special(self) -> bool:
        return self.rarity == "special"

    @property
    def needs_purchase(self) -> bool:
        return self.source == "market"

    @property
    def category(self) -> str:
        if self.source == "market":
            return "market"
        if self.untradeable and self.is_duplicate:
            return "untradeable_duplicate"
        if self.untradeable:
            return "untradeable"
        return "tradeable"


@dataclass
class Requirement:
    type: str
    value: int
    op: str = "min"
    filter: dict[str, Any] = field(default_factory=dict)  # só para "count"
    attribute: str | None = None  # "league"/"nation"/"club" para "distinct"/"same"


@dataclass
class Options:
    locked_players: frozenset[str] = frozenset()  # ids ou definition_ids que nunca usar
    rating_min: int | None = None
    rating_max: int | None = None
    allow_special: bool = False  # por padrão protege cartas especiais (TOTW, promo...)
    allow_tradeable: bool = True
    allow_market: bool = False
    time_limit_s: float = 10.0
    # Quanto um intransferível "vale", como fração do preço de mercado (ver cost.py).
    untradeable_value: float = 0.3
    # Jogadores que TÊM de estar na solução (ex.: já colocados no DME pelo usuário).
    # Eles ignoram os filtros acima: foram escolhidos de propósito.
    required_players: frozenset[str] = frozenset()


@dataclass
class SBC:
    name: str
    slots: list[str]  # posição de cada slot; len(slots) = tamanho do time
    requirements: list[Requirement] = field(default_factory=list)
    options: Options = field(default_factory=Options)
    # Avisos da extensão: requisitos do Web App que não foram traduzidos.
    warnings: list[str] = field(default_factory=list)

    @property
    def squad_size(self) -> int:
        return len(self.slots)
