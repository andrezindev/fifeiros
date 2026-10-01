"""Confere um time contra os requisitos do DME, sem usar o solver.

Serve de "prova real": toda solução do solver passa por aqui antes de ser
devolvida, e os testes usam isto para garantir que o modelo CP-SAT está certo.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from .chemistry import compute_chemistry
from .filters import describe_filter, matches
from .models import SBC, Player, Requirement
from .rating import team_rating

_ATTR_PT = {"league": "ligas", "nation": "nações", "club": "clubes"}
_ATTR_PT_SING = {"league": "da mesma liga", "nation": "da mesma nação", "club": "do mesmo clube"}
_OP_PT = {"min": "mín.", "max": "máx.", "exact": "exatamente"}


@dataclass
class RequirementCheck:
    description: str
    ok: bool
    actual: int


def describe(req: Requirement) -> str:
    op = _OP_PT[req.op]
    if req.type == "min_team_rating":
        return f"Overall do time: mín. {req.value}"
    if req.type == "min_team_chemistry":
        return f"Química do time: mín. {req.value}"
    if req.type == "min_player_chemistry":
        return f"Química por jogador: mín. {req.value}"
    if req.type == "count":
        return f"Jogadores ({describe_filter(req.filter)}): {op} {req.value}"
    if req.type == "distinct":
        return f"{_ATTR_PT[req.attribute].capitalize()} diferentes: {op} {req.value}"
    if req.type == "same":
        return f"Jogadores {_ATTR_PT_SING[req.attribute]}: {op} {req.value}"
    return req.type


def compare(op: str, actual: int, value: int) -> bool:
    if op == "min":
        return actual >= value
    if op == "max":
        return actual <= value
    return actual == value


def evaluate(sbc: SBC, lineup: Sequence[Player | None]) -> list[RequirementCheck]:
    players = [p for p in lineup if p is not None]
    per_slot_chem, team_chem = compute_chemistry(sbc.slots, lineup)
    checks = []

    filled = len(players) == sbc.squad_size
    checks.append(RequirementCheck(f"Time completo ({sbc.squad_size} jogadores)", filled, len(players)))
    defs = Counter(p.definition_id for p in players)
    repeated = sum(c - 1 for c in defs.values())
    checks.append(RequirementCheck("Sem jogador repetido", repeated == 0, repeated))

    for req in sbc.requirements:
        if req.type == "min_team_rating":
            actual = team_rating(p.rating for p in players)
        elif req.type == "min_team_chemistry":
            actual = team_chem
        elif req.type == "min_player_chemistry":
            actual = min((c for p, c in zip(lineup, per_slot_chem) if p is not None), default=0)
        elif req.type == "count":
            actual = sum(matches(p, req.filter) for p in players)
        elif req.type == "distinct":
            actual = len({getattr(p, req.attribute) for p in players})
        elif req.type == "same":
            groups = Counter(getattr(p, req.attribute) for p in players)
            actual = max(groups.values(), default=0)
        else:
            raise ValueError(req.type)
        op = "min" if req.type.startswith("min_") else req.op
        checks.append(RequirementCheck(describe(req), compare(op, actual, req.value), actual))
    return checks


def is_valid(sbc: SBC, lineup: Sequence[Player | None]) -> bool:
    return all(c.ok for c in evaluate(sbc, lineup))
