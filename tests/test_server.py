"""Servidor local: sobe numa porta livre e faz pedidos HTTP de verdade."""

import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from sbc_solver.server import make_server, merge_options

ROOT = Path(__file__).resolve().parent.parent
EXT_ORIGIN = "chrome-extension://abcdefghijklmnop"


@pytest.fixture(scope="module")
def base_url():
    server = make_server(0)  # porta livre
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def request(url, body=None, origin=EXT_ORIGIN, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"))
    req.add_header("Content-Type", "application/json")
    if origin:
        req.add_header("Origin", origin)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers), json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b"{}")


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8-sig"))


def test_health(base_url):
    status, headers, body = request(f"{base_url}/health")
    assert status == 200 and body["ok"] is True
    assert headers["Access-Control-Allow-Origin"] == EXT_ORIGIN


def test_solve_example(base_url):
    payload = {"club": load("data/club.json"), "sbc": load("data/sbcs/02_liga_nacao.json")}
    status, _, sol = request(f"{base_url}/solve", payload)
    assert status == 200
    assert sol["status"] == "OPTIMAL" and sol["valid"]
    assert len(sol["squad"]) == 11


def test_options_from_panel_are_applied(base_url):
    payload = {
        "club": load("data/club.json"),
        "sbc": load("data/sbcs/02_liga_nacao.json"),
        "options": {"max_rating": 81, "untradeable_value": 0.5},
    }
    status, _, sol = request(f"{base_url}/solve", payload)
    assert status == 200 and sol["valid"]
    assert max(p["rating"] for p in sol["squad"]) <= 81


def test_infeasible_returns_reason(base_url):
    payload = {"club": load("data/club.json"), "sbc": {"formation": ["ST"] * 11,
               "requirements": [{"type": "min_team_rating", "value": 95}]}}
    status, _, sol = request(f"{base_url}/solve", payload)
    assert status == 200
    assert sol["status"] == "INFEASIBLE" and "Overall máximo" in sol["reason"]


def test_bad_input_is_400(base_url):
    status, _, body = request(f"{base_url}/solve", {"club": {"players": []}, "sbc": {"formation": ["XX"]}})
    assert status == 400 and "inválida" in body["error"]


def test_websites_are_blocked(base_url):
    status, headers, _ = request(f"{base_url}/health", origin="https://site-malicioso.com")
    assert status == 403
    assert "Access-Control-Allow-Origin" not in headers
    status, _, _ = request(f"{base_url}/solve", {"club": {}, "sbc": {}}, origin="https://site-malicioso.com")
    assert status == 403


def test_local_tools_without_origin_are_allowed(base_url):
    status, _, _ = request(f"{base_url}/health", origin=None)
    assert status == 200


def test_cors_preflight(base_url):
    status, headers, _ = request(f"{base_url}/solve", method="OPTIONS")
    assert status == 204
    assert headers["Access-Control-Allow-Private-Network"] == "true"


def test_merge_options_priority():
    sbc = {"formation": ["ST"], "options": {"rating_range": {"min": 70}, "locked_players": ["a"]}}
    merged = merge_options(sbc, {"max_rating": 85, "locked_players": ["b"], "allow_special": True, "min_rating": None})
    assert merged["options"] == {"rating_range": {"min": 70, "max": 85}, "locked_players": ["a", "b"], "allow_special": True}
