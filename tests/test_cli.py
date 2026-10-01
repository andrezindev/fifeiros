"""Ponta a ponta: CLI + dados de exemplo + contratos JSON (schemas/)."""

import json
from pathlib import Path

import jsonschema
import pytest
from referencing import Registry, Resource

from sbc_solver.__main__ import main

ROOT = Path(__file__).resolve().parent.parent
SBCS = sorted((ROOT / "data" / "sbcs").glob("*.json"))


def _schemas():
    loaded = {p.name: json.loads(p.read_text(encoding="utf-8-sig")) for p in (ROOT / "schemas").glob("*.json")}
    registry = Registry().with_resources((name, Resource.from_contents(s)) for name, s in loaded.items())
    return loaded, registry


SCHEMAS, REGISTRY = _schemas()


def validate(data, schema_name):
    jsonschema.Draft202012Validator(SCHEMAS[schema_name], registry=REGISTRY).validate(data)


@pytest.mark.parametrize("path", ["club.json", "market.json"])
def test_example_players_match_schema(path):
    validate(json.loads((ROOT / "data" / path).read_text(encoding="utf-8-sig")), "club.schema.json")


def test_example_club_size():
    players = json.loads((ROOT / "data" / "club.json").read_text(encoding="utf-8-sig"))["players"]
    assert 140 <= len(players) <= 170


@pytest.mark.parametrize("sbc", SBCS, ids=lambda p: p.stem)
def test_example_sbcs_solve_and_match_schemas(sbc, tmp_path, monkeypatch):
    validate(json.loads(sbc.read_text(encoding="utf-8-sig")), "sbc.schema.json")
    monkeypatch.chdir(ROOT)
    out = tmp_path / "solution.json"
    code = main(["--club", "data/club.json", "--sbc", str(sbc), "--out", str(out), "--quiet"])
    sol = json.loads(out.read_text(encoding="utf-8-sig"))
    validate(sol, "solution.schema.json")
    assert code == 0, sol["reason"]
    assert sol["status"] == "OPTIMAL"
    assert sol["valid"]


def test_cli_infeasible_exit_code_and_reason(tmp_path, monkeypatch):
    monkeypatch.chdir(ROOT)
    sbc = tmp_path / "impossible.json"
    sbc.write_text(json.dumps({"formation": ["ST"] * 11, "requirements": [{"type": "min_team_rating", "value": 95}]}))
    out = tmp_path / "s.json"
    code = main(["--club", "data/club.json", "--sbc", str(sbc), "--out", str(out), "--quiet"])
    sol = json.loads(out.read_text(encoding="utf-8-sig"))
    validate(sol, "solution.schema.json")
    assert code == 1
    assert "Overall máximo possível" in sol["reason"]


def test_cli_bad_input(tmp_path, capsys):
    bad = tmp_path / "bad.json"
    bad.write_text('{"formation": ["XX"]}')
    assert main(["--club", str(ROOT / "data" / "club.json"), "--sbc", str(bad)]) == 2
    assert "posição 'XX' inválida" in capsys.readouterr().err


def test_cli_max_rating_flag(tmp_path, monkeypatch):
    monkeypatch.chdir(ROOT)
    out = tmp_path / "s.json"
    code = main(["--club", "data/club.json", "--sbc", "data/sbcs/02_liga_nacao.json",
                 "--max-rating", "82", "--out", str(out), "--quiet"])
    sol = json.loads(out.read_text(encoding="utf-8-sig"))
    assert code == 0
    assert max(s["rating"] for s in sol["squad"]) <= 82


def test_cli_rejects_inverted_rating_range(tmp_path, capsys):
    code = main(["--club", str(ROOT / "data" / "club.json"), "--sbc", str(SBCS[0]),
                 "--min-rating", "85", "--max-rating", "80", "--out", str(tmp_path / "s.json")])
    assert code == 2
    assert "maior que o máximo" in capsys.readouterr().err


def test_cli_rejects_bad_untradeable_value(tmp_path, capsys):
    code = main(["--club", str(ROOT / "data" / "club.json"), "--sbc", str(SBCS[0]),
                 "--untradeable-value", "2", "--out", str(tmp_path / "s.json")])
    assert code == 2
