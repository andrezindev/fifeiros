# FIFEIROS – resolvedor de DMEs do EA FC Ultimate Team

Monta automaticamente o time **mais barato** que cumpre os requisitos de um DME
(SBC), usando os jogadores do **seu** clube, e coloca esse time no DME do Web App
para você conferir e enviar.

- Extensão do Chrome que lê o seu clube e o DME aberto no Web App da EA.
- Solver que roda **no seu PC** (Python + Google OR-Tools) e calcula a melhor escalação.
- Painel flutuante no Web App: mostra a solução e preenche o DME com um clique.
- **Quem aperta "Enviar" é sempre você.** A extensão nunca envia DMEs, nunca compra e nunca vende.

> ⚠️ **Aviso importante.** Projeto de fã, sem nenhuma ligação com a EA. Extensões
> que mexem no Web App vão contra os termos da EA, e existe risco de bloqueio
> (softban) ou banimento da conta. A extensão foi feita para fazer **poucas**
> requisições (limite de ritmo embutido), mas **use por sua conta e risco**.

---

## Sumário

1. [O que você precisa](#o-que-você-precisa)
2. [Instalação (uma vez)](#instalação-uma-vez)
3. [Uso no dia a dia](#uso-no-dia-a-dia)
4. [Opções do solver](#opções-do-solver)
5. [Segurança e privacidade](#segurança-e-privacidade)
6. [Problemas comuns](#problemas-comuns)
7. [Para desenvolvedores](#para-desenvolvedores)

---

## O que você precisa

- **Windows** (os atalhos `.bat` são para Windows; em Mac/Linux veja a parte de desenvolvedores).
- **Google Chrome** (ou outro navegador baseado em Chromium, como Edge ou Brave).
- **Python 3.11 ou mais novo**.

## Instalação (uma vez)

### 1. Baixar o projeto

Na página do GitHub, clique em **Code › Download ZIP** e extraia numa pasta,
por exemplo `Documentos\FIFEIROS`. Se você usa git:

```bash
git clone https://github.com/andrezindev/fifeiros.git
```

### 2. Instalar o Python

Baixe em [python.org/downloads](https://www.python.org/downloads/) e, na
instalação, **marque "Add python.exe to PATH"**. Também dá pelo PowerShell:

```bash
winget install Python.Python.3.12
```

### 3. Instalar o solver

Na pasta do projeto, dê dois cliques em **`instalar.bat`**. Ele cria o ambiente
Python (pasta `.venv`) e baixa o OR-Tools. Demora um ou dois minutos; no fim
aparece "Pronto!".

### 4. Instalar a extensão no Chrome

1. Abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta **`extension`** de dentro do projeto.
4. Fixe o ícone do FIFEIROS na barra (ícone de quebra-cabeça › alfinete).

## Uso no dia a dia

1. **Ligue o solver:** dois cliques em **`iniciar-solver.bat`**. Deixe a janela
   "Solver FIFEIROS" aberta enquanto usa (feche para desligar).
2. **Abra o Web App** do EA FC e faça login normalmente. Se ele já estava aberto
   antes de instalar ou atualizar a extensão, aperte **F5**.
3. **Carregue o clube** (na primeira vez, e quando o clube mudar muito):
   - vá em *Clube › Jogadores* sem filtros e deixe a primeira página carregar;
   - abra também os **Não atribuídos** e o **Armazém de DME**, se tiver;
   - no popup da extensão, clique em **Carregar clube inteiro**. Ela percorre o
     clube página por página, com pausas, e mostra quantos jogadores leu.
4. **Abra o DME** que você quer fazer no Web App.
5. No popup, clique em **Resolver DME aberto**. A solução aparece num painel
   sobre o Web App, com cada jogador, overall, química, custo e os requisitos
   marcados com ✓.
6. Clique em **Preencher no DME** e confirme. Os jogadores aparecem no campo na hora.
7. **Confira e aperte Enviar você mesmo.**
8. Para o próximo (por exemplo, um DME repetível), é só clicar em **Resolver**
   de novo: a extensão percebe o envio e não usa de novo os jogadores que já foram.

O ponto ao lado de "Solver" no popup fica **verde** quando o solver está ligado.

## Opções do solver

Ficam no popup, em **Opções do solver**, e são salvas automaticamente.

| Opção | O que faz |
|---|---|
| **Priorizar** | *Menor custo* (padrão) · *Menor overall primeiro* · *Proteger cartas boas* |
| **Faixa de overall** | Barra dupla e campos **Mín.**/**Máx.**: só usa jogadores dentro dessa faixa (ex.: nunca gastar um 88) |
| **Substituir atletas já no DME** | Ligado (padrão): monta do zero. Desligado: mantém quem você já colocou e completa o resto |
| **Somente não negociáveis** | Não usa os negociáveis do clube |
| **Excluir atletas do elenco ativo** | Não usa ninguém do seu time titular nem dos reservas |
| **Usar cartas de evento** | Permite gastar cartas especiais (por padrão ficam protegidas) |
| **Usar atletas de conceito** | Em breve (precisa dos preços do mercado) |

**Como o solver escolhe "o mais barato":** duplicados intransferíveis primeiro
(não servem para mais nada), depois intransferíveis, depois negociáveis (pelo
preço de mercado). Um intransferível muito valioso conta como uma fração do
preço dele, para o solver não queimar, por exemplo, um 89 quando um 84 negociável
resolveria.

## Segurança e privacidade

- **Nada sai do seu computador.** O clube e o DME vão só para o solver em
  `127.0.0.1` (o seu próprio PC). O solver recusa pedidos de sites e só aceita
  os da extensão.
- **Nunca envia DMEs.** O único "salvar" que a extensão faz é o mesmo
  "salvar escalação" que o Web App faz quando você coloca um jogador. Há testes
  automáticos garantindo que nenhum outro endereço da EA é usado para escrever.
- **Não compra, não vende, não lista no mercado.**
- **Seu login não é guardado.** O token de sessão da EA fica só na memória da
  página e nunca é salvo nem exportado.
- **Limite de ritmo:** as requisições da própria extensão têm no mínimo 3 s
  entre elas e no máximo 40 a cada 10 minutos. O popup mostra o uso.
- Os dados capturados ficam em `chrome.storage.local`, só neste navegador.
  **Limpar dados** no popup apaga tudo.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Ponto vermelho "Solver desligado" | Dê dois cliques em `iniciar-solver.bat` e deixe a janela aberta |
| `iniciar-solver.bat` diz "Ambiente Python não encontrado" | Rode `instalar.bat` primeiro |
| "Resolver" diz que a página está com a versão antiga | Aperte **F5** no Web App |
| Clube aparece com 0 jogadores | Abra *Clube › Jogadores* sem filtros e clique em **Carregar clube inteiro** |
| "Sem solução" | O painel explica o motivo (ex.: falta jogador de uma liga, overall impossível com a faixa escolhida). Ajuste as opções ou o clube |
| Depois de preencher, o campo não atualizou | Use o botão **Recarregar Web App agora** do painel e **não mexa no DME antes** |
| Atualizei os arquivos da extensão | Em `chrome://extensions`, clique em ⟳ no FIFEIROS e aperte F5 no Web App |

Se algo ainda não funcionar, clique em **Exportar diagnóstico** no popup e abra
uma *issue* no GitHub com o arquivo `fifeiros-diagnostico.json`. Ele **não**
contém seu token de sessão, e-mail ou senha.

Mais detalhes sobre a extensão estão em [extension/README.md](extension/README.md).

---

## Para desenvolvedores

### Estrutura

```
extension/           extensão do Chrome (Manifest V3, JavaScript puro, sem build)
  src/page-hook.js     roda na página: lê as respostas da EA, carrega o clube, preenche o DME
  src/content.js       guarda os dados em chrome.storage.local
  src/background.js    conversa com o solver local
  src/normalize/       converte dados da EA -> formato do solver
  src/panel/           painel flutuante no Web App
  src/popup/           janela da extensão
  test/                testes (node --test)
src/sbc_solver/      solver em Python
  models.py            dados (Player, SBC, Requirement, Options)
  io.py                leitura/validação dos JSON
  filters.py           filtros dos requisitos "count"
  rating.py            fórmula de overall (pura)
  chemistry.py         química (pura)
  cost.py              custo/prioridade
  validate.py          confere um time contra o DME (puro)
  model_builder.py     modelo CP-SAT
  solver.py            orquestração e saída
  diagnostics.py       motivo de "sem solução"
  server.py            servidor local (127.0.0.1:8127)
  __main__.py          linha de comando
schemas/             contratos JSON (club, sbc, solution)
data/                clube e DMEs de exemplo (fictícios)
scripts/             gerador dos dados de exemplo
tests/               pytest
instalar.bat         cria o .venv e instala as dependências
iniciar-solver.bat   liga o servidor local
```

### Instalação manual e testes

```bash
python -m venv .venv
```

```bash
.venv/Scripts/python.exe -m pip install -e ".[dev]"
```

(Em Mac/Linux, use `.venv/bin/python`.) Testes do solver:

```bash
.venv/Scripts/python.exe -m pytest
```

Testes da extensão (Node 20+), dentro de `extension/`:

```bash
node --test "test/*.test.js"
```

### Servidor local

`python -m sbc_solver.server` sobe em `127.0.0.1:8127`:

- `GET /health` → versão e se está ocupado;
- `POST /solve` com `{"club": ..., "sbc": ..., "options": {...}}` → solução.

Pedidos com `Origin` de sites recebem 403; só a extensão (`chrome-extension://`)
e ferramentas locais sem `Origin` são aceitas.

### Linha de comando

```bash
.venv/Scripts/python.exe -m sbc_solver --club data/club.json --sbc data/sbcs/01_overall_86.json
```

A saída mostra o time no terminal e grava `solution.json`.

| Opção | O que faz |
|---|---|
| `--market arquivo.json` | lista de jogadores "conceito" que podem ser comprados (o `data/market.json` de exemplo é fictício) |
| `--allow-market` | permite sugerir compras da lista passada em `--market` |
| `--allow-special` | permite usar cartas especiais (por padrão ficam protegidas) |
| `--no-tradeable` | não usa os negociáveis do clube |
| `--lock c010 --lock c022` | nunca usa esses jogadores (id da carta ou `definition_id`) |
| `--max-rating 85` / `--min-rating 75` | faixa de overall permitida |
| `--untradeable-value 0.3` | quanto um intransferível "vale" (fração do preço de mercado) |
| `--time-limit 30` | tempo máximo do solver, em segundos (padrão: 10) |
| `--out minha_solucao.json` | nome do arquivo de saída |

Código de saída: `0` = achou solução, `1` = sem solução (o motivo vai em
`reason`), `2` = erro nos arquivos de entrada.

Exemplos em `data/sbcs/`: overall mínimo, liga/nação, química, um "puzzle"
misto e um DME de 5 jogadores. `data/club.json` (152 jogadores) e
`data/market.json` são fictícios, gerados por `scripts/generate_example_data.py`.

### Formato dos arquivos

Contratos completos em `schemas/` (JSON Schema).

**Jogador** (`club.json`):
```json
{"id": "c001", "definition_id": "d000", "name": "Marc Guéhi", "overall": 83,
 "position": "CB", "alt_positions": [], "league": "Premier League", "nation": "England",
 "club": "Crystal Palace", "rarity": "common", "tradeable": false, "untradeable": true,
 "is_duplicate": true, "unassigned": true, "market_price": 1400}
```

- `definition_id` identifica a pessoa: cartas diferentes do mesmo jogador nunca entram juntas.
- `rarity`: `common`/`rare`/`special`. No FC 27 não existe mais comum/raro: todo
  card base é `common` e cartas de evento são `special`.
- Posições: `GK RB LB CB CDM CM CAM RM LM RW LW ST`.

**DME** (`sbc.json`):
```json
{
  "name": "Liga e Nação",
  "formation": ["GK","RB","CB","CB","LB","CM","CDM","CM","RW","ST","LW"],
  "requirements": [
    {"type": "min_team_rating", "value": 80},
    {"type": "count", "filter": {"league": "Premier League"}, "op": "min", "value": 3}
  ],
  "options": {"allow_market": false, "rating_range": {"max": 87}, "locked_players": []}
}
```

| `type` | Significado | Campos |
|---|---|---|
| `min_team_rating` | overall mínimo do time | `value` |
| `min_team_chemistry` | química mínima do time (0–33) | `value` |
| `min_player_chemistry` | química mínima de cada jogador (0–3) | `value` |
| `count` | nº de jogadores que batem com o filtro | `filter`, `op` (`min`/`max`/`exact`), `value` |
| `distinct` | nº de ligas/nações/clubes diferentes | `attribute`, `op`, `value` |
| `same` | jogadores do mesmo clube/liga/nação | `attribute`, `op`, `value` |

Chaves de `filter`: `league`, `nation`, `club`, `rarity`, `quality`
(`bronze`/`silver`/`gold`), `rare`, `min_rating`, `max_rating`.

Opções: `locked_players`, `required_players`, `rating_range` (`min`/`max`),
`allow_special`, `allow_tradeable`, `allow_market`, `time_limit_s`, `untradeable_value`.

**Solução** (`solution.json`): `status` (`OPTIMAL` ou `FEASIBLE`), `squad`,
`team_rating`, `team_chemistry`, `total_cost`, `purchase_cost`, `to_buy`, a
conferência de cada requisito e, quando não há solução, `reason` + `diagnostics`.

### Como o solver funciona

- **Modelo:** programação por restrições com o CP-SAT (Google OR-Tools).
  `u[i]` = "jogador i entra no time"; se o DME pede química, também `x[i,j]` =
  "jogador i no slot j".
- **Overall do time** (`rating.py`): fórmula exata do jogo (soma + excesso acima
  da média, arredondado e truncado), modelada sem aproximação escolhendo o piso da média.
- **Química** (`chemistry.py`): clube 2/5/7, nação 2/5/8, liga 3/5/8; fora de
  posição = 0; ícone conta 2 na nação, herói 2 na liga.
- **Custo** (`cost.py`): duplicado intransferível < intransferível < negociável < mercado.
- **Prova real** (`validate.py`): toda solução é conferida por um validador independente do modelo.
- **Sem solução** (`diagnostics.py`): checagens diretas, depois tira um requisito
  de cada vez para achar o gargalo.

### Limitações conhecidas

- O formato dos dados do Web App não é documentado pela EA; a extensão pode
  quebrar quando a EA atualizar o app. O diagnóstico ajuda a corrigir.
- Química: técnico (+1 liga/nação) e boosts de promoções não são considerados.
- Ainda não feito: resolver vários DMEs de um grupo juntos, sugestões de compra
  no mercado e "atletas de conceito".
