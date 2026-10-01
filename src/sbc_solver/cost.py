"""Custo de cada jogador: em moedas (para o relatório) e no objetivo do solver.

O objetivo do solver usa "pontos de custo" inteiros (10 pontos = 1 moeda):

    1. duplicado intransferível -> quase 0 (não tem outro destino além de DME)
    2. intransferível no clube  -> pequeno + untradeable_value * preço de mercado
    3. negociável do clube      -> preço de mercado (você deixa de vendê-lo)
    4. conceito do mercado      -> preço + penalidade (exige comprar)

O `untradeable_value` (0 a 1, padrão 0.3) diz quanto um intransferível "vale"
em relação ao preço de mercado dele. Não dá para vendê-lo, mas ele serve para
jogar. Efeito com 0.3:
  - intransferível 83 (preço ~1.400) custa como ~440 moedas: continua sendo
    usado antes de um negociável parecido;
  - intransferível 89 (preço ~35.000) custa como ~10.500 moedas: o solver
    prefere gastar um negociável 84 (~2.800) em vez de queimá-lo.
Com 0, volta à prioridade estrita (qualquer intransferível antes de qualquer
negociável).

Dentro das categorias 1 e 2, um pequeno custo por ponto de overall faz o
solver preferir "queimar" os piores e guardar os melhores. Cartas especiais
(se permitidas) recebem um adicional, para só serem usadas quando necessário.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import Player

MIN_PRICE = 150  # preço mínimo de venda no mercado (piso para jogadores sem preço)
DEFAULT_UNTRADEABLE_VALUE = 0.3


@dataclass(frozen=True)
class CostWeights:
    coin_scale: int = 10          # pontos por moeda
    duplicate_base: int = 0
    duplicate_per_rating: int = 1
    untradeable_base: int = 100
    untradeable_per_rating: int = 3
    untradeable_value: float = DEFAULT_UNTRADEABLE_VALUE
    tradeable_base: int = 50
    market_base: int = 500        # "incômodo" de ter que comprar
    special_extra: int = 150


def coin_cost(p: Player) -> int:
    """Moedas que você gasta (mercado) ou deixa de ganhar (negociável do clube)."""
    if p.category in ("tradeable", "market"):
        return p.market_price
    return 0


def objective_cost(p: Player, w: CostWeights = CostWeights()) -> int:
    over40 = max(0, p.rating - 40)
    price = max(p.market_price, MIN_PRICE)
    cat = p.category
    if cat == "untradeable_duplicate":
        cost = w.duplicate_base + w.duplicate_per_rating * over40
    elif cat == "untradeable":
        cost = (w.untradeable_base + w.untradeable_per_rating * over40
                + round(w.untradeable_value * w.coin_scale * p.market_price))
    elif cat == "tradeable":
        cost = w.tradeable_base + w.coin_scale * price
    else:
        cost = w.market_base + w.coin_scale * price
    if p.is_special:
        cost += w.special_extra
    return cost
