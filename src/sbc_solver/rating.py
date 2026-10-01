"""Fórmula de overall do time (squad rating) da EA.

Fórmula (usada pelas calculadoras da comunidade: FUTBIN, fifauteam.com,
github.com/delta4d/fut-rating), a mesma desde o FIFA 17:

    SOMA    = soma dos overalls
    MÉDIA   = SOMA / 11
    EXCESSO = soma de (overall - MÉDIA) apenas para quem está ACIMA da média
    TOTAL   = round(SOMA + EXCESSO)       # arredonda para o inteiro mais próximo (.5 sobe)
    OVERALL = floor(TOTAL / 11)           # trunca

Detalhe: o divisor é sempre 11. Em DMEs com menos de 11 jogadores, os slots
vazios contam como overall 0 (hipótese a confirmar no jogo; esses DMEs quase
nunca pedem overall mínimo).

Para evitar erros de ponto flutuante, trabalhamos com números inteiros
multiplicando tudo por 11:

    W = 11*SOMA + soma de max(0, 11*overall - SOMA)      (W = 11 * (SOMA + EXCESSO))
    round(W / 11) = floor((2W + 11) / 22)
    OVERALL = floor(round(W / 11) / 11)

E, invertendo, "overall do time >= T"  <=>  W >= 121*T - 5.
(Porque OVERALL >= T <=> round(W/11) >= 11T <=> W/11 >= 11T - 0.5 <=> W >= 121T - 5.5.)
É exatamente essa desigualdade que o solver usa no modelo CP-SAT.

Curiosidade: como TOTAL = W/11, ele nunca termina em .5, então não importa se
o round() arredonda empates para cima ou para o par.
"""

from __future__ import annotations

from collections.abc import Iterable

DIVISOR = 11


def rating_w(ratings: Iterable[int]) -> int:
    """W = 11 * (SOMA + EXCESSO), sempre inteiro."""
    rs = list(ratings)
    s = sum(rs)
    return DIVISOR * s + sum(max(0, DIVISOR * r - s) for r in rs)


def team_rating(ratings: Iterable[int]) -> int:
    rs = list(ratings)
    if not rs:
        return 0
    w = rating_w(rs)
    rounded_total = (2 * w + DIVISOR) // (2 * DIVISOR)  # round(W/11), .5 para cima
    return rounded_total // DIVISOR


def min_w_for_rating(target: int) -> int:
    """Menor W que garante overall >= target."""
    return DIVISOR * DIVISOR * target - 5


def average_floor_range(target: int, max_rating: int, squad_size: int) -> range:
    """Valores possíveis de A = floor(SOMA/11) num time com overall >= target.

    Usado pelo solver, que "chuta" A (ver model_builder._add_team_rating).
    Limite inferior: com k jogadores acima da média, o excesso*11 vale
    sum(11r - SOMA) <= 11*SOMA - k*SOMA (pois a soma dos k é <= SOMA) e também
    <= k*(11*max_rating - SOMA). Procuramos a menor SOMA em que algum k deixa
    W chegar ao alvo. Limite superior: SOMA <= squad_size * max_rating.
    """
    need = min_w_for_rating(target)
    s_max = squad_size * max_rating
    s_min = s_max + 1
    for s in range(s_max + 1):
        best_excess = max(
            min((DIVISOR - k) * s, k * max(0, DIVISOR * max_rating - s)) for k in range(squad_size + 1)
        )
        if DIVISOR * s + best_excess >= need:
            s_min = s
            break
    return range(s_min // DIVISOR, s_max // DIVISOR + 1)


def max_possible_rating(ratings: Iterable[int], squad_size: int) -> int:
    """Maior overall possível escolhendo `squad_size` jogadores.

    Como o overall do time nunca cai quando um jogador melhora, basta pegar os
    `squad_size` maiores overalls.
    """
    best = sorted(ratings, reverse=True)[:squad_size]
    return team_rating(best)
