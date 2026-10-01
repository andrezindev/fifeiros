import itertools
import random

import pytest

from sbc_solver.rating import (
    average_floor_range,
    max_possible_rating,
    min_w_for_rating,
    rating_w,
    team_rating,
)


def float_formula(ratings):
    """Implementação "ingênua" da fórmula, igual às calculadoras da comunidade."""
    s = sum(ratings)
    avg = s / 11
    excess = sum(r - avg for r in ratings if r > avg)
    total = int(s + excess + 0.5)  # Math.round (.5 sobe)
    return total // 11


@pytest.mark.parametrize(
    "ratings, expected",
    [
        ([84] * 11, 84),
        ([83] * 10 + [90], 84),   # 920 + 6.36 = 926.36 -> 926 -> 84.18 -> 84
        ([82] * 10 + [86], 82),   # 906 + 3.64 = 909.64 -> 910 -> 82.7 -> 82
        ([83] * 9 + [84, 84], 83),
        ([85] * 5 + [82] * 6, 84),  # 917 + 5*1.636 = 925.18 -> 925 -> 84.09
        ([75] * 11, 75),
        ([99] * 11, 99),
    ],
)
def test_known_examples(ratings, expected):
    assert team_rating(ratings) == expected
    assert float_formula(ratings) == expected


def test_matches_float_formula_on_random_squads():
    rng = random.Random(27)
    for _ in range(20000):
        ratings = [rng.randint(45, 99) for _ in range(11)]
        assert team_rating(ratings) == float_formula(ratings)


def test_total_never_ends_in_half():
    # TOTAL = W/11, e um inteiro dividido por 11 nunca termina em .5:
    # a regra de desempate do round() (half-up vs. banker's) não faz diferença.
    for combo in itertools.combinations_with_replacement(range(80, 88), 11):
        assert (2 * rating_w(combo)) % 22 != 11


def test_threshold_equivalence():
    """W >= 121*T - 5 é exatamente equivalente a overall >= T."""
    rng = random.Random(1)
    for _ in range(20000):
        ratings = [rng.randint(60, 95) for _ in range(11)]
        w = rating_w(ratings)
        for t in range(70, 92):
            assert (w >= min_w_for_rating(t)) == (team_rating(ratings) >= t)


def test_average_floor_range_contains_every_valid_squad():
    rng = random.Random(5)
    for _ in range(1500):
        n = rng.choice([11, 11, 11, 7, 5])
        ratings = [rng.randint(45, 99) for _ in range(n)]
        t = team_rating(ratings)
        for target in (t, t - 3):
            if target > 0:
                assert sum(ratings) // 11 in average_floor_range(target, max(ratings), n)


def test_average_floor_range_extreme_case():
    # Time "desequilibrado": poucos 99 puxam o overall muito acima da média.
    ratings = [99] * 4 + [45] * 7
    t = team_rating(ratings)
    assert sum(ratings) // 11 in average_floor_range(t, 99, 11)
    assert sum(ratings) // 11 < t - 5  # a média fica bem abaixo do overall


def test_fewer_than_11_players_uses_divisor_11():
    assert team_rating([80] * 5) == float_formula([80] * 5)
    assert team_rating([]) == 0


def test_max_possible_rating_takes_the_best():
    ratings = [70, 90, 85, 60, 88, 84, 83, 83, 82, 81, 80, 79, 78]
    best = sorted(ratings, reverse=True)[:11]
    assert max_possible_rating(ratings, 11) == team_rating(best)
