import random

import pytest
from conftest import P, R, brute_force_best_cost, make_sbc, solution_cost

from sbc_solver.solver import solve

F442 = ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"]


def assert_valid(sol):
    assert sol["valid"], sol
    assert all(r["ok"] for r in sol["requirements"])


# ---------- prioridade de custo ----------

def test_cost_priority_order():
    dup = P(70, is_duplicate=True)
    untr = P(70)
    trad = P(70, tradeable=True, market_price=300)
    mkt = P(70, source="market", tradeable=True, market_price=300)
    sbc = make_sbc(["CM"], allow_market=True)
    order = []
    pool = [dup, untr, trad, mkt]
    while pool:
        sol = solve([p for p in pool if p.source == "club"], sbc, [p for p in pool if p.source == "market"])
        chosen = sol["squad"][0]["player_id"]
        order.append(chosen)
        pool = [p for p in pool if p.id != chosen]
    assert order == [dup.id, untr.id, trad.id, mkt.id]


def test_prefers_burning_lower_rated_untradeables():
    low, high = P(75), P(85)
    sol = solve([low, high], make_sbc(["CM"]))
    assert sol["squad"][0]["player_id"] == low.id


def test_cheapest_tradeable_wins():
    a = P(80, tradeable=True, market_price=900)
    b = P(80, tradeable=True, market_price=600)
    sol = solve([a, b], make_sbc(["CM"]))
    assert sol["squad"][0]["player_id"] == b.id
    assert sol["total_cost"] == 600


# ---------- overall ----------

def test_min_team_rating_optimal_vs_brute_force():
    rng = random.Random(7)
    for _ in range(4):
        club = [P(rng.randint(76, 88), tradeable=rng.random() < 0.5, market_price=rng.randint(3, 40) * 100,
                  is_duplicate=rng.random() < 0.2) for _ in range(14)]
        sbc = make_sbc(F442, [R("min_team_rating", 83)])
        best = brute_force_best_cost(sbc, club)
        sol = solve(club, sbc, diagnose_on_failure=False)
        if best is None:
            assert sol["status"] == "INFEASIBLE"
        else:
            assert_valid(sol)
            assert sol["team_rating"] >= 83
            assert solution_cost(sol, club) == best


# ---------- contagens / grupos ----------

@pytest.mark.parametrize("op,value", [("min", 3), ("max", 1), ("exact", 2)])
def test_count_league(op, value):
    club = [P(80, league="PL" if i % 3 == 0 else "LL", tradeable=i % 2 == 0, market_price=500 + 50 * i)
            for i in range(12)]
    sbc = make_sbc(["CM"] * 6, [R("count", value, op, {"league": "PL"})])
    sol = solve(club, sbc)
    assert_valid(sol)
    assert solution_cost(sol, club) == brute_force_best_cost(sbc, club)


def test_count_rare_gold_and_min_rating():
    club = ([P(80, rarity="rare", tradeable=True, market_price=2000) for _ in range(3)]
            + [P(70) for _ in range(5)]
            + [P(86, tradeable=True, market_price=9000), P(84)])
    sbc = make_sbc(["CM"] * 5, [
        R("count", 2, filter={"rare": True}),
        R("count", 3, filter={"quality": "gold"}),
        R("count", 1, filter={"min_rating": 84}),
    ])
    sol = solve(club, sbc)
    assert_valid(sol)
    assert solution_cost(sol, club) == brute_force_best_cost(sbc, club)


@pytest.mark.parametrize("op,value", [("min", 4), ("max", 2), ("exact", 3)])
def test_distinct_nations(op, value):
    rng = random.Random(value)
    club = [P(rng.randint(70, 85), nation=f"N{rng.randint(1, 5)}", tradeable=rng.random() < 0.5,
              market_price=rng.randint(2, 30) * 100) for _ in range(11)]
    sbc = make_sbc(["CM"] * 6, [R("distinct", value, op, attribute="nation")])
    sol = solve(club, sbc, diagnose_on_failure=False)
    best = brute_force_best_cost(sbc, club)
    if best is None:
        assert sol["status"] == "INFEASIBLE"
    else:
        assert_valid(sol)
        assert solution_cost(sol, club) == best


@pytest.mark.parametrize("op,value", [("max", 2), ("min", 3)])
def test_same_club(op, value):
    rng = random.Random(10 + value)
    club = [P(rng.randint(70, 85), club=f"C{rng.randint(1, 3)}", tradeable=rng.random() < 0.5,
              market_price=rng.randint(2, 30) * 100) for _ in range(11)]
    sbc = make_sbc(["CM"] * 5, [R("same", value, op, attribute="club")])
    sol = solve(club, sbc, diagnose_on_failure=False)
    assert_valid(sol)
    assert solution_cost(sol, club) == brute_force_best_cost(sbc, club)


def test_same_person_only_once():
    base = P(85, definition_id="messi")
    totw = P(88, definition_id="messi", rarity="special")
    others = [P(70) for _ in range(2)]
    sbc = make_sbc(["CM"] * 3, [R("count", 2, filter={"min_rating": 85})], allow_special=True)
    sol = solve([base, totw, *others], sbc)
    assert sol["status"] == "INFEASIBLE"


def test_squad_smaller_than_11():
    club = [P(60 + i) for i in range(10)]
    sol = solve(club, make_sbc(["ST", "CM", "CB"]))
    assert_valid(sol)
    assert len(sol["squad"]) == 3


# ---------- química ----------

def test_min_player_chemistry_forces_positions_and_links():
    # Dois do clube X em posição dão 1 de química para cada.
    gk = P(70, position="GK", club="X", nation="A")
    st = P(70, position="ST", club="X", nation="B")
    loner = P(60, position="ST", club="Y", nation="C")  # mais barato, mas sem química
    gk2 = P(60, position="GK", club="Z", nation="D")
    sbc = make_sbc(["GK", "ST"], [R("min_player_chemistry", 1)])
    sol = solve([gk, st, loner, gk2], sbc)
    assert_valid(sol)
    assert {s["player_id"] for s in sol["squad"]} == {gk.id, st.id}


def test_team_chemistry_optimal_vs_brute_force():
    rng = random.Random(3)
    positions = ["GK", "CB", "CM", "ST"]
    club = [P(rng.randint(70, 84), position=rng.choice(positions), league=f"L{rng.randint(1, 2)}",
              nation=f"N{rng.randint(1, 3)}", club=f"C{rng.randint(1, 3)}",
              tradeable=rng.random() < 0.5, market_price=rng.randint(2, 20) * 100) for _ in range(8)]
    sbc = make_sbc(["GK", "CB", "CM", "ST"], [R("min_team_chemistry", 4)])
    sol = solve(club, sbc, diagnose_on_failure=False)
    best = brute_force_best_cost(sbc, club, use_slots=True)
    if best is None:
        assert sol["status"] == "INFEASIBLE"
    else:
        assert_valid(sol)
        assert sol["team_chemistry"] >= 4
        assert solution_cost(sol, club) == best


# ---------- opções ----------

def test_locked_players_are_never_used():
    cheap, other = P(70), P(80, tradeable=True, market_price=500)
    sol = solve([cheap, other], make_sbc(["CM"], locked_players=frozenset({cheap.id})))
    assert sol["squad"][0]["player_id"] == other.id


def test_rating_range():
    club = [P(70), P(80, tradeable=True, market_price=500), P(90)]
    sol = solve(club, make_sbc(["CM"], rating_min=75, rating_max=85))
    assert sol["squad"][0]["rating"] == 80


def test_special_excluded_by_default():
    special, normal = P(70, rarity="special", is_duplicate=True), P(80, tradeable=True, market_price=700)
    assert solve([special, normal], make_sbc(["CM"]))["squad"][0]["player_id"] == normal.id
    sol = solve([special, normal], make_sbc(["CM"], allow_special=True))
    assert sol["squad"][0]["player_id"] == special.id


def test_allow_tradeable_false():
    t = P(70, tradeable=True, market_price=200)
    sol = solve([t], make_sbc(["CM"], allow_tradeable=False))
    assert sol["status"] == "INFEASIBLE"


def test_market_only_when_allowed_and_reported():
    club = [P(70)]
    market = [P(85, source="market", tradeable=True, market_price=5000)]
    sbc = make_sbc(["CM"], [R("count", 1, filter={"min_rating": 85})])
    sol = solve(club, sbc, market)
    assert sol["status"] == "INFEASIBLE"
    assert any("mercado" in d for d in sol["diagnostics"])

    sol = solve(club, make_sbc(["CM"], [R("count", 1, filter={"min_rating": 85})], allow_market=True), market)
    assert_valid(sol)
    assert sol["purchase_cost"] == 5000
    assert sol["to_buy"][0]["price"] == 5000


# ---------- diagnóstico ----------

def test_diagnostic_missing_league_players():
    club = [P(80, league="LL") for _ in range(11)] + [P(80, league="PL")]
    sol = solve(club, make_sbc(F442, [R("count", 3, filter={"league": "PL"})]))
    assert sol["status"] == "INFEASIBLE"
    assert "só 1" in sol["reason"] and "3" in sol["reason"]


def test_diagnostic_rating_too_high():
    club = [P(80) for _ in range(11)]
    sol = solve(club, make_sbc(F442, [R("min_team_rating", 85)]))
    assert "Overall máximo possível" in sol["reason"] and "80" in sol["reason"]


def test_diagnostic_relaxation_finds_culprit():
    # Cada requisito sozinho é possível; juntos, não. Só o relaxamento descobre.
    club = [P(80, league="PL", nation="BR") for _ in range(3)] + [P(80, league="LL", nation="FR") for _ in range(3)]
    sbc = make_sbc(["CM"] * 3, [
        R("count", 2, filter={"league": "PL"}),
        R("count", 2, filter={"nation": "FR"}),
    ])
    sol = solve(club, sbc)
    assert sol["status"] == "INFEASIBLE"
    assert "Removendo qualquer um" in sol["reason"]


def test_not_enough_players():
    sol = solve([P(80)], make_sbc(["CM", "ST"]))
    assert "Só 1" in sol["reason"]


# ---------- jogadores obrigatórios ("Substituir atletas" desligado) ----------

def test_required_players_are_kept_even_if_expensive():
    cheap = [P(80) for _ in range(3)]
    placed = P(85, tradeable=True, market_price=9000)  # caro, mas o usuário colocou
    sol = solve([*cheap, placed], make_sbc(["CM"] * 3, required_players=frozenset({placed.id})))
    assert placed.id in {s["player_id"] for s in sol["squad"]}


def test_required_players_ignore_filters():
    placed = P(90)  # acima do overall máximo, mas colocado pelo usuário
    others = [P(75) for _ in range(2)]
    sbc = make_sbc(["CM"] * 2, rating_max=80, required_players=frozenset({placed.id}))
    sol = solve([placed, *others], sbc)
    assert placed.id in {s["player_id"] for s in sol["squad"]}


def test_required_players_blocking_gives_clear_reason():
    placed = P(70, league="LL")
    others = [P(80, league="PL") for _ in range(3)]
    sbc = make_sbc(["CM"] * 2, [R("count", 2, filter={"league": "PL"})], required_players=frozenset({placed.id}))
    sol = solve([placed, *others], sbc)
    assert sol["status"] == "INFEASIBLE"
    assert "Substituir atletas" in sol["reason"]


def test_required_player_missing_from_club():
    sol = solve([P(80), P(80)], make_sbc(["CM"], required_players=frozenset({"sumiu"})))
    assert "não estão mais no clube" in sol["reason"]


# ---------- valor dos intransferíveis (opção A) ----------

def test_valuable_untradeable_is_protected_by_default():
    star = P(89, market_price=35_000)                       # intransferível valioso
    fodder = P(84, tradeable=True, market_price=2_800)      # negociável barato
    sol = solve([star, fodder], make_sbc(["CM"]))
    assert sol["squad"][0]["player_id"] == fodder.id


def test_untradeable_value_zero_restores_strict_priority():
    star = P(89, market_price=35_000)
    fodder = P(84, tradeable=True, market_price=2_800)
    sol = solve([star, fodder], make_sbc(["CM"], untradeable_value=0.0))
    assert sol["squad"][0]["player_id"] == star.id


def test_cheap_untradeable_still_used_before_similar_tradeable():
    untr = P(83, market_price=1_400)
    trad = P(83, tradeable=True, market_price=1_400)
    sol = solve([untr, trad], make_sbc(["CM"]))
    assert sol["squad"][0]["player_id"] == untr.id


def test_duplicates_are_always_cheap_even_if_valuable():
    dup = P(89, is_duplicate=True, market_price=35_000)
    trad = P(75, tradeable=True, market_price=350)
    sol = solve([dup, trad], make_sbc(["CM"]))
    assert sol["squad"][0]["player_id"] == dup.id
