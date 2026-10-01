"""Filtros usados pelos requisitos do tipo "count".

Exemplo: {"league": "Premier League", "min_rating": 80} = jogadores da Premier
League com overall >= 80. Todas as chaves precisam bater (E lógico); uma chave
com lista aceita qualquer um dos valores (OU lógico).
"""

from __future__ import annotations

from typing import Any

from .models import Player

LIST_KEYS = ("league", "nation", "club", "rarity", "quality")
FILTER_KEYS = (*LIST_KEYS, "rare", "min_rating", "max_rating")

_LABELS = {
    "league": "liga",
    "nation": "nação",
    "club": "clube",
    "rarity": "raridade",
    "quality": "qualidade",
}


def validate_filter(flt: dict[str, Any]) -> None:
    unknown = set(flt) - set(FILTER_KEYS)
    if unknown:
        raise ValueError(f"Chave(s) de filtro desconhecida(s): {sorted(unknown)}. Válidas: {FILTER_KEYS}")


def matches(player: Player, flt: dict[str, Any]) -> bool:
    for key, value in flt.items():
        if key in LIST_KEYS:
            allowed = value if isinstance(value, list) else [value]
            if getattr(player, key) not in allowed:
                return False
        elif key == "rare":
            if player.is_rare != bool(value):
                return False
        elif key == "min_rating":
            if player.rating < value:
                return False
        elif key == "max_rating":
            if player.rating > value:
                return False
        else:
            raise ValueError(f"Chave de filtro desconhecida: {key}")
    return True


def describe_filter(flt: dict[str, Any]) -> str:
    parts = []
    for key, value in flt.items():
        if key in LIST_KEYS:
            shown = " ou ".join(value) if isinstance(value, list) else value
            parts.append(f"{_LABELS[key]} {shown}")
        elif key == "rare":
            parts.append("raros" if value else "não raros")
        elif key == "min_rating":
            parts.append(f"overall >= {value}")
        elif key == "max_rating":
            parts.append(f"overall <= {value}")
    return ", ".join(parts) or "qualquer jogador"
