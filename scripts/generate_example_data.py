"""Gera data/club.json e data/market.json de exemplo.

Os overalls, clubes e preços são APROXIMADOS (inspirados no FC 26), só para
testar o solver. Na Fase 2 estes arquivos virão do Web App de verdade.

Uso:  python scripts/generate_example_data.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

PL, LL, SA, BL, L1 = "Premier League", "LALIGA EA SPORTS", "Serie A Enilive", "Bundesliga", "Ligue 1 McDonald's"
ERE, LPT, SPL, MLS, EFL = "Eredivisie", "Liga Portugal", "ROSHN Saudi League", "MLS", "EFL League One"

# (nome, overall, posição, alternativas, liga, nação, clube, raridade)
BASE = [
    # Premier League
    ("Mohamed Salah", 91, "RW", ["RM"], PL, "Egypt", "Liverpool", "rare"),
    ("Virgil van Dijk", 90, "CB", [], PL, "Netherlands", "Liverpool", "rare"),
    ("Alexis Mac Allister", 86, "CM", ["CDM"], PL, "Argentina", "Liverpool", "rare"),
    ("Florian Wirtz", 88, "CAM", ["CM"], PL, "Germany", "Liverpool", "rare"),
    ("Hugo Ekitiké", 83, "ST", [], PL, "France", "Liverpool", "rare"),
    ("Erling Haaland", 91, "ST", [], PL, "Norway", "Manchester City", "rare"),
    ("Rodri", 89, "CDM", ["CM"], PL, "Spain", "Manchester City", "rare"),
    ("Phil Foden", 85, "CAM", ["LW"], PL, "England", "Manchester City", "rare"),
    ("Joško Gvardiol", 85, "CB", ["LB"], PL, "Croatia", "Manchester City", "rare"),
    ("Gianluigi Donnarumma", 89, "GK", [], PL, "Italy", "Manchester City", "rare"),
    ("Bukayo Saka", 88, "RW", ["RM"], PL, "England", "Arsenal", "rare"),
    ("Martin Ødegaard", 87, "CAM", ["CM"], PL, "Norway", "Arsenal", "rare"),
    ("William Saliba", 87, "CB", [], PL, "France", "Arsenal", "rare"),
    ("Declan Rice", 87, "CDM", ["CM"], PL, "England", "Arsenal", "rare"),
    ("Viktor Gyökeres", 86, "ST", [], PL, "Sweden", "Arsenal", "rare"),
    ("Leandro Trossard", 81, "LW", ["ST"], PL, "Belgium", "Arsenal", "common"),
    ("Eberechi Eze", 82, "CAM", ["LW"], PL, "England", "Arsenal", "rare"),
    ("Cole Palmer", 87, "CAM", ["RW"], PL, "England", "Chelsea", "rare"),
    ("Bruno Fernandes", 87, "CAM", ["CM"], PL, "Portugal", "Manchester United", "rare"),
    ("Bryan Mbeumo", 83, "RW", ["ST"], PL, "Cameroon", "Manchester United", "rare"),
    ("Matheus Cunha", 83, "CAM", ["ST"], PL, "Brazil", "Manchester United", "rare"),
    ("Bruno Guimarães", 85, "CM", ["CDM"], PL, "Brazil", "Newcastle United", "rare"),
    ("Tino Livramento", 79, "RB", ["LB"], PL, "England", "Newcastle United", "common"),
    ("Ollie Watkins", 84, "ST", [], PL, "England", "Aston Villa", "rare"),
    ("Emiliano Martínez", 86, "GK", [], PL, "Argentina", "Aston Villa", "rare"),
    ("Pedro Porro", 82, "RB", ["RM"], PL, "Spain", "Tottenham Hotspur", "rare"),
    ("Xavi Simons", 84, "CAM", ["LW"], PL, "Netherlands", "Tottenham Hotspur", "rare"),
    ("Dominic Solanke", 80, "ST", [], PL, "England", "Tottenham Hotspur", "common"),
    ("Morgan Gibbs-White", 82, "CAM", ["CM"], PL, "England", "Nottingham Forest", "rare"),
    ("Murillo", 82, "CB", [], PL, "Brazil", "Nottingham Forest", "rare"),
    ("Jordan Pickford", 83, "GK", [], PL, "England", "Everton", "rare"),
    ("James Tarkowski", 80, "CB", [], PL, "England", "Everton", "common"),
    ("Jake O'Brien", 73, "CB", ["RB"], PL, "Republic of Ireland", "Everton", "common"),
    ("Marc Guéhi", 83, "CB", [], PL, "England", "Crystal Palace", "rare"),
    ("Adam Wharton", 79, "CDM", ["CM"], PL, "England", "Crystal Palace", "common"),
    ("Dean Henderson", 79, "GK", [], PL, "England", "Crystal Palace", "common"),
    ("Kaoru Mitoma", 80, "LW", ["LM"], PL, "Japan", "Brighton & Hove Albion", "rare"),
    ("Lewis Dunk", 79, "CB", [], PL, "England", "Brighton & Hove Albion", "common"),
    ("Jack Hinshelwood", 72, "CM", ["RB"], PL, "England", "Brighton & Hove Albion", "common"),
    ("Antoine Semenyo", 80, "RW", ["ST"], PL, "Ghana", "AFC Bournemouth", "common"),
    ("Bernd Leno", 80, "GK", [], PL, "Germany", "Fulham", "common"),
    ("Andreas Pereira", 77, "CAM", ["CM"], PL, "Brazil", "Fulham", "common"),
    ("Harry Wilson", 76, "RW", ["RM"], PL, "Wales", "Fulham", "common"),
    ("Granit Xhaka", 84, "CDM", ["CM"], PL, "Switzerland", "Sunderland", "rare"),
    ("Jarrod Bowen", 83, "RW", ["ST"], PL, "England", "West Ham United", "rare"),
    # LALIGA
    ("Kylian Mbappé", 91, "ST", ["LW"], LL, "France", "Real Madrid", "rare"),
    ("Jude Bellingham", 89, "CAM", ["CM"], LL, "England", "Real Madrid", "rare"),
    ("Vini Jr.", 89, "LW", ["ST"], LL, "Brazil", "Real Madrid", "rare"),
    ("Thibaut Courtois", 89, "GK", [], LL, "Belgium", "Real Madrid", "rare"),
    ("Federico Valverde", 88, "CM", ["RM"], LL, "Uruguay", "Real Madrid", "rare"),
    ("Lamine Yamal", 89, "RW", ["RM"], LL, "Spain", "FC Barcelona", "rare"),
    ("Pedri", 89, "CM", ["CAM"], LL, "Spain", "FC Barcelona", "rare"),
    ("Raphinha", 89, "LW", ["RW"], LL, "Brazil", "FC Barcelona", "rare"),
    ("Robert Lewandowski", 86, "ST", [], LL, "Poland", "FC Barcelona", "rare"),
    ("Jules Koundé", 85, "RB", ["CB"], LL, "France", "FC Barcelona", "rare"),
    ("Jan Oblak", 87, "GK", [], LL, "Slovenia", "Atlético de Madrid", "rare"),
    ("Julián Álvarez", 86, "ST", ["CAM"], LL, "Argentina", "Atlético de Madrid", "rare"),
    ("Antoine Griezmann", 85, "ST", ["CAM"], LL, "France", "Atlético de Madrid", "rare"),
    ("Koke", 82, "CM", ["CDM"], LL, "Spain", "Atlético de Madrid", "rare"),
    ("Álex Baena", 82, "LM", ["CAM"], LL, "Spain", "Atlético de Madrid", "rare"),
    ("Nico Williams", 85, "LW", ["LM"], LL, "Spain", "Athletic Club", "rare"),
    ("Unai Simón", 84, "GK", [], LL, "Spain", "Athletic Club", "rare"),
    ("Oihan Sancet", 81, "CAM", ["CM"], LL, "Spain", "Athletic Club", "common"),
    ("Mikel Oyarzabal", 83, "ST", ["LW"], LL, "Spain", "Real Sociedad", "rare"),
    ("Takefusa Kubo", 80, "RW", ["RM"], LL, "Japan", "Real Sociedad", "common"),
    ("Ander Barrenetxea", 78, "LW", ["LM"], LL, "Spain", "Real Sociedad", "common"),
    ("Isco", 83, "CAM", ["CM"], LL, "Spain", "Real Betis", "rare"),
    ("Giovani Lo Celso", 81, "CM", ["CAM"], LL, "Argentina", "Real Betis", "common"),
    ("Pablo Fornals", 78, "CM", ["CAM"], LL, "Spain", "Real Betis", "common"),
    ("Gerard Moreno", 80, "ST", [], LL, "Spain", "Villarreal CF", "common"),
    ("Antonio Blanco", 74, "CDM", ["CM"], LL, "Spain", "Deportivo Alavés", "common"),
    ("Carlos Vicente", 73, "RW", ["RM"], LL, "Spain", "Deportivo Alavés", "common"),
    ("Kike García", 72, "ST", [], LL, "Spain", "Deportivo Alavés", "common"),
    # Serie A
    ("Lautaro Martínez", 88, "ST", [], SA, "Argentina", "Inter", "rare"),
    ("Nicolò Barella", 87, "CM", [], SA, "Italy", "Inter", "rare"),
    ("Hakan Çalhanoğlu", 86, "CDM", ["CM"], SA, "Türkiye", "Inter", "rare"),
    ("Alessandro Bastoni", 86, "CB", [], SA, "Italy", "Inter", "rare"),
    ("Yann Sommer", 84, "GK", [], SA, "Switzerland", "Inter", "rare"),
    ("Marcus Thuram", 84, "ST", ["LW"], SA, "France", "Inter", "rare"),
    ("Mike Maignan", 86, "GK", [], SA, "France", "Milan", "rare"),
    ("Rafael Leão", 85, "LW", ["ST"], SA, "Portugal", "Milan", "rare"),
    ("Christian Pulisic", 84, "RW", ["RM"], SA, "United States", "Milan", "rare"),
    ("Dušan Vlahović", 83, "ST", [], SA, "Serbia", "Juventus", "rare"),
    ("Gleison Bremer", 85, "CB", [], SA, "Brazil", "Juventus", "rare"),
    ("Kenan Yıldız", 83, "LW", ["CAM"], SA, "Türkiye", "Juventus", "rare"),
    ("Manuel Locatelli", 82, "CDM", ["CM"], SA, "Italy", "Juventus", "rare"),
    ("Andrea Cambiaso", 82, "LB", ["RB"], SA, "Italy", "Juventus", "rare"),
    ("Kevin De Bruyne", 87, "CAM", ["CM"], SA, "Belgium", "Napoli", "rare"),
    ("Scott McTominay", 85, "CM", ["CAM"], SA, "Scotland", "Napoli", "rare"),
    ("Alessandro Buongiorno", 83, "CB", [], SA, "Italy", "Napoli", "rare"),
    ("Ademola Lookman", 84, "LW", ["RW"], SA, "Nigeria", "Atalanta", "rare"),
    ("Paulo Dybala", 83, "CAM", ["RW"], SA, "Argentina", "Roma", "rare"),
    ("Mattia Zaccagni", 81, "LW", ["LM"], SA, "Italy", "Lazio", "common"),
    ("Riccardo Orsolini", 81, "RW", ["RM"], SA, "Italy", "Bologna", "common"),
    ("Tommaso Baldanzi", 74, "CAM", ["RW"], SA, "Italy", "Roma", "common"),
    ("Mattia Viti", 70, "CB", [], SA, "Italy", "Genoa", "common"),
    # Bundesliga
    ("Harry Kane", 90, "ST", [], BL, "England", "FC Bayern München", "rare"),
    ("Jamal Musiala", 88, "CAM", ["LW"], BL, "Germany", "FC Bayern München", "rare"),
    ("Joshua Kimmich", 88, "CDM", ["RB"], BL, "Germany", "FC Bayern München", "rare"),
    ("Manuel Neuer", 86, "GK", [], BL, "Germany", "FC Bayern München", "rare"),
    ("Michael Olise", 87, "RW", ["RM"], BL, "France", "FC Bayern München", "rare"),
    ("Jonathan Tah", 84, "CB", [], BL, "Germany", "FC Bayern München", "rare"),
    ("Serhou Guirassy", 85, "ST", [], BL, "Guinea", "Borussia Dortmund", "rare"),
    ("Gregor Kobel", 86, "GK", [], BL, "Switzerland", "Borussia Dortmund", "rare"),
    ("Nico Schlotterbeck", 84, "CB", [], BL, "Germany", "Borussia Dortmund", "rare"),
    ("Julian Brandt", 82, "CAM", ["CM"], BL, "Germany", "Borussia Dortmund", "rare"),
    ("David Raum", 81, "LB", ["LM"], BL, "Germany", "RB Leipzig", "common"),
    ("Vincenzo Grifo", 80, "LM", ["LW"], BL, "Italy", "SC Freiburg", "common"),
    ("Lukas Kübler", 72, "RB", ["CB"], BL, "Germany", "SC Freiburg", "common"),
    ("Robin Hack", 73, "LM", ["RM"], BL, "Germany", "Borussia Mönchengladbach", "common"),
    ("Jonas Omlin", 74, "GK", [], BL, "Switzerland", "Borussia Mönchengladbach", "common"),
    # Ligue 1
    ("Ousmane Dembélé", 90, "RW", ["ST"], L1, "France", "Paris Saint-Germain", "rare"),
    ("Achraf Hakimi", 88, "RB", ["RM"], L1, "Morocco", "Paris Saint-Germain", "rare"),
    ("Marquinhos", 86, "CB", [], L1, "Brazil", "Paris Saint-Germain", "rare"),
    ("Vitinha", 88, "CM", ["CDM"], L1, "Portugal", "Paris Saint-Germain", "rare"),
    ("Khvicha Kvaratskhelia", 87, "LW", ["LM"], L1, "Georgia", "Paris Saint-Germain", "rare"),
    ("João Neves", 86, "CM", ["CDM"], L1, "Portugal", "Paris Saint-Germain", "rare"),
    ("Mason Greenwood", 83, "RW", ["ST"], L1, "England", "Olympique de Marseille", "rare"),
    ("Pierre-Emerick Aubameyang", 81, "ST", [], L1, "Gabon", "Olympique de Marseille", "common"),
    ("Brice Samba", 81, "GK", [], L1, "France", "Stade Rennais FC", "common"),
    ("Ludovic Blas", 76, "CAM", ["RM"], L1, "France", "Stade Rennais FC", "common"),
    ("Benjamin André", 78, "CDM", ["CM"], L1, "France", "LOSC Lille", "common"),
    ("Hákon Arnar Haraldsson", 79, "CAM", ["CM"], L1, "Iceland", "LOSC Lille", "common"),
    ("Himad Abdelli", 74, "CM", ["CAM"], L1, "Algeria", "Angers SCO", "common"),
    ("Farid El Melali", 72, "LW", ["LM"], L1, "Algeria", "Angers SCO", "common"),
    # Eredivisie
    ("Brian Brobbey", 78, "ST", [], ERE, "Netherlands", "Ajax", "common"),
    ("Kenneth Taylor", 77, "CM", ["CAM"], ERE, "Netherlands", "Ajax", "common"),
    ("Mika Godts", 74, "LW", ["LM"], ERE, "Belgium", "Ajax", "common"),
    ("Joey Veerman", 81, "CM", ["CDM"], ERE, "Netherlands", "PSV", "common"),
    ("Luuk de Jong", 78, "ST", [], ERE, "Netherlands", "PSV", "common"),
    ("Quinten Timber", 80, "CM", ["CDM"], ERE, "Netherlands", "Feyenoord", "common"),
    ("Justin Bijlow", 77, "GK", [], ERE, "Netherlands", "Feyenoord", "common"),
    ("Oussama Targhalline", 74, "CDM", ["CM"], ERE, "Morocco", "Feyenoord", "common"),
    ("Sem Steijn", 75, "CAM", ["ST"], ERE, "Netherlands", "FC Twente", "common"),
    # Liga Portugal
    ("Pedro Gonçalves", 83, "CAM", ["LW"], LPT, "Portugal", "Sporting CP", "rare"),
    ("Morten Hjulmand", 83, "CDM", ["CM"], LPT, "Denmark", "Sporting CP", "rare"),
    ("Nicolás Otamendi", 80, "CB", [], LPT, "Argentina", "SL Benfica", "common"),
    ("Anatoliy Trubin", 82, "GK", [], LPT, "Ukraine", "SL Benfica", "rare"),
    ("Diogo Costa", 85, "GK", [], LPT, "Portugal", "FC Porto", "rare"),
    ("Alan Varela", 81, "CDM", ["CM"], LPT, "Argentina", "FC Porto", "common"),
    ("Samu Aghehowa", 79, "ST", [], LPT, "Spain", "FC Porto", "common"),
    ("Ricardo Horta", 80, "LW", ["CAM"], LPT, "Portugal", "SC Braga", "common"),
    ("João Moutinho", 74, "CM", ["CDM"], LPT, "Portugal", "SC Braga", "common"),
    # Arábia Saudita
    ("Cristiano Ronaldo", 86, "ST", [], SPL, "Portugal", "Al Nassr", "rare"),
    ("Sadio Mané", 83, "LW", ["ST"], SPL, "Senegal", "Al Nassr", "rare"),
    ("Karim Benzema", 86, "ST", [], SPL, "France", "Al Ittihad", "rare"),
    ("N'Golo Kanté", 83, "CDM", ["CM"], SPL, "France", "Al Ittihad", "rare"),
    ("Riyad Mahrez", 82, "RW", ["RM"], SPL, "Algeria", "Al Ahli", "rare"),
    ("Rúben Neves", 83, "CDM", ["CM"], SPL, "Portugal", "Al Hilal", "rare"),
    ("Kalidou Koulibaly", 81, "CB", [], SPL, "Senegal", "Al Hilal", "common"),
    # MLS
    ("Lionel Messi", 86, "RW", ["CAM"], MLS, "Argentina", "Inter Miami CF", "rare"),
    ("Luis Suárez", 80, "ST", [], MLS, "Uruguay", "Inter Miami CF", "common"),
    ("Son Heung-min", 85, "LW", ["ST"], MLS, "Korea Republic", "LAFC", "rare"),
    ("Hugo Lloris", 79, "GK", [], MLS, "France", "LAFC", "common"),
    ("Denis Bouanga", 80, "LW", ["ST"], MLS, "Gabon", "LAFC", "common"),
    ("Cucho Hernández", 79, "ST", [], MLS, "Colombia", "Columbus Crew", "common"),
    ("Diego Rossi", 74, "LW", ["LM"], MLS, "Uruguay", "Columbus Crew", "common"),
    # Laterais
    ("Trent Alexander-Arnold", 86, "RB", ["CM"], LL, "England", "Real Madrid", "rare"),
    ("Álvaro Carreras", 80, "LB", [], LL, "Spain", "Real Madrid", "common"),
    ("Nuno Mendes", 86, "LB", ["LM"], L1, "Portugal", "Paris Saint-Germain", "rare"),
    ("Jeremie Frimpong", 83, "RB", ["RM"], PL, "Netherlands", "Liverpool", "rare"),
    ("Diogo Dalot", 80, "RB", ["LB"], PL, "Portugal", "Manchester United", "common"),
    ("Destiny Udogie", 81, "LB", ["LM"], PL, "Italy", "Tottenham Hotspur", "common"),
    ("Kieran Trippier", 79, "RB", [], PL, "England", "Newcastle United", "common"),
    ("Lewis Hall", 78, "LB", [], PL, "England", "Newcastle United", "common"),
    ("Federico Dimarco", 85, "LB", ["LM"], SA, "Italy", "Inter", "rare"),
    ("Denzel Dumfries", 83, "RB", ["RM"], SA, "Netherlands", "Inter", "rare"),
    ("Alejandro Grimaldo", 85, "LB", ["LM"], BL, "Spain", "Bayer 04 Leverkusen", "rare"),
    ("Theo Hernández", 84, "LB", [], SPL, "France", "Al Hilal", "rare"),
    ("Arnau Martínez", 74, "RB", ["CB"], LL, "Spain", "Girona FC", "common"),
    ("Daley Blind", 74, "LB", ["CB"], LL, "Netherlands", "Girona FC", "common"),
    # Bronzes (EFL League One)
    ("Alfie May", 63, "ST", [], EFL, "England", "Huddersfield Town", "common"),
    ("Callum Lang", 62, "RW", ["ST"], EFL, "England", "Plymouth Argyle", "common"),
    ("Will Norris", 61, "GK", [], EFL, "England", "Peterborough United", "common"),
    ("Max Dean", 60, "ST", [], EFL, "England", "Mansfield Town", "common"),
    ("Ellis Harrison", 58, "ST", [], EFL, "Wales", "Port Vale", "rare"),
    ("Lewis Wing", 64, "CM", [], EFL, "England", "Reading", "rare"),
]

ICON = ("Ronaldinho", 90, "CAM", ["LW"], "Icons", "Brazil", "ICON", "special")


def market_price(rating: int, rarity: str) -> int:
    """Curva de preço aproximada (moedas)."""
    if rating < 65:
        price = 200 if rarity == "rare" else 150
    elif rating < 75:
        price = 300 if rarity == "rare" else 200
    elif rating < 80:
        price = 500 if rarity == "rare" else 350
    else:
        table = {80: 600, 81: 700, 82: 900, 83: 1_400, 84: 2_800, 85: 5_500, 86: 9_000,
                 87: 15_000, 88: 23_000, 89: 35_000, 90: 55_000, 91: 80_000}
        price = table.get(rating, 120_000)
    if rarity == "special":
        price = int(price * 2.5)
    return price


def card(pid, defid, row, *, rating=None, rarity=None, tradeable=False, duplicate=False, unassigned=False,
         icon=False, source="club"):
    name, ovr, pos, alts, league, nation, club, _ = row
    rating = rating or ovr
    # FC 27: não existe mais comum/raro; todo card base é "common", eventos são "special".
    rarity = rarity or "common"
    d = {
        "id": pid,
        "definition_id": defid,
        "name": name,
        "overall": rating,
        "position": pos,
        "alt_positions": alts,
        "league": league,
        "nation": nation,
        "club": club,
        "rarity": rarity,
        "tradeable": tradeable,
        "untradeable": not tradeable,
        "is_duplicate": duplicate,
        "market_price": market_price(rating, rarity),
    }
    if unassigned:
        d["unassigned"] = True
    if icon:
        d["is_icon"] = True
    return d


def main() -> None:
    rng = random.Random(27)
    club, market = [], []
    n = 0

    def next_id() -> str:
        nonlocal n
        n += 1
        return f"c{n:03d}"

    for k, row in enumerate(BASE):
        defid = f"d{k:03d}"
        market.append(card(f"m{k:03d}", defid, row, tradeable=True, source="market"))
        ovr = row[1]
        # Cartas muito boas são raras no clube de um jogador comum.
        if (ovr >= 88 and rng.random() > 0.2) or (ovr >= 85 and rng.random() > 0.45):
            continue
        club.append(card(next_id(), defid, row, tradeable=rng.random() < 0.45))

    # Duplicados intransferíveis (parados nos "não atribuídos"): golds de 75 a 84.
    dup_pool = [(k, r) for k, r in enumerate(BASE) if 75 <= r[1] <= 84]
    for k, row in rng.sample(dup_pool, 12):
        club.append(card(next_id(), f"d{k:03d}", row, duplicate=True, unassigned=True))

    # Cartas especiais (TOTW etc.): +3 de overall, mesmo definition_id do base.
    for k, row in rng.sample([(k, r) for k, r in enumerate(BASE) if 78 <= r[1] <= 85], 6):
        club.append(card(next_id(), f"d{k:03d}", row, rating=row[1] + 3, rarity="special"))

    club.append(card(next_id(), "icon_ronaldinho", ICON, icon=True))

    root = Path(__file__).resolve().parent.parent / "data"
    root.mkdir(exist_ok=True)
    for fname, players in (("club.json", club), ("market.json", market)):
        with open(root / fname, "w", encoding="utf-8") as f:
            json.dump({"players": players}, f, ensure_ascii=False, indent=1)
    print(f"club.json: {len(club)} jogadores | market.json: {len(market)} jogadores")


if __name__ == "__main__":
    main()
