"""Servidor local do solver, usado pela extensão do Chrome (Fase 3).

    python -m sbc_solver.server            (porta padrão 8127)

Endpoints:
    GET  /health  -> {"ok": true, "version": ...}
    POST /solve   -> corpo {"club": {...}, "sbc": {...}, "options": {...}}
                     resposta = mesmo formato do solution.json

Segurança:
- Escuta só em 127.0.0.1: nenhum outro computador consegue acessar.
- Só aceita pedidos da extensão (Origin chrome-extension://...) ou sem Origin
  (ferramentas locais, como curl). Pedidos de sites comuns recebem 403, então
  uma página qualquer aberta no navegador não consegue usar o solver.
- Resolve um DME por vez, para não travar o PC.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from . import __version__
from .io import InputError, parse_players, parse_sbc
from .solver import solve

DEFAULT_PORT = 8127
MAX_BODY = 32 * 1024 * 1024  # 32 MB: sobra para clubes com milhares de jogadores

# Opções que a extensão pode mandar -> chaves do "options" do sbc.json.
OPTION_KEYS = ("allow_special", "allow_tradeable", "allow_market", "untradeable_value", "time_limit_s")

_solve_lock = threading.Lock()


def merge_options(sbc: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    """Opções do painel têm prioridade sobre as do sbc.json."""
    merged = dict(sbc.get("options", {}))
    for key in OPTION_KEYS:
        if options.get(key) is not None:
            merged[key] = options[key]
    rr = dict(merged.get("rating_range", {}))
    if options.get("min_rating") is not None:
        rr["min"] = int(options["min_rating"])
    if options.get("max_rating") is not None:
        rr["max"] = int(options["max_rating"])
    if rr:
        merged["rating_range"] = rr
    locked = list(merged.get("locked_players", [])) + [str(x) for x in options.get("locked_players", [])]
    if locked:
        merged["locked_players"] = locked
    required = [str(x) for x in options.get("required_players", [])]
    if required:
        merged["required_players"] = required
    return {**sbc, "options": merged}


def handle_solve(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict) or "club" not in payload or "sbc" not in payload:
        raise InputError("o pedido precisa de 'club' e 'sbc'")
    club = parse_players(payload["club"], "club", "clube")
    market = parse_players(payload["market"], "market", "mercado") if payload.get("market") else []
    sbc = parse_sbc(merge_options(payload["sbc"], payload.get("options") or {}))
    with _solve_lock:
        return solve(club, sbc, market)


def origin_allowed(origin: str | None) -> bool:
    return origin is None or origin.startswith("chrome-extension://")


class Handler(BaseHTTPRequestHandler):
    server_version = f"FIFEIROS-solver/{__version__}"

    def _send(self, status: int, body: dict[str, Any]) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        origin = self.headers.get("Origin")
        if origin and origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def _check_origin(self) -> bool:
        if origin_allowed(self.headers.get("Origin")):
            return True
        self._send(403, {"error": "origem não permitida"})
        return False

    def do_OPTIONS(self) -> None:  # pré-verificação CORS
        if not self._check_origin():
            return
        self.send_response(204)
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._check_origin():
            return
        if self.path == "/health":
            self._send(200, {"ok": True, "version": __version__, "busy": _solve_lock.locked()})
        else:
            self._send(404, {"error": "não encontrado"})

    def do_POST(self) -> None:
        if not self._check_origin():
            return
        if self.path != "/solve":
            self._send(404, {"error": "não encontrado"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._send(413 if length > MAX_BODY else 400, {"error": "corpo vazio ou grande demais"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            solution = handle_solve(payload)
        except (InputError, json.JSONDecodeError, UnicodeDecodeError) as e:
            self._send(400, {"error": f"entrada inválida: {e}"})
            return
        except Exception as e:  # noqa: BLE001 - devolve o erro para o painel mostrar
            self._send(500, {"error": f"erro interno do solver: {e}"})
            return
        self.log_message('DME "%s": %s em %ss', solution.get("sbc"), solution.get("status"), solution.get("solve_time_s"))
        self._send(200, solution)

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        if self.path == "/health" and str(code) == "200":
            return  # o popup checa o status toda vez que abre; não polui a janela
        super().log_request(code, size)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(f"[solver] {fmt % args}\n")
        sys.stderr.flush()


def make_server(port: int = DEFAULT_PORT) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    ap = argparse.ArgumentParser(prog="sbc_solver.server", description="Servidor local do solver para a extensão.")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = ap.parse_args(argv)
    try:
        server = make_server(args.port)
    except OSError as e:
        print(f"Não consegui abrir a porta {args.port}: {e}. O solver já está aberto em outra janela?", file=sys.stderr)
        return 1
    print(f"Solver FIFEIROS rodando em http://127.0.0.1:{args.port}  (feche esta janela para parar)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
