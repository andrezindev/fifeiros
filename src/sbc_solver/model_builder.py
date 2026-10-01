"""Monta o modelo CP-SAT a partir do DME e da lista de jogadores candidatos.

Variáveis principais:
- u[i]   (0/1): o jogador i está no time.
- x[i,j] (0/1): o jogador i está no slot j. Só criadas quando o DME exige
  química, porque só a química depende da posição. Sem química, o solver
  escolhe QUEM entra e a arrumação nos slots é feita depois (ver solver.arrange).

Veja rating.py para a dedução da restrição de overall e chemistry.py para as
regras de química.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from .chemistry import (
    MAX_PLAYER_CHEM,
    THRESHOLDS,
    group_weight,
    has_fixed_max_chem,
    in_position,
)
from .cost import CostWeights, objective_cost
from .filters import matches
from .models import SBC, Player, Requirement
from .rating import DIVISOR, average_floor_range, min_w_for_rating

CHEM_TYPES = ("min_team_chemistry", "min_player_chemistry")


def needs_chemistry(requirements: list[Requirement]) -> bool:
    return any(r.type in CHEM_TYPES for r in requirements)


@dataclass
class BuiltModel:
    model: cp_model.CpModel
    players: list[Player]
    slots: list[str]
    u: list[cp_model.IntVar]
    x: dict[tuple[int, int], cp_model.IntVar] = field(default_factory=dict)
    chem: list[cp_model.IntVar] | None = None  # química de cada jogador

    @property
    def uses_slots(self) -> bool:
        return bool(self.x)


def _add_op(model: cp_model.CpModel, expr, op: str, value: int) -> None:
    if op == "min":
        model.Add(expr >= value)
    elif op == "max":
        model.Add(expr <= value)
    else:
        model.Add(expr == value)


def add_assignment(model: cp_model.CpModel, players: list[Player], slots: list[str], u):
    """Cria x[i,j]: cada slot recebe exatamente 1 jogador, e u[i] = soma de x[i,*]."""
    x = {(i, j): model.NewBoolVar(f"x_{i}_{j}") for i in range(len(players)) for j in range(len(slots))}
    for j in range(len(slots)):
        model.AddExactlyOne(x[i, j] for i in range(len(players)))
    for i in range(len(players)):
        model.Add(sum(x[i, j] for j in range(len(slots))) == u[i])
    return x


def add_chemistry(model: cp_model.CpModel, players: list[Player], slots: list[str], x) -> list:
    """Cria a variável de química (0-3) de cada jogador. Devolve a lista."""
    n = len(players)
    # a[i] = 1 se o jogador está no time E numa posição dele.
    a = []
    for i, p in enumerate(players):
        ok_slots = [x[i, j] for j, pos in enumerate(slots) if in_position(p, pos)]
        a.append(sum(ok_slots) if ok_slots else 0)

    # Para cada grupo (ex.: liga "Premier League"), variáveis "atingiu o nível k".
    levels: dict[tuple[str, str], list] = {}
    for attr, thresholds in THRESHOLDS.items():
        members = defaultdict(list)
        for i, p in enumerate(players):
            members[getattr(p, attr)].append(i)
        for value, idx in members.items():
            count = sum(group_weight(players[i], attr) * a[i] for i in idx)
            max_count = min(
                sum(group_weight(players[i], attr) for i in idx), 2 * len(slots)
            )
            bools = []
            for k, t in enumerate(thresholds):
                if t > max_count:
                    break  # nível inatingível: nem cria a variável
                b = model.NewBoolVar(f"lvl_{attr}_{value}_{k}")
                model.Add(count >= t).OnlyEnforceIf(b)
                bools.append(b)
            levels[attr, value] = bools

    chem = []
    for i, p in enumerate(players):
        c = model.NewIntVar(0, MAX_PLAYER_CHEM, f"chem_{i}")
        model.Add(c <= MAX_PLAYER_CHEM * a[i])
        if not has_fixed_max_chem(p):
            pts = [b for attr in THRESHOLDS for b in levels[attr, getattr(p, attr)]]
            model.Add(c <= sum(pts))
        chem.append(c)
    assert len(chem) == n
    return chem


def _add_team_rating(
    model: cp_model.CpModel, players: list[Player], u, target: int, squad_size: int
) -> None:
    """Restrição exata "overall do time >= target", via W >= 121*T - 5 (ver rating.py).

    A dificuldade é saber quem está acima da média, porque a média depende de
    quem foi escolhido. Truque: o solver escolhe o piso da média,
    A = floor(SOMA/11), numa variável 0/1 y[A] (exatamente uma ligada).
    Com A fixo, "acima da média" (11r > SOMA) equivale a r >= A+1, uma lista
    conhecida de antemão. Escrevendo SOMA = 11A + d (0 <= d <= 10):

        W = 11*SOMA + 11*R_A - SOMA*N_A = 11*SOMA + 11*R_A - 11A*N_A - d*N_A

    onde R_A = soma dos overalls e N_A = quantidade de escolhidos com r >= A+1.
    Só d*N_A não é linear, e é um produto de números pequenos (d<=10, N<=11),
    que o CP-SAT resolve bem. Testei três formulações; esta foi a mais rápida
    (DME de overall 84 com 150 jogadores: 1,4s contra 17s e >60s das outras).
    """
    total = sum(p.rating * u[i] for i, p in enumerate(players))
    max_rating = max(p.rating for p in players)
    s = model.NewIntVar(0, squad_size * max_rating, "sum_ratings")
    model.Add(s == total)
    need = min_w_for_rating(target)

    choices = []
    for a in average_floor_range(target, max_rating, squad_size):
        y = model.NewBoolVar(f"avg_floor_{a}")
        choices.append(y)
        model.Add(s >= DIVISOR * a).OnlyEnforceIf(y)
        model.Add(s <= DIVISOR * a + DIVISOR - 1).OnlyEnforceIf(y)
        above = [i for i, p in enumerate(players) if p.rating >= a + 1]
        n_above = model.NewIntVar(0, squad_size, f"n_above_{a}")
        model.Add(n_above == sum(u[i] for i in above))
        r_above = sum(players[i].rating * u[i] for i in above)
        d = model.NewIntVar(0, DIVISOR - 1, f"d_{a}")
        model.Add(d == s - DIVISOR * a).OnlyEnforceIf(y)
        d_times_n = model.NewIntVar(0, (DIVISOR - 1) * squad_size, f"dn_{a}")
        model.AddMultiplicationEquality(d_times_n, [d, n_above])
        w = DIVISOR * s + DIVISOR * r_above - DIVISOR * a * n_above - d_times_n
        model.Add(w >= need).OnlyEnforceIf(y)
    if choices:
        model.AddExactlyOne(choices)
    else:
        model.Add(s < 0)  # alvo inalcançável até com os melhores: inviável


def _add_group_requirement(model: cp_model.CpModel, players: list[Player], u, req: Requirement) -> None:
    groups = defaultdict(list)
    for i, p in enumerate(players):
        groups[getattr(p, req.attribute)].append(i)

    if req.type == "same":
        if req.op == "max":
            for idx in groups.values():
                model.Add(sum(u[i] for i in idx) <= req.value)
        else:  # min: pelo menos um grupo com >= value jogadores
            flags = []
            for value, idx in groups.items():
                y = model.NewBoolVar(f"same_{req.attribute}_{value}")
                model.Add(sum(u[i] for i in idx) >= req.value).OnlyEnforceIf(y)
                flags.append(y)
            model.AddBoolOr(flags)
        return

    # distinct: y[g] = 1 se o grupo g tem alguém no time
    flags = []
    for value, idx in groups.items():
        y = model.NewBoolVar(f"has_{req.attribute}_{value}")
        members = sum(u[i] for i in idx)
        if req.op in ("min", "exact"):
            model.Add(y <= members)  # só conta o grupo se alguém dele entrou
        if req.op in ("max", "exact"):
            for i in idx:
                model.AddImplication(u[i], y)  # se alguém entrou, o grupo conta
        flags.append(y)
    _add_op(model, sum(flags), req.op, req.value)


def build_model(
    sbc: SBC,
    players: list[Player],
    skip: frozenset[int] = frozenset(),
    weights: CostWeights = CostWeights(),
) -> BuiltModel:
    """`skip` = índices de requisitos a ignorar (usado pelo diagnóstico)."""
    model = cp_model.CpModel()
    reqs = [r for k, r in enumerate(sbc.requirements) if k not in skip]
    u = [model.NewBoolVar(f"u_{i}") for i in range(len(players))]
    model.Add(sum(u) == sbc.squad_size)

    # Jogadores obrigatórios (já colocados no DME pelo usuário).
    for i, p in enumerate(players):
        if p.id in sbc.options.required_players:
            model.Add(u[i] == 1)

    # A mesma pessoa (definition_id) no máximo uma vez.
    by_def = defaultdict(list)
    for i, p in enumerate(players):
        by_def[p.definition_id].append(i)
    for idx in by_def.values():
        if len(idx) > 1:
            model.AddAtMostOne(u[i] for i in idx)

    built = BuiltModel(model, players, list(sbc.slots), u)
    if needs_chemistry(reqs):
        built.x = add_assignment(model, players, built.slots, u)
        built.chem = add_chemistry(model, players, built.slots, built.x)

    for req in reqs:
        if req.type == "min_team_rating":
            _add_team_rating(model, players, u, req.value, sbc.squad_size)
        elif req.type == "min_team_chemistry":
            model.Add(sum(built.chem) >= req.value)
        elif req.type == "min_player_chemistry":
            for i in range(len(players)):
                model.Add(built.chem[i] >= req.value * u[i])
        elif req.type == "count":
            expr = sum(u[i] for i, p in enumerate(players) if matches(p, req.filter))
            _add_op(model, expr, req.op, req.value)
        elif req.type in ("distinct", "same"):
            _add_group_requirement(model, players, u, req)

    model.Minimize(sum(objective_cost(p, weights) * u[i] for i, p in enumerate(players)))
    return built
