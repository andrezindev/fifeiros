import itertools

from sbc_solver.cost import objective_cost
from sbc_solver.models import SBC, Options, Player, Requirement
from sbc_solver.validate import is_valid

_counter = itertools.count()


def P(rating=80, position="CM", league="L1", nation="N1", club="C1", **kw) -> Player:
    """Cria um jogador de teste com valores padrão (intransferível, comum)."""
    i = next(_counter)
    kw.setdefault("id", f"p{i}")
    kw.setdefault("name", f"Jogador {i}")
    return Player(rating=rating, position=position, league=league, nation=nation, club=club, **kw)


def R(type, value, op="min", filter=None, attribute=None) -> Requirement:
    return Requirement(type=type, value=value, op=op, filter=filter or {}, attribute=attribute)


def make_sbc(slots, requirements=(), **opts) -> SBC:
    return SBC(name="teste", slots=list(slots), requirements=list(requirements), options=Options(**opts))


def brute_force_best_cost(sbc: SBC, players: list[Player], use_slots: bool = False):
    """Custo mínimo testando TODAS as combinações (e permutações, se houver química)."""
    best = None
    for combo in itertools.combinations(players, sbc.squad_size):
        orders = itertools.permutations(combo) if use_slots else [combo]
        if any(is_valid(sbc, list(order)) for order in orders):
            cost = sum(objective_cost(p) for p in combo)
            best = cost if best is None else min(best, cost)
    return best


def solution_cost(solution, players) -> int:
    by_id = {p.id: p for p in players}
    return sum(objective_cost(by_id[s["player_id"]]) for s in solution["squad"])
