"""CLI: python -m sbc_solver --club data/club.json --sbc data/sbcs/01_overall_84.json"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace

from .io import InputError, load_players, load_sbc, write_json
from .solver import solve

CATEGORY_PT = {
    "untradeable_duplicate": "dup. intransf.",
    "untradeable": "intransferível",
    "tradeable": "negociável",
    "market": "COMPRAR",
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="sbc_solver", description="Encontra o time mais barato para um DME.")
    ap.add_argument("--club", required=True, help="JSON com os jogadores do clube")
    ap.add_argument("--sbc", required=True, help="JSON com os requisitos do DME")
    ap.add_argument("--market", help="JSON com jogadores 'conceito' do mercado (ex.: data/market.json, que é fictício)")
    ap.add_argument("--allow-market", action="store_true", help="permite sugerir compras no mercado")
    ap.add_argument("--allow-special", action="store_true", help="permite usar cartas especiais")
    ap.add_argument("--no-tradeable", action="store_true", help="não usa negociáveis do clube")
    ap.add_argument("--lock", action="append", default=[], metavar="ID", help="nunca usar este jogador (repetível)")
    ap.add_argument("--max-rating", type=int, metavar="N", help="não usa jogadores com overall acima de N")
    ap.add_argument("--min-rating", type=int, metavar="N", help="não usa jogadores com overall abaixo de N")
    ap.add_argument("--untradeable-value", type=float, metavar="0-1",
                    help="quanto um intransferível vale, em fração do preço de mercado (padrão 0.3; 0 = gastar intransferíveis sempre primeiro)")
    ap.add_argument("--time-limit", type=float, help="tempo máximo do solver, em segundos")
    ap.add_argument("--out", default="solution.json", help="arquivo de saída (padrão: solution.json)")
    ap.add_argument("--quiet", action="store_true", help="não imprime o resumo")
    return ap.parse_args(argv)


def print_summary(sol: dict) -> None:
    print(f"\nDME: {sol['sbc']}  |  status: {sol['status']}  |  {sol['solve_time_s']}s")
    if sol.get("warnings"):
        print("\nATENÇÃO: a extensão não conseguiu traduzir tudo deste DME. Confira no jogo antes de enviar:")
        for w in sol["warnings"]:
            print(f"  ! {w}")
    if not sol["squad"]:
        print(f"\nSem solução. Motivo provável: {sol['reason']}")
        for d in sol["diagnostics"]:
            print(f"  - {d}")
        return
    print(f"\n{'Slot':<5}{'Jogador':<28}{'OVR':>4} {'Pos':<4}{'Quím':>5}  {'Tipo':<15}{'Moedas':>8}")
    print("-" * 72)
    for s in sol["squad"]:
        pos = s["position"] if s["in_position"] else f"{s['position']}!"
        print(f"{s['slot_position']:<5}{s['name'][:27]:<28}{s['rating']:>4} {pos:<4}{s['chemistry']:>5}  "
              f"{CATEGORY_PT[s['category']]:<15}{s['coin_cost']:>8,}")
    print("-" * 72)
    print(f"Overall: {sol['team_rating']}  |  Química: {sol['team_chemistry']}/33  |  "
          f"Custo total: {sol['total_cost']:,} moedas  |  Compras: {sol['purchase_cost']:,}")
    print("\nRequisitos:")
    for r in sol["requirements"]:
        print(f"  [{'OK' if r['ok'] else 'X '}] {r['description']}  (atual: {r['actual']})")


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    args = parse_args(argv)
    try:
        club = load_players(args.club, "club")
        sbc = load_sbc(args.sbc)
        # O mercado só entra se for passado explicitamente (data/market.json é fictício).
        market = load_players(args.market, "market") if args.market else []
    except InputError as e:
        print(f"Erro na entrada: {e}", file=sys.stderr)
        return 2

    if args.untradeable_value is not None and not 0 <= args.untradeable_value <= 1:
        print("Erro na entrada: --untradeable-value precisa estar entre 0 e 1", file=sys.stderr)
        return 2
    rating_min = args.min_rating if args.min_rating is not None else sbc.options.rating_min
    rating_max = args.max_rating if args.max_rating is not None else sbc.options.rating_max
    if rating_min is not None and rating_max is not None and rating_min > rating_max:
        print(f"Erro na entrada: overall mínimo ({rating_min}) maior que o máximo ({rating_max})", file=sys.stderr)
        return 2

    opts = sbc.options
    opts = replace(
        opts,
        rating_min=rating_min,
        rating_max=rating_max,
        untradeable_value=(args.untradeable_value if args.untradeable_value is not None
                           else opts.untradeable_value),
    )
    opts = replace(
        opts,
        allow_market=opts.allow_market or args.allow_market,
        allow_special=opts.allow_special or args.allow_special,
        allow_tradeable=opts.allow_tradeable and not args.no_tradeable,
        locked_players=opts.locked_players | frozenset(args.lock),
        time_limit_s=args.time_limit or opts.time_limit_s,
    )
    sbc = replace(sbc, options=opts)

    sol = solve(club, sbc, market)
    write_json(args.out, sol)
    if not args.quiet:
        lo = opts.rating_min if opts.rating_min is not None else "-"
        hi = opts.rating_max if opts.rating_max is not None else "-"
        print(f"Opções: overall permitido {lo} a {hi}  |  valor dos intransferíveis: "
              f"{opts.untradeable_value:.0%} do preço  |  mercado: {'sim' if opts.allow_market else 'não'}")
        print_summary(sol)
        print(f"\nSolução salva em {args.out}")
    return 0 if sol["squad"] else 1


if __name__ == "__main__":
    sys.exit(main())
