from conftest import P

from sbc_solver.chemistry import compute_chemistry


def test_two_from_same_club_get_one_point():
    a = P(position="ST", club="X", league="A", nation="A")
    b = P(position="ST", club="X", league="B", nation="B")
    per, total = compute_chemistry(["ST", "ST"], [a, b])
    assert per == [1, 1] and total == 2


def test_league_needs_three():
    players = [P(position="CM", league="PL", nation=f"N{i}", club=f"C{i}") for i in range(3)]
    assert compute_chemistry(["CM"] * 2, players[:2])[1] == 0
    assert compute_chemistry(["CM"] * 3, players)[0] == [1, 1, 1]


def test_thresholds_and_cap_of_three():
    # 8 da mesma liga, nação e clube: 3+3+3 pontos, mas o teto é 3.
    players = [P(position="CM", league="L", nation="N", club="C") for _ in range(8)]
    per, total = compute_chemistry(["CM"] * 8, players)
    assert per == [3] * 8 and total == 24


def test_nation_levels():
    players = [P(position="CM", league=f"L{i}", nation="BR", club=f"C{i}") for i in range(5)]
    assert compute_chemistry(["CM"] * 5, players)[0] == [2] * 5  # 5 da nação -> 2 pontos


def test_out_of_position_gets_zero_and_does_not_help():
    a = P(position="ST", club="X", league="A", nation="A")
    b = P(position="GK", club="X", league="B", nation="B")
    per, _ = compute_chemistry(["ST", "ST"], [a, b])
    assert per == [0, 0]  # b fora de posição: 0, e a fica sozinho no clube


def test_alternative_position_counts():
    a = P(position="CM", alt_positions=("CDM",), club="X", nation="A")
    b = P(position="CM", club="X", nation="B")
    assert compute_chemistry(["CDM", "CM"], [a, b])[0] == [1, 1]


def test_icon_has_max_chem_and_counts_double_for_nation():
    icon = P(position="ST", nation="BR", league="Icons", club="ICON", is_icon=True)
    br = P(position="CM", nation="BR", league="X", club="Y")
    per, _ = compute_chemistry(["ST", "CM"], [icon, br])
    assert per == [3, 1]  # ícone conta 2 -> nação BR tem 3 -> nível 1

    icon_out = compute_chemistry(["GK", "CM"], [icon, br])[0]
    assert icon_out == [0, 0]  # ícone fora de posição: 0


def test_hero_counts_double_for_league():
    hero = P(position="ST", league="PL", nation="A", club="A", is_hero=True)
    pl = P(position="CM", league="PL", nation="B", club="B")
    assert compute_chemistry(["ST", "CM"], [hero, pl])[0] == [3, 1]
