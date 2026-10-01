"""Orquestra tudo: filtra candidatos -> monta modelo -> resolve -> monta a saída."""

from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass, replace
from typing import Any

from ortools.sat.python import cp_model

from .chemistry import compute_chemistry
from .cost import CostWeights, coin_cost
from .model_builder import add_assignment, add_chemistry, build_model
from .models import SBC, Options, Player
from .rating import team_rating
from .validate import evaluate

STATUS_NAMES = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.MODEL_INVALID: "MODEL_INVALID",
    cp_model.UNKNOWN: "UNKNOWN",
}

WORKERS = 8


@dataclass
class RunResult:
    status: str
    lineup: list[Player] | None  # jogador de cada slot, na ordem dos slots
    wall_time: float


def select_candidates(
    club: list[Player], market: list[Player], opts: Options
) -> tuple[list[Player], Counter]:
    """Remove quem não pode ser usado e conta os motivos (para o diagnóstico)."""
    pool = list(club) + (list(market) if opts.allow_market else [])
    kept, excluded = [], Counter()
    for p in pool:
        if p.id in opts.required_players:
            kept.append(p)  # escolhido pelo usuário: ignora os filtros
        elif p.id in opts.locked_players or p.definition_id in opts.locked_players:
            excluded["bloqueado (locked_players)"] += 1
        elif opts.rating_min is not None and p.rating < opts.rating_min:
            excluded["overall abaixo de rating_range.min"] += 1
        elif opts.rating_max is not None and p.rating > opts.rating_max:
            excluded["overall acima de rating_range.max"] += 1
        elif p.is_special and not opts.allow_special:
            excluded["especial (allow_special=false)"] += 1
        elif p.category == "tradeable" and not opts.allow_tradeable:
            excluded["negociável (allow_tradeable=false)"] += 1
        else:
            kept.append(p)
    return kept, excluded


def run(
    sbc: SBC,
    players: list[Player],
    skip: frozenset[int] = frozenset(),
    time_limit: float | None = None,
    weights: CostWeights = CostWeights(),
) -> RunResult:
    weights = replace(weights, untradeable_value=sbc.options.untradeable_value)
    built = build_model(sbc, players, skip, weights)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit or sbc.options.time_limit_s
    solver.parameters.num_workers = WORKERS
    status = solver.Solve(built.model)
    name = STATUS_NAMES.get(status, str(status))
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return RunResult(name, None, solver.WallTime())

    if built.uses_slots:
        lineup = [
            next(players[i] for i in range(len(players)) if solver.Value(built.x[i, j]))
            for j in range(len(sbc.slots))
        ]
    else:
        chosen = [p for i, p in enumerate(players) if solver.Value(built.u[i])]
        lineup = arrange(sbc.slots, chosen)
    return RunResult(name, lineup, solver.WallTime())


def arrange(slots: list[str], chosen: list[Player]) -> list[Player]:
    """Distribui os jogadores já escolhidos nos slots maximizando a química.

    Usado quando o DME não pede química: o custo não depende da posição, mas
    é mais bonito (e útil na Fase 4) colocar cada um onde rende mais.
    """
    model = cp_model.CpModel()
    u = [1] * len(chosen)
    x = add_assignment(model, chosen, slots, u)
    chem = add_chemistry(model, chosen, slots, x)
    in_pos = [x[i, j] for i, p in enumerate(chosen) for j, pos in enumerate(slots) if pos in p.positions]
    # Química primeiro; em empate, mais gente na posição.
    model.Maximize(100 * sum(chem) + sum(in_pos))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5
    solver.parameters.num_workers = WORKERS
    solver.Solve(model)
    return [
        next(chosen[i] for i in range(len(chosen)) if solver.Value(x[i, j]))
        for j in range(len(slots))
    ]


def _player_out(slot: int, pos: str, p: Player, chem: int) -> dict[str, Any]:
    return {
        "slot": slot,
        "slot_position": pos,
        "player_id": p.id,
        "definition_id": p.definition_id,
        "name": p.name,
        "rating": p.rating,
        "position": p.position,
        "in_position": pos in p.positions,
        "chemistry": chem,
        "league": p.league,
        "nation": p.nation,
        "club": p.club,
        "rarity": p.rarity,
        "category": p.category,
        "coin_cost": coin_cost(p),
        "needs_purchase": p.needs_purchase,
    }


def build_solution(sbc: SBC, result: RunResult) -> dict[str, Any]:
    lineup = result.lineup
    per_slot, team_chem = compute_chemistry(sbc.slots, lineup)
    checks = evaluate(sbc, lineup)
    squad = [_player_out(j, pos, p, c) for j, (pos, p, c) in enumerate(zip(sbc.slots, lineup, per_slot))]
    to_buy = [s for s in squad if s["needs_purchase"]]
    return {
        "status": result.status,
        "sbc": sbc.name,
        "squad": squad,
        "team_rating": team_rating(p.rating for p in lineup),
        "team_chemistry": team_chem,
        "total_cost": sum(s["coin_cost"] for s in squad),
        "purchase_cost": sum(s["coin_cost"] for s in to_buy),
        "to_buy": [{"name": s["name"], "rating": s["rating"], "price": s["coin_cost"]} for s in to_buy],
        "requirements": [{"description": c.description, "ok": c.ok, "actual": c.actual} for c in checks],
        "valid": all(c.ok for c in checks),
        "reason": None,
        "diagnostics": [],
        "warnings": list(sbc.warnings),
        "solve_time_s": round(result.wall_time, 3),
    }


def solve(
    club: list[Player],
    sbc: SBC,
    market: list[Player] | None = None,
    weights: CostWeights = CostWeights(),
    diagnose_on_failure: bool = True,
) -> dict[str, Any]:
    from .diagnostics import diagnose  # import tardio: diagnostics usa este módulo

    market = market or []
    started = time.perf_counter()
    candidates, excluded = select_candidates(club, market, sbc.options)
    result = None
    missing_required = sbc.options.required_players - {p.id for p in candidates}
    if not missing_required and len(candidates) >= sbc.squad_size:
        result = run(sbc, candidates, weights=weights)

    if result is not None and result.lineup is not None:
        solution = build_solution(sbc, result)
        if not solution["valid"]:
            # Nunca deveria acontecer: modelo e validador discordam.
            solution["status"] = "INVALID"
            solution["reason"] = "Erro interno: a solução do solver não passou na validação."
        return solution

    status = result.status if result else "INFEASIBLE"
    reason, details = (
        diagnose(club, sbc, market, candidates, excluded, status)
        if diagnose_on_failure
        else ("Sem solução.", [])
    )
    return {
        "status": status,
        "sbc": sbc.name,
        "squad": [],
        "team_rating": None,
        "team_chemistry": None,
        "total_cost": None,
        "purchase_cost": None,
        "to_buy": [],
        "requirements": [],
        "valid": False,
        "reason": reason,
        "diagnostics": details,
        "warnings": list(sbc.warnings),
        "solve_time_s": round(time.perf_counter() - started, 3),
    }


def with_options(sbc: SBC, **changes: Any) -> SBC:
    return replace(sbc, options=replace(sbc.options, **changes))
