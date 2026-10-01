"""Quando não há solução, descobre o motivo mais provável.

Três camadas, da mais barata para a mais cara:
1. Checagens diretas: faltam jogadores, faltam jogadores de uma liga, overall
   máximo possível abaixo do pedido etc.
2. Relaxamento: remove UM requisito de cada vez e resolve de novo. Se o
   problema fica viável sem o requisito X, X é o "gargalo".
3. Sugestões: seria viável comprando do mercado? Há jogadores excluídos
   pelas opções (especiais, bloqueados...)?
"""

from __future__ import annotations

from collections import Counter

from .filters import describe_filter, matches
from .models import SBC, Player
from .rating import max_possible_rating
from .validate import describe

RELAX_TIME_LIMIT = 3.0


def _distinct_people(players: list[Player]) -> int:
    return len({p.definition_id for p in players})


def quick_checks(sbc: SBC, candidates: list[Player]) -> list[str]:
    n = sbc.squad_size
    msgs = []
    for req in sbc.requirements:
        if req.type == "count":
            ok = [p for p in candidates if matches(p, req.filter)]
            have = _distinct_people(ok)
            what = describe_filter(req.filter)
            if req.op in ("min", "exact") and have < req.value:
                msgs.append(f"Você tem só {have} jogador(es) disponível(is) com {what}; o DME pede {req.value}.")
            if req.op in ("max", "exact"):
                others = _distinct_people([p for p in candidates if not matches(p, req.filter)])
                if others < n - req.value:
                    msgs.append(
                        f"Faltam jogadores SEM {what}: precisa de {n - req.value}, você tem {others}."
                    )
        elif req.type == "distinct" and req.op in ("min", "exact"):
            have = len({getattr(p, req.attribute) for p in candidates})
            if have < req.value:
                msgs.append(f"{describe(req)}: seus jogadores disponíveis cobrem só {have}.")
        elif req.type == "same" and req.op == "min":
            groups = Counter()
            for p in {p.definition_id: p for p in candidates}.values():
                groups[getattr(p, req.attribute)] += 1
            best = max(groups.values(), default=0)
            if best < req.value:
                msgs.append(f"{describe(req)}: o maior grupo que você tem é de {best}.")
        elif req.type == "min_team_rating":
            best = max_possible_rating([p.rating for p in {p.definition_id: p for p in candidates}.values()], n)
            if best < req.value:
                msgs.append(
                    f"Overall máximo possível com os jogadores disponíveis é {best}; o DME pede {req.value}."
                )
    return msgs


def diagnose(
    club: list[Player],
    sbc: SBC,
    market: list[Player],
    candidates: list[Player],
    excluded: Counter,
    status: str,
) -> tuple[str, list[str]]:
    from .solver import run, select_candidates, with_options

    n = sbc.squad_size
    details: list[str] = []

    if status == "UNKNOWN":
        return (
            f"O solver não achou solução em {sbc.options.time_limit_s:.0f}s (não provou que é impossível). "
            "Tente aumentar o tempo com --time-limit.",
            details,
        )

    required = sbc.options.required_players
    missing_required = sorted(required - {p.id for p in candidates})
    if missing_required:
        reason = (f"{len(missing_required)} jogador(es) que você já colocou no DME não estão mais no clube. "
                  "Ligue 'Substituir atletas' ou tire-os do DME.")
    elif len(required) > n:
        reason = f"Você já colocou {len(required)} jogadores, mas o DME só tem {n} vagas."
    elif len(candidates) < n:
        reason = f"Só {len(candidates)} jogador(es) disponível(is) e o DME precisa de {n}."
    else:
        quick = quick_checks(sbc, candidates)
        if quick:
            reason = quick[0]
            details.extend(quick[1:])
        else:
            culprits = [
                k for k in range(len(sbc.requirements))
                if run(sbc, candidates, skip=frozenset({k}), time_limit=RELAX_TIME_LIMIT).lineup
            ]
            if required and run(with_options(sbc, required_players=frozenset()), candidates, time_limit=RELAX_TIME_LIMIT).lineup:
                culprits = []
                reason = ("Os jogadores que você já colocou no DME impedem a solução. "
                          "Ligue 'Substituir atletas' para o solver trocar quem precisar.")
            elif len(culprits) == 1:
                reason = f"O requisito que impede a solução é: {describe(sbc.requirements[culprits[0]])}."
            elif culprits:
                names = "; ".join(describe(sbc.requirements[k]) for k in culprits)
                reason = f"Removendo qualquer um destes requisitos haveria solução: {names}."
            else:
                reason = (
                    "Nenhum requisito sozinho é o problema: é a combinação de vários deles "
                    "que não fecha com o seu clube."
                )

    if excluded:
        parts = ", ".join(f"{c} {motivo}" for motivo, c in excluded.items())
        details.append(f"Jogadores excluídos pelas opções: {parts}.")

    if not sbc.options.allow_market and market:
        alt = with_options(sbc, allow_market=True)
        cands, _ = select_candidates(club, market, alt.options)
        res = run(alt, cands, time_limit=max(RELAX_TIME_LIMIT, sbc.options.time_limit_s))
        if res.lineup:
            to_buy = [p for p in res.lineup if p.needs_purchase]
            cost = sum(p.market_price for p in to_buy)
            details.append(
                f"Comprando do mercado há solução: {len(to_buy)} jogador(es), ~{cost:,} moedas "
                "(rode com --allow-market)."
            )
    return reason, details
