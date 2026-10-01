"""Leitura e validação dos JSON de entrada (clube, mercado, DME) e escrita da saída."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .filters import validate_filter
from .models import (
    GROUP_ATTRIBUTES,
    OPS,
    RARITIES,
    REQUIREMENT_TYPES,
    SBC,
    Options,
    Player,
    Requirement,
)

# Posições do FC 25 em diante (sem alas CF/RWB/LWB).
POSITIONS = ("GK", "RB", "LB", "CB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST")

RARITY_ALIASES = {"comum": "common", "raro": "rare", "especial": "special"}


class InputError(ValueError):
    """Erro de formato nos arquivos de entrada, com mensagem amigável."""


def _read_json(path: str | Path) -> Any:
    try:
        # utf-8-sig aceita arquivos com ou sem BOM (PowerShell 5 e o Bloco de Notas gravam com BOM).
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except FileNotFoundError as e:
        raise InputError(f"Arquivo não encontrado: {path}") from e
    except json.JSONDecodeError as e:
        raise InputError(f"JSON inválido em {path}: {e}") from e


def write_json(path: str | Path, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _check_position(pos: str, where: str) -> str:
    if pos not in POSITIONS:
        raise InputError(f"{where}: posição '{pos}' inválida. Válidas: {', '.join(POSITIONS)}")
    return pos


def parse_player(d: dict[str, Any], source: str = "club") -> Player:
    where = f"Jogador {d.get('id', '?')}"
    for key in ("id", "name", "position", "league", "nation", "club"):
        if key not in d:
            raise InputError(f"{where}: campo obrigatório '{key}' ausente")
    rating = d.get("overall", d.get("rating"))
    if not isinstance(rating, int):
        raise InputError(f"{where}: 'overall' precisa ser um inteiro")

    rarity = RARITY_ALIASES.get(d.get("rarity", "common"), d.get("rarity", "common"))
    if rarity not in RARITIES:
        raise InputError(f"{where}: raridade '{rarity}' inválida. Válidas: {RARITIES}")

    # Aceita "tradeable" e/ou "untradeable"; se vierem os dois, precisam concordar.
    if "tradeable" in d:
        tradeable = bool(d["tradeable"])
        if "untradeable" in d and bool(d["untradeable"]) == tradeable:
            raise InputError(f"{where}: 'tradeable' e 'untradeable' se contradizem")
    else:
        tradeable = not bool(d.get("untradeable", source == "club"))
    if source == "market":
        tradeable = True

    return Player(
        id=str(d["id"]),
        name=d["name"],
        rating=rating,
        position=_check_position(d["position"], where),
        alt_positions=tuple(_check_position(p, where) for p in d.get("alt_positions", [])),
        league=d["league"],
        nation=d["nation"],
        club=d["club"],
        rarity=rarity,
        tradeable=tradeable,
        is_duplicate=bool(d.get("is_duplicate", False)),
        market_price=int(d.get("market_price", 0)),
        definition_id=str(d.get("definition_id", "")),
        source=source,
        is_icon=bool(d.get("is_icon", False)),
        is_hero=bool(d.get("is_hero", False)),
        unassigned=bool(d.get("unassigned", False)),
    )


def parse_players(data: Any, source: str = "club", where: str = "clube") -> list[Player]:
    """Aceita {"players": [...]} ou a lista direto."""
    items = data.get("players") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise InputError(f"{where}: esperava uma lista de jogadores em 'players'")
    players = [parse_player(d, source) for d in items]
    ids = [p.id for p in players]
    if len(ids) != len(set(ids)):
        dup = sorted({i for i in ids if ids.count(i) > 1})
        raise InputError(f"{where}: ids repetidos: {dup}")
    return players


def load_players(path: str | Path, source: str = "club") -> list[Player]:
    return parse_players(_read_json(path), source, str(path))


def parse_requirement(d: dict[str, Any]) -> Requirement:
    rtype = d.get("type")
    if rtype not in REQUIREMENT_TYPES:
        raise InputError(f"Tipo de requisito '{rtype}' inválido. Válidos: {REQUIREMENT_TYPES}")
    if not isinstance(d.get("value"), int):
        raise InputError(f"Requisito {rtype}: 'value' precisa ser um inteiro")
    op = d.get("op", "min")
    if op not in OPS:
        raise InputError(f"Requisito {rtype}: op '{op}' inválido. Válidos: {OPS}")
    req = Requirement(type=rtype, value=d["value"], op=op,
                      filter=d.get("filter", {}), attribute=d.get("attribute"))
    if rtype == "count":
        try:
            validate_filter(req.filter)
        except ValueError as e:
            raise InputError(str(e)) from e
    if rtype in ("distinct", "same") and req.attribute not in GROUP_ATTRIBUTES:
        raise InputError(f"Requisito {rtype}: 'attribute' precisa ser um de {GROUP_ATTRIBUTES}")
    if rtype == "same" and op == "exact":
        raise InputError("Requisito same: use op 'min' ou 'max'")
    return req


def parse_options(d: dict[str, Any]) -> Options:
    rr = d.get("rating_range", {})
    if rr.get("min") is not None and rr.get("max") is not None and rr["min"] > rr["max"]:
        raise InputError(f"rating_range inválido: min ({rr['min']}) maior que max ({rr['max']})")
    uv = float(d.get("untradeable_value", 0.3))
    if not 0 <= uv <= 1:
        raise InputError(f"untradeable_value precisa estar entre 0 e 1 (veio {uv})")
    return Options(
        untradeable_value=uv,
        required_players=frozenset(str(x) for x in d.get("required_players", [])),
        locked_players=frozenset(str(x) for x in d.get("locked_players", [])),
        rating_min=rr.get("min"),
        rating_max=rr.get("max"),
        allow_special=bool(d.get("allow_special", False)),
        allow_tradeable=bool(d.get("allow_tradeable", True)),
        allow_market=bool(d.get("allow_market", False)),
        time_limit_s=float(d.get("time_limit_s", 10.0)),
    )


def parse_sbc(d: dict[str, Any]) -> SBC:
    if "slots" in d:
        slots = [s["position"] if isinstance(s, dict) else s for s in d["slots"]]
    elif "formation" in d:
        slots = list(d["formation"])
    else:
        raise InputError("DME precisa de 'formation' (lista de posições) ou 'slots'")
    if not 1 <= len(slots) <= 11:
        raise InputError(f"DME precisa de 1 a 11 slots (tem {len(slots)})")
    slots = [_check_position(p, "Formação") for p in slots]
    if "squad_size" in d and d["squad_size"] != len(slots):
        raise InputError(f"squad_size={d['squad_size']} não bate com {len(slots)} slots na formação")
    return SBC(
        name=d.get("name", "DME sem nome"),
        slots=slots,
        requirements=[parse_requirement(r) for r in d.get("requirements", [])],
        options=parse_options(d.get("options", {})),
        warnings=[str(w) for w in d.get("warnings", [])],
    )


def load_sbc(path: str | Path) -> SBC:
    return parse_sbc(_read_json(path))
