"""Ponta a ponta Fase 2: dados crus da EA -> exportação da extensão -> solver.

Precisa do Node.js; se não houver, o teste é pulado.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from sbc_solver.__main__ import main

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="Node.js não instalado")
def test_extension_export_feeds_the_solver(tmp_path, monkeypatch):
    run = subprocess.run(
        [NODE, str(ROOT / "extension" / "tools" / "export-fixture.mjs"), str(tmp_path)],
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    report = json.loads(run.stdout)
    assert report["warnings"] == []
    assert report["skipped"] == {}

    club = json.loads((tmp_path / "club.json").read_text(encoding="utf-8"))
    original = json.loads((ROOT / "data" / "club.json").read_text(encoding="utf-8"))
    assert len(club["players"]) == len(original["players"])
    assert sum(p["is_duplicate"] for p in club["players"]) == sum(p["is_duplicate"] for p in original["players"])

    monkeypatch.chdir(tmp_path)  # sem data/market.json aqui
    out = tmp_path / "solution.json"
    code = main(["--club", str(tmp_path / "club.json"), "--sbc", str(tmp_path / "sbc.json"), "--out", str(out), "--quiet"])
    sol = json.loads(out.read_text(encoding="utf-8"))
    assert code == 0, sol["reason"]
    assert sol["valid"]
    assert sol["status"] == "OPTIMAL"
    assert sol["team_chemistry"] >= 15
    assert sol["warnings"] == []


@pytest.mark.skipif(NODE is None, reason="Node.js não instalado")
def test_extension_background_request_against_real_server(tmp_path):
    """Fase 3: o mesmo POST /solve que o background faz, contra o servidor Python real."""
    import threading

    from sbc_solver.server import make_server

    server = make_server(0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}"
        run = subprocess.run(
            [NODE, str(ROOT / "extension" / "tools" / "export-fixture.mjs"), str(tmp_path), "--solve", url],
            capture_output=True, text=True, encoding="utf-8", check=True,
        )
    finally:
        server.shutdown()
        server.server_close()
    assert json.loads(run.stdout)["solveStatus"] == 200
    sol = json.loads((tmp_path / "solution.json").read_text(encoding="utf-8"))
    assert sol["status"] == "OPTIMAL" and sol["valid"]
    assert max(p["rating"] for p in sol["squad"]) <= 84  # opção do painel aplicada
